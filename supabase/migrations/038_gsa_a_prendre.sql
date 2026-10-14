-- Tâches GSA — 038 : « 🙋 À prendre » : une tâche proposée à quelques personnes ; l'une d'elles s'en charge elle-même.
--
-- La tâche garde la proposition dans data.aPrendre :
--   personnes : fiches de l'entité à qui la tâche est proposée ;
--   nombre    : personnes qu'il faut (1 si absent).
-- Une place est prise tant qu'une personne proposée est responsable (retirée des responsables : la place se libère).
-- Jamais pour les tickets (remboursements, factures) : l'appli ne l'enregistre pas, et le serveur l'ignore.
--
-- • gsa_tache_lisible (037) : une personne à qui la tâche est proposée la lit dans son entité, même sans « Voir toutes
--   les tâches » (seule différence avec 037 : le bloc « à prendre »).
-- • gsa_prendre_tache(unite, tache) : « Je m'en charge ». Contrôles : la personne connectée a une fiche dans l'entité, la
--   tâche lui est proposée, n'est ni un ticket, ni supprimée, ni terminée, et il reste une place (deux clics en même
--   temps : la ligne est verrouillée, le second trouve la place prise). Elle devient responsable ; rien d'autre ne
--   change. Renvoie la tâche ; déjà responsable : rien à faire.
-- Ajout pur : une fonction redéfinie (037 + le bloc « à prendre ») et une nouvelle ; aucune donnée modifiée.
-- Pour revenir en arrière : relancer gsa_tache_lisible de 037 et supprimer gsa_prendre_tache.

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
  -- Pour info (037) : la personne mentionnée la lit, sans en être responsable.
  if moi is not null and p is null
    and jsonb_typeof(t -> 'pourInfo' -> 'personnes') = 'array' and (t -> 'pourInfo' -> 'personnes') ? moi then
    return true;
  end if;
  -- À prendre (038) : la personne à qui elle est proposée la lit, pour s'en charger.
  if moi is not null and p is null
    and jsonb_typeof(t -> 'aPrendre' -> 'personnes') = 'array' and (t -> 'aPrendre' -> 'personnes') ? moi then
    return true;
  end if;
  if p is not null then
    return public.gsa_a_droit(c, 'paiements.payer');
  end if;
  return public.gsa_a_droit_section(c, 'tasks.viewAll', t ->> 'sectionId');
end $$;

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
  d := d || jsonb_build_object(
    'responsables', resp || to_jsonb(moi),
    'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  update public.gsa_items i set data = d, client_id = null
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache;
  return d;
end $$;

revoke all on function public.gsa_prendre_tache(uuid, text) from public, anon;
grant execute on function public.gsa_prendre_tache(uuid, text) to authenticated;
