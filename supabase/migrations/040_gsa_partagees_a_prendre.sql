-- Tâches GSA — 040 : « 🙋 À prendre » et « 👁 Pour info » aussi dans les tâches partagées par une autre entité.
--
-- Une tâche partagée (019, 027, 030 ; ou attribuée par le comité à un groupe / événement : 035) se modifie depuis les
-- entités du partage. Jusqu'ici, la proposition « À prendre » (038, 039) et la liste « Pour info » (037) ne se
-- changeaient que dans l'entité de la tâche. Désormais :
--
-- • À prendre : une entité du partage propose la tâche à ses propres personnes. Elles sont dans
--   data.aPrendre.partage = { "<entité>": { personnes, refus, par } } (fiches de cette entité ; par : qui l'a
--   proposée, prévenu des réponses). Elles la lisent depuis leur entité (gsa_partagee_lisible), et y répondent :
--   « Je m'en charge » les ajoute à respPartage[<entité>] (responsables de cette entité, comme d'habitude),
--   « Pas dispo » à refus. Une place est prise par toute personne proposée qui en est responsable, quelle que soit son
--   entité (gsa_places_prises) : gsa_prendre_tache (039) compte aussi celles des autres entités.
-- • gsa_modifier_tache_partagee (030) garde en plus, d'une entité du partage : ses personnes proposées (fiches
--   existantes chez elle ; leurs « Pas dispo » restent ceux du serveur), le nombre de personnes qu'il faut, et la liste
--   « Pour info » (chaque partie contrôlée : fiches de l'entité de la tâche, entités du club, fiches de ces entités).
--   Les personnes proposées par l'entité de la tâche ou par les autres entités ne changent pas d'ici.
-- • gsa_repondre_partagee(unite, source, tache, prend) : « Je m'en charge » (prend) ou « Pas dispo », depuis l'entité
--   `unite`, pour la tâche `tache` de l'entité `source`. Contrôles : fiche dans l'entité, tâche partagée avec elle,
--   proposée à la personne ici ; « Je m'en charge » : ni terminée ni complète (ligne verrouillée : deux clics en même
--   temps, le second trouve la place prise) ; « Pas dispo » : pas si elle en est déjà responsable. Renvoie la tâche.
--
-- Ajout pur : quatre fonctions redéfinies (même règle + ce qui est décrit ci-dessus) et deux nouvelles ; aucune donnée
-- modifiée. Pour revenir en arrière : relancer gsa_partagee_lisible de 029, gsa_modifier_tache_partagee de 030,
-- gsa_prendre_tache de 039, et supprimer gsa_repondre_partagee et gsa_places_prises.

-- Places prises d'une tâche à prendre : personnes proposées qui en sont responsables, dans l'entité de la tâche
-- (responsables) et dans les entités du partage (respPartage).
create or replace function public.gsa_places_prises(d jsonb) returns int
language sql immutable set search_path = '' as $$
  select (
    select count(*)
    from jsonb_array_elements_text(case when jsonb_typeof(d -> 'aPrendre' -> 'personnes') = 'array' then d -> 'aPrendre' -> 'personnes' else '[]'::jsonb end) x
    where jsonb_typeof(d -> 'responsables') = 'array' and (d -> 'responsables') ? x
  )::int + (
    select count(*)
    from jsonb_each(case when jsonb_typeof(d -> 'aPrendre' -> 'partage') = 'object' then d -> 'aPrendre' -> 'partage' else '{}'::jsonb end) e(k, v)
    cross join lateral jsonb_array_elements_text(case when jsonb_typeof(e.v -> 'personnes') = 'array' then e.v -> 'personnes' else '[]'::jsonb end) x
    where jsonb_typeof(d -> 'respPartage' -> e.k) = 'array' and (d -> 'respPartage' -> e.k) ? x
  )::int
$$;

revoke all on function public.gsa_places_prises(jsonb) from public, anon, authenticated;

-- 039, avec les places prises dans les entités du partage.
create or replace function public.gsa_prendre_tache(unite uuid, tache text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi text := public.gsa_ma_fiche(unite);
  d jsonb;
  a jsonb;
  resp jsonb;
  nombre int;
begin
  if moi is null then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  select i.data into d
  from public.gsa_items i
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache and not i.deleted
  for update;
  if d is null then
    raise exception 'Tâche introuvable' using errcode = 'P0002';
  end if;
  a := case when jsonb_typeof(d -> 'aPrendre') = 'object' then d -> 'aPrendre' end;
  if a is null or jsonb_typeof(d -> 'paiement') = 'object'
    or jsonb_typeof(a -> 'personnes') is distinct from 'array' or not (a -> 'personnes') ? moi then
    raise exception 'Cette tâche ne t’est pas proposée' using errcode = '42501';
  end if;
  resp := case when jsonb_typeof(d -> 'responsables') = 'array' then d -> 'responsables' else '[]'::jsonb end;
  if resp ? moi then
    return d;
  end if;
  if exists (
    select 1 from public.gsa_items s
    where s.committee_id = unite and s.kind = 'statuses' and s.id = d ->> 'statusId' and not s.deleted
      and coalesce((s.data ->> 'done')::boolean, false)) then
    raise exception 'Cette tâche est déjà terminée' using errcode = 'P0001';
  end if;
  nombre := case when jsonb_typeof(a -> 'nombre') = 'number' then least(greatest(floor((a ->> 'nombre')::numeric), 1), 100)::int else 1 end;
  if public.gsa_places_prises(d) >= nombre then
    raise exception 'Quelqu’un s’en charge déjà' using errcode = 'P0001';
  end if;
  -- Elle avait répondu « Pas dispo » (039) : elle change d'avis.
  if jsonb_typeof(a -> 'refus') = 'array' then
    a := a || jsonb_build_object('refus', (a -> 'refus') - moi);
  end if;
  d := d || jsonb_build_object(
    'responsables', resp || to_jsonb(moi),
    'aPrendre', a,
    'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  update public.gsa_items i set data = d, client_id = null
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache;
  return d;
end $$;

-- 029, avec les personnes à qui la tâche est proposée dans l'entité `unite`.
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
  -- À prendre (040) : proposée à la personne dans cette entité.
  if jsonb_typeof(t -> 'aPrendre' -> 'partage' -> unite::text -> 'personnes') = 'array'
     and (t -> 'aPrendre' -> 'partage' -> unite::text -> 'personnes') ? moi then
    return true;
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

-- 030, avec « À prendre » (personnes de l'entité `unite`, nombre) et « Pour info ».
create or replace function public.gsa_modifier_tache_partagee(unite uuid, source uuid, tache text, modif jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  src public.committees;
  club uuid;
  old jsonb;
  nd jsonb;
  place jsonb;
  a jsonb;
  m jsonb;
  ici jsonb;
  avant jsonb;
  pers jsonb;
  ref jsonb;
  par text;
  part jsonb;
  pi jsonb;
  x jsonb;
  n numeric;
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
  if old is not null and public.gsa_tache_dans(src.info -> 'historiqueDependance', coalesce(public.gsa_dependance(src.id) = unite, false),
       public.gsa_reglage_taches(src.id), src.parent_id, tache, old, unite) = 'ancienne' then
    raise exception 'Ancienne tâche de « % » : elle se consulte et se copie, sans modification', src.name using errcode = '42501';
  end if;
  if old is null or public.gsa_tache_dans(src.info -> 'historiqueDependance', coalesce(public.gsa_dependance(src.id) = unite, false),
       public.gsa_reglage_taches(src.id), src.parent_id, tache, old, unite) is distinct from 'modifiable' then
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

  -- À prendre (040) : d'ici, seulement les personnes proposées de cette entité (ses fiches) et le nombre qu'il faut.
  -- Leurs « Pas dispo » restent ceux du serveur (gsa_repondre_partagee), sauf celles qui ne sont plus proposées ou qui
  -- en sont devenues responsables.
  a := case when jsonb_typeof(old -> 'aPrendre') = 'object' then old -> 'aPrendre' else '{}'::jsonb end;
  m := case when jsonb_typeof(modif -> 'aPrendre') = 'object' then modif -> 'aPrendre' end;
  ici := m -> 'partage' -> unite::text;
  avant := a -> 'partage' -> unite::text;
  pers := (
    select coalesce(jsonb_agg(s.v order by s.n), '[]'::jsonb)
    from (
      select distinct on (r.v) r.v, r.n
      from jsonb_array_elements_text(case when jsonb_typeof(ici -> 'personnes') = 'array' then ici -> 'personnes' else '[]'::jsonb end) with ordinality r(v, n)
      where exists (select 1 from public.gsa_items p where p.committee_id = unite and p.kind = 'people' and p.id = r.v and not p.deleted)
      order by r.v, r.n
    ) s);
  ref := (
    select coalesce(jsonb_agg(distinct r.v), '[]'::jsonb)
    from jsonb_array_elements_text(case when jsonb_typeof(avant -> 'refus') = 'array' then avant -> 'refus' else '[]'::jsonb end) r(v)
    where pers ? r.v
      and not (jsonb_typeof(nd -> 'respPartage' -> unite::text) = 'array' and (nd -> 'respPartage' -> unite::text) ? r.v));
  par := case
    when jsonb_typeof(ici -> 'par') = 'string' and exists (
      select 1 from public.gsa_items p where p.committee_id = unite and p.kind = 'people' and p.id = ici ->> 'par' and not p.deleted)
    then ici ->> 'par'
    else avant ->> 'par' end;
  part := case when jsonb_typeof(a -> 'partage') = 'object' then (a -> 'partage') - unite::text else '{}'::jsonb end;
  if jsonb_array_length(pers) > 0 then
    part := part || jsonb_build_object(unite::text, jsonb_strip_nulls(jsonb_build_object(
      'personnes', pers,
      'refus', case when jsonb_array_length(ref) > 0 then ref end,
      'par', par)));
  end if;
  if m is not null then
    n := case when jsonb_typeof(m -> 'nombre') = 'number' then least(greatest(floor((m ->> 'nombre')::numeric), 1), 100) else 1 end;
    a := case when n > 1 then a || jsonb_build_object('nombre', n) else a - 'nombre' end;
  end if;
  if jsonb_typeof(a -> 'personnes') is distinct from 'array' then
    a := a || jsonb_build_object('personnes', '[]'::jsonb);
  end if;
  a := case when part = '{}'::jsonb then a - 'partage' else a || jsonb_build_object('partage', part) end;
  nd := case when jsonb_array_length(a -> 'personnes') = 0 and part = '{}'::jsonb then nd - 'aPrendre' else nd || jsonb_build_object('aPrendre', a) end;

  -- Pour info (040) : modifiable d'ici comme dans l'entité de la tâche. Personnes : fiches de l'entité de la tâche ;
  -- entités : celles du club (sauf l'entité de la tâche) ; autres : fiches de ces entités, par entité.
  if jsonb_typeof(modif -> 'pourInfo') = 'object' then
    pi := modif -> 'pourInfo';
    x := jsonb_strip_nulls(jsonb_build_object(
      'personnes', (
        select jsonb_agg(distinct r.v)
        from jsonb_array_elements_text(case when jsonb_typeof(pi -> 'personnes') = 'array' then pi -> 'personnes' else '[]'::jsonb end) r(v)
        where exists (select 1 from public.gsa_items p where p.committee_id = source and p.kind = 'people' and p.id = r.v and not p.deleted)),
      'unites', (
        select jsonb_agg(distinct r.v)
        from jsonb_array_elements_text(case when jsonb_typeof(pi -> 'unites') = 'array' then pi -> 'unites' else '[]'::jsonb end) r(v)
        where r.v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and exists (select 1 from public.committees c where c.id = r.v::uuid and c.id <> source and (c.id = club or c.parent_id = club))),
      'autres', (
        select jsonb_object_agg(z.k, z.l)
        from (
          select e.k, (
            select jsonb_agg(distinct r.v)
            from jsonb_array_elements_text(case when jsonb_typeof(e.v) = 'array' then e.v else '[]'::jsonb end) r(v)
            where exists (select 1 from public.gsa_items p where p.committee_id = e.k::uuid and p.kind = 'people' and p.id = r.v and not p.deleted)) as l
          from jsonb_each(case when jsonb_typeof(pi -> 'autres') = 'object' then pi -> 'autres' else '{}'::jsonb end) e(k, v)
          where e.k ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and exists (select 1 from public.committees c where c.id = e.k::uuid and c.id <> source and (c.id = club or c.parent_id = club))
        ) z
        where z.l is not null)));
    nd := case when x = '{}'::jsonb then nd - 'pourInfo' else nd || jsonb_build_object('pourInfo', x) end;
  else
    nd := nd - 'pourInfo';
  end if;

  nd := nd || jsonb_build_object('updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  update public.gsa_items i set data = nd, client_id = null
  where i.committee_id = source and i.kind = 'tasks' and i.id = tache;
end $$;

-- « Je m'en charge » (prend) ou « Pas dispo » depuis l'entité `unite`, pour une tâche de l'entité `source` partagée avec
-- elle et proposée à la personne connectée ici. Renvoie la tâche.
create or replace function public.gsa_repondre_partagee(unite uuid, source uuid, tache text, prend boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi text := public.gsa_ma_fiche(unite);
  src public.committees;
  club uuid;
  nom text;
  d jsonb;
  a jsonb;
  ici jsonb;
  rp jsonb;
  mes jsonb;
  ref jsonb;
  ma jsonb;
  nombre int;
begin
  if moi is null then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  select coalesce(x.parent_id, x.id), x.name into club, nom from public.committees x where x.id = unite;
  select * into src from public.committees x where x.id = source;
  if src.id is null or src.id = unite or coalesce(src.parent_id, src.id) is distinct from club
     or coalesce((src.info ->> 'archive')::boolean, false) then
    raise exception 'Entité introuvable' using errcode = '42501';
  end if;
  select i.data into d from public.gsa_items i
  where i.committee_id = source and i.kind = 'tasks' and i.id = tache and not i.deleted
  for update;
  if d is null then
    raise exception 'Tâche introuvable' using errcode = 'P0002';
  end if;
  if public.gsa_tache_dans(src.info -> 'historiqueDependance', coalesce(public.gsa_dependance(src.id) = unite, false),
       public.gsa_reglage_taches(src.id), src.parent_id, tache, d, unite) is distinct from 'modifiable' then
    raise exception 'Cette tâche n’est plus partagée avec cette entité' using errcode = '42501';
  end if;
  a := case when jsonb_typeof(d -> 'aPrendre') = 'object' then d -> 'aPrendre' end;
  ici := a -> 'partage' -> unite::text;
  if a is null or jsonb_typeof(ici -> 'personnes') is distinct from 'array' or not (ici -> 'personnes') ? moi then
    raise exception 'Cette tâche ne t’est pas proposée' using errcode = '42501';
  end if;
  rp := case when jsonb_typeof(d -> 'respPartage') = 'object' then d -> 'respPartage' else '{}'::jsonb end;
  mes := case when jsonb_typeof(rp -> unite::text) = 'array' then rp -> unite::text else '[]'::jsonb end;
  ref := case when jsonb_typeof(ici -> 'refus') = 'array' then ici -> 'refus' else '[]'::jsonb end;
  if prend then
    if mes ? moi then
      return d;
    end if;
    if exists (
      select 1 from public.gsa_items s
      where s.committee_id = source and s.kind = 'statuses' and s.id = d ->> 'statusId' and not s.deleted
        and coalesce((s.data ->> 'done')::boolean, false)) then
      raise exception 'Cette tâche est déjà terminée' using errcode = 'P0001';
    end if;
    nombre := case when jsonb_typeof(a -> 'nombre') = 'number' then least(greatest(floor((a ->> 'nombre')::numeric), 1), 100)::int else 1 end;
    if public.gsa_places_prises(d) >= nombre then
      raise exception 'Quelqu’un s’en charge déjà' using errcode = 'P0001';
    end if;
    d := d || jsonb_build_object('respPartage', rp || jsonb_build_object(unite::text, mes || to_jsonb(moi)));
    ref := ref - moi;
  else
    if mes ? moi then
      raise exception 'Tu t’en charges déjà : retire-toi des responsables dans la tâche' using errcode = 'P0001';
    end if;
    if ref ? moi then
      return d;
    end if;
    ref := ref || to_jsonb(moi);
  end if;
  ici := case when jsonb_array_length(ref) > 0 then ici || jsonb_build_object('refus', ref) else ici - 'refus' end;
  select p.data into ma from public.gsa_items p where p.committee_id = unite and p.kind = 'people' and p.id = moi and not p.deleted;
  d := d || jsonb_build_object(
    'aPrendre', a || jsonb_build_object('partage', (a -> 'partage') || jsonb_build_object(unite::text, ici)),
    'modifiePar', left(btrim(coalesce(ma ->> 'prenom', '') || ' ' || coalesce(ma ->> 'nom', '')) || ' (' || coalesce(nom, '') || ')', 200),
    'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  update public.gsa_items i set data = d, client_id = null
  where i.committee_id = source and i.kind = 'tasks' and i.id = tache;
  return d;
end $$;

revoke all on function public.gsa_repondre_partagee(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.gsa_repondre_partagee(uuid, uuid, text, boolean) to authenticated;
