-- Tâches GSA — 016 : membres du club (registre commun à toutes les entités).
-- Une seule fiche par personne pour tout le club : prénom, nom, email, téléphone, IBAN, groupes de l'organigramme.
-- Le registre compte aussi des membres sans accès à l'appli (licenciés, parents, bénévoles…).
--   • Accès (lecture et écriture) : le droit « club.membres » (rôle Admin, Secrétaire…) dans l'une des entités du club,
--     ou admin de l'une d'elles. Les autres membres n'y ont pas accès (IBAN).
--   • Les fiches des entités (people) sont liées au registre (data.membreId) : une fiche sans lien est rattachée au membre
--     de même email, ou en crée un. Les coordonnées (prénom, nom, email, téléphone) sont communes : modifiées dans le
--     registre ou dans une entité, elles valent pour toutes les fiches liées.
--   • Un membre qui a encore une fiche active dans une entité ne peut pas être supprimé du registre.
-- Reprise : les fiches existantes sont regroupées par email (comité central d'abord) ; leurs valeurs ne sont pas modifiées,
-- seul le lien membreId est ajouté. Le rôle « Secrétaire » du comité central reçoit le droit « club.membres ».

create table if not exists public.gsa_club_membres (
  club_id uuid not null references public.committees(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (club_id, id)
);
create index if not exists gsa_club_membres_email_idx on public.gsa_club_membres (club_id, lower(btrim(data ->> 'email')));
create index if not exists gsa_items_membre_idx on public.gsa_items ((data ->> 'membreId')) where kind = 'people';
alter table public.gsa_club_membres enable row level security;
grant select, insert, update, delete on public.gsa_club_membres to authenticated;

-- Accès au registre d'un club (club : comité central) : droit « club.membres » ou admin dans l'une de ses entités.
create or replace function public.gsa_membres_acces(club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.committees k where k.id = club and k.parent_id is null)
    and exists (
      select 1 from public.gsa_members m join public.committees c on c.id = m.committee_id
      where m.user_id = (select auth.uid()) and (c.id = club or c.parent_id = club)
        and (public.gsa_is_admin(c.id) or public.gsa_a_droit(c.id, 'club.membres'))
    )
$$;
grant execute on function public.gsa_membres_acces(uuid) to authenticated;

drop policy if exists gsa_club_membres_select on public.gsa_club_membres;
create policy gsa_club_membres_select on public.gsa_club_membres for select to authenticated using (public.gsa_membres_acces(club_id));
drop policy if exists gsa_club_membres_insert on public.gsa_club_membres;
create policy gsa_club_membres_insert on public.gsa_club_membres for insert to authenticated with check (public.gsa_membres_acces(club_id));
drop policy if exists gsa_club_membres_update on public.gsa_club_membres;
create policy gsa_club_membres_update on public.gsa_club_membres for update to authenticated
  using (public.gsa_membres_acces(club_id)) with check (public.gsa_membres_acces(club_id));
drop policy if exists gsa_club_membres_delete on public.gsa_club_membres;
create policy gsa_club_membres_delete on public.gsa_club_membres for delete to authenticated using (public.gsa_membres_acces(club_id));

-- Fiche du registre : champs connus seulement, tailles bornées, groupes = identifiants d'entités.
create or replace function public.gsa_club_membres_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb = new.data;
  g jsonb = case when jsonb_typeof(new.data -> 'groupes') = 'array' then new.data -> 'groupes' else '[]'::jsonb end;
begin
  if btrim(coalesce(d ->> 'prenom', '') || coalesce(d ->> 'nom', '')) = '' then
    raise exception 'Un membre du club a un nom ou un prénom' using errcode = '22023';
  end if;
  new.data = jsonb_build_object(
    'prenom', left(btrim(coalesce(d ->> 'prenom', '')), 100),
    'nom', left(btrim(coalesce(d ->> 'nom', '')), 100),
    'email', left(btrim(coalesce(d ->> 'email', '')), 200),
    'telephone', left(btrim(coalesce(d ->> 'telephone', '')), 50),
    'iban', left(upper(regexp_replace(coalesce(d ->> 'iban', ''), '\s', '', 'g')), 42),
    'couleur', case when coalesce(d ->> 'couleur', '') ~ '^#[0-9a-fA-F]{6}$' then d ->> 'couleur' else '#0f766e' end,
    'groupes', coalesce((select jsonb_agg(distinct x) from jsonb_array_elements_text(g) x where x ~ '^[0-9a-zA-Z_-]{1,64}$'), '[]'::jsonb)
  );
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

drop trigger if exists gsa_club_membres_guard on public.gsa_club_membres;
create trigger gsa_club_membres_guard before insert or update on public.gsa_club_membres
  for each row execute function public.gsa_club_membres_guard();

-- Pas de suppression d'un membre qui a encore une fiche active dans une entité du club.
create or replace function public.gsa_club_membres_suppression() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.gsa_items i join public.committees c on c.id = i.committee_id
    where (c.id = old.club_id or c.parent_id = old.club_id) and i.kind = 'people' and not i.deleted
      and i.data ->> 'membreId' = old.id and coalesce((i.data ->> 'actif')::boolean, true)
  ) then
    raise exception 'Ce membre a encore un poste dans une entité du club : retire-le d’abord de ses entités' using errcode = '42501';
  end if;
  return old;
end $$;

drop trigger if exists gsa_club_membres_suppression on public.gsa_club_membres;
create trigger gsa_club_membres_suppression before delete on public.gsa_club_membres
  for each row execute function public.gsa_club_membres_suppression();

-- Coordonnées d'une fiche (personne d'une entité ou membre du registre).
create or replace function public.gsa_coordonnees(d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'prenom', btrim(coalesce(d ->> 'prenom', '')),
    'nom', btrim(coalesce(d ->> 'nom', '')),
    'email', btrim(coalesce(d ->> 'email', '')),
    'telephone', btrim(coalesce(d ->> 'telephone', '')))
$$;

-- Registre modifié : ses coordonnées passent dans toutes les fiches liées des entités du club
-- (sauf la fiche d'entité qui vient de les changer : gsa.registre = « entité|fiche »).
create or replace function public.gsa_club_membres_diffuse() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  co jsonb = public.gsa_coordonnees(new.data);
  sauf text = coalesce(current_setting('gsa.registre', true), '');
begin
  update public.gsa_items i set data = i.data || co, client_id = null
  from public.committees c
  where c.id = i.committee_id and (c.id = new.club_id or c.parent_id = new.club_id)
    and i.kind = 'people' and i.data ->> 'membreId' = new.id
    and i.committee_id::text || '|' || i.id <> sauf
    and public.gsa_coordonnees(i.data) is distinct from co;
  return null;
end $$;

-- Fiche d'une entité enregistrée : liée au registre (lien gardé, sinon même email, sinon nouveau membre) ;
-- ses coordonnées, si elles ont changé, passent dans le registre puis dans les autres fiches liées.
create or replace function public.gsa_items_registre() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  club uuid;
  mid text = nullif(new.data ->> 'membreId', '');
  r public.gsa_club_membres;
  co jsonb;
begin
  if new.kind <> 'people' or new.deleted then
    return new;
  end if;
  -- Un upsert passe d'abord par l'insertion : si la fiche existe déjà, le lien se fait à la mise à jour.
  if tg_op = 'INSERT' and exists (select 1 from public.gsa_items i where i.committee_id = new.committee_id and i.kind = new.kind and i.id = new.id) then
    return new;
  end if;
  select coalesce(c.parent_id, c.id) into club from public.committees c where c.id = new.committee_id;
  if club is null then
    return new;
  end if;
  if mid is null and tg_op = 'UPDATE' then
    mid = nullif(old.data ->> 'membreId', '');
  end if;
  if mid is not null then
    select * into r from public.gsa_club_membres m where m.club_id = club and m.id = mid;
  end if;
  if r.id is null and btrim(coalesce(new.data ->> 'email', '')) <> '' then
    select * into r from public.gsa_club_membres m
    where m.club_id = club and lower(btrim(m.data ->> 'email')) = lower(btrim(new.data ->> 'email'))
    order by m.updated_at limit 1;
  end if;
  co = public.gsa_coordonnees(new.data);
  if r.id is null then
    if btrim((co ->> 'prenom') || (co ->> 'nom')) = '' then
      return new;
    end if;
    insert into public.gsa_club_membres (club_id, id, data)
    values (club, coalesce(mid, 'm' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
            co || jsonb_build_object('couleur', new.data ->> 'couleur', 'groupes', '[]'::jsonb))
    returning * into r;
  elsif public.gsa_coordonnees(r.data) is distinct from co then
    perform set_config('gsa.registre', new.committee_id::text || '|' || new.id, true);
    update public.gsa_club_membres m set data = m.data || co where m.club_id = club and m.id = r.id;
    perform set_config('gsa.registre', '', true);
  end if;
  new.data = new.data || jsonb_build_object('membreId', r.id);
  return new;
end $$;

-- Reprise des fiches existantes : un membre par email (comité central d'abord, puis les entités ; champs vides complétés),
-- un membre par fiche sans email. Seul le lien membreId est ajouté aux fiches.
do $$
declare
  p record;
  club uuid;
  mid text;
  co jsonb;
begin
  for p in
    select i.committee_id, i.id, i.data, coalesce(c.parent_id, c.id) as club
    from public.gsa_items i join public.committees c on c.id = i.committee_id
    where i.kind = 'people' and not i.deleted and nullif(i.data ->> 'membreId', '') is null
    order by (c.parent_id is not null), c.name, c.id, i.pos
  loop
    club = p.club;
    co = public.gsa_coordonnees(p.data);
    mid = null;
    if co ->> 'email' <> '' then
      select m.id into mid from public.gsa_club_membres m where m.club_id = club and lower(btrim(m.data ->> 'email')) = lower(co ->> 'email') limit 1;
    end if;
    if mid is null then
      if btrim((co ->> 'prenom') || (co ->> 'nom')) = '' then
        continue;
      end if;
      mid = 'm' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
      insert into public.gsa_club_membres (club_id, id, data)
      values (club, mid, co || jsonb_build_object('couleur', p.data ->> 'couleur', 'groupes', '[]'::jsonb));
    else
      -- Champs encore vides du membre complétés par cette fiche (sans diffusion : les fiches gardent leurs valeurs).
      update public.gsa_club_membres m set data = m.data
        || case when m.data ->> 'telephone' = '' and co ->> 'telephone' <> '' then jsonb_build_object('telephone', co ->> 'telephone') else '{}'::jsonb end
        || case when m.data ->> 'prenom' = '' and co ->> 'prenom' <> '' then jsonb_build_object('prenom', co ->> 'prenom') else '{}'::jsonb end
        || case when m.data ->> 'nom' = '' and co ->> 'nom' <> '' then jsonb_build_object('nom', co ->> 'nom') else '{}'::jsonb end
      where m.club_id = club and m.id = mid
        and ((m.data ->> 'telephone' = '' and co ->> 'telephone' <> '') or (m.data ->> 'prenom' = '' and co ->> 'prenom' <> '') or (m.data ->> 'nom' = '' and co ->> 'nom' <> ''));
    end if;
    update public.gsa_items i set data = i.data || jsonb_build_object('membreId', mid), client_id = null
    where i.committee_id = p.committee_id and i.kind = 'people' and i.id = p.id;
  end loop;
end $$;

-- Après la reprise : registre et fiches des entités se suivent.
drop trigger if exists gsa_club_membres_diffuse on public.gsa_club_membres;
create trigger gsa_club_membres_diffuse after insert or update on public.gsa_club_membres
  for each row execute function public.gsa_club_membres_diffuse();
drop trigger if exists gsa_items_registre on public.gsa_items;
create trigger gsa_items_registre before insert or update on public.gsa_items
  for each row execute function public.gsa_items_registre();

-- Droit « club.membres » pour le rôle Secrétaire du comité central (les admins l'ont déjà).
update public.gsa_items r set data = jsonb_set(r.data, '{permissions}', coalesce(r.data -> 'permissions', '[]'::jsonb) || '["club.membres"]'::jsonb), client_id = null
from public.committees c
where c.id = r.committee_id and c.parent_id is null and r.kind = 'roles' and r.id = 'secretaire' and not r.deleted
  and not coalesce(r.data -> 'permissions', '[]'::jsonb) ? 'club.membres';

-- Organigramme (011) : avec le lien de chaque fiche au registre (postes d'un membre du club).
create or replace function public.gsa_organigramme(club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.gsa_is_club_member(club) then
    raise exception 'Réservé aux membres du club' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'nom', c.name,
      'type', c.type,
      'parentId', c.parent_id,
      'info', c.info,
      'moi', public.gsa_is_member(c.id),
      'moiAdmin', public.gsa_is_admin(c.id),
      'membres', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id,
          'prenom', coalesce(p.data ->> 'prenom', ''),
          'nom', coalesce(p.data ->> 'nom', ''),
          'poste', coalesce(p.data ->> 'poste', ''),
          'autresPostes', p.data ->> 'autresPostes',
          'email', coalesce(p.data ->> 'email', ''),
          'couleur', coalesce(p.data ->> 'couleur', '#999999'),
          'membreId', p.data ->> 'membreId',
          'roles', (
            select coalesce(jsonb_agg(r.data ->> 'label' order by r.pos), '[]'::jsonb)
            from public.gsa_items r
            where r.committee_id = c.id and r.kind = 'roles' and not r.deleted and coalesce(p.data -> 'roles', '[]'::jsonb) ? r.id
          ),
          'admin', coalesce((p.data -> 'roles') @> '["admin"]'::jsonb, false),
          'caisse', exists (
            select 1 from public.gsa_items r
            where r.committee_id = c.id and r.kind = 'roles' and not r.deleted and coalesce(p.data -> 'roles', '[]'::jsonb) ? r.id
              and not coalesce((r.data ->> 'locked')::boolean, false) and (r.data -> 'permissions') ? 'paiements.payer'
          )
        ) order by p.pos), '[]'::jsonb)
        from public.gsa_items p
        where p.committee_id = c.id and p.kind = 'people' and not p.deleted and coalesce((p.data ->> 'actif')::boolean, true)
      ),
      'sections', case when c.parent_id is null then (
        select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.data ->> 'nom') order by s.pos), '[]'::jsonb)
        from public.gsa_items s
        where s.committee_id = c.id and s.kind = 'sections' and not s.deleted
      ) end
    ) order by c.parent_id nulls first, c.name), '[]'::jsonb)
    from public.committees c
    where c.id = club or c.parent_id = club
  );
end $$;
