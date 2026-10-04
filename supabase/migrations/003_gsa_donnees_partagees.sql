-- Tâches GSA – version réelle : données partagées d'un comité (appliqué au projet Supabase « Taches_GSA »).
--
-- Chaque élément de l'appli (tâche, séance, responsable, statut, sondage, entrée du journal…) est une ligne
-- de gsa_items, son contenu tel quel en jsonb : l'appli garde son format de données et chaque modification
-- n'écrit que les éléments touchés, diffusés en direct aux autres membres (Realtime).
--
-- Accès : un compte (auth.users) est rattaché à un comité et à sa fiche « responsable » par gsa_members.
-- L'accès suit la fiche : fiche désactivée ou supprimée → plus d'accès. Le propriétaire (président) garde
-- toujours l'accès et les droits d'admin. Les comptes sont créés par un admin depuis la console admin
-- (fonction gsa-acces, voir supabase/functions/gsa-acces) : pas d'inscription libre.
-- Les tables des essais précédents (tasks, people, meetings…) ne sont pas utilisées.

create table if not exists public.gsa_members (
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id text,
  owner boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (committee_id, user_id)
);
create unique index if not exists gsa_members_person_key on public.gsa_members (committee_id, person_id) where person_id is not null;
create index if not exists gsa_members_user_idx on public.gsa_members (user_id);

create table if not exists public.gsa_items (
  committee_id uuid not null references public.committees(id) on delete cascade,
  kind text not null,          -- collection de l'appli : tasks, people, meetings, log, prefs, meta…
  id text not null,            -- identifiant dans l'appli (t12, p3…)
  pos double precision not null default 0, -- ordre dans la liste
  data jsonb not null,
  deleted boolean not null default false,  -- suppression douce (diffusée en direct comme une modification)
  client_id text,              -- onglet qui a écrit (pour ignorer l'écho de ses propres modifications)
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (committee_id, kind, id)
);

-- Membre actif du comité : propriétaire, ou compte lié à une fiche responsable active.
create or replace function public.gsa_is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gsa_members m
    where m.committee_id = c and m.user_id = (select auth.uid())
      and (m.owner or exists (
        select 1 from public.gsa_items p
        where p.committee_id = c and p.kind = 'people' and p.id = m.person_id and not p.deleted
          and coalesce((p.data ->> 'actif')::boolean, true)
      ))
  );
$$;

-- Admin du comité : propriétaire, ou fiche active avec le rôle « admin ».
create or replace function public.gsa_is_admin(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gsa_members m
    where m.committee_id = c and m.user_id = (select auth.uid())
      and (m.owner or exists (
        select 1 from public.gsa_items p
        where p.committee_id = c and p.kind = 'people' and p.id = m.person_id and not p.deleted
          and coalesce((p.data ->> 'actif')::boolean, true)
          and (p.data -> 'roles') @> '["admin"]'::jsonb
      ))
  );
$$;

-- Fichiers joints : chemin « <comité>/<fichier> » dans le bucket gsa-fichiers.
create or replace function public.gsa_file_member(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.gsa_is_member(split_part(name, '/', 1)::uuid)
    else false
  end;
$$;

-- Garde-fous : seuls les admins touchent aux rôles et aux comptes administrateurs.
create or replace function public.gsa_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_admin boolean;
  now_admin boolean;
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  if auth.uid() is null or public.gsa_is_admin(new.committee_id) then
    return new;
  end if;
  if new.kind = 'roles' then
    raise exception 'Seul un administrateur peut modifier les rôles' using errcode = '42501';
  end if;
  if new.kind = 'people' then
    now_admin = coalesce((new.data -> 'roles') @> '["admin"]'::jsonb, false);
    if tg_op = 'INSERT' then
      -- Un upsert passe d'abord ici : si la fiche existe déjà, le contrôle se fait à la mise à jour.
      if now_admin and not exists (select 1 from public.gsa_items i where i.committee_id = new.committee_id and i.kind = new.kind and i.id = new.id) then
        raise exception 'Seul un administrateur peut donner le rôle Admin' using errcode = '42501';
      end if;
    else
      was_admin = coalesce((old.data -> 'roles') @> '["admin"]'::jsonb, false);
      if was_admin is distinct from now_admin
         or (was_admin and (new.deleted is distinct from old.deleted or (new.data ->> 'actif') is distinct from (old.data ->> 'actif'))) then
        raise exception 'Seul un administrateur peut modifier un compte administrateur' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists gsa_items_guard on public.gsa_items;
create trigger gsa_items_guard before insert or update on public.gsa_items
  for each row execute function public.gsa_items_guard();

-- Sans connexion (auth.uid() vide), gsa_is_member / gsa_is_admin renvoient toujours faux.

alter table public.gsa_members enable row level security;
alter table public.gsa_items enable row level security;

drop policy if exists gsa_members_select on public.gsa_members;
create policy gsa_members_select on public.gsa_members for select to authenticated
  using (user_id = (select auth.uid()) or public.gsa_is_member(committee_id));
-- Le propriétaire choisit lui-même sa fiche (première mise en route) ; les autres liens passent par gsa-acces.
drop policy if exists gsa_members_owner_link on public.gsa_members;
create policy gsa_members_owner_link on public.gsa_members for update to authenticated
  using (user_id = (select auth.uid()) and owner)
  with check (user_id = (select auth.uid()) and owner);

drop policy if exists gsa_items_select on public.gsa_items;
create policy gsa_items_select on public.gsa_items for select to authenticated
  using (public.gsa_is_member(committee_id));
drop policy if exists gsa_items_insert on public.gsa_items;
create policy gsa_items_insert on public.gsa_items for insert to authenticated
  with check (public.gsa_is_member(committee_id));
drop policy if exists gsa_items_update on public.gsa_items;
create policy gsa_items_update on public.gsa_items for update to authenticated
  using (public.gsa_is_member(committee_id))
  with check (public.gsa_is_member(committee_id));

-- Nom du comité : visible par ses membres, modifiable par ses admins.
drop policy if exists gsa_committees_select on public.committees;
create policy gsa_committees_select on public.committees for select to authenticated
  using (exists (select 1 from public.gsa_members m where m.committee_id = committees.id and m.user_id = (select auth.uid())));
drop policy if exists gsa_committees_update on public.committees;
create policy gsa_committees_update on public.committees for update to authenticated
  using (public.gsa_is_admin(id)) with check (public.gsa_is_admin(id));

-- Les profils ne sont plus lisibles par n'importe quel compte connecté (noms et adresses) : chacun voit le sien,
-- la règle « profiles_self_or_member » (soi-même ou membres d'un même comité) reste.
alter policy "profils lisibles" on public.profiles using (id = (select auth.uid()));

-- Fichiers joints (privés, 15 Mo max).
insert into storage.buckets (id, name, public, file_size_limit)
values ('gsa-fichiers', 'gsa-fichiers', false, 15728640)
on conflict (id) do nothing;

drop policy if exists gsa_fichiers_select on storage.objects;
create policy gsa_fichiers_select on storage.objects for select to authenticated
  using (bucket_id = 'gsa-fichiers' and public.gsa_file_member(name));
drop policy if exists gsa_fichiers_insert on storage.objects;
create policy gsa_fichiers_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gsa-fichiers' and public.gsa_file_member(name));
drop policy if exists gsa_fichiers_update on storage.objects;
create policy gsa_fichiers_update on storage.objects for update to authenticated
  using (bucket_id = 'gsa-fichiers' and public.gsa_file_member(name))
  with check (bucket_id = 'gsa-fichiers' and public.gsa_file_member(name));
drop policy if exists gsa_fichiers_delete on storage.objects;
create policy gsa_fichiers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gsa-fichiers' and public.gsa_file_member(name));

-- Synchronisation en direct.
alter publication supabase_realtime add table public.gsa_items;

-- Mise en route (une fois, depuis le SQL Editor) : rattacher le compte du président au comité comme propriétaire.
--   insert into public.gsa_members (committee_id, user_id, owner)
--   select c.id, u.id, true from public.committees c, auth.users u
--   where c.name = '<nom du comité>' and u.email = '<adresse du président>';
