-- Tâches GSA — 050 : historique d'une tâche (qui a changé quoi et quand).
--
-- • Table gsa_historique : une ligne par changement d'une tâche (entité, tâche, date, compte, nom affiché, champs changés).
--   champs : { "<champ de la tâche>": [avant, après] } (null : vide) ; quoi : 'creee', 'supprimee', 'retablie', ou vide
--   pour une modification. Personne ne la lit ni ne l'écrit directement (ni l'appli, ni les visiteurs).
-- • Déclencheur gsa_historique_noter (après chaque écriture d'une tâche dans gsa_items) : compare l'ancienne et la nouvelle
--   version, champ par champ, et note ce qui a changé au nom de la personne connectée (sa fiche dans l'entité de la tâche ;
--   depuis une autre entité : « Prénom Nom (Entité) »).
--     - Champs non suivis : notés ailleurs (commentaires 049, « Vu » 046), techniques ou recalculés par l'appli (voir
--       `ignores`). Valeurs « vides » confondues (absent, null, "", [], {}, false). Paiement : son état et son montant
--       seulement ; séance du comité, événement d'une entité : leur identifiant seulement. Valeur de plus de 4000
--       caractères : « (trop long) ».
--     - Une modification qui suit de moins de 10 minutes une modification de la même personne s'y ajoute (première valeur
--       « avant », dernière « après » ; un champ revenu à sa valeur de départ disparaît, et la ligne aussi s'il n'en reste
--       aucun). 100 lignes par tâche au plus (les plus anciennes partent).
--     - Une erreur ici n'empêche jamais l'enregistrement de la tâche (elle est seulement signalée dans les journaux).
-- • gsa_historique_tache(unite, tache, depuis) : l'historique de la tâche `tache` de l'entité `unite` (du plus récent au plus
--   ancien), si la personne connectée la voit depuis l'entité ouverte `depuis` (mêmes règles que la discussion, 049 :
--   sa propre entité, une entité du partage, ou une mention « Pour info »), avec les noms (dans l'entité de la tâche) des
--   personnes, statuts et sections qu'il cite : { entrees: [...], noms: { "p:<fiche>", "s:<statut>", "sec:<section>" } }.
-- Ajout pur : une table, deux fonctions et un déclencheur nouveaux ; aucune donnée modifiée. L'historique commence à
-- l'application de cette mise à jour.
-- Pour revenir en arrière : supprimer le déclencheur gsa_historique_noter, les fonctions gsa_historique_noter,
-- gsa_historique_valeur et gsa_historique_tache, puis la table gsa_historique.

create table if not exists public.gsa_historique (
  id bigint generated always as identity primary key,
  committee_id uuid not null references public.committees (id) on delete cascade,
  tache_id text not null,
  le timestamptz not null default now(),
  par uuid,
  nom text not null,
  quoi text check (quoi in ('creee', 'supprimee', 'retablie')),
  champs jsonb not null default '{}'::jsonb
);
create index if not exists gsa_historique_tache_idx on public.gsa_historique (committee_id, tache_id, id desc);
alter table public.gsa_historique enable row level security;
revoke all on table public.gsa_historique from public, anon, authenticated;

-- Valeur gardée dans l'historique (null : vide). Mêmes règles que l'appli (src/data/historique.ts, valeurSuivie).
create or replace function public.gsa_historique_valeur(cle text, v jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when v is null or v in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb, 'false'::jsonb) then null
    else (
      select case when length(w::text) > 4000 then '"(trop long)"'::jsonb else w end
      from (select case
              when cle = 'paiement' and jsonb_typeof(v) = 'object'
                then jsonb_build_object('etat', coalesce(v -> 'etat', 'null'::jsonb), 'montant', coalesce(v -> 'montant', 'null'::jsonb))
              when cle in ('seanceComite', 'evenementEntite') and jsonb_typeof(v) = 'object'
                then jsonb_build_object('uniteId', coalesce(v -> 'uniteId', 'null'::jsonb), 'id', coalesce(v -> 'id', 'null'::jsonb))
              else v
            end as w) x)
  end
$$;

create or replace function public.gsa_historique_noter() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ignores constant text[] := array['updatedAt', 'commentaires', 'pourInfoVus', 'modifiePar', 'source', 'pieces', 'suivanteId',
    'termineeLe', 'postesResp', 'createdBy', 'placePartage', 'parCentral', 'copieDe', 'attribueePar', 'proposee', 'id'];
  o jsonb;
  n jsonb;
  genre text;
  diff jsonb := '{}'::jsonb;
  k text;
  a jsonb;
  b jsonb;
  qui uuid := auth.uid();
  auteur text;
  der public.gsa_historique;
  fusion jsonb;
begin
  if tg_op = 'UPDATE' and old.data is not distinct from new.data and old.deleted = new.deleted then
    return null;
  end if;
  begin
    o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data end;
    n := case when not new.deleted and jsonb_typeof(new.data) = 'object' then new.data end;
    if o is null and n is null then
      return null;
    elsif o is null then
      genre := case when (tg_op = 'UPDATE' and old.deleted) or exists (
          select 1 from public.gsa_historique h where h.committee_id = new.committee_id and h.tache_id = new.id)
        then 'retablie' else 'creee' end;
    elsif n is null then
      genre := 'supprimee';
    else
      for k in select x from jsonb_object_keys(o) x union select x from jsonb_object_keys(n) x loop
        continue when k = any (ignores);
        a := public.gsa_historique_valeur(k, o -> k);
        b := public.gsa_historique_valeur(k, n -> k);
        if a is distinct from b then
          diff := diff || jsonb_build_object(k, jsonb_build_array(a, b));
        end if;
      end loop;
      if diff = '{}'::jsonb then
        return null;
      end if;
    end if;

    -- Changements rapprochés de la même personne : regroupés.
    if genre is null and qui is not null then
      select * into der
      from public.gsa_historique h
      where h.committee_id = new.committee_id and h.tache_id = new.id
      order by h.id desc
      limit 1;
      if der.id is not null and der.quoi is null and der.par = qui and der.le > now() - interval '10 minutes' then
        fusion := der.champs;
        for k, a in select e.key, e.value from jsonb_each(diff) e loop
          if fusion ? k then
            if (fusion -> k -> 0) = (a -> 1) then
              fusion := fusion - k;
            else
              fusion := jsonb_set(fusion, array[k], jsonb_build_array(fusion -> k -> 0, a -> 1));
            end if;
          else
            fusion := fusion || jsonb_build_object(k, a);
          end if;
        end loop;
        if fusion = '{}'::jsonb then
          delete from public.gsa_historique h where h.id = der.id;
        else
          update public.gsa_historique h set champs = fusion, le = now() where h.id = der.id;
        end if;
        return null;
      end if;
    end if;

    -- Qui : sa fiche dans l'entité de la tâche ; sinon le nom laissé par une entité du partage ; sinon sa fiche ailleurs
    -- dans le club, avec l'entité.
    select nullif(btrim(coalesce(p.data ->> 'prenom', '') || ' ' || coalesce(p.data ->> 'nom', '')), '') into auteur
    from public.gsa_members m
    join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
    where m.committee_id = new.committee_id and m.user_id = qui
    limit 1;
    if auteur is null and n is not null and (n ->> 'modifiePar') is distinct from (o ->> 'modifiePar') then
      auteur := nullif(btrim(n ->> 'modifiePar'), '');
    end if;
    if auteur is null and qui is not null then
      select nullif(btrim(coalesce(p.data ->> 'prenom', '') || ' ' || coalesce(p.data ->> 'nom', '')), '') || ' (' || c.name || ')'
        into auteur
      from public.gsa_members m
      join public.committees c on c.id = m.committee_id
      join public.committees t on t.id = new.committee_id and coalesce(t.parent_id, t.id) = coalesce(c.parent_id, c.id)
      join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
      where m.user_id = qui
      order by c.name
      limit 1;
    end if;

    insert into public.gsa_historique (committee_id, tache_id, par, nom, quoi, champs)
    values (new.committee_id, new.id, qui, coalesce(auteur, case when qui is null then 'Automatique' else '?' end), genre, diff);
    delete from public.gsa_historique h
    where h.committee_id = new.committee_id and h.tache_id = new.id
      and h.id <= (select x.id from public.gsa_historique x where x.committee_id = new.committee_id and x.tache_id = new.id
                   order by x.id desc offset 100 limit 1);
  exception when others then
    raise warning 'gsa_historique_noter (%, %) : %', new.committee_id, new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists gsa_historique_noter on public.gsa_items;
create trigger gsa_historique_noter after insert or update on public.gsa_items
  for each row when (new.kind = 'tasks') execute function public.gsa_historique_noter();

create or replace function public.gsa_historique_tache(unite uuid, tache text, depuis uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  moi text := public.gsa_ma_fiche(depuis);
  src public.committees;
  club uuid;
  d jsonb;
  ok boolean;
  entrees jsonb;
  noms jsonb;
begin
  if moi is null then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  select coalesce(x.parent_id, x.id) into club from public.committees x where x.id = depuis;
  select * into src from public.committees x where x.id = unite;
  if src.id is null or coalesce(src.parent_id, src.id) is distinct from club
     or (src.id <> depuis and coalesce((src.info ->> 'archive')::boolean, false)) then
    raise exception 'Tâche introuvable' using errcode = 'P0002';
  end if;
  select i.data into d
  from public.gsa_items i
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache and not i.deleted;
  if jsonb_typeof(d) is distinct from 'object' then
    raise exception 'Tâche introuvable' using errcode = 'P0002';
  end if;
  -- Mêmes règles que gsa_commenter (049).
  if depuis = unite then
    ok := public.gsa_tache_lisible(unite, d);
  else
    ok := (public.gsa_tache_dans(src.info -> 'historiqueDependance', coalesce(public.gsa_dependance(src.id) = depuis, false),
             public.gsa_reglage_taches(src.id), src.parent_id, tache, d, depuis) = 'modifiable'
           and public.gsa_partagee_lisible(depuis, unite, d))
      or (jsonb_typeof(d -> 'pourInfo') = 'object' and (
             ((public.gsa_is_admin(depuis) or public.gsa_a_droit(depuis, 'tasks.viewAll'))
              and jsonb_typeof(d -> 'pourInfo' -> 'unites') = 'array' and (d -> 'pourInfo' -> 'unites') ? depuis::text)
          or (jsonb_typeof(d -> 'pourInfo' -> 'autres' -> depuis::text) = 'array'
              and (d -> 'pourInfo' -> 'autres' -> depuis::text) ? moi)));
  end if;
  if not coalesce(ok, false) then
    raise exception 'Tu ne vois pas cette tâche' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
      jsonb_build_object('le', to_char(h.le at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'par', '', 'nom', h.nom,
        'champs', h.champs)
      || case when h.quoi is null then '{}'::jsonb else jsonb_build_object('quoi', h.quoi) end
      order by h.id desc), '[]'::jsonb)
    into entrees
  from public.gsa_historique h
  where h.committee_id = unite and h.tache_id = tache;

  -- Noms cités (dans l'entité de la tâche) : responsables, statuts, sections.
  with cites as (
    select c.cle, v.v
    from public.gsa_historique h
    cross join lateral (values ('responsables'), ('statusId'), ('sectionId')) c(cle)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(h.champs -> c.cle) = 'array' then h.champs -> c.cle else '[]'::jsonb end) a(x)
    cross join lateral jsonb_array_elements_text(case jsonb_typeof(a.x) when 'array' then a.x when 'string' then jsonb_build_array(a.x) else '[]'::jsonb end) v(v)
    where h.committee_id = unite and h.tache_id = tache
  )
  select coalesce(jsonb_object_agg(z.k, z.v), '{}'::jsonb) into noms
  from (
    select distinct
      case i.kind when 'people' then 'p:' when 'statuses' then 's:' else 'sec:' end || i.id as k,
      case i.kind
        when 'people' then nullif(btrim(coalesce(i.data ->> 'prenom', '') || ' ' || coalesce(i.data ->> 'nom', '')), '')
        when 'statuses' then nullif(i.data ->> 'label', '')
        else nullif(i.data ->> 'nom', '')
      end as v
    from cites c
    join public.gsa_items i on i.committee_id = unite and not i.deleted and i.id = c.v
      and i.kind = case c.cle when 'responsables' then 'people' when 'statusId' then 'statuses' else 'sections' end
  ) z
  where z.v is not null;

  return jsonb_build_object('entrees', entrees, 'noms', noms);
end $$;

revoke all on function public.gsa_historique_valeur(text, jsonb) from public, anon;
revoke all on function public.gsa_historique_noter() from public, anon, authenticated;
revoke all on function public.gsa_historique_tache(uuid, text, uuid) from public, anon;
grant execute on function public.gsa_historique_tache(uuid, text, uuid) to authenticated;
