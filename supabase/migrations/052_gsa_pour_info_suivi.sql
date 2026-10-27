-- Tâches GSA — 052 : suivi des « Pour info » (046) : relance, « modifiée depuis ton ✓ Vu », personnes sans compte,
-- « tout le monde l'a vue ».
--
-- • Garde gsa_items_contenu_garde : data.contenuLe (date ISO) est la date de la dernière modification du contenu de la
--   tâche : les champs suivis par l'historique (050), sauf « Pour info » (mettre quelqu'un au courant ne change pas la
--   tâche). L'appli la pose quand elle enregistre une modification ; le serveur la garde honnête :
--     - contenu inchangé : l'ancienne date reste (personne ne peut en inventer) ;
--     - contenu changé sans date nouvelle et plausible (modification depuis une entité du partage, ancienne version de
--       l'appli) : l'heure du serveur ; la ligne est alors marquée comme écrite par le serveur (client_id vide), pour que
--       l'appli la relise.
-- • gsa_pour_info_attendus(unite, d) (interne, appelée par les fonctions ci-dessous) : les clés « Pour info » qui attendent
--   un « ✓ Vu » sur la tâche `d` de l'entité `unite`. Ce sont les personnes mentionnées (« p:<fiche> », « a:<entité>:<fiche> »)
--   qui ont un compte et une fiche active, hors responsables. Pour une entité mentionnée en entier, ce sont chacune des
--   personnes qui la reçoivent (« u:<entité>:<fiche> », mêmes règles que gsa_pour_info_destinataires, 046). Entités du club
--   pas archivées. Les autres personnes mentionnées (sans compte, inactives) ne reçoivent rien et ne comptent pas.
-- • gsa_pour_info_vu (046) remplacée, mêmes contrôles :
--     - « ✓ Vu » sur une tâche modifiée depuis le précédent (contenuLe plus récent) : noté à part, { "le": <premier>,
--       "revu": <dernier> } ; sinon, comme avant, la première fois compte ;
--     - quand arrive le dernier « ✓ Vu » attendu, l'auteur de la tâche est prévenu (notification « toutVu » dans l'entité
--       de la tâche ; pas s'il est lui-même le dernier).
-- • gsa_pour_info_relancer(unite, tache, depuis) : depuis l'entité de la tâche, l'auteur, un responsable, un admin ou une
--   personne avec le droit « Modifier toutes les tâches » renvoie une notification (« relance ») à chacune des personnes
--   attendues qui ne l'ont pas encore vue, chacune dans son entité. Une relance par heure et par tâche au plus. Renvoie
--   { "n": <personnes relancées>, "le": <date ISO> }.
-- • gsa_pour_info_suivi(unite, taches) : pour chaque tâche « Pour info » de la liste (500 au plus) de l'entité `unite`, ses
--   clés attendues : { "<tâche>": ["p:…", "u:…:…"] }. Membres du club seulement, comme gsa_pour_info_destinataires ; ne
--   renvoie que des identifiants de fiches.
-- Ajout pur : une garde et trois fonctions nouvelles, gsa_pour_info_vu complétée ; aucune donnée modifiée (contenuLe
-- n'apparaît qu'aux prochaines modifications).
-- Pour revenir en arrière : supprimer le déclencheur gsa_items_contenu_garde, puis les fonctions gsa_items_contenu_garde,
-- gsa_pour_info_relancer, gsa_pour_info_suivi et gsa_pour_info_attendus, et relancer gsa_pour_info_vu de 046 (les dates
-- déjà enregistrées restent dans les tâches, sans effet).

create or replace function public.gsa_items_contenu_garde() returns trigger
language plpgsql set search_path = '' as $$
declare
  -- Mêmes champs non suivis que l'historique (050), plus « Pour info » et la date elle-même.
  ignores constant text[] := array['updatedAt', 'commentaires', 'pourInfoVus', 'modifiePar', 'source', 'pieces', 'suivanteId',
    'termineeLe', 'postesResp', 'createdBy', 'placePartage', 'parCentral', 'copieDe', 'attribueePar', 'proposee', 'id',
    'pourInfo', 'contenuLe'];
  vides constant jsonb[] := array['null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb, 'false'::jsonb];
  envoye jsonb;
  ancien jsonb;
  k text;
  a jsonb;
  b jsonb;
  change boolean := false;
  maintenant timestamptz := now();
begin
  if tg_op <> 'UPDATE' or new.kind is distinct from 'tasks' or new.deleted
     or jsonb_typeof(new.data) is distinct from 'object' or jsonb_typeof(old.data) is distinct from 'object' then
    return new;
  end if;
  envoye := new.data -> 'contenuLe';
  ancien := case when jsonb_typeof(old.data -> 'contenuLe') = 'string' then old.data -> 'contenuLe' end;
  for k in select x from jsonb_object_keys(old.data) x union select x from jsonb_object_keys(new.data) x loop
    continue when k = any (ignores);
    a := old.data -> k;
    b := new.data -> k;
    a := case when a is null or a = any (vides) then null else a end;
    b := case when b is null or b = any (vides) then null else b end;
    if a is distinct from b then
      change := true;
      exit;
    end if;
  end loop;
  if not change then
    new.data := (new.data - 'contenuLe') || case when ancien is not null then jsonb_build_object('contenuLe', ancien) else '{}'::jsonb end;
  elsif not (jsonb_typeof(envoye) = 'string'
             and envoye ->> 0 ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$'
             and envoye is distinct from ancien
             and (envoye ->> 0) > coalesce(ancien ->> 0, '')
             and (envoye ->> 0)::timestamptz <= maintenant + interval '5 minutes') then
    new.data := new.data || jsonb_build_object('contenuLe', to_char(maintenant at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;
  if (new.data -> 'contenuLe') is distinct from envoye then
    new.client_id := null;
  end if;
  return new;
end $$;

drop trigger if exists gsa_items_contenu_garde on public.gsa_items;
create trigger gsa_items_contenu_garde before update on public.gsa_items
  for each row execute function public.gsa_items_contenu_garde();

create or replace function public.gsa_pour_info_attendus(unite uuid, d jsonb) returns text[]
language sql stable security definer set search_path = '' as $$
  with p as (
    select case when jsonb_typeof(d -> 'pourInfo') = 'object' and jsonb_typeof(d -> 'paiement') is distinct from 'object'
             then d -> 'pourInfo' else '{}'::jsonb end as v,
           case when jsonb_typeof(d -> 'responsables') = 'array' then d -> 'responsables' else '[]'::jsonb end as resp
  ),
  club as (
    select coalesce(c.parent_id, c.id) as id from public.committees c where c.id = unite
  ),
  entites as (
    select c.id from public.committees c, club
    where coalesce(c.parent_id, c.id) = club.id and not coalesce((c.info ->> 'archive')::boolean, false)
  ),
  -- Fiches actives avec un compte, par entité du club.
  comptes as (
    select m.committee_id as entite, m.person_id as fiche, m.owner, x.data -> 'roles' as roles
    from public.gsa_members m
    join entites e on e.id = m.committee_id
    join public.gsa_items x on x.committee_id = m.committee_id and x.kind = 'people' and x.id = m.person_id and not x.deleted
    where coalesce((x.data ->> 'actif')::boolean, true)
  )
  select coalesce(array_agg(distinct z.k order by z.k), '{}')
  from (
    select 'p:' || f.v as k
    from p
    cross join lateral jsonb_array_elements_text(case when jsonb_typeof(p.v -> 'personnes') = 'array' then p.v -> 'personnes' else '[]'::jsonb end) f(v)
    join comptes c on c.entite = unite and c.fiche = f.v
    where not p.resp ? f.v
    union all
    select 'a:' || e.k || ':' || f.v
    from p
    cross join lateral jsonb_each(case when jsonb_typeof(p.v -> 'autres') = 'object' then p.v -> 'autres' else '{}'::jsonb end) e(k, l)
    cross join lateral jsonb_array_elements_text(case when jsonb_typeof(e.l) = 'array' then e.l else '[]'::jsonb end) f(v)
    join comptes c on c.entite::text = e.k and c.fiche = f.v
    where e.k <> unite::text
    union all
    select 'u:' || c.entite::text || ':' || c.fiche
    from p
    cross join lateral jsonb_array_elements_text(case when jsonb_typeof(p.v -> 'unites') = 'array' then p.v -> 'unites' else '[]'::jsonb end) e(v)
    join comptes c on c.entite::text = e.v
    where e.v <> unite::text
      and (c.owner or c.roles @> '["admin"]'::jsonb or exists (
        select 1 from public.gsa_items r
        where r.committee_id = c.entite and r.kind = 'roles' and not r.deleted and c.roles ? r.id
          and (coalesce((r.data ->> 'locked')::boolean, false) or (r.data -> 'permissions') ? 'tasks.viewAll')))
  ) z
$$;

revoke all on function public.gsa_pour_info_attendus(uuid, jsonb) from public, anon, authenticated;

create or replace function public.gsa_pour_info_vu(unite uuid, tache text, depuis uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi text := public.gsa_ma_fiche(depuis);
  d jsonb;
  p jsonb;
  vus jsonb;
  avant jsonb;
  cles text[] := '{}';
  k text;
  contenu text;
  nouveau boolean := false;
  attendus text[];
  auteur text;
  nom text;
  ici text;
  quand text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if moi is null then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  if depuis <> unite and not exists (
    select 1 from public.committees a, public.committees b
    where a.id = unite and b.id = depuis and coalesce(a.parent_id, a.id) = coalesce(b.parent_id, b.id)) then
    raise exception 'Tâche introuvable' using errcode = 'P0002';
  end if;
  select i.data into d
  from public.gsa_items i
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache and not i.deleted
  for update;
  if d is null then
    raise exception 'Tâche introuvable' using errcode = 'P0002';
  end if;
  p := case when jsonb_typeof(d -> 'pourInfo') = 'object' and jsonb_typeof(d -> 'paiement') is distinct from 'object' then d -> 'pourInfo' end;
  if depuis = unite then
    if jsonb_typeof(p -> 'personnes') = 'array' and (p -> 'personnes') ? moi then
      cles := cles || ('p:' || moi);
    end if;
  else
    if jsonb_typeof(p -> 'autres' -> depuis::text) = 'array' and (p -> 'autres' -> depuis::text) ? moi then
      cles := cles || ('a:' || depuis::text || ':' || moi);
    end if;
    if jsonb_typeof(p -> 'unites') = 'array' and (p -> 'unites') ? depuis::text
       and (public.gsa_is_admin(depuis) or public.gsa_a_droit(depuis, 'tasks.viewAll')) then
      cles := cles || ('u:' || depuis::text || ':' || moi);
    end if;
  end if;
  if cardinality(cles) = 0 then
    raise exception 'Cette tâche n’est pas « pour info » pour toi' using errcode = '42501';
  end if;
  contenu := case when jsonb_typeof(d -> 'contenuLe') = 'string' then d ->> 'contenuLe' end;
  avant := case when jsonb_typeof(d -> 'pourInfoVus') = 'object' then d -> 'pourInfoVus' else '{}'::jsonb end;
  vus := avant;
  foreach k in array cles loop
    if not vus ? k or jsonb_typeof(vus -> k) is distinct from 'object' then
      vus := vus || jsonb_build_object(k, jsonb_build_object('le', quand));
      nouveau := true;
    elsif contenu > coalesce(vus -> k ->> 'revu', vus -> k ->> 'le', '') then
      -- Modifiée depuis son « ✓ Vu » : revue.
      vus := vus || jsonb_build_object(k, (vus -> k) || jsonb_build_object('revu', quand));
    end if;
  end loop;
  if vus = avant then
    return d;
  end if;
  d := d || jsonb_build_object('pourInfoVus', vus);
  perform set_config('gsa.pour_info_vus', 'oui', true);
  update public.gsa_items i set data = d, client_id = null
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache;
  perform set_config('gsa.pour_info_vus', '', true);

  -- Dernier « ✓ Vu » attendu : l'auteur de la tâche est prévenu.
  if nouveau then
    attendus := public.gsa_pour_info_attendus(unite, d);
    auteur := nullif(d ->> 'createdBy', '');
    if cardinality(attendus) > 0
       and not exists (select 1 from unnest(attendus) a(cle) where not vus ? a.cle)
       and exists (select 1 from unnest(attendus) a(cle) where not avant ? a.cle)
       and auteur is not null and not (depuis = unite and auteur = moi)
       and exists (
         select 1 from public.gsa_items x
         where x.committee_id = unite and x.kind = 'people' and x.id = auteur and not x.deleted
           and coalesce((x.data ->> 'actif')::boolean, true)) then
      if depuis <> unite then
        select c.name into ici from public.committees c where c.id = depuis;
        select nullif(btrim(coalesce(x.data ->> 'prenom', '') || ' ' || coalesce(x.data ->> 'nom', '')), '') into nom
        from public.gsa_items x
        where x.committee_id = depuis and x.kind = 'people' and x.id = moi and not x.deleted;
      end if;
      insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
      select unite, 'notifications', z.nid,
        coalesce((select min(n.pos) from public.gsa_items n where n.committee_id = unite and n.kind = 'notifications'), 0) - 1,
        jsonb_build_object('id', z.nid, 'userId', auteur, 'type', 'toutVu', 'taskId', tache,
          'by', case when depuis = unite then moi else 'x:' || depuis::text || ':' || moi end,
          'at', quand, 'titre', coalesce(d ->> 'titre', ''))
        || case when depuis <> unite then jsonb_build_object('byName', coalesce(nom, '?') || ' (' || coalesce(ici, '?') || ')') else '{}'::jsonb end,
        false, null
      from (select 'n' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) as nid) z;
    end if;
  end if;
  return d;
end $$;

revoke all on function public.gsa_pour_info_vu(uuid, text, uuid) from public, anon;
grant execute on function public.gsa_pour_info_vu(uuid, text, uuid) to authenticated;

create or replace function public.gsa_pour_info_relancer(unite uuid, tache text, depuis uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi text := public.gsa_ma_fiche(depuis);
  club uuid;
  ici text;
  nom text;
  d jsonb;
  vus jsonb;
  derniere text;
  combien int;
  quand text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  limite text := to_char((now() - interval '1 hour') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if moi is null or depuis is distinct from unite then
    raise exception 'Réservé aux membres de l’entité de la tâche' using errcode = '42501';
  end if;
  select coalesce(c.parent_id, c.id), c.name into club, ici from public.committees c where c.id = unite;
  select i.data into d
  from public.gsa_items i
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache and not i.deleted
  for update;
  if jsonb_typeof(d) is distinct from 'object' or jsonb_typeof(d -> 'paiement') = 'object' then
    raise exception 'Tâche introuvable' using errcode = 'P0002';
  end if;
  if not (public.gsa_is_admin(unite)
          or d ->> 'createdBy' = moi
          or (jsonb_typeof(d -> 'responsables') = 'array' and (d -> 'responsables') ? moi)
          or public.gsa_a_droit_section(unite, 'tasks.editAny', d ->> 'sectionId')) then
    raise exception 'Seuls l’auteur, les responsables et les personnes qui modifient toutes les tâches peuvent relancer'
      using errcode = '42501';
  end if;
  select max(x.data ->> 'at') into derniere
  from public.gsa_items x
  join public.committees c on c.id = x.committee_id and coalesce(c.parent_id, c.id) = club
  where x.kind = 'notifications' and not x.deleted and x.data ->> 'type' = 'relance'
    and ((x.committee_id = unite and x.data ->> 'taskId' = tache) or x.data ->> 'taskId' = 'x:' || unite::text || ':' || tache);
  if derniere > limite then
    raise exception 'Déjà relancée il y a moins d’une heure' using errcode = '54000';
  end if;
  select nullif(btrim(coalesce(x.data ->> 'prenom', '') || ' ' || coalesce(x.data ->> 'nom', '')), '') into nom
  from public.gsa_items x
  where x.committee_id = unite and x.kind = 'people' and x.id = moi and not x.deleted;
  vus := case when jsonb_typeof(d -> 'pourInfoVus') = 'object' then d -> 'pourInfoVus' else '{}'::jsonb end;

  insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
  select z.entite, 'notifications', z.nid, z.pos,
    jsonb_build_object(
      'id', z.nid, 'userId', z.fiche, 'type', 'relance',
      'taskId', case when z.entite = unite then tache else 'x:' || unite::text || ':' || tache end,
      'by', case when z.entite = unite then moi else 'x:' || unite::text || ':' || moi end,
      'at', quand, 'titre', coalesce(d ->> 'titre', ''))
    || case when z.entite <> unite then jsonb_build_object('byName', coalesce(nom, '?') || ' (' || coalesce(ici, '?') || ')') else '{}'::jsonb end,
    false, null
  from (
    -- Un identifiant par notification (calculé ligne par ligne) ; en tête de la liste de son entité.
    select x.entite, x.fiche, 'n' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) as nid,
      coalesce((select min(n.pos) from public.gsa_items n where n.committee_id = x.entite and n.kind = 'notifications'), 0) - 1 as pos
    from (
      select distinct
        case when split_part(a.cle, ':', 1) = 'p' then unite else split_part(a.cle, ':', 2)::uuid end as entite,
        case when split_part(a.cle, ':', 1) = 'p' then split_part(a.cle, ':', 2) else split_part(a.cle, ':', 3) end as fiche
      from unnest(public.gsa_pour_info_attendus(unite, d)) a(cle)
      where not vus ? a.cle
    ) x
    offset 0
  ) z;
  get diagnostics combien = row_count;
  return jsonb_build_object('n', combien, 'le', quand);
end $$;

revoke all on function public.gsa_pour_info_relancer(uuid, text, uuid) from public, anon;
grant execute on function public.gsa_pour_info_relancer(uuid, text, uuid) to authenticated;

create or replace function public.gsa_pour_info_suivi(unite uuid, taches text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb := '{}'::jsonb;
  t record;
begin
  if not public.gsa_compte_ok() or not exists (
    select 1
    from public.gsa_members m
    join public.committees a on a.id = m.committee_id
    join public.committees b on b.id = unite
    where m.user_id = (select auth.uid()) and coalesce(a.parent_id, a.id) = coalesce(b.parent_id, b.id)) then
    raise exception 'Réservé aux membres du club' using errcode = '42501';
  end if;
  if cardinality(taches) > 500 then
    raise exception 'Trop de tâches à la fois (500 au plus)' using errcode = '54000';
  end if;
  for t in
    select i.id, i.data
    from public.gsa_items i
    where i.committee_id = unite and i.kind = 'tasks' and i.id = any (taches) and not i.deleted
      and jsonb_typeof(i.data -> 'pourInfo') = 'object' and jsonb_typeof(i.data -> 'paiement') is distinct from 'object'
  loop
    r := r || jsonb_build_object(t.id, to_jsonb(public.gsa_pour_info_attendus(unite, t.data)));
  end loop;
  return r;
end $$;

revoke all on function public.gsa_pour_info_suivi(uuid, text[]) from public, anon;
grant execute on function public.gsa_pour_info_suivi(uuid, text[]) to authenticated;
