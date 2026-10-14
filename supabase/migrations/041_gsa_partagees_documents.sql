-- Tâches GSA — 041 : dans une tâche partagée par une autre entité, documents, répétition, séance liée et partage aussi.
--
-- Une tâche partagée (019, 027, 030, 035) se modifie depuis les entités du partage : titre, délai, statut, responsables,
-- remarque, checklist, et depuis 040 « À prendre » et « Pour info ». Le reste se gérait seulement dans l'entité de la
-- tâche. Désormais, depuis une entité du partage (`unite`) :
--
-- • Documents : la liste des documents de la tâche (gsa_taches_partagees les renvoie désormais). Ceux qui y sont restent
--   tels quels (ou sont retirés de la liste) ; d'ici, on ajoute des liens (http/https) et des fichiers déposés par la
--   personne connectée dans le dossier de l'entité de la tâche, sous « <entité>/pt-… » (gsa_depot_partage). Chaque
--   document ajouté d'ici note qui l'a ajouté (parNom : « Prénom Nom (Entité) »). Un fichier de la tâche est lisible
--   depuis les entités qui voient la tâche (gsa_fichier_partage_lisible : même règle que la tâche elle-même) ; les membres
--   de l'entité de la tâche lisent les fichiers « pt-… » comme les leurs (029). Retirer un fichier d'ici le retire de la
--   tâche, sans l'effacer du stockage (seule l'entité de la tâche efface ses fichiers) ; un fichier « pt-… » qu'aucune
--   tâche n'utilise peut être effacé par la personne qui l'a déposé.
-- • Répétition : chaque semaine, mois, trimestre, semestre ou année (« à chaque séance » : seulement si elle l'était
--   déjà, ce sont les séances de l'entité de la tâche). L'entité de la tâche crée l'occurrence suivante quand la tâche
--   est terminée (l'appli, à l'ouverture par l'un de ses membres).
-- • Séance liée : une séance de cette entité (son ordre du jour et son PV : seanceComite), si la tâche n'est liée ni à
--   une séance de son entité ni à celle d'une autre entité.
-- • Partage : avec d'autres entités du club (pas l'entité de la tâche) ; cette entité-ci reste comme elle était (on ne
--   s'ajoute ni ne se retire d'ici). La séance d'une entité retirée du partage est retirée aussi.
-- Les modifications des appli d'avant (040) restent valables : sans liste de documents, ceux de la tâche sont gardés ; la
-- répétition, la séance et le partage qu'elles renvoient tels quels ne changent pas.
-- gsa_taches_partagees renvoie aussi « v » = 41 : l'appli sait alors que ces parties se modifient d'ici.
--
-- Ajout pur : deux fonctions redéfinies (même règle + ce qui est décrit ci-dessus), trois nouvelles et trois règles de
-- stockage nouvelles ; aucune donnée modifiée. Pour revenir en arrière : relancer gsa_taches_partagees de 030 et
-- gsa_modifier_tache_partagee de 040, supprimer les règles gsa_fichiers_partage_insert / _select / _delete et les
-- fonctions gsa_depot_partage, gsa_fichier_partage_lisible et gsa_docs_partagee.

-- 030, avec les documents de la tâche (lisibles d'ici : gsa_fichier_partage_lisible) et la version (41).
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
      select c.id, c.name, c.type, c.parent_id, c.info -> 'historiqueDependance' as h,
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
      'task', t.data,
      'v', 41,
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
    where public.gsa_tache_dans(c.h, c.depend, c.reglage, c.parent_id, t.id, t.data, unite) = 'modifiable'
      and public.gsa_partagee_lisible(unite, c.id, t.data)
  );
end $$;


-- Documents d'une tâche de l'entité `source` modifiés depuis une entité du partage : `avant` (ceux de la tâche),
-- `liste` (ceux envoyés), `qui` (« Prénom Nom (Entité) »). Ceux de la tâche restent tels quels ; les nouveaux : liens
-- http(s), fichiers « <source>/pt-… » déposés par la personne connectée. Au plus 100.
create or replace function public.gsa_docs_partagee(source uuid, avant jsonb, liste jsonb, qui text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  docs jsonb := '[]'::jsonb;
  vus text[] := '{}';
  d jsonb;
  od jsonb;
  did text;
  le text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  for d in select e from jsonb_array_elements(case when jsonb_typeof(liste) = 'array' then liste else '[]'::jsonb end) e loop
    did := case when jsonb_typeof(d) = 'object' then d ->> 'id' end;
    if did is null or did = any (vus) then
      continue;
    end if;
    if cardinality(vus) >= 100 then
      raise exception 'Trop de documents (100 au plus)' using errcode = '22023';
    end if;
    od := (select e from jsonb_array_elements(case when jsonb_typeof(avant) = 'array' then avant else '[]'::jsonb end) e
           where e ->> 'id' = did limit 1);
    if od is not null then
      docs := docs || jsonb_build_array(od);
    elsif d ->> 'kind' = 'lien' then
      if did !~ '^[A-Za-z0-9_-]{1,60}$' or coalesce(d ->> 'url', '') !~* '^https?://\S+$' or length(d ->> 'url') > 2000 then
        raise exception 'Lien invalide : « % »', left(coalesce(nullif(btrim(d ->> 'nom'), ''), d ->> 'url', ''), 100) using errcode = '22023';
      end if;
      docs := docs || jsonb_build_array(jsonb_build_object(
        'id', did, 'nom', left(coalesce(nullif(btrim(d ->> 'nom'), ''), 'lien'), 200), 'kind', 'lien', 'url', d ->> 'url',
        'par', '', 'parNom', qui, 'le', le));
    elsif d ->> 'kind' = 'fichier' then
      if did !~ ('^' || source::text || '/pt-[A-Za-z0-9_-]{4,60}$')
         or not exists (select 1 from storage.objects o
           where o.bucket_id = 'gsa-fichiers' and o.name = did and o.owner_id = (select auth.uid())::text) then
        raise exception 'Fichier introuvable : « % » ; ajoute-le à nouveau', left(coalesce(d ->> 'nom', ''), 100) using errcode = '22023';
      end if;
      docs := docs || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', did, 'nom', left(coalesce(nullif(btrim(d ->> 'nom'), ''), 'fichier'), 200), 'kind', 'fichier',
        'mime', left(d ->> 'mime', 100), 'taille', case when jsonb_typeof(d -> 'taille') = 'number' then d -> 'taille' end,
        'par', '', 'parNom', qui, 'le', le)));
    else
      continue;
    end if;
    vus := vus || did;
  end loop;
  return docs;
end $$;

revoke all on function public.gsa_docs_partagee(uuid, jsonb, jsonb, text) from public, anon, authenticated;

-- 040, avec les documents, la répétition, la séance de cette entité et le partage (voir plus haut).
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
  nomu text;
  ma jsonb;
  docs jsonb;
  sc jsonb;
  pavant jsonb;
  pnouv jsonb;
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

  -- Documents (041) : seulement si l'appli envoie la liste (celles d'avant ne la connaissaient pas : rien ne change).
  if jsonb_typeof(modif -> 'documents') = 'array' then
    select coalesce(x.name, '') into nomu from public.committees x where x.id = unite;
    select p.data into ma from public.gsa_items p
    where p.committee_id = unite and p.kind = 'people' and p.id = public.gsa_ma_fiche(unite) and not p.deleted;
    docs := public.gsa_docs_partagee(source, old -> 'documents', modif -> 'documents',
      left(coalesce(nullif(btrim(coalesce(ma ->> 'prenom', '') || ' ' || coalesce(ma ->> 'nom', '')), ''), '?') || ' (' || nomu || ')', 200));
    nd := case when jsonb_array_length(docs) = 0 then nd - 'documents' else nd || jsonb_build_object('documents', docs) end;
  end if;

  -- Répétition (041) : l'entité de la tâche crée l'occurrence suivante. « À chaque séance » (ses séances) : si elle l'était.
  if modif ->> 'recurrence' in ('hebdomadaire', 'mensuelle', 'trimestrielle', 'semestrielle', 'annuelle')
     or (modif ->> 'recurrence' = 'seance' and old ->> 'recurrence' = 'seance') then
    nd := nd || jsonb_build_object('recurrence', modif ->> 'recurrence');
  else
    nd := nd - 'recurrence';
  end if;

  -- Partage (041) : d'autres entités du club, pas l'entité de la tâche ; celle-ci reste comme elle était. Une entité
  -- archivée : seulement si elle y était déjà. L'ancienne case « Transmettre au comité central » devient le partage.
  pavant := coalesce((
    select jsonb_agg(distinct v) from (
      select p.v from jsonb_array_elements_text(case when jsonb_typeof(old -> 'partage') = 'array' then old -> 'partage' else '[]'::jsonb end) p(v)
      union select club::text where coalesce((old ->> 'auCentral')::boolean, false)) l(v)), '[]'::jsonb);
  pnouv := coalesce((
    select jsonb_agg(distinct l.v) from (
      select p.v from jsonb_array_elements_text(case when jsonb_typeof(modif -> 'partage') = 'array' then modif -> 'partage' else '[]'::jsonb end) p(v)
      union select club::text where coalesce((modif ->> 'auCentral')::boolean, false)) l(v)
    where l.v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and l.v <> unite::text
      and exists (select 1 from public.committees c where c.id = l.v::uuid and c.id <> source and (c.id = club or c.parent_id = club)
        and (not coalesce((c.info ->> 'archive')::boolean, false) or pavant ? l.v))), '[]'::jsonb);
  if pavant ? unite::text then
    pnouv := pnouv || to_jsonb(unite::text);
  end if;
  nd := nd - 'auCentral';
  nd := case when jsonb_array_length(pnouv) = 0 then nd - 'partage' else nd || jsonb_build_object('partage', pnouv) end;
  -- Séance d'une entité retirée du partage : plus à son ordre du jour.
  if jsonb_typeof(old -> 'seanceComite') = 'object' and pavant ? (old -> 'seanceComite' ->> 'uniteId')
     and not pnouv ? (old -> 'seanceComite' ->> 'uniteId') then
    nd := nd - 'seanceComite';
    if coalesce(old ->> 'meetingId', '') = '' and nd -> 'delaiRef' ->> 'type' = 'meeting' then
      nd := nd - 'delaiRef';
    end if;
  end if;

  -- Séance liée (041) : une séance de cette entité, si la tâche n'est liée ni à une séance de son entité ni à celle d'une
  -- autre entité.
  if coalesce(old ->> 'meetingId', '') = ''
     and (jsonb_typeof(old -> 'seanceComite') is distinct from 'object' or old -> 'seanceComite' ->> 'uniteId' = unite::text) then
    sc := null;
    if modif -> 'seanceComite' ->> 'uniteId' = unite::text then
      select jsonb_build_object('uniteId', unite::text, 'id', s.id, 'titre', left(coalesce(s.data ->> 'titre', ''), 300), 'date', coalesce(s.data ->> 'date', ''))
      into sc
      from public.gsa_items s
      where s.committee_id = unite and s.kind = 'meetings' and s.id = modif -> 'seanceComite' ->> 'id' and not s.deleted;
    end if;
    if sc is not null then
      nd := nd || jsonb_build_object('seanceComite', sc);
    elsif jsonb_typeof(old -> 'seanceComite') = 'object' then
      nd := nd - 'seanceComite';
      if nd -> 'delaiRef' ->> 'type' = 'meeting' then
        nd := nd - 'delaiRef';
      end if;
    end if;
  end if;

  nd := nd || jsonb_build_object('updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  update public.gsa_items i set data = nd, client_id = null
  where i.committee_id = source and i.kind = 'tasks' and i.id = tache;
end $$;

-- Fichier déposable depuis une entité du partage : « <entité>/pt-… », par un membre du club de cette entité (non
-- archivée). (Paramètre qualifié, comme dans 012.)
create or replace function public.gsa_depot_partage(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when gsa_depot_partage.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/pt-[A-Za-z0-9_-]{4,60}$'
      then exists (
        select 1 from public.committees c
        where c.id = split_part(gsa_depot_partage.name, '/', 1)::uuid and not coalesce((c.info ->> 'archive')::boolean, false)
          and public.gsa_is_club_member(coalesce(c.parent_id, c.id)))
    else false
  end
$$;

-- Fichier « <entité>/<fichier> » joint à une tâche de cette entité (non supprimée) que la personne connectée voit depuis
-- une autre entité du club, dont elle est membre (même règle que gsa_taches_partagees).
create or replace function public.gsa_fichier_partage_lisible(name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  dossier text := split_part(gsa_fichier_partage_lisible.name, '/', 1);
  s public.committees;
  club uuid;
  f text;
begin
  if dossier !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  select * into s from public.committees c where c.id = dossier::uuid;
  if s.id is null or coalesce((s.info ->> 'archive')::boolean, false) then
    return false;
  end if;
  club := coalesce(s.parent_id, s.id);
  f := substr(gsa_fichier_partage_lisible.name, length(dossier) + 2);
  return exists (
    select 1
    from public.gsa_items t
    cross join lateral (
      select u.id from public.committees u
      where u.id <> s.id and (u.id = club or u.parent_id = club) and not coalesce((u.info ->> 'archive')::boolean, false)
        and u.id in (select m.committee_id from public.gsa_members m where m.user_id = (select auth.uid()))
        and public.gsa_is_member(u.id)
    ) u
    where t.committee_id = s.id and t.kind = 'tasks' and not t.deleted and jsonb_typeof(t.data -> 'documents') = 'array'
      and (t.data -> 'documents' @> jsonb_build_array(jsonb_build_object('id', f, 'kind', 'fichier'))
        or t.data -> 'documents' @> jsonb_build_array(jsonb_build_object('id', gsa_fichier_partage_lisible.name, 'kind', 'fichier')))
      and public.gsa_tache_dans(s.info -> 'historiqueDependance', coalesce(public.gsa_dependance(s.id) = u.id, false),
            public.gsa_reglage_taches(s.id), s.parent_id, t.id, t.data, u.id) = 'modifiable'
      and public.gsa_partagee_lisible(u.id, s.id, t.data));
end $$;

-- Dépôt (sans remplacement), relecture de ses propres dépôts ; lecture des fichiers des tâches partagées ; retrait de
-- ses dépôts tant qu'aucune tâche ne les utilise (comme les tickets, 012). Règles créées une seule fois.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'gsa_fichiers_partage_insert') then
    create policy gsa_fichiers_partage_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'gsa-fichiers' and public.gsa_depot_partage(name));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'gsa_fichiers_partage_select') then
    create policy gsa_fichiers_partage_select on storage.objects for select to authenticated
      using (bucket_id = 'gsa-fichiers' and ((owner_id = (select auth.uid())::text and public.gsa_depot_partage(name))
        or public.gsa_fichier_partage_lisible(name)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'gsa_fichiers_partage_delete') then
    create policy gsa_fichiers_partage_delete on storage.objects for delete to authenticated
      using (bucket_id = 'gsa-fichiers' and owner_id = (select auth.uid())::text and public.gsa_depot_partage(name)
        and not public.gsa_fichier_de_ticket(name));
  end if;
end $$;

grant execute on function public.gsa_depot_partage(text) to authenticated;
grant execute on function public.gsa_fichier_partage_lisible(text) to authenticated;
