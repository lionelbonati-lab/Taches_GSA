-- Tâches GSA — 058 : les mêmes statuts dans tout le club, ceux du comité central.
--
-- • Les statuts des tâches (À faire, En cours, Envoyé…) se règlent au comité central (console admin › Sections et
--   statuts, ses admins) et valent pour toutes les entités du club. Le serveur les recopie dans chacune (gsa_items,
--   « statuses »), où l'appli et les fonctions serveur (notifications, agenda, copies de chaque nuit) les lisent comme
--   avant ; les consoles des autres entités les montrent sans les modifier.
-- • gsa_statuts_aligner(entite) : les statuts de l'entité deviennent ceux du comité central (mêmes identifiants, noms,
--   couleurs, « terminée » et ordre). Un statut de l'entité absent du comité central est retiré s'il ne sert à aucune de
--   ses tâches, sinon gardé à la fin (jusqu'à ce que ses tâches changent de statut). Aucune tâche n'est modifiée.
-- • Déclencheur gsa_statuts_club, après chaque écriture d'un statut : au comité central, recopie dans toutes les entités ;
--   dans une autre entité (nouvelle entité, ancienne version de l'appli, restauration), réalignement sur le comité central.
-- • Au départ : toutes les entités alignées (le 28.10.2026 : chacune reçoit les 5 statuts propres au comité central —
--   Envoyé, Reçu, Refusé, A discuter, Information — et « Annulé » prend sa couleur ; aucune tâche n'utilise de statut
--   absent du comité central).
-- Pour revenir en arrière (les statuts recopiés restent, réglables par entité comme avant) :
--   drop trigger if exists gsa_statuts_club on public.gsa_items;
--   drop function if exists public.gsa_statuts_club_suivre();
--   drop function if exists public.gsa_statuts_aligner(uuid);

create or replace function public.gsa_statuts_aligner(entite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  central uuid;
  n integer;
begin
  select k.parent_id into central from public.committees k where k.id = entite;
  select count(*) into n from public.gsa_items c where c.committee_id = central and c.kind = 'statuses' and not c.deleted;
  -- Le comité central lui-même, ou un club sans statuts : rien à recopier.
  if central is null or n = 0 then
    return;
  end if;
  -- Écritures du serveur : le déclencheur ne repart pas ; client_id vide, pour que l'appli qui a écrit les reçoive aussi.
  perform set_config('gsa.statuts_club', 'on', true);
  insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
  select entite, 'statuses', c.id, row_number() over (order by c.pos, c.id) - 1, c.data, false, null
  from public.gsa_items c
  where c.committee_id = central and c.kind = 'statuses' and not c.deleted
  on conflict (committee_id, kind, id) do update
    set pos = excluded.pos, data = excluded.data, deleted = false, client_id = null
    where public.gsa_items.pos is distinct from excluded.pos
       or public.gsa_items.data is distinct from excluded.data
       or public.gsa_items.deleted;
  -- Ses statuts absents du comité central : retirés s'ils ne servent plus, sinon gardés après ceux du club.
  with propres as (
    select e.id,
           exists (select 1 from public.gsa_items t
                   where t.committee_id = entite and t.kind = 'tasks' and not t.deleted and t.data ->> 'statusId' = e.id) as utilise,
           row_number() over (order by e.pos, e.id) as rang
    from public.gsa_items e
    where e.committee_id = entite and e.kind = 'statuses' and not e.deleted
      and not exists (select 1 from public.gsa_items c
                      where c.committee_id = central and c.kind = 'statuses' and not c.deleted and c.id = e.id))
  update public.gsa_items e
     set deleted = not p.utilise, pos = n + p.rang - 1, client_id = null
    from propres p
   where e.committee_id = entite and e.kind = 'statuses' and e.id = p.id
     and (not p.utilise or e.pos is distinct from (n + p.rang - 1)::double precision);
  perform set_config('gsa.statuts_club', 'off', true);
end $$;
revoke all on function public.gsa_statuts_aligner(uuid) from public, anon, authenticated;

create or replace function public.gsa_statuts_club_suivre() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e uuid;
begin
  if coalesce(current_setting('gsa.statuts_club', true), '') = 'on' then
    return null;
  end if;
  if exists (select 1 from public.committees k where k.id = new.committee_id and k.parent_id is null) then
    for e in select k.id from public.committees k where k.parent_id = new.committee_id loop
      perform public.gsa_statuts_aligner(e);
    end loop;
  else
    perform public.gsa_statuts_aligner(new.committee_id);
  end if;
  return null;
end $$;
revoke all on function public.gsa_statuts_club_suivre() from public, anon, authenticated;

drop trigger if exists gsa_statuts_club on public.gsa_items;
create trigger gsa_statuts_club after insert or update on public.gsa_items
  for each row when (new.kind = 'statuses') execute function public.gsa_statuts_club_suivre();

-- Au départ : toutes les entités du club alignées sur le comité central.
select public.gsa_statuts_aligner(k.id) from public.committees k where k.parent_id is not null;
