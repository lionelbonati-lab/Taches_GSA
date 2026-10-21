-- Tâches GSA — 044 : clôture automatique des sondages à la date et à l'heure limite.
-- Un sondage peut avoir une heure limite (data.heureLimite, « 18:00 », heure de Suisse) en plus de sa date limite, et
-- une date limite seulement indicative (data.clotureAuto = false : il reste ouvert jusqu'à « Clôturer »).
-- L'appli applique la règle pour les sondages de l'entité ; ici, pour les réponses venues des autres entités du club
-- (sondages ouverts à d'autres entités, 021) : gsa_voter_sondage_partage est redéfinie à l'identique, sauf le contrôle
-- de la date limite. Sans heure ni clotureAuto, même règle qu'avant (ouvert jusqu'à la fin du jour de la date limite).
-- Aucune donnée modifiée ; retour en arrière : relancer gsa_voter_sondage_partage de 021.

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
  -- Clôturé à la main, ou date et heure limite passées (heure de Suisse ; sans heure, à la fin du jour), sauf date
  -- limite indicative (clotureAuto = false).
  if nullif(p ->> 'clotureLe', '') is not null
     or (nullif(p ->> 'dateLimite', '') is not null and p -> 'clotureAuto' is distinct from 'false'::jsonb
         and to_char(now() at time zone 'Europe/Zurich', 'YYYY-MM-DD"T"HH24:MI') collate "C"
             >= ((p ->> 'dateLimite') || 'T' || coalesce(nullif(p ->> 'heureLimite', ''), '24:00'))) then
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
