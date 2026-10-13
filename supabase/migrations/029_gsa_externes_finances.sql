-- Tâches GSA — 029 : le serveur n'envoie à chacun que les tâches qu'il a le droit de voir (externes, finances).
--
-- Jusqu'ici, tout membre d'une entité recevait toutes ses données ; l'appli cachait ensuite les tâches d'autrui aux
-- rôles sans « Voir toutes les tâches » (bénévoles, responsables d'activité, externes…). Désormais le serveur
-- applique lui-même ces règles, ligne par ligne :
--   • une tâche est lisible par les admins de l'entité, par ses responsables, par la personne qui l'a créée, et par
--     les rôles « Voir toutes les tâches » qui couvrent sa section (rôle sans section = toutes, comme dans l'appli) ;
--   • un ticket (remboursement, facture : tâche avec « paiement ») a son propre contrôle, séparé : la caisse (droit
--     « Caisse »), le demandeur, la personne à qui le visa est demandé, celle qui l'a visé, ses responsables, la
--     personne qui l'a créé et les admins. « Voir toutes les tâches » ne suffit plus pour les tickets des autres ;
--   • emails programmés : ceux de ses tâches lisibles, et ceux qu'on a programmés ;
--   • notifications : celles qu'on reçoit et celles qu'on a envoyées ;
--   • journal : la console admin (droit « Accès console admin ») et ses propres entrées ;
--   • fichiers joints à des tâches : lisibles (et remplaçables, supprimables) seulement si l'une de ces tâches l'est ;
--     les autres fichiers de l'entité restent lisibles de ses membres ;
--   • tâches des autres entités (gsa_taches_partagees, 027 ; gsa_taches_transmises, 018) : pour les admins et les
--     rôles « Voir toutes les tâches » de l'entité qui les reçoit ; sinon seulement celles dont on est responsable
--     (même personne : même fiche du registre des membres du club ou même email, comme dans l'appli).
-- Le reste (séances, événements, personnes, sondages, réglages…) ne change pas : lisible de tous les membres.
--
-- Écriture : une ligne qu'on vient d'écrire reste lisible le temps de cette écriture (updated_by et updated_at, posés
-- par gsa_items_guard), sinon l'enregistrement d'une tâche qu'on confie à quelqu'un d'autre serait refusé (un
-- upsert relit la ligne écrite). On ne peut toujours modifier que les lignes qu'on peut lire.
-- Aucune donnée modifiée. Pour revenir en arrière : relancer les règles et fonctions de 003, 006, 018 et 027.

-- L'utilisateur connecté a-t-il ce droit dans l'entité, pour cette section (rôle sans section = toutes) ?
create or replace function public.gsa_a_droit_section(c uuid, perm text, section text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.gsa_members m
    join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
    join public.gsa_items r on r.committee_id = m.committee_id and r.kind = 'roles' and not r.deleted
    where m.committee_id = c and m.user_id = (select auth.uid())
      and coalesce((p.data ->> 'actif')::boolean, true)
      and (p.data -> 'roles') ? r.id
      and (coalesce((r.data ->> 'locked')::boolean, false) or (r.data -> 'permissions') ? perm)
      and (coalesce(section, '') = ''
        or jsonb_typeof(r.data -> 'sections') is distinct from 'array'
        or jsonb_array_length(r.data -> 'sections') = 0
        or (r.data -> 'sections') ? section)
  )
$$;

-- La tâche `t` de l'entité `c` est-elle lisible par l'utilisateur connecté (membre de l'entité) ?
create or replace function public.gsa_tache_lisible(c uuid, t jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  moi text;
  p jsonb := case when jsonb_typeof(t -> 'paiement') = 'object' then t -> 'paiement' end;
begin
  if public.gsa_is_admin(c) then
    return true;
  end if;
  moi := public.gsa_ma_fiche(c);
  if moi is not null and (
       (jsonb_typeof(t -> 'responsables') = 'array' and (t -> 'responsables') ? moi)
    or t ->> 'createdBy' = moi
    or p ->> 'demandePar' = moi
    or p -> 'visa' ->> 'a' = moi
    or p -> 'validation' ->> 'par' = moi) then
    return true;
  end if;
  if p is not null then
    return public.gsa_a_droit(c, 'paiements.payer');
  end if;
  return public.gsa_a_droit_section(c, 'tasks.viewAll', t ->> 'sectionId');
end $$;

-- Ligne de gsa_items lisible par l'utilisateur connecté ? `ecrit` : il vient de l'écrire (même transaction).
create or replace function public.gsa_ligne_lisible(c uuid, k text, d jsonb, ecrit boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  moi text;
begin
  if not public.gsa_is_member(c) then
    return false;
  end if;
  if k not in ('tasks', 'emails', 'notifications', 'log') or coalesce(ecrit, false) or public.gsa_is_admin(c) then
    return true;
  end if;
  moi := public.gsa_ma_fiche(c);
  return coalesce(case k
    when 'tasks' then public.gsa_tache_lisible(c, d)
    when 'emails' then d ->> 'creePar' = moi or exists (
      select 1 from public.gsa_items t
      where t.committee_id = c and t.kind = 'tasks' and t.id = d ->> 'taskId' and public.gsa_tache_lisible(c, t.data))
    when 'notifications' then d ->> 'userId' = moi or d ->> 'by' = moi
    when 'log' then d ->> 'userId' = moi or public.gsa_a_droit(c, 'admin.access')
  end, false);
end $$;

-- Membres de l'entité : lecture et modification des lignes lisibles ; ajout comme avant (gsa_items_guard contrôle le
-- reste). L'accès du comité central (006) est fermé depuis 028.
alter policy gsa_items_select on public.gsa_items
  using (public.gsa_ligne_lisible(committee_id, kind, data, updated_by = (select auth.uid()) and updated_at = now()));
alter policy gsa_items_insert on public.gsa_items
  with check (public.gsa_is_member(committee_id));
alter policy gsa_items_update on public.gsa_items
  using (public.gsa_ligne_lisible(committee_id, kind, data, updated_by = (select auth.uid()) and updated_at = now()))
  with check (public.gsa_is_member(committee_id));

-- Fichiers : « <entité>/<fichier> ». Joint à des tâches (documents, visa signé compris) : lisible seulement si l'une
-- d'elles l'est ; sinon par les membres de l'entité, comme avant. (Paramètre qualifié, comme dans 012.)
create or replace function public.gsa_file_reader(name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  dossier text := split_part(gsa_file_reader.name, '/', 1);
  c uuid;
  f text;
begin
  if dossier !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  c := dossier::uuid;
  if not public.gsa_is_member(c) then
    return false;
  end if;
  f := substr(gsa_file_reader.name, length(dossier) + 2);
  return not exists (
      select 1 from public.gsa_items t
      where t.committee_id = c and t.kind = 'tasks' and jsonb_typeof(t.data -> 'documents') = 'array'
        and (t.data -> 'documents' @> jsonb_build_array(jsonb_build_object('id', f))
          or t.data -> 'documents' @> jsonb_build_array(jsonb_build_object('id', gsa_file_reader.name))))
    or exists (
      select 1 from public.gsa_items t
      where t.committee_id = c and t.kind = 'tasks' and jsonb_typeof(t.data -> 'documents') = 'array'
        and (t.data -> 'documents' @> jsonb_build_array(jsonb_build_object('id', f))
          or t.data -> 'documents' @> jsonb_build_array(jsonb_build_object('id', gsa_file_reader.name)))
        and public.gsa_tache_lisible(c, t.data));
end $$;

alter policy gsa_fichiers_update on storage.objects
  using (bucket_id = 'gsa-fichiers' and public.gsa_file_writer(name) and public.gsa_file_reader(name))
  with check (bucket_id = 'gsa-fichiers' and public.gsa_file_writer(name));
alter policy gsa_fichiers_delete on storage.objects
  using (bucket_id = 'gsa-fichiers' and public.gsa_file_member(name) and public.gsa_file_reader(name));

-- Tâche `t` de l'entité `source`, affichée dans l'entité `unite` (tâches partagées, transmises) : lisible ?
-- Admins et rôles « Voir toutes les tâches » de `unite` : oui ; sinon, seulement pour l'un de ses responsables (dans
-- `source` ou choisis par une entité du partage), reconnu comme dans l'appli : sa fiche dans `unite`, même fiche du
-- registre des membres du club ou même adresse email.
create or replace function public.gsa_partagee_lisible(unite uuid, source uuid, t jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  moi text;
  ma jsonb;
begin
  if public.gsa_is_admin(unite) or public.gsa_a_droit(unite, 'tasks.viewAll') then
    return true;
  end if;
  moi := public.gsa_ma_fiche(unite);
  if moi is null then
    return false;
  end if;
  select p.data into ma from public.gsa_items p where p.committee_id = unite and p.kind = 'people' and p.id = moi and not p.deleted;
  return exists (
    select 1
    from (
      select source as entite, r.v as fid
      from jsonb_array_elements_text(case when jsonb_typeof(t -> 'responsables') = 'array' then t -> 'responsables' else '[]'::jsonb end) r(v)
      union all
      select e.k::uuid, r.v
      from jsonb_each(case when jsonb_typeof(t -> 'respPartage') = 'object' then t -> 'respPartage' else '{}'::jsonb end) e(k, l)
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(e.l) = 'array' then e.l else '[]'::jsonb end) r(v)
      where e.k ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) x
    join public.gsa_items p on p.committee_id = x.entite and p.kind = 'people' and p.id = x.fid and not p.deleted
    where (x.entite = unite and x.fid = moi)
       or (coalesce(ma ->> 'membreId', '') <> '' and p.data ->> 'membreId' = ma ->> 'membreId')
       or (btrim(coalesce(ma ->> 'email', '')) <> '' and lower(btrim(p.data ->> 'email')) = lower(btrim(ma ->> 'email')))
  );
end $$;

-- 027, avec gsa_partagee_lisible.
create or replace function public.gsa_taches_partagees(unite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  club uuid;
begin
  if not public.gsa_is_member(unite) then
    return '[]'::jsonb;
  end if;
  select coalesce(x.parent_id, x.id) into club from public.committees x where x.id = unite;
  return (
    with sources as (
      select c.id, c.name, c.type, c.parent_id,
             coalesce(public.gsa_dependance(c.id) = unite, false) as depend,
             public.gsa_reglage_taches(c.id) as reglage
      from public.committees c
      where (c.id = club or c.parent_id = club) and c.id <> unite
        and not coalesce((c.info ->> 'archive')::boolean, false)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'uniteId', c.id,
      'unite', c.name,
      'type', c.type,
      'task', t.data - 'documents',
      'statuts', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id,
          'label', coalesce(s.data ->> 'label', ''),
          'done', coalesce((s.data ->> 'done')::boolean, false)
        ) order by s.pos), '[]'::jsonb)
        from public.gsa_items s
        where s.committee_id = c.id and s.kind = 'statuses' and not s.deleted
      )
    ) order by c.name, t.data ->> 'delai'), '[]'::jsonb)
    from sources c
    join public.gsa_items t on t.committee_id = c.id and t.kind = 'tasks' and not t.deleted
    where public.gsa_tache_visible(t.data, c.parent_id, c.depend, c.reglage, unite)
      and public.gsa_partagee_lisible(unite, c.id, t.data)
  );
end $$;

-- 027, avec gsa_partagee_lisible.
create or replace function public.gsa_modifier_tache_partagee(unite uuid, source uuid, tache text, modif jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  src public.committees;
  club uuid;
  old jsonb;
  nd jsonb;
  place jsonb;
begin
  if not public.gsa_is_member(unite) then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  select coalesce(x.parent_id, x.id) into club from public.committees x where x.id = unite;
  select * into src from public.committees x where x.id = source;
  if src.id is null or src.id = unite or coalesce(src.parent_id, src.id) is distinct from club
     or coalesce((src.info ->> 'archive')::boolean, false) then
    raise exception 'Entité introuvable' using errcode = '42501';
  end if;
  select i.data into old from public.gsa_items i
  where i.committee_id = source and i.kind = 'tasks' and i.id = tache and not i.deleted
  for update;
  if old is null or not public.gsa_tache_visible(old, src.parent_id, coalesce(public.gsa_dependance(src.id) = unite, false),
       public.gsa_reglage_taches(src.id), unite) then
    raise exception 'Cette tâche n’est plus partagée avec cette entité' using errcode = '42501';
  end if;
  if not public.gsa_partagee_lisible(unite, source, old) then
    raise exception 'Cette tâche ne t’est pas attribuée' using errcode = '42501';
  end if;

  nd := old;
  if jsonb_typeof(modif -> 'titre') = 'string' and btrim(modif ->> 'titre') <> '' then
    nd := nd || jsonb_build_object('titre', left(btrim(modif ->> 'titre'), 500));
  end if;
  -- Délai changé ici : il ne suit plus l'événement / la séance de l'entité de la tâche.
  if jsonb_typeof(modif -> 'delai') = 'string' and (modif ->> 'delai' = '' or modif ->> 'delai' ~ '^\d{4}-\d{2}-\d{2}$')
     and (modif ->> 'delai') is distinct from (old ->> 'delai') then
    nd := (nd - 'delaiRef') || jsonb_build_object('delai', modif ->> 'delai');
  end if;
  if jsonb_typeof(modif -> 'statusId') = 'string' and exists (
       select 1 from public.gsa_items s
       where s.committee_id = source and s.kind = 'statuses' and s.id = modif ->> 'statusId' and not s.deleted) then
    nd := nd || jsonb_build_object('statusId', modif ->> 'statusId');
  end if;
  if jsonb_typeof(modif -> 'remarque') = 'string' then
    nd := nd || jsonb_build_object('remarque', left(modif ->> 'remarque', 5000));
  end if;
  if jsonb_typeof(modif -> 'checklist') = 'array' then
    nd := nd || jsonb_build_object('checklist', modif -> 'checklist');
  end if;
  -- Responsables : fiches de l'entité de la tâche ; ceux des entités du partage : respPartage.
  if jsonb_typeof(modif -> 'responsables') = 'array' then
    nd := nd || jsonb_build_object('responsables', (
      select coalesce(jsonb_agg(r.v order by r.n), '[]'::jsonb)
      from jsonb_array_elements_text(modif -> 'responsables') with ordinality as r(v, n)
      where exists (select 1 from public.gsa_items p where p.committee_id = source and p.kind = 'people' and p.id = r.v and not p.deleted)
    ));
  end if;
  if jsonb_typeof(modif -> 'respPartage') = 'object' then
    nd := nd || jsonb_build_object('respPartage', modif -> 'respPartage');
  else
    nd := nd - 'respPartage';
  end if;
  -- Rangement : seulement celui de l'entité qui modifie.
  place := coalesce(old -> 'placePartage', '{}'::jsonb) - unite::text;
  if jsonb_typeof(modif -> 'placePartage' -> unite::text) = 'object' then
    place := place || jsonb_build_object(unite::text, modif -> 'placePartage' -> unite::text);
  end if;
  nd := case when place = '{}'::jsonb then nd - 'placePartage' else nd || jsonb_build_object('placePartage', place) end;
  if jsonb_typeof(modif -> 'termineeLe') = 'string' then
    nd := nd || jsonb_build_object('termineeLe', left(modif ->> 'termineeLe', 10));
  else
    nd := nd - 'termineeLe';
  end if;
  if jsonb_typeof(modif -> 'modifiePar') = 'string' then
    nd := nd || jsonb_build_object('modifiePar', left(modif ->> 'modifiePar', 200));
  end if;
  nd := nd || jsonb_build_object('updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  update public.gsa_items i set data = nd, client_id = null
  where i.committee_id = source and i.kind = 'tasks' and i.id = tache;
end $$;

-- 018 (ancienne lecture des tâches transmises, plus utilisée par l'appli), avec gsa_partagee_lisible.
create or replace function public.gsa_taches_transmises(club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.committees where id = club and parent_id is null) or not public.gsa_is_member(club) then
    raise exception 'Réservé aux membres du comité central' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'uniteId', c.id,
      'unite', c.name,
      'type', c.type,
      'id', t.id,
      'titre', coalesce(t.data ->> 'titre', ''),
      'delai', coalesce(t.data ->> 'delai', ''),
      'remarque', coalesce(t.data ->> 'remarque', ''),
      'statut', coalesce(s.data ->> 'label', '?'),
      'termine', coalesce((s.data ->> 'done')::boolean, false),
      'termineeLe', t.data ->> 'termineeLe',
      'checklist', case when jsonb_typeof(t.data -> 'checklist') = 'array' then t.data -> 'checklist' else '[]'::jsonb end,
      'responsables', (
        select coalesce(jsonb_agg(btrim(coalesce(p.data ->> 'prenom', '') || ' ' || coalesce(p.data ->> 'nom', ''))), '[]'::jsonb)
        from public.gsa_items p
        where p.committee_id = c.id and p.kind = 'people' and not p.deleted
          and p.id in (select jsonb_array_elements_text(case when jsonb_typeof(t.data -> 'responsables') = 'array' then t.data -> 'responsables' else '[]'::jsonb end))
      )
    )) order by c.name, t.data ->> 'delai'), '[]'::jsonb)
    from public.committees c
    join public.gsa_items t on t.committee_id = c.id and t.kind = 'tasks' and not t.deleted
    left join public.gsa_items s on s.committee_id = c.id and s.kind = 'statuses' and s.id = t.data ->> 'statusId' and not s.deleted
    where c.parent_id = club
      and not coalesce((c.info ->> 'archive')::boolean, false)
      and coalesce((t.data ->> 'auCentral')::boolean, false)
      and not (t.data ? 'paiement')
      and public.gsa_partagee_lisible(club, c.id, t.data)
  );
end $$;

-- Fonctions internes : appelées par les règles et les autres fonctions seulement.
revoke all on function public.gsa_a_droit_section(uuid, text, text) from public, anon, authenticated;
revoke all on function public.gsa_tache_lisible(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.gsa_partagee_lisible(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.gsa_ligne_lisible(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.gsa_ligne_lisible(uuid, text, jsonb, boolean) to authenticated;
grant execute on function public.gsa_file_reader(text) to authenticated;
