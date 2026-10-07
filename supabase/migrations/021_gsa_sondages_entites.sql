-- Tâches GSA — 021 : sondages ouverts à d'autres entités du club.
-- Un sondage reste dans son entité ; data.entites liste d'autres entités du club dont tous les membres votent aussi,
-- en plus des votants choisis dans l'entité. Les membres de ces entités le lisent (gsa_sondages_partages) et y
-- répondent depuis leur entité (gsa_voter_sondage_partage) ; la réponse est enregistrée dans l'entité du sondage, sous
-- la clé de vote de la personne : sa fiche dans l'entité du sondage si elle en est votante, sinon « entité:fiche » (la
-- première entité ouverte dont elle est membre). Une même personne ne vote qu'une fois : même fiche du registre
-- « Membres du club », même adresse email, ou fiche liée par « Tous les membres de … » (020).
-- Même règle que l'appli (src/data/polls.ts : identites, electorat, cleVote).
-- Ni les entités archivées, ni la gestion du sondage (modifier, clôturer, supprimer : dans son entité seulement).
-- Ajout pur : quatre nouvelles fonctions ; aucune donnée existante modifiée.

-- Ce qui reconnaît une personne d'une entité à l'autre, dans cet ordre : fiche du registre, email, fiche, fiche d'origine.
create or replace function public.gsa_identites(unite uuid, fiche text, d jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select array_remove(array[
    nullif(d ->> 'membreId', ''),
    'e:' || nullif(lower(btrim(coalesce(d ->> 'email', ''))), ''),
    'f:' || unite::text || ':' || fiche,
    case when nullif(d ->> 'viaEntite', '') is not null and nullif(d ->> 'viaFiche', '') is not null
      then 'f:' || (d ->> 'viaEntite') || ':' || (d ->> 'viaFiche') end
  ], null)
$$;

-- Clé de vote de la fiche `fiche` de l'entité `unite` pour le sondage `p` de l'entité `source` ; null si elle ne vote pas.
-- Votants de l'entité du sondage d'abord (toujours eux-mêmes), puis les membres des entités ouvertes, dans l'ordre :
-- une personne déjà reconnue garde la clé de sa première apparition.
-- Droits de l'appelant (pas security definer) : appelée par gsa_voter_sondage_partage, elle lit tout ; appelée
-- directement, seulement ce que l'utilisateur peut déjà lire.
create or replace function public.gsa_cle_vote(source uuid, p jsonb, unite uuid, fiche text) returns text
language plpgsql stable set search_path = '' as $$
declare
  club uuid;
  moi text[];
  de jsonb := '{}';
  cles text[] := '{}';
  r record;
  ks text[];
  c text;
  k text;
begin
  select coalesce(x.parent_id, x.id) into club from public.committees x where x.id = source;
  select public.gsa_identites(unite, i.id, i.data) into moi from public.gsa_items i
  where i.committee_id = unite and i.kind = 'people' and i.id = fiche and not i.deleted
    and coalesce((i.data ->> 'actif')::boolean, true);
  if club is null or moi is null then
    return null;
  end if;
  for r in
    select 0 as g, v.n, 0::double precision as pos, v.id as fid, source as u, i.data
    from jsonb_array_elements_text(case when jsonb_typeof(p -> 'votants') = 'array' then p -> 'votants' else '[]'::jsonb end) with ordinality v(id, n)
    left join public.gsa_items i on i.committee_id = source and i.kind = 'people' and i.id = v.id and not i.deleted
      and coalesce((i.data ->> 'actif')::boolean, true)
    union all
    select 1, e.n, m.pos, m.id, e.u, m.data
    from (
      select x.u::uuid as u, min(x.n) as n
      from jsonb_array_elements_text(case when jsonb_typeof(p -> 'entites') = 'array' then p -> 'entites' else '[]'::jsonb end) with ordinality x(u, n)
      where x.u ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      group by x.u
    ) e
    join public.committees c on c.id = e.u and c.id <> source and coalesce(c.parent_id, c.id) = club
      and not coalesce((c.info ->> 'archive')::boolean, false)
    join public.gsa_items m on m.committee_id = e.u and m.kind = 'people' and not m.deleted
      and coalesce((m.data ->> 'actif')::boolean, true)
    order by g, n, pos, fid
  loop
    if r.g = 0 then
      continue when r.fid = any (cles);
      c := r.fid;
      cles := cles || c;
      ks := case when r.data is null then array['f:' || source::text || ':' || r.fid] else public.gsa_identites(source, r.fid, r.data) end;
    else
      ks := public.gsa_identites(r.u, r.fid, r.data);
      c := null;
      foreach k in array ks loop
        c := de ->> k;
        exit when c is not null;
      end loop;
      c := coalesce(c, r.u::text || ':' || r.fid);
    end if;
    foreach k in array ks loop
      if not de ? k then
        de := de || jsonb_build_object(k, c);
      end if;
    end loop;
  end loop;
  foreach k in array moi loop
    c := de ->> k;
    if c is not null then
      return c;
    end if;
  end loop;
  return null;
end $$;

-- Sondages que les autres entités du club ouvrent à l'entité `unite` (vide pour qui n'en est pas membre).
create or replace function public.gsa_sondages_partages(unite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  club uuid;
begin
  if not public.gsa_is_member(unite) then
    return '[]'::jsonb;
  end if;
  select coalesce(x.parent_id, x.id) into club from public.committees x where x.id = unite;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('uniteId', c.id, 'unite', c.name, 'poll', s.data) order by c.name, s.data ->> 'creeLe' desc), '[]'::jsonb)
    from public.committees c
    join public.gsa_items s on s.committee_id = c.id and s.kind = 'polls' and not s.deleted
    where (c.id = club or c.parent_id = club) and c.id <> unite
      and not coalesce((c.info ->> 'archive')::boolean, false)
      and jsonb_typeof(s.data -> 'entites') = 'array' and s.data -> 'entites' ? unite::text
  );
end $$;

-- Réponse d'un membre de l'entité `unite` au sondage `sondage` de l'entité `source` : enregistrée sous sa clé de vote.
create or replace function public.gsa_voter_sondage_partage(unite uuid, source uuid, sondage text, choix jsonb, texte text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  club uuid;
  src public.committees;
  fiche text;
  p jsonb;
  cle text;
  textes jsonb;
begin
  if not public.gsa_is_member(unite) then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  select m.person_id into fiche from public.gsa_members m where m.committee_id = unite and m.user_id = auth.uid();
  select coalesce(x.parent_id, x.id) into club from public.committees x where x.id = unite;
  select * into src from public.committees x where x.id = source;
  if src.id is null or src.id = unite or coalesce(src.parent_id, src.id) is distinct from club
     or coalesce((src.info ->> 'archive')::boolean, false) then
    raise exception 'Entité introuvable' using errcode = '42501';
  end if;
  select i.data into p from public.gsa_items i
  where i.committee_id = source and i.kind = 'polls' and i.id = sondage and not i.deleted
  for update;
  if p is null or jsonb_typeof(p -> 'entites') is distinct from 'array' or not (p -> 'entites' ? unite::text) then
    raise exception 'Ce sondage n’est plus ouvert à cette entité' using errcode = '42501';
  end if;
  if nullif(p ->> 'clotureLe', '') is not null
     or (nullif(p ->> 'dateLimite', '') is not null and p ->> 'dateLimite' < to_char((now() at time zone 'Europe/Zurich')::date, 'YYYY-MM-DD')) then
    raise exception 'Ce sondage est clôturé' using errcode = '42501';
  end if;
  -- Réponses possibles du sondage ; une seule sans choix multiple ; aucune seulement pour un sondage de dates.
  if jsonb_typeof(choix) is distinct from 'array' then
    raise exception 'Réponse invalide' using errcode = '22023';
  end if;
  if exists (
       select 1 from jsonb_array_elements(choix) x
       where jsonb_typeof(x) <> 'string' or not exists (
         select 1 from jsonb_array_elements(case when jsonb_typeof(p -> 'options') = 'array' then p -> 'options' else '[]'::jsonb end) o
         where o ->> 'id' = x #>> '{}'))
     or (jsonb_array_length(choix) > 1 and not coalesce((p ->> 'multiple')::boolean, false))
     or (jsonb_array_length(choix) = 0 and coalesce(p ->> 'type', '') <> 'dates') then
    raise exception 'Réponse invalide' using errcode = '22023';
  end if;
  cle := public.gsa_cle_vote(source, p, unite, fiche);
  if cle is null then
    raise exception 'Tu ne fais pas partie des votants de ce sondage' using errcode = '42501';
  end if;
  textes := coalesce(case when jsonb_typeof(p -> 'textes') = 'object' then p -> 'textes' end, '{}'::jsonb) - cle;
  if nullif(btrim(coalesce(texte, '')), '') is not null and choix ? 'autre' then
    textes := textes || jsonb_build_object(cle, left(btrim(texte), 300));
  end if;
  update public.gsa_items i
  set data = p || jsonb_build_object(
        'votes', coalesce(case when jsonb_typeof(p -> 'votes') = 'object' then p -> 'votes' end, '{}'::jsonb) || jsonb_build_object(cle, choix),
        'textes', textes),
      client_id = null
  where i.committee_id = source and i.kind = 'polls' and i.id = sondage;
end $$;

grant execute on function public.gsa_sondages_partages(uuid) to authenticated;
grant execute on function public.gsa_voter_sondage_partage(uuid, uuid, text, jsonb, text) to authenticated;
