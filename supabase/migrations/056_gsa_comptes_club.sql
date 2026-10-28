-- Tâches GSA — 056 : comptes du club (PERSONNES_DU_CLUB.md, étape 5) : un compte par personne, donné une fois ; ses
-- accès suivent ses places dans l'organigramme.
--
-- • gsa_club_comptes : le compte (auth.users) de chaque personne du club (registre gsa_club_membres). Une personne, un
--   compte ; un compte, une personne par club. Rempli au départ avec les comptes déjà liés à une fiche du club (celle du
--   comité central d'abord, une fiche active d'abord). Écrit par la fonction gsa-acces (clé secrète) ; chacun lit sa ligne.
-- • Les accès suivent les places : une fiche active d'une entité du club pas archivée, liée à une personne du club qui a un
--   compte, ouvre l'entité à ce compte (gsa_acces_place), quand la fiche arrive (nouvelle, réactivée, liée à une autre
--   personne) et quand la personne reçoit son compte. Une fiche retirée ferme l'accès comme avant (gsa_is_member : fiche
--   active). Une fiche qui ouvre déjà l'entité à un compte n'est pas touchée ; un compte déjà lié à une autre fiche active
--   de l'entité la garde. Au départ : les places des comptes existants qui n'ouvraient pas encore leur entité.
-- • gsa_mon_membre (034) : la personne du club du compte connecté, par gsa_club_comptes d'abord, puis comme avant.
-- • gsa_mes_comptes_club() : les clubs du compte connecté, sa personne du club, et s'il a une place (une entité ouverte).
-- • gsa_mes_taches_confiees(club) : pour la personne connectée (même sans place), les tâches qui lui sont confiées sur son
--   nom (respHors, 054) dans les entités du club pas archivées, avec leur entité et ses statuts. Ni tickets, ni fichiers,
--   ni discussion.
-- • gsa_modifier_tache_confiee(club, unite, tache, statut, coches) : elle en change le statut et coche sa checklist
--   ({ "<élément>": true|false }) ; rien d'autre. Date de fin, date de modification et « modifié par » suivent.
-- • gsa_compte_club_etat(club, membre) : pour qui gère les personnes du club (055) : son compte (adresse, dernière
--   connexion, mot de passe provisoire), ses places, et ce que la personne connectée peut faire :
--     - donner l'accès, le retirer, la retirer du club (peutDonner) : une personne sans place ou avec des places
--       ordinaires ; pour chaque place ★ (Admin), il faut être admin de cette entité ou du comité central (sinon, donner
--       l'accès à un ★ donnerait ses droits d'admin à qui reçoit le mot de passe provisoire) ; super-admin : toujours ;
--     - nouveau mot de passe (peutMdp) : les règles de 025 (gsa_peut_approuver_mdp) ; pour un compte sans place, le droit
--       « Gérer les personnes » suffit. Jamais le sien, ni celui d'un propriétaire ou d'un super-admin (sauf super-admin).
-- Pour revenir en arrière : supprimer les déclencheurs gsa_items_acces_places (gsa_items) et gsa_club_comptes_acces, les
-- fonctions gsa_compte_club_etat, gsa_modifier_tache_confiee, gsa_mes_taches_confiees, gsa_mes_comptes_club,
-- gsa_club_comptes_acces, gsa_items_acces_places et gsa_acces_place, la table gsa_club_comptes, puis relancer
-- gsa_mon_membre de 034. Les accès ouverts entre-temps restent (console admin : « Retirer l'accès »).

create table if not exists public.gsa_club_comptes (
  club_id uuid not null,
  membre_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (club_id, membre_id),
  unique (club_id, user_id),
  foreign key (club_id, membre_id) references public.gsa_club_membres (club_id, id) on delete cascade
);
alter table public.gsa_club_comptes enable row level security;
revoke all on public.gsa_club_comptes from anon, authenticated;
grant select on public.gsa_club_comptes to authenticated;
grant select, insert, update, delete on public.gsa_club_comptes to service_role;
drop policy if exists gsa_club_comptes_moi on public.gsa_club_comptes;
create policy gsa_club_comptes_moi on public.gsa_club_comptes for select to authenticated using (user_id = (select auth.uid()));

-- La fiche `fiche` de l'entité `unite` ouvre l'entité au compte `compte`.
create or replace function public.gsa_acces_place(unite uuid, fiche text, compte uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  if exists (select 1 from public.gsa_members x where x.committee_id = unite and x.person_id = fiche) then
    return;
  end if;
  select x.person_id, x.owner into m from public.gsa_members x where x.committee_id = unite and x.user_id = compte;
  if not found then
    insert into public.gsa_members (committee_id, user_id, person_id) values (unite, compte, fiche) on conflict do nothing;
  elsif m.person_id is null or (not m.owner and not exists (
      select 1 from public.gsa_items p
      where p.committee_id = unite and p.kind = 'people' and p.id = m.person_id and not p.deleted
        and coalesce((p.data ->> 'actif')::boolean, true))) then
    -- Son compte était lié à une fiche retirée de l'entité (ou à aucune) : il passe à la nouvelle.
    update public.gsa_members set person_id = fiche where committee_id = unite and user_id = compte;
  end if;
end $$;

-- Une fiche arrive dans une entité : le compte de sa personne du club l'ouvre.
create or replace function public.gsa_items_acces_places() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  club uuid;
  compte uuid;
begin
  if new.kind <> 'people' or new.deleted or jsonb_typeof(new.data) is distinct from 'object'
     or not coalesce((new.data ->> 'actif')::boolean, true) or coalesce(new.data ->> 'membreId', '') = ''
     or new.data ? 'viaEntite' then
    return null;
  end if;
  -- Déjà là, même personne : rien de neuf (un accès retiré à la main le reste).
  if tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object'
     and coalesce((old.data ->> 'actif')::boolean, true) and (old.data ->> 'membreId') is not distinct from (new.data ->> 'membreId') then
    return null;
  end if;
  select coalesce(c.parent_id, c.id) into club
  from public.committees c
  where c.id = new.committee_id and not coalesce((c.info ->> 'archive')::boolean, false);
  if club is null then
    return null;
  end if;
  select k.user_id into compte from public.gsa_club_comptes k where k.club_id = club and k.membre_id = new.data ->> 'membreId';
  if compte is not null then
    perform public.gsa_acces_place(new.committee_id, new.id, compte);
  end if;
  return null;
exception when others then
  raise warning 'gsa_items_acces_places (%, %) : %', new.committee_id, new.id, sqlerrm;
  return null;
end $$;

drop trigger if exists gsa_items_acces_places on public.gsa_items;
create trigger gsa_items_acces_places after insert or update on public.gsa_items
  for each row when (new.kind = 'people') execute function public.gsa_items_acces_places();

-- Une personne du club reçoit son compte : chacune de ses places lui ouvre son entité.
create or replace function public.gsa_club_comptes_acces() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  f record;
begin
  for f in
    select p.committee_id, p.id
    from public.gsa_items p
    join public.committees c on c.id = p.committee_id
    where (c.id = new.club_id or c.parent_id = new.club_id) and not coalesce((c.info ->> 'archive')::boolean, false)
      and p.kind = 'people' and not p.deleted and jsonb_typeof(p.data) = 'object'
      and coalesce((p.data ->> 'actif')::boolean, true) and p.data ->> 'membreId' = new.membre_id
      and not p.data ? 'viaEntite'
    order by (c.parent_id is not null), p.committee_id, p.pos, p.id
  loop
    perform public.gsa_acces_place(f.committee_id, f.id, new.user_id);
  end loop;
  return null;
end $$;

drop trigger if exists gsa_club_comptes_acces on public.gsa_club_comptes;
create trigger gsa_club_comptes_acces after insert or update of user_id, membre_id on public.gsa_club_comptes
  for each row execute function public.gsa_club_comptes_acces();

-- Au départ : les comptes déjà liés à une fiche du club (et, par le déclencheur, leurs places pas encore ouvertes).
insert into public.gsa_club_comptes (club_id, membre_id, user_id)
select x.club_id, x.membre_id, x.user_id
from (
  select distinct on (coalesce(c.parent_id, c.id), p.data ->> 'membreId')
    coalesce(c.parent_id, c.id) as club_id, p.data ->> 'membreId' as membre_id, m.user_id,
    (c.parent_id is not null) as entite, coalesce((p.data ->> 'actif')::boolean, true) as actif, c.name
  from public.gsa_members m
  join public.committees c on c.id = m.committee_id
  join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
  join public.gsa_club_membres r on r.club_id = coalesce(c.parent_id, c.id) and r.id = p.data ->> 'membreId'
  order by coalesce(c.parent_id, c.id), p.data ->> 'membreId', (c.parent_id is not null), coalesce((p.data ->> 'actif')::boolean, true) desc, c.name, m.user_id
) x
order by x.club_id, x.entite, x.actif desc, x.name, x.membre_id
on conflict do nothing;

-- Personne du club du compte connecté : son compte du club d'abord, puis comme avant (034).
create or replace function public.gsa_mon_membre(club uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is not null and public.gsa_compte_ok() then coalesce(
    (select k.membre_id from public.gsa_club_comptes k where k.club_id = club and k.user_id = (select auth.uid())),
    (select r.id
     from public.gsa_members m
     join public.committees c on c.id = m.committee_id and (c.id = club or c.parent_id = club)
     join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
     join public.gsa_club_membres r on r.club_id = club and r.id = p.data ->> 'membreId'
     where m.user_id = (select auth.uid())
     order by (c.parent_id is not null), c.name
     limit 1),
    (select r.id
     from public.gsa_club_membres r
     where r.club_id = club and btrim(coalesce((select auth.jwt()) ->> 'email', '')) <> ''
       and lower(btrim(r.data ->> 'email')) = lower(btrim((select auth.jwt()) ->> 'email'))
     order by r.updated_at
     limit 1)) end
$$;
grant execute on function public.gsa_mon_membre(uuid) to authenticated;

-- Les clubs du compte connecté : sa personne du club, et s'il a une place (une entité ouverte).
create or replace function public.gsa_mes_comptes_club() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'club', k.club_id,
      'nom', c.name,
      'logo', c.info -> 'logo',
      'membreId', k.membre_id,
      'prenom', coalesce(r.data ->> 'prenom', ''),
      'nomPersonne', coalesce(r.data ->> 'nom', ''),
      'place', exists (
        select 1 from public.gsa_members m join public.committees e on e.id = m.committee_id
        where m.user_id = k.user_id and (e.id = k.club_id or e.parent_id = k.club_id) and public.gsa_is_member(e.id)))
    order by c.name), '[]'::jsonb)
  from public.gsa_club_comptes k
  join public.committees c on c.id = k.club_id
  join public.gsa_club_membres r on r.club_id = k.club_id and r.id = k.membre_id
  where k.user_id = (select auth.uid()) and public.gsa_compte_ok()
$$;

-- Tâches confiées à la personne connectée, sur son nom (respHors), dans les entités du club pas archivées.
create or replace function public.gsa_mes_taches_confiees(club uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'unite', jsonb_build_object('id', c.id, 'nom', c.name, 'type', c.type, 'parentId', c.parent_id,
        'info', coalesce(c.info, '{}'::jsonb) - 'logo' - 'historiqueDependance' - 'carte' - 'rangement'),
      'tache', (t.data - 'documents' - 'pieces' - 'commentaires' - 'pourInfoVus') || jsonb_build_object('id', t.id),
      'statuts', coalesce((
        select jsonb_agg(s.data order by s.pos, s.id) from public.gsa_items s
        where s.committee_id = t.committee_id and s.kind = 'statuses' and not s.deleted), '[]'::jsonb))
    order by c.name, t.data ->> 'delai', t.id), '[]'::jsonb)
  from public.gsa_club_comptes k
  join public.committees c on (c.id = k.club_id or c.parent_id = k.club_id) and not coalesce((c.info ->> 'archive')::boolean, false)
  join public.gsa_items t on t.committee_id = c.id and t.kind = 'tasks' and not t.deleted
  where k.club_id = club and k.user_id = (select auth.uid()) and public.gsa_compte_ok()
    and jsonb_typeof(t.data) = 'object' and not (t.data ? 'paiement')
    and jsonb_typeof(t.data -> 'respHors') = 'array'
    and (t.data -> 'respHors') @> jsonb_build_array(jsonb_build_object('membreId', k.membre_id))
$$;

-- Statut et checklist d'une tâche confiée à la personne connectée ; renvoie la tâche (comme gsa_mes_taches_confiees).
create or replace function public.gsa_modifier_tache_confiee(club uuid, unite uuid, tache text, statut text default null,
  coches jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  mid text;
  qui text;
  d jsonb;
  s jsonb;
  etait boolean;
  maintenant text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if not public.gsa_compte_ok() then
    raise exception 'Choisis d’abord ton propre mot de passe' using errcode = '42501';
  end if;
  select k.membre_id into mid from public.gsa_club_comptes k where k.club_id = club and k.user_id = (select auth.uid());
  if mid is null then
    raise exception 'Réservé aux personnes du club qui ont un accès' using errcode = '42501';
  end if;
  if not exists (select 1 from public.committees c where c.id = unite and (c.id = club or c.parent_id = club)
                 and not coalesce((c.info ->> 'archive')::boolean, false)) then
    raise exception 'Entité introuvable' using errcode = '42501';
  end if;
  select t.data into d from public.gsa_items t where t.committee_id = unite and t.kind = 'tasks' and t.id = tache and not t.deleted for update;
  if d is null or jsonb_typeof(d) is distinct from 'object' or d ? 'paiement' or jsonb_typeof(d -> 'respHors') is distinct from 'array'
     or not (d -> 'respHors') @> jsonb_build_array(jsonb_build_object('membreId', mid)) then
    raise exception 'Cette tâche ne t’est pas confiée' using errcode = '42501';
  end if;
  if statut is not null then
    select x.data into s from public.gsa_items x where x.committee_id = unite and x.kind = 'statuses' and x.id = statut and not x.deleted;
    if s is null then
      raise exception 'Statut inconnu dans cette entité' using errcode = '22023';
    end if;
    select coalesce((x.data ->> 'done')::boolean, false) into etait
    from public.gsa_items x where x.committee_id = unite and x.kind = 'statuses' and x.id = d ->> 'statusId' and not x.deleted;
    d := d || jsonb_build_object('statusId', statut);
    if coalesce((s ->> 'done')::boolean, false) then
      if not coalesce(etait, false) or not (d ? 'termineeLe') then
        d := d || jsonb_build_object('termineeLe', left(maintenant, 10));
      end if;
    else
      d := d - 'termineeLe';
    end if;
  end if;
  if coches is not null then
    if jsonb_typeof(coches) is distinct from 'object' then
      raise exception 'Checklist invalide' using errcode = '22023';
    end if;
    if jsonb_typeof(d -> 'checklist') = 'array' then
      d := jsonb_set(d, '{checklist}', (
        select coalesce(jsonb_agg(
          case when jsonb_typeof(e.c) = 'object' and jsonb_typeof(coches -> (e.c ->> 'id')) = 'boolean'
               then e.c || jsonb_build_object('done', coches -> (e.c ->> 'id')) else e.c end
          order by e.i), '[]'::jsonb)
        from jsonb_array_elements(d -> 'checklist') with ordinality e(c, i)));
    end if;
  end if;
  select nullif(btrim(coalesce(r.data ->> 'prenom', '') || ' ' || coalesce(r.data ->> 'nom', '')), '') into qui
  from public.gsa_club_membres r where r.club_id = club and r.id = mid;
  d := d || jsonb_build_object('updatedAt', maintenant, 'contenuLe', maintenant, 'modifiePar', coalesce(qui, '?'));
  update public.gsa_items set data = d, client_id = null where committee_id = unite and kind = 'tasks' and id = tache
  returning data into d;
  return (d - 'documents' - 'pieces' - 'commentaires' - 'pourInfoVus') || jsonb_build_object('id', tache);
end $$;

-- Pour qui gère les personnes du club : le compte de la personne `membre`, ses places, et ce qu'on peut faire.
create or replace function public.gsa_compte_club_etat(club uuid, membre text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  moi uuid := (select auth.uid());
  sup boolean;
  u uuid;
  adresse text;
  connexion timestamptz;
  prov boolean := false;
  places int;
  etoiles jsonb;
  admins_ok boolean;
  protege boolean;
  peut_mdp boolean := false;
begin
  if moi is null or not public.gsa_personnes_gerer(club) then
    raise exception 'Réservé aux personnes qui ont le droit « Gérer les personnes du club »' using errcode = '42501';
  end if;
  if not exists (select 1 from public.gsa_club_membres r where r.club_id = club and r.id = membre) then
    raise exception 'Personne introuvable dans le club' using errcode = 'P0002';
  end if;
  sup := exists (select 1 from public.gsa_super_admins s where s.user_id = moi);
  select k.user_id into u from public.gsa_club_comptes k where k.club_id = club and k.membre_id = membre;
  with p as (
    select c.id, c.name, c.parent_id, coalesce((x.data -> 'roles') @> '["admin"]'::jsonb, false) as etoile
    from public.gsa_items x
    join public.committees c on c.id = x.committee_id
    where (c.id = club or c.parent_id = club) and not coalesce((c.info ->> 'archive')::boolean, false)
      and x.kind = 'people' and not x.deleted and jsonb_typeof(x.data) = 'object'
      and coalesce((x.data ->> 'actif')::boolean, true) and x.data ->> 'membreId' = membre
  )
  select count(*),
    coalesce(jsonb_agg(distinct p.name) filter (where p.etoile), '[]'::jsonb),
    coalesce(bool_and(not p.etoile or public.gsa_is_admin(p.id) or (p.parent_id is not null and public.gsa_is_admin(p.parent_id))), true)
    into places, etoiles, admins_ok
  from p;
  if u is not null then
    select x.email::text, x.last_sign_in_at,
      coalesce(x.raw_app_meta_data ->> 'doit_changer_mdp', '') = 'true' or coalesce(x.raw_user_meta_data ->> 'doit_changer_mdp', '') = 'true'
      into adresse, connexion, prov
    from auth.users x where x.id = u;
  end if;
  protege := u is not null and (exists (select 1 from public.gsa_super_admins s where s.user_id = u)
    or exists (select 1 from public.gsa_members m where m.user_id = u and m.owner));
  if u is not null and u <> moi then
    peut_mdp := sup or (not protege and (
      public.gsa_peut_approuver_mdp(moi, u)
      or not exists (select 1 from public.gsa_members m where m.user_id = u and public.gsa_membre_de(u, m.committee_id))));
  end if;
  return jsonb_build_object(
    'compte', u is not null,
    'email', adresse,
    'derniereConnexion', connexion,
    'provisoire', coalesce(prov, false),
    'places', places,
    'etoiles', etoiles,
    'moi', (u is not null and u = moi) or membre is not distinct from public.gsa_mon_membre(club),
    'peutDonner', sup or (admins_ok and not protege),
    'peutMdp', peut_mdp);
end $$;

revoke all on function public.gsa_acces_place(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.gsa_items_acces_places() from public, anon, authenticated;
revoke all on function public.gsa_club_comptes_acces() from public, anon, authenticated;
revoke all on function public.gsa_mes_comptes_club() from public, anon;
revoke all on function public.gsa_mes_taches_confiees(uuid) from public, anon;
revoke all on function public.gsa_modifier_tache_confiee(uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function public.gsa_compte_club_etat(uuid, text) from public, anon;
grant execute on function public.gsa_mes_comptes_club() to authenticated;
grant execute on function public.gsa_mes_taches_confiees(uuid) to authenticated;
grant execute on function public.gsa_modifier_tache_confiee(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.gsa_compte_club_etat(uuid, text) to authenticated;
