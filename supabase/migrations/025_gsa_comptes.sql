-- Tâches GSA — 025 : comptes du club (mot de passe provisoire, mot de passe oublié, super-admin).
--
-- • Mot de passe provisoire à changer : le drapeau « doit_changer_mdp » passe dans app_metadata, que l'utilisateur ne
--   peut pas modifier lui-même, et se lit dans son jeton de connexion. Tant qu'il est là, le compte n'a accès à aucune
--   donnée (gsa_is_member, gsa_is_admin, gsa_a_droit, gsa_ma_fiche : tout le reste passe par elles) ni à la fonction
--   gsa-acces. Il disparaît quand l'utilisateur change lui-même son mot de passe (déclencheur sur auth.users) ; l'appli
--   demande ensuite un nouveau jeton. Avant 025, le drapeau était dans user_metadata et seule l'appli le respectait.
-- • Super-admins du club, hors des entités (table gsa_super_admins) : nouveau mot de passe, blocage, fusion de deux
--   comptes (fonction gsa-acces, page « Comptes du club »). Au départ : le propriétaire du comité central.
-- • « Mot de passe oublié » sans e-mail : la demande (gsa_demandes_mdp, écrite par gsa-acces) est vue par les admins de
--   chacune des entités du compte ; une seule validation suffit. Garde-fou : le compte d'un admin ne se valide que par un
--   admin de cette même entité, de son comité central, ou par un super-admin ; celui d'un propriétaire ou d'un
--   super-admin, par un super-admin seulement. Sinon, le responsable d'un groupe pourrait prendre le compte du président.

-- Compte utilisable : pas de mot de passe provisoire en attente (sans jeton, par la clé secrète : utilisable).
create or replace function public.gsa_compte_ok() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'doit_changer_mdp', '') <> 'true'
$$;

create or replace function public.gsa_is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gsa_compte_ok() and exists (
    select 1 from public.gsa_members m
    where m.committee_id = c and m.user_id = (select auth.uid())
      and (m.owner or exists (
        select 1 from public.gsa_items p
        where p.committee_id = c and p.kind = 'people' and p.id = m.person_id and not p.deleted
          and coalesce((p.data ->> 'actif')::boolean, true)
      ))
  );
$$;

create or replace function public.gsa_is_admin(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gsa_compte_ok() and exists (
    select 1 from public.gsa_members m
    where m.committee_id = c and m.user_id = (select auth.uid())
      and (m.owner or exists (
        select 1 from public.gsa_items p
        where p.committee_id = c and p.kind = 'people' and p.id = m.person_id and not p.deleted
          and coalesce((p.data ->> 'actif')::boolean, true)
          and (p.data -> 'roles') @> '["admin"]'::jsonb
      ))
  );
$$;

create or replace function public.gsa_ma_fiche(c uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.person_id from public.gsa_members m where m.committee_id = c and m.user_id = auth.uid() and public.gsa_compte_ok() limit 1
$$;

create or replace function public.gsa_a_droit(c uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gsa_compte_ok() and exists (
    select 1
    from public.gsa_members m
    join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
    join public.gsa_items r on r.committee_id = m.committee_id and r.kind = 'roles' and not r.deleted
    where m.committee_id = c and m.user_id = auth.uid()
      and coalesce((p.data ->> 'actif')::boolean, true)
      and (p.data -> 'roles') ? r.id
      and (coalesce((r.data ->> 'locked')::boolean, false) or (r.data -> 'permissions') ? perm)
  )
$$;

-- Seule fonction de lecture sans contrôle d'appartenance (ses propres tickets envoyés à la caisse centrale, 015) : idem.
create or replace function public.gsa_mes_tickets_centraux() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'type', t.data -> 'paiement' ->> 'type',
    'titre', t.data ->> 'titre',
    'montant', t.data -> 'paiement' -> 'montant',
    'beneficiaire', t.data -> 'paiement' ->> 'beneficiaire',
    'etat', t.data -> 'paiement' ->> 'etat',
    'le', t.data -> 'paiement' ->> 'demandeLe',
    'unite', t.data -> 'paiement' -> 'externe' ->> 'unite',
    'caisse', c.name,
    'viseLe', t.data -> 'paiement' -> 'validation' ->> 'le',
    'payeLe', t.data -> 'paiement' -> 'paye' ->> 'le',
    'motif', t.data -> 'paiement' -> 'refus' ->> 'motif'
  ) order by t.data -> 'paiement' ->> 'demandeLe' desc), '[]'::jsonb)
  from public.gsa_items t
  join public.committees c on c.id = t.committee_id
  where t.kind = 'tasks' and not t.deleted and (select auth.uid()) is not null and public.gsa_compte_ok()
    and t.data -> 'paiement' -> 'externe' ->> 'userId' = (select auth.uid())::text
$$;

-- L'utilisateur change lui-même son mot de passe provisoire : le drapeau tombe.
-- gsa-acces donne un mot de passe provisoire en deux temps (mot de passe, puis drapeau) : le drapeau revient ensuite.
create or replace function public.gsa_mdp_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and coalesce(old.raw_app_meta_data ->> 'doit_changer_mdp', '') = 'true'
     and coalesce(new.raw_app_meta_data ->> 'doit_changer_mdp', '') = 'true' then
    new.raw_app_meta_data := new.raw_app_meta_data - 'doit_changer_mdp';
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'doit_changer_mdp';
  end if;
  return new;
end $$;
drop trigger if exists gsa_mdp_change on auth.users;
create trigger gsa_mdp_change before update of encrypted_password on auth.users
  for each row execute function public.gsa_mdp_change();

-- Mots de passe provisoires pas encore changés : le drapeau passe aussi dans app_metadata.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"doit_changer_mdp": true}'::jsonb
where coalesce(raw_user_meta_data ->> 'doit_changer_mdp', '') = 'true'
  and coalesce(raw_app_meta_data ->> 'doit_changer_mdp', '') <> 'true';

-- Super-admins du club.
create table if not exists public.gsa_super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  depuis timestamptz not null default now()
);
alter table public.gsa_super_admins enable row level security;
drop policy if exists gsa_super_admins_moi on public.gsa_super_admins;
create policy gsa_super_admins_moi on public.gsa_super_admins for select to authenticated using (user_id = (select auth.uid()));
grant select on public.gsa_super_admins to authenticated;
grant select, insert, update, delete on public.gsa_super_admins to service_role;

insert into public.gsa_super_admins (user_id)
select distinct m.user_id
from public.gsa_members m join public.committees c on c.id = m.committee_id
where c.parent_id is null and c.type = 'central' and m.owner
on conflict do nothing;

create or replace function public.gsa_est_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gsa_compte_ok() and exists (select 1 from public.gsa_super_admins s where s.user_id = (select auth.uid()))
$$;
grant execute on function public.gsa_est_super_admin() to authenticated;

-- Demandes « mot de passe oublié » (écrites et traitées par gsa-acces ; lues par les admins via gsa_demandes_mdp_entite).
create table if not exists public.gsa_demandes_mdp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  le timestamptz not null default now(),
  etat text not null default 'attente' check (etat in ('attente', 'faite', 'refusee')),
  traitee_le timestamptz,
  par uuid references auth.users(id) on delete set null
);
create index if not exists gsa_demandes_mdp_user_idx on public.gsa_demandes_mdp (user_id, le desc);
create index if not exists gsa_demandes_mdp_le_idx on public.gsa_demandes_mdp (le desc);
alter table public.gsa_demandes_mdp enable row level security;
grant select, insert, update, delete on public.gsa_demandes_mdp to service_role;

-- Membre actif / admin d'une entité, pour un compte donné (comme gsa_is_member / gsa_is_admin pour la personne connectée).
create or replace function public.gsa_membre_de(u uuid, c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gsa_members m
    where m.committee_id = c and m.user_id = u
      and (m.owner or exists (
        select 1 from public.gsa_items p
        where p.committee_id = c and p.kind = 'people' and p.id = m.person_id and not p.deleted
          and coalesce((p.data ->> 'actif')::boolean, true)
      ))
  );
$$;

create or replace function public.gsa_admin_de(u uuid, c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gsa_members m
    where m.committee_id = c and m.user_id = u
      and (m.owner or exists (
        select 1 from public.gsa_items p
        where p.committee_id = c and p.kind = 'people' and p.id = m.person_id and not p.deleted
          and coalesce((p.data ->> 'actif')::boolean, true)
          and (p.data -> 'roles') @> '["admin"]'::jsonb
      ))
  );
$$;

-- `appelant` peut-il donner un mot de passe provisoire au compte `cible` ?
--   • super-admin : oui ;
--   • sinon : pas son propre compte, ni celui d'un propriétaire ou d'un super-admin ; admin de l'une des entités où
--     `cible` est membre actif ; et, pour chaque entité où `cible` est admin, admin de cette entité ou de son comité central.
create or replace function public.gsa_peut_approuver_mdp(appelant uuid, cible uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select appelant is not null and cible is not null and (
    exists (select 1 from public.gsa_super_admins s where s.user_id = appelant)
    or (
      appelant <> cible
      and not exists (select 1 from public.gsa_super_admins s where s.user_id = cible)
      and not exists (select 1 from public.gsa_members m where m.user_id = cible and m.owner)
      and exists (
        select 1 from public.gsa_members m
        where m.user_id = cible and public.gsa_membre_de(cible, m.committee_id) and public.gsa_admin_de(appelant, m.committee_id)
      )
      and not exists (
        select 1 from public.gsa_members m join public.committees c on c.id = m.committee_id
        where m.user_id = cible and public.gsa_admin_de(cible, m.committee_id)
          and not public.gsa_admin_de(appelant, m.committee_id)
          and not (c.parent_id is not null and public.gsa_admin_de(appelant, c.parent_id))
      )
    )
  )
$$;

-- Demandes en attente (7 derniers jours) des membres de l'entité, pour ses admins ; `peut` : la personne connectée peut la valider.
create or replace function public.gsa_demandes_mdp_entite(c uuid)
returns table (id uuid, person_id text, email text, le timestamptz, peut boolean)
language sql stable security definer set search_path = '' as $$
  select x.id, x.person_id, x.email, x.le, public.gsa_peut_approuver_mdp((select auth.uid()), x.user_id)
  from (
    select distinct on (d.user_id) d.id, d.user_id, m.person_id, u.email::text as email, d.le
    from public.gsa_demandes_mdp d
    join public.gsa_members m on m.committee_id = c and m.user_id = d.user_id
    join auth.users u on u.id = d.user_id
    where public.gsa_is_admin(c) and d.etat = 'attente' and d.le > now() - interval '7 days'
      and public.gsa_membre_de(d.user_id, c)
    order by d.user_id, d.le desc
  ) x
  order by x.le desc
$$;
grant execute on function public.gsa_demandes_mdp_entite(uuid) to authenticated;

-- Compte d'une adresse (demande « mot de passe oublié », sans connexion : gsa-acces ne dit jamais s'il existe).
create or replace function public.gsa_compte_par_email(e text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(e)) limit 1
$$;

-- Page « Comptes du club » (super-admins) : chaque compte, ses entités et sa fiche dans chacune.
create or replace function public.gsa_comptes_club()
returns table (user_id uuid, email text, cree_le timestamptz, derniere_connexion timestamptz, bloque boolean, provisoire boolean,
  super_admin boolean, entites jsonb, demande uuid, demande_le timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at,
    coalesce(u.banned_until > now(), false),
    coalesce(u.raw_app_meta_data ->> 'doit_changer_mdp', '') = 'true' or coalesce(u.raw_user_meta_data ->> 'doit_changer_mdp', '') = 'true',
    exists (select 1 from public.gsa_super_admins s where s.user_id = u.id),
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'committeeId', c.id, 'nom', c.name, 'type', c.type, 'archive', coalesce(c.info ->> 'archive', '') = 'true',
          'personId', m.person_id, 'owner', m.owner,
          'fiche', nullif(btrim(coalesce(p.data ->> 'prenom', '') || ' ' || coalesce(p.data ->> 'nom', '')), ''),
          'actif', public.gsa_membre_de(u.id, c.id),
          'admin', public.gsa_admin_de(u.id, c.id))
        order by c.parent_id nulls first, c.name)
      from public.gsa_members m
      join public.committees c on c.id = m.committee_id
      left join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id
      where m.user_id = u.id), '[]'::jsonb),
    d.id, d.le
  from auth.users u
  left join lateral (
    select x.id, x.le from public.gsa_demandes_mdp x
    where x.user_id = u.id and x.etat = 'attente' and x.le > now() - interval '7 days'
    order by x.le desc limit 1
  ) d on true
  order by lower(u.email)
$$;

-- Fusion de deux comptes d'une même personne (super-admin) : `absorber` passe dans `garder` (entités, fiche, propriété,
-- tickets envoyés à la caisse centrale, propositions) ; gsa-acces supprime ensuite le compte absorbé.
-- Même entité des deux côtés : on garde le lien de `garder` (sa fiche, sinon celle d'`absorber`).
create or replace function public.gsa_fusionner_comptes(garder uuid, absorber uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  g record;
  deplaces int := 0;
  communes int := 0;
  doublons int := 0;
begin
  if garder is null or absorber is null or garder = absorber then
    raise exception 'Choisis deux comptes différents.';
  end if;
  if not exists (select 1 from auth.users where id = garder) or not exists (select 1 from auth.users where id = absorber) then
    raise exception 'Compte introuvable.';
  end if;
  for r in select * from public.gsa_members where user_id = absorber loop
    select * into g from public.gsa_members where committee_id = r.committee_id and user_id = garder;
    if not found then
      update public.gsa_members set user_id = garder where committee_id = r.committee_id and user_id = absorber;
      deplaces := deplaces + 1;
    else
      delete from public.gsa_members where committee_id = r.committee_id and user_id = absorber;
      if g.person_id is null and r.person_id is not null then
        update public.gsa_members set person_id = r.person_id where committee_id = r.committee_id and user_id = garder;
      elsif r.person_id is not null and r.person_id is distinct from g.person_id then
        doublons := doublons + 1;
      end if;
      if r.owner and not g.owner then
        update public.gsa_members set owner = true where committee_id = r.committee_id and user_id = garder;
      end if;
      communes := communes + 1;
    end if;
  end loop;
  insert into public.gsa_super_admins (user_id)
  select garder where exists (select 1 from public.gsa_super_admins where user_id = absorber)
  on conflict do nothing;
  update public.gsa_items set data = jsonb_set(data, '{paiement,externe,userId}', to_jsonb(garder::text))
  where kind = 'tasks' and data -> 'paiement' -> 'externe' ->> 'userId' = absorber::text;
  update public.gsa_items set data = jsonb_set(data, '{auteur}', to_jsonb(garder::text))
  where kind = 'propositions' and data ->> 'auteur' = absorber::text;
  update public.committees set created_by = garder where created_by = absorber;
  update public.gsa_demandes_mdp set etat = 'faite', traitee_le = now() where user_id = absorber and etat = 'attente';
  return jsonb_build_object('deplaces', deplaces, 'communes', communes, 'fichesEnDouble', doublons);
end $$;

-- Fonctions internes : déclencheur, ou fonction gsa-acces (clé secrète) seulement.
revoke all on function public.gsa_mdp_change() from public, anon, authenticated;
revoke all on function public.gsa_membre_de(uuid, uuid) from public, anon, authenticated;
revoke all on function public.gsa_admin_de(uuid, uuid) from public, anon, authenticated;
revoke all on function public.gsa_peut_approuver_mdp(uuid, uuid) from public, anon, authenticated;
revoke all on function public.gsa_compte_par_email(text) from public, anon, authenticated;
revoke all on function public.gsa_comptes_club() from public, anon, authenticated;
revoke all on function public.gsa_fusionner_comptes(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gsa_membre_de(uuid, uuid) to service_role;
grant execute on function public.gsa_admin_de(uuid, uuid) to service_role;
grant execute on function public.gsa_peut_approuver_mdp(uuid, uuid) to service_role;
grant execute on function public.gsa_compte_par_email(text) to service_role;
grant execute on function public.gsa_comptes_club() to service_role;
grant execute on function public.gsa_fusionner_comptes(uuid, uuid) to service_role;
