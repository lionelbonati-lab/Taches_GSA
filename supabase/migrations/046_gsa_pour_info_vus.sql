-- Tâches GSA — 046 : retour des « ✓ Vu » sur les tâches « Pour info » (037).
--
-- Jusqu'ici, « ✓ Vu » (accueil) n'était noté que pour soi, dans ses préférences. Il est maintenant aussi enregistré sur
-- la tâche, pour que l'auteur, les responsables et ceux qui la modifient voient qui l'a vue, et quand (pastilles de
-- « 👁 Pour info » dans la fiche de la tâche). La tâche le garde dans data.pourInfoVus, avec les clés de « Pour info » :
--   "p:<fiche>"          : personne de l'entité de la tâche (pourInfo.personnes)            → { "le": "<date ISO>" } ;
--   "a:<entité>:<fiche>" : personne d'une autre entité (pourInfo.autres)                     → { "le": "<date ISO>" } ;
--   "u:<entité>"         : autre entité (pourInfo.unites), vue par l'un de ses admins ou rôles « Voir toutes les tâches »
--                          → { "le": "<date ISO>", "par": "<sa fiche dans cette entité>" }.
-- La première fois compte : un second « Vu » ne change pas la date.
--
-- • gsa_pour_info_vu(unite, tache, depuis) : « ✓ Vu » de la personne connectée, depuis l'entité ouverte `depuis`, sur la
--   tâche `tache` de l'entité `unite` (la même, ou une autre entité du club : tâche reçue pour info ou partagée). Contrôles :
--   fiche dans `depuis`, même club, tâche ni ticket ni supprimée, la personne (ou son entité, pour ses admins et les rôles
--   « Voir toutes les tâches ») y est mentionnée pour info. La ligne est verrouillée et seul pourInfoVus change (ni la date
--   de modification, ni le reste de la tâche). Renvoie la tâche.
-- • Garde gsa_items_vus_garde : seul gsa_pour_info_vu écrit pourInfoVus. Une tâche enregistrée par l'appli garde ceux du
--   serveur (un enregistrement fait avec une copie plus ancienne ne les efface pas, et personne ne peut en inventer) ;
--   s'ils diffèrent de ce que l'appli a envoyé, la ligne est marquée comme écrite par le serveur (client_id vide), pour que
--   l'appli la relise. Une tâche nouvelle (copie, occurrence suivante, duplication) part sans « Vu ».
-- Ajout pur : une fonction et une garde nouvelles ; aucune donnée modifiée.
-- Pour revenir en arrière : supprimer le déclencheur gsa_items_vus_garde, puis les fonctions gsa_items_vus_garde et
-- gsa_pour_info_vu (les « Vu » déjà enregistrés restent dans les tâches, sans effet).

create or replace function public.gsa_items_vus_garde() returns trigger
language plpgsql set search_path = '' as $$
declare
  envoye jsonb;
begin
  if new.kind is distinct from 'tasks' or jsonb_typeof(new.data) is distinct from 'object'
     or current_setting('gsa.pour_info_vus', true) = 'oui' then
    return new;
  end if;
  envoye := new.data -> 'pourInfoVus';
  new.data := new.data - 'pourInfoVus';
  if tg_op = 'UPDATE' and jsonb_typeof(old.data) = 'object' and jsonb_typeof(old.data -> 'pourInfoVus') = 'object' then
    new.data := new.data || jsonb_build_object('pourInfoVus', old.data -> 'pourInfoVus');
  end if;
  if (new.data -> 'pourInfoVus') is distinct from envoye then
    new.client_id := null;
  end if;
  return new;
end $$;

drop trigger if exists gsa_items_vus_garde on public.gsa_items;
create trigger gsa_items_vus_garde before insert or update on public.gsa_items
  for each row execute function public.gsa_items_vus_garde();

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
      cles := cles || ('u:' || depuis::text);
    end if;
  end if;
  if cardinality(cles) = 0 then
    raise exception 'Cette tâche n’est pas « pour info » pour toi' using errcode = '42501';
  end if;
  avant := case when jsonb_typeof(d -> 'pourInfoVus') = 'object' then d -> 'pourInfoVus' else '{}'::jsonb end;
  vus := avant;
  foreach k in array cles loop
    if not vus ? k then
      vus := vus || jsonb_build_object(k, case when k like 'u:%' then jsonb_build_object('le', quand, 'par', moi) else jsonb_build_object('le', quand) end);
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
  return d;
end $$;

revoke all on function public.gsa_pour_info_vu(uuid, text, uuid) from public, anon;
grant execute on function public.gsa_pour_info_vu(uuid, text, uuid) to authenticated;
