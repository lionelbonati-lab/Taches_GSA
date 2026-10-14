-- Tâches GSA — 039 : « Pas dispo » sur une tâche à prendre (038).
--
-- Une personne à qui la tâche est proposée peut répondre « Pas dispo » : elle s'ajoute à data.aPrendre.refus (fiches de
-- l'entité). La tâche quitte alors ses listes, et l'auteur de la tâche voit qui a décliné. Elle peut changer d'avis :
-- « Je m'en charge » reste possible et la retire de « refus ».
--
-- • gsa_pas_dispo(unite, tache) : contrôles comme gsa_prendre_tache (fiche dans l'entité, tâche proposée à la personne,
--   ni ticket ni supprimée) ; refusé si elle en est déjà responsable. Ajoute la personne à « refus » (une fois) ; rien
--   d'autre ne change. La ligne est verrouillée et modifiée sur le serveur : une place prise au même moment par
--   quelqu'un d'autre n'est pas écrasée. Renvoie la tâche.
-- • gsa_prendre_tache (038) : la même, qui retire en plus la personne de « refus » quand elle s'en charge.
-- Ajout pur : une fonction redéfinie et une nouvelle ; aucune donnée modifiée.
-- Pour revenir en arrière : relancer gsa_prendre_tache de 038 et supprimer gsa_pas_dispo.

create or replace function public.gsa_prendre_tache(unite uuid, tache text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi text := public.gsa_ma_fiche(unite);
  d jsonb;
  a jsonb;
  resp jsonb;
  nombre int;
  deja int;
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
  select count(*) into deja from jsonb_array_elements_text(a -> 'personnes') x where resp ? x;
  if deja >= nombre then
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

create or replace function public.gsa_pas_dispo(unite uuid, tache text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi text := public.gsa_ma_fiche(unite);
  d jsonb;
  a jsonb;
  refus jsonb;
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
  if jsonb_typeof(d -> 'responsables') = 'array' and (d -> 'responsables') ? moi then
    raise exception 'Tu t’en charges déjà : retire-toi des responsables dans la tâche' using errcode = 'P0001';
  end if;
  refus := case when jsonb_typeof(a -> 'refus') = 'array' then a -> 'refus' else '[]'::jsonb end;
  if refus ? moi then
    return d;
  end if;
  d := d || jsonb_build_object(
    'aPrendre', a || jsonb_build_object('refus', refus || to_jsonb(moi)),
    'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  update public.gsa_items i set data = d, client_id = null
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache;
  return d;
end $$;

revoke all on function public.gsa_pas_dispo(uuid, text) from public, anon;
grant execute on function public.gsa_pas_dispo(uuid, text) to authenticated;
