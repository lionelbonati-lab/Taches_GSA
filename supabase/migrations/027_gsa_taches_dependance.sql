-- Tâches GSA — 027 : les tâches d'une entité dans l'entité dont elle dépend.
--
-- • « Dépend de » (committees.info.dependDe) : toujours un comité ; sans choix, une valeur inconnue (ancien « aucun »)
--   ou une boucle : le comité central ; une ancienne valeur vers un groupe ou un événement : le comité dont il dépend
--   (comme parentDans dans l'appli). gsa_dependance(entité) donne ce comité.
-- • committees.info.tachesDependance, réglé par les admins de l'entité (ou du comité central) : ce que l'entité dont
--   elle dépend affiche de ses tâches (liste des tâches, ordre du jour, PV) :
--     « toutes »    : toutes ses tâches (elle peut les modifier, comme une tâche partagée) ;
--     sans valeur   : seulement celles partagées avec elle (comme avant) ;
--     « rien »      : aucune, même partagées avec elle.
--   Les autres entités du club : celles partagées avec elles, comme avant. Jamais les tickets.
-- • gsa_taches_partagees et gsa_modifier_tache_partagee (019) suivent cette règle (gsa_tache_visible).
-- • gsa_committees_guard (007) : tachesDependance contrôlé ; « Dépend de » ne change que par les admins du comité
--   central (sinon l'ancienne valeur reste, comme pour l'accès du comité central).
-- Aucune donnée existante modifiée ; sans réglage, rien ne change.

-- Le comité dont dépend `entite` (null pour le comité central) : celui choisi ; sans choix, un choix inconnu ou archivé,
-- ou une boucle : le comité central. Une ancienne valeur qui désigne un groupe ou un événement : le comité dont celui-ci
-- dépend (comme parentDans dans l'appli).
create or replace function public.gsa_dependance(entite uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.committees;
  x public.committees;
  club uuid;
  choisi uuid;
  suivant text;
  vus uuid[] := '{}';
begin
  select * into e from public.committees c where c.id = entite;
  if e.id is null or e.parent_id is null then
    return null;
  end if;
  club := e.parent_id;
  suivant := e.info ->> 'dependDe';
  loop
    -- Le comité central (sans parent), une entité inconnue ou archivée : fin.
    select * into x from public.committees c
    where c.id::text = suivant and c.parent_id = club and not coalesce((c.info ->> 'archive')::boolean, false);
    exit when x.id is null;
    if x.id = entite then
      return club;
    end if;
    exit when x.id = any(vus);
    vus := vus || x.id;
    if choisi is null and x.type = 'sous-comite' then
      choisi := x.id;
    end if;
    suivant := x.info ->> 'dependDe';
  end loop;
  return coalesce(choisi, club);
end $$;

-- La tâche `data` d'une entité s'affiche-t-elle dans l'entité `unite` ? `club` : le comité central ; `depend` :
-- l'entité de la tâche dépend de `unite` ; `reglage` : son tachesDependance.
create or replace function public.gsa_tache_visible(data jsonb, club uuid, depend boolean, reglage text, unite uuid) returns boolean
language sql immutable set search_path = '' as $$
  select not (data ? 'paiement') and case
    when depend and reglage = 'toutes' then true
    when depend and reglage = 'rien' then false
    else coalesce(
      (jsonb_typeof(data -> 'partage') = 'array' and data -> 'partage' ? unite::text)
      or (coalesce((data ->> 'auCentral')::boolean, false) and unite = club),
      false)
  end
$$;

-- Tâches des autres entités du club affichées dans l'entité `unite` (vide pour qui n'en est pas membre).
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
             coalesce(c.info ->> 'tachesDependance', 'partagees') as reglage
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
  );
end $$;

-- Modification d'une tâche affichée dans l'entité `unite` : enregistrée dans l'entité `source`.
-- Seuls les champs modifiables sont repris (types contrôlés, sinon l'ancienne valeur reste). Comme 019, sauf la règle.
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
       coalesce(src.info ->> 'tachesDependance', 'partagees'), unite) then
    raise exception 'Cette tâche n’est plus partagée avec cette entité' using errcode = '42501';
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

-- Garde des fiches d'entités (007) : en plus, tachesDependance contrôlé et « Dépend de » réservé au comité central.
create or replace function public.gsa_committees_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.info ->> 'central', 'aucun') not in ('aucun', 'lecture', 'ecriture') then
    raise exception 'Accès du comité central inconnu : %', new.info ->> 'central' using errcode = '22023';
  end if;
  if coalesce(new.info ->> 'tachesDependance', 'partagees') not in ('toutes', 'partagees', 'rien') then
    raise exception 'Réglage des tâches inconnu : %', new.info ->> 'tachesDependance' using errcode = '22023';
  end if;
  if new.info ? 'logo' and (
       jsonb_typeof(new.info -> 'logo') <> 'string'
       or length(new.info ->> 'logo') > 200000
       or (new.info ->> 'logo') !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then
    raise exception 'Logo refusé : image PNG, JPEG ou WebP de 200 Ko au plus' using errcode = '22023';
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if (new.info -> 'central') is distinct from (old.info -> 'central') and not public.gsa_is_admin(old.id) then
    new.info = case when old.info ? 'central' then new.info || jsonb_build_object('central', old.info -> 'central') else new.info - 'central' end;
  end if;
  if public.gsa_is_admin(old.parent_id) then
    return new;
  end if;
  if new.type is distinct from old.type
     or coalesce(new.info -> 'archive', 'false'::jsonb) is distinct from coalesce(old.info -> 'archive', 'false'::jsonb) then
    raise exception 'Seul le comité central change le type d’une entité ou l’archive' using errcode = '42501';
  end if;
  if nullif(new.info ->> 'dependDe', '') is distinct from nullif(old.info ->> 'dependDe', '') then
    new.info = case when old.info ? 'dependDe' then new.info || jsonb_build_object('dependDe', old.info -> 'dependDe') else new.info - 'dependDe' end;
  end if;
  return new;
end $$;

revoke all on function public.gsa_dependance(uuid) from public, anon, authenticated;
revoke all on function public.gsa_tache_visible(jsonb, uuid, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.gsa_taches_partagees(uuid) to authenticated;
grant execute on function public.gsa_modifier_tache_partagee(uuid, uuid, text, jsonb) to authenticated;
