-- Entités du club (appliqué le 05.10.2026).
--
-- Le club = un comité central (committees sans parent) et ses entités : sous-comités (organisation d'un
-- événement), groupes (école de cyclisme, compétition…) et équipes d'événement. Chaque entité est un
-- « comité » de l'appli avec ses propres données dans gsa_items (responsables, rôles, sections, statuts,
-- tâches…), visibles de ses seuls membres : le comité central ne voit pas les tâches des entités.
-- Ce qui passe d'une entité à l'autre se fait par les fonctions ci-dessous :
--   - gsa_organigramme : l'organigramme du club (entités, membres, postes), pour tous ses membres ;
--   - gsa_proposer_tache / gsa_mes_demandes : une entité envoie une tâche au comité central et en suit l'avancement.
-- Les entités sont créées par un admin du comité central (fonction gsa-acces, action « creerUnite »).
-- Migration additive : le comité existant devient le comité central, ses données ne changent pas.

alter table public.committees
  add column if not exists parent_id uuid references public.committees(id),
  add column if not exists type text not null default 'central',
  add column if not exists info jsonb not null default '{}'::jsonb; -- couleur, description, date, archive

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'committees_gsa_type') then
    alter table public.committees add constraint committees_gsa_type
      check (type in ('central', 'sous-comite', 'groupe', 'equipe') and ((parent_id is null) = (type = 'central')));
  end if;
end $$;
create index if not exists committees_parent_idx on public.committees (parent_id);

-- Membre du club : membre actif du comité central ou de l'une de ses entités.
create or replace function public.gsa_is_club_member(club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gsa_members m
    join public.committees c on c.id = m.committee_id
    where m.user_id = (select auth.uid()) and (c.id = club or c.parent_id = club) and public.gsa_is_member(c.id)
  );
$$;

-- Nom, type et fiche d'une entité : modifiables par ses admins et par ceux du comité central.
-- Le type et l'archivage restent réservés au comité central (garde-fou ci-dessous).
alter policy gsa_committees_update on public.committees
  using (public.gsa_is_admin(id) or public.gsa_is_admin(parent_id))
  with check (public.gsa_is_admin(id) or public.gsa_is_admin(parent_id));
grant update (name, type, info) on public.committees to authenticated;

create or replace function public.gsa_committees_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.gsa_is_admin(old.parent_id) then
    return new;
  end if;
  if new.type is distinct from old.type
     or coalesce(new.info -> 'archive', 'false'::jsonb) is distinct from coalesce(old.info -> 'archive', 'false'::jsonb) then
    raise exception 'Seul le comité central change le type d’une entité ou l’archive' using errcode = '42501';
  end if;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'gsa_committees_guard' and tgrelid = 'public.committees'::regclass) then
    create trigger gsa_committees_guard before update on public.committees
      for each row execute function public.gsa_committees_guard();
  end if;
end $$;

-- Organigramme du club : entités, membres actifs (nom, poste, rôles, adresse email), sections du comité central.
-- Les numéros de téléphone et tout le reste des données restent dans chaque entité.
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
          'roles', (
            select coalesce(jsonb_agg(r.data ->> 'label' order by r.pos), '[]'::jsonb)
            from public.gsa_items r
            where r.committee_id = c.id and r.kind = 'roles' and not r.deleted and coalesce(p.data -> 'roles', '[]'::jsonb) ? r.id
          ),
          'admin', coalesce((p.data -> 'roles') @> '["admin"]'::jsonb, false)
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

-- Une entité envoie une tâche au comité central : elle arrive sans responsable, au premier statut ouvert,
-- marquée « proposée » (entité, auteur, date). Le contenu est contrôlé ici, pas repris tel quel.
create or replace function public.gsa_proposer_tache(source uuid, tache jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  src public.committees;
  club uuid;
  par text;
  sec text;
  statut text;
  titre text := left(btrim(coalesce(tache ->> 'titre', '')), 300);
  remarque text := left(coalesce(tache ->> 'remarque', ''), 4000);
  delai text := case when coalesce(tache ->> 'delai', '') ~ '^\d{4}-\d{2}-\d{2}$' then tache ->> 'delai' else '' end;
  le text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  tid text := 'd' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  select * into src from public.committees where id = source;
  if src.id is null or src.parent_id is null then
    raise exception 'Seules les entités du club envoient des demandes au comité central' using errcode = '22023';
  end if;
  if not public.gsa_is_member(source) then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  if coalesce((src.info ->> 'archive')::boolean, false) then
    raise exception 'Cette entité est archivée' using errcode = '22023';
  end if;
  if titre = '' then
    raise exception 'La demande n’a pas de titre' using errcode = '22023';
  end if;
  club := src.parent_id;

  select nullif(btrim(coalesce(p.data ->> 'prenom', '') || ' ' || coalesce(p.data ->> 'nom', '')), '') into par
  from public.gsa_members m
  join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id
  where m.committee_id = source and m.user_id = (select auth.uid());

  select s.id into sec from public.gsa_items s
  where s.committee_id = club and s.kind = 'sections' and not s.deleted and s.id = tache ->> 'sectionId';
  if sec is null then
    select s.id into sec from public.gsa_items s
    where s.committee_id = club and s.kind = 'sections' and not s.deleted order by s.pos limit 1;
  end if;
  select s.id into statut from public.gsa_items s
  where s.committee_id = club and s.kind = 'statuses' and not s.deleted and not coalesce((s.data ->> 'done')::boolean, false)
  order by s.pos limit 1;

  insert into public.gsa_items (committee_id, kind, id, pos, data)
  select club, 'tasks', tid, coalesce(min(i.pos), 0) - 1, jsonb_build_object(
    'id', tid, 'sectionId', coalesce(sec, ''), 'sousSection', '', 'titre', titre, 'responsables', '[]'::jsonb,
    'statusId', coalesce(statut, ''), 'delai', delai, 'remarque', remarque, 'checklist', '[]'::jsonb,
    'createdBy', '', 'updatedAt', le,
    'proposee', jsonb_build_object('uniteId', source, 'unite', src.name, 'par', coalesce(par, 'Membre'), 'le', le))
  from public.gsa_items i where i.committee_id = club and i.kind = 'tasks';

  insert into public.gsa_items (committee_id, kind, id, pos, data)
  select club, 'log', 'l' || tid, coalesce(min(i.pos), 0) - 1, jsonb_build_object(
    'id', 'l' || tid, 'at', le, 'userId', '',
    'action', format('Demande de « %s » (%s) : « %s »', src.name, coalesce(par, 'Membre'), titre))
  from public.gsa_items i where i.committee_id = club and i.kind = 'log';

  return tid;
end $$;

-- Suivi des demandes d'une entité : statut, délai et responsables au comité central.
create or replace function public.gsa_mes_demandes(source uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  club uuid;
begin
  if not public.gsa_is_member(source) then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  select parent_id into club from public.committees where id = source;
  if club is null then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'titre', t.data ->> 'titre',
      'delai', coalesce(t.data ->> 'delai', ''),
      'le', t.data -> 'proposee' ->> 'le',
      'par', t.data -> 'proposee' ->> 'par',
      'statut', coalesce(s.data ->> 'label', '?'),
      'couleur', coalesce(s.data ->> 'couleur', '#999999'),
      'termine', coalesce((s.data ->> 'done')::boolean, false),
      'supprimee', t.deleted,
      'responsables', (
        select coalesce(jsonb_agg(btrim(coalesce(p.data ->> 'prenom', '') || ' ' || coalesce(p.data ->> 'nom', ''))), '[]'::jsonb)
        from public.gsa_items p
        where p.committee_id = club and p.kind = 'people'
          and p.id in (select jsonb_array_elements_text(coalesce(t.data -> 'responsables', '[]'::jsonb)))
      )
    ) order by t.data -> 'proposee' ->> 'le' desc), '[]'::jsonb)
    from public.gsa_items t
    left join public.gsa_items s on s.committee_id = club and s.kind = 'statuses' and s.id = t.data ->> 'statusId'
    where t.committee_id = club and t.kind = 'tasks' and t.data -> 'proposee' ->> 'uniteId' = source::text
  );
end $$;

-- Sans connexion, auth.uid() est vide : ces fonctions refusent (aucun membre).
grant execute on function public.gsa_organigramme(uuid) to authenticated;
grant execute on function public.gsa_proposer_tache(uuid, jsonb) to authenticated;
grant execute on function public.gsa_mes_demandes(uuid) to authenticated;

-- Fonction serveur gsa-acces : création des entités.
grant insert on public.committees to service_role;
grant update (name, type, info) on public.committees to service_role;
