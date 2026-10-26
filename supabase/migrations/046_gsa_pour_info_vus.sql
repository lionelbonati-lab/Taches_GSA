-- Tâches GSA — 046 : retour des « ✓ Vu » sur les tâches « Pour info » (037).
--
-- Jusqu'ici, « ✓ Vu » (accueil) n'était noté que pour soi, dans ses préférences. Il est maintenant aussi enregistré sur
-- la tâche, pour que l'auteur, les responsables et ceux qui la modifient voient qui l'a vue, et quand (pastilles de
-- « 👁 Pour info » dans la fiche de la tâche). La tâche le garde dans data.pourInfoVus, avec les clés de « Pour info » :
--   "p:<fiche>"          : personne de l'entité de la tâche (pourInfo.personnes)            → { "le": "<date ISO>" } ;
--   "a:<entité>:<fiche>" : personne d'une autre entité (pourInfo.autres)                     → { "le": "<date ISO>" } ;
--   "u:<entité>:<fiche>" : autre entité mentionnée en entier (pourInfo.unites) : chacune des personnes qui la reçoivent
--                          (ses admins et rôles « Voir toutes les tâches ») a son « Vu »   → { "le": "<date ISO>" }.
-- La première fois compte : un second « Vu » ne change pas la date. Une entité n'est vue que quand chacune des personnes
-- qui la reçoivent l'a vue (l'appli les obtient de gsa_pour_info_destinataires).
--
-- • gsa_pour_info_vu(unite, tache, depuis) : « ✓ Vu » de la personne connectée, depuis l'entité ouverte `depuis`, sur la
--   tâche `tache` de l'entité `unite` (la même, ou une autre entité du club : tâche reçue pour info ou partagée). Contrôles :
--   fiche dans `depuis`, même club, tâche ni ticket ni supprimée, la personne (ou son entité, pour ses admins et les rôles
--   « Voir toutes les tâches ») y est mentionnée pour info. La ligne est verrouillée et seul pourInfoVus change (ni la date
--   de modification, ni le reste de la tâche). Renvoie la tâche.
-- • gsa_pour_info_destinataires(unite, tache) : pour chaque entité mentionnée en entier sur la tâche, les fiches des
--   personnes qui la reçoivent (avec un compte, actives, admins ou rôle « Voir toutes les tâches »). Membres du club
--   seulement ; ne renvoie que des identifiants de fiches (les noms sont déjà dans l'organigramme du club).
-- • Garde gsa_items_vus_garde : seul gsa_pour_info_vu écrit pourInfoVus. Une tâche enregistrée par l'appli garde ceux du
--   serveur (un enregistrement fait avec une copie plus ancienne ne les efface pas, et personne ne peut en inventer) ;
--   s'ils diffèrent de ce que l'appli a envoyé, la ligne est marquée comme écrite par le serveur (client_id vide), pour que
--   l'appli la relise. Une tâche nouvelle (copie, occurrence suivante, duplication) part sans « Vu ».
-- Ajout pur : deux fonctions et une garde nouvelles ; aucune donnée modifiée.
-- Pour revenir en arrière : supprimer le déclencheur gsa_items_vus_garde, puis les fonctions gsa_items_vus_garde,
-- gsa_pour_info_vu et gsa_pour_info_destinataires (les « Vu » déjà enregistrés restent dans les tâches, sans effet).

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
      cles := cles || ('u:' || depuis::text || ':' || moi);
    end if;
  end if;
  if cardinality(cles) = 0 then
    raise exception 'Cette tâche n’est pas « pour info » pour toi' using errcode = '42501';
  end if;
  avant := case when jsonb_typeof(d -> 'pourInfoVus') = 'object' then d -> 'pourInfoVus' else '{}'::jsonb end;
  vus := avant;
  foreach k in array cles loop
    if not vus ? k then
      vus := vus || jsonb_build_object(k, jsonb_build_object('le', quand));
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

create or replace function public.gsa_pour_info_destinataires(unite uuid, tache text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d jsonb;
  r jsonb := '{}'::jsonb;
  e text;
begin
  if not public.gsa_compte_ok() or not exists (
    select 1
    from public.gsa_members m
    join public.committees a on a.id = m.committee_id
    join public.committees b on b.id = unite
    where m.user_id = (select auth.uid()) and coalesce(a.parent_id, a.id) = coalesce(b.parent_id, b.id)) then
    raise exception 'Réservé aux membres du club' using errcode = '42501';
  end if;
  select i.data into d
  from public.gsa_items i
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache and not i.deleted;
  if d is null or jsonb_typeof(d -> 'paiement') = 'object' or jsonb_typeof(d -> 'pourInfo' -> 'unites') is distinct from 'array' then
    return r;
  end if;
  for e in select jsonb_array_elements_text(d -> 'pourInfo' -> 'unites') loop
    r := r || jsonb_build_object(e, coalesce((
      select jsonb_agg(distinct m.person_id)
      from public.committees c
      join public.committees b on b.id = unite
      join public.gsa_members m on m.committee_id = c.id
      join public.gsa_items p on p.committee_id = c.id and p.kind = 'people' and p.id = m.person_id and not p.deleted
      where c.id::text = e and coalesce(c.parent_id, c.id) = coalesce(b.parent_id, b.id)
        and coalesce((p.data ->> 'actif')::boolean, true)
        and (m.owner or (p.data -> 'roles') @> '["admin"]'::jsonb or exists (
          select 1 from public.gsa_items x
          where x.committee_id = c.id and x.kind = 'roles' and not x.deleted and (p.data -> 'roles') ? x.id
            and (coalesce((x.data ->> 'locked')::boolean, false) or (x.data -> 'permissions') ? 'tasks.viewAll')))
    ), '[]'::jsonb));
  end loop;
  return r;
end $$;

revoke all on function public.gsa_pour_info_destinataires(uuid, text) from public, anon;
grant execute on function public.gsa_pour_info_destinataires(uuid, text) to authenticated;
