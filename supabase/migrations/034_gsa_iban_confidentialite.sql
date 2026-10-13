-- Tâches GSA — 034 : IBAN des membres du club, confidentialité et liste des membres.
-- • IBAN : il ne s'enregistre plus dans la fiche du registre « Membres du club » (016), mais à part (gsa_club_iban),
--   et seulement par la personne elle-même (gsa_mon_iban) : personne d'autre, pas même un admin, ne peut le saisir ou
--   le modifier à sa place. Il n'est lu que par elle (gsa_mon_registre) et, dans la liste des membres
--   (gsa_membres_liste), par les caissiers du club : un rôle qui donne expressément le droit « paiements.payer » dans
--   l'une de ses entités (pas le seul rôle Admin). Les IBAN déjà enregistrés sont repris tels quels.
-- • Confidentialité : une personne peut masquer ses données personnelles (email, téléphone, IBAN) dans la liste des
--   membres (gsa_ma_confidentialite) ; seule elle change ce réglage. La liste ne les envoie plus (sauf à elle-même) et
--   on ne peut plus les modifier depuis le registre (ils changent toujours depuis sa fiche dans une entité).
-- • Liste des membres (gsa_membres_liste) : pour le droit « Membres du club » et les admins (comme avant), et pour les
--   caissiers, en lecture.
-- • Fiche ajoutée à une entité pour une personne déjà au club : ses champs vides prennent les valeurs du registre
--   (gsa_items_registre), plutôt que d'y effacer des coordonnées masquées.
-- Rien n'est supprimé : les IBAN passent de la fiche du registre à gsa_club_iban.

-- Fiche du registre de la personne connectée dans ce club : celle de l'une de ses fiches d'entité, sinon même email.
create or replace function public.gsa_mon_membre(club uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is not null and public.gsa_compte_ok() then coalesce(
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

-- Caissier du club : un rôle qui donne expressément « paiements.payer » (hors Admin) dans l'une de ses entités actives.
create or replace function public.gsa_caissier_club(club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gsa_compte_ok() and exists (
    select 1
    from public.gsa_members m
    join public.committees c on c.id = m.committee_id and (c.id = club or c.parent_id = club)
    join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
    join public.gsa_items r on r.committee_id = m.committee_id and r.kind = 'roles' and not r.deleted
    where m.user_id = (select auth.uid())
      and not coalesce((c.info ->> 'archive')::boolean, false)
      and coalesce((p.data ->> 'actif')::boolean, true)
      and coalesce(p.data -> 'roles', '[]'::jsonb) ? r.id
      and not coalesce((r.data ->> 'locked')::boolean, false)
      and coalesce(r.data -> 'permissions', '[]'::jsonb) ? 'paiements.payer'
  )
$$;
grant execute on function public.gsa_caissier_club(uuid) to authenticated;

-- IBAN : longueur, caractères et clé de contrôle (modulo 97).
create or replace function public.gsa_iban_valide(v text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  s text;
  r int = 0;
  ch text;
begin
  if v is null or v !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
    return false;
  end if;
  s = substr(v, 5) || substr(v, 1, 4);
  for k in 1 .. length(s) loop
    ch = substr(s, k, 1);
    if ch ~ '[A-Z]' then
      r = (r * 100 + ascii(ch) - 55) % 97;
    else
      r = (r * 10 + ascii(ch) - 48) % 97;
    end if;
  end loop;
  return r = 1;
end $$;

-- IBAN des membres du club : aucun accès direct, seulement par les fonctions ci-dessous.
create table if not exists public.gsa_club_iban (
  club_id uuid not null references public.committees(id) on delete cascade,
  membre_id text not null,
  iban text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (club_id, membre_id)
);
alter table public.gsa_club_iban enable row level security;
revoke all on public.gsa_club_iban from anon, authenticated;
grant select, insert, update, delete on public.gsa_club_iban to service_role;

-- Fiche du registre : champs connus seulement (plus d'IBAN) ; « prive » ne change que par la personne elle-même
-- (gsa_ma_confidentialite), et ses coordonnées masquées ne changent pas depuis le registre, sauf par elle (sinon depuis
-- une fiche d'entité : gsa_items_registre, 016).
create or replace function public.gsa_club_membres_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb = new.data;
  g jsonb = case when jsonb_typeof(new.data -> 'groupes') = 'array' then new.data -> 'groupes' else '[]'::jsonb end;
  prive boolean = false;
  moi boolean = false;
begin
  if btrim(coalesce(d ->> 'prenom', '') || coalesce(d ->> 'nom', '')) = '' then
    raise exception 'Un membre du club a un nom ou un prénom' using errcode = '22023';
  end if;
  if coalesce(current_setting('gsa.moi', true), '') = new.club_id::text || '|' || new.id then
    moi = public.gsa_mon_membre(new.club_id) is not distinct from new.id;
  end if;
  if tg_op = 'UPDATE' then
    prive = coalesce((old.data ->> 'prive')::boolean, false);
  end if;
  if moi then
    prive = coalesce((d ->> 'prive')::boolean, false);
  elsif tg_op = 'UPDATE' and prive and coalesce(current_setting('gsa.registre', true), '') = ''
    and public.gsa_mon_membre(new.club_id) is distinct from new.id then
    d = d || jsonb_build_object('email', coalesce(old.data ->> 'email', ''), 'telephone', coalesce(old.data ->> 'telephone', ''));
  end if;
  new.data = jsonb_build_object(
    'prenom', left(btrim(coalesce(d ->> 'prenom', '')), 100),
    'nom', left(btrim(coalesce(d ->> 'nom', '')), 100),
    'email', left(btrim(coalesce(d ->> 'email', '')), 200),
    'telephone', left(btrim(coalesce(d ->> 'telephone', '')), 50),
    'couleur', case when coalesce(d ->> 'couleur', '') ~ '^#[0-9a-fA-F]{6}$' then d ->> 'couleur' else '#0f766e' end,
    'groupes', coalesce((select jsonb_agg(distinct x) from jsonb_array_elements_text(g) x where x ~ '^[0-9a-zA-Z_-]{1,64}$'), '[]'::jsonb),
    'prive', prive
  );
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

-- Fiche d'une entité enregistrée (016) : liée au registre, ses coordonnées passent dans le registre. Nouveau : une fiche
-- nouvelle (ou liée pour la première fois) à une personne déjà au club complète d'abord ses champs vides par ceux du
-- registre, au lieu de les y effacer (personne ajoutée à une entité depuis la liste des membres, où ses données
-- peuvent être masquées).
create or replace function public.gsa_items_registre() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  club uuid;
  mid text = nullif(new.data ->> 'membreId', '');
  r public.gsa_club_membres;
  co jsonb;
  rc jsonb;
begin
  if new.kind <> 'people' or new.deleted then
    return new;
  end if;
  -- Un upsert passe d'abord par l'insertion : si la fiche existe déjà, le lien se fait à la mise à jour.
  if tg_op = 'INSERT' and exists (select 1 from public.gsa_items i where i.committee_id = new.committee_id and i.kind = new.kind and i.id = new.id) then
    return new;
  end if;
  select coalesce(c.parent_id, c.id) into club from public.committees c where c.id = new.committee_id;
  if club is null then
    return new;
  end if;
  if mid is null and tg_op = 'UPDATE' then
    mid = nullif(old.data ->> 'membreId', '');
  end if;
  if mid is not null then
    select * into r from public.gsa_club_membres m where m.club_id = club and m.id = mid;
  end if;
  if r.id is null and btrim(coalesce(new.data ->> 'email', '')) <> '' then
    select * into r from public.gsa_club_membres m
    where m.club_id = club and lower(btrim(m.data ->> 'email')) = lower(btrim(new.data ->> 'email'))
    order by m.updated_at limit 1;
  end if;
  co = public.gsa_coordonnees(new.data);
  if r.id is null then
    if btrim((co ->> 'prenom') || (co ->> 'nom')) = '' then
      return new;
    end if;
    insert into public.gsa_club_membres (club_id, id, data)
    values (club, coalesce(mid, 'm' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
            co || jsonb_build_object('couleur', new.data ->> 'couleur', 'groupes', '[]'::jsonb))
    returning * into r;
  else
    if tg_op = 'INSERT' or nullif(old.data ->> 'membreId', '') is distinct from r.id then
      rc = public.gsa_coordonnees(r.data);
      co = (select jsonb_object_agg(k, case when co ->> k = '' then rc ->> k else co ->> k end) from jsonb_object_keys(co) k);
      new.data = new.data || co;
    end if;
    if public.gsa_coordonnees(r.data) is distinct from co then
      perform set_config('gsa.registre', new.committee_id::text || '|' || new.id, true);
      update public.gsa_club_membres m set data = m.data || co where m.club_id = club and m.id = r.id;
      perform set_config('gsa.registre', '', true);
    end if;
  end if;
  new.data = new.data || jsonb_build_object('membreId', r.id);
  return new;
end $$;

-- Reprise : les IBAN des fiches du registre passent dans gsa_club_iban, puis quittent la fiche.
insert into public.gsa_club_iban (club_id, membre_id, iban, updated_at, updated_by)
select m.club_id, m.id, left(upper(regexp_replace(m.data ->> 'iban', '\s', '', 'g')), 42), m.updated_at, m.updated_by
from public.gsa_club_membres m
where btrim(coalesce(m.data ->> 'iban', '')) <> ''
on conflict (club_id, membre_id) do nothing;
update public.gsa_club_membres m set data = m.data - 'iban'
where m.data ? 'iban'
  and (btrim(coalesce(m.data ->> 'iban', '')) = ''
    or exists (select 1 from public.gsa_club_iban i where i.club_id = m.club_id and i.membre_id = m.id));

-- Membre retiré du registre : son IBAN aussi.
create or replace function public.gsa_club_membres_iban_retire() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.gsa_club_iban i where i.club_id = old.club_id and i.membre_id = old.id;
  return null;
end $$;
drop trigger if exists gsa_club_membres_iban_retire on public.gsa_club_membres;
create trigger gsa_club_membres_iban_retire after delete on public.gsa_club_membres
  for each row execute function public.gsa_club_membres_iban_retire();

-- Ma fiche du registre (pour « Réglages ») : mon nom, mon IBAN, ma confidentialité ; null si je n'y suis pas.
create or replace function public.gsa_mon_registre(club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  mid text = public.gsa_mon_membre(club);
  r public.gsa_club_membres;
begin
  if mid is null then
    return null;
  end if;
  select * into r from public.gsa_club_membres m where m.club_id = club and m.id = mid;
  return jsonb_build_object(
    'id', mid,
    'prenom', coalesce(r.data ->> 'prenom', ''),
    'nom', coalesce(r.data ->> 'nom', ''),
    'iban', coalesce((select i.iban from public.gsa_club_iban i where i.club_id = club and i.membre_id = mid), ''),
    'prive', coalesce((r.data ->> 'prive')::boolean, false)
  );
end $$;
grant execute on function public.gsa_mon_registre(uuid) to authenticated;

-- Mon IBAN : enregistré, modifié ou effacé (vide) par la personne elle-même, et par elle seule.
create or replace function public.gsa_mon_iban(club uuid, valeur text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  mid text = public.gsa_mon_membre(club);
  v text = upper(regexp_replace(coalesce(valeur, ''), '\s', '', 'g'));
begin
  if mid is null then
    raise exception 'Ta fiche n’est pas dans le registre « Membres du club » : demande à un admin de t’y inscrire.' using errcode = '42501';
  end if;
  if v = '' then
    delete from public.gsa_club_iban i where i.club_id = club and i.membre_id = mid;
    return '';
  end if;
  if not public.gsa_iban_valide(v) then
    raise exception 'IBAN invalide : vérifie-le (longueur et chiffres de contrôle).' using errcode = '22023';
  end if;
  insert into public.gsa_club_iban as i (club_id, membre_id, iban, updated_at, updated_by)
  values (club, mid, v, now(), auth.uid())
  on conflict (club_id, membre_id) do update set iban = excluded.iban, updated_at = now(), updated_by = auth.uid();
  return v;
end $$;
grant execute on function public.gsa_mon_iban(uuid, text) to authenticated;

-- Ma confidentialité : masquer (ou non) mes données personnelles dans la liste des membres.
create or replace function public.gsa_ma_confidentialite(club uuid, masquer boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  mid text = public.gsa_mon_membre(club);
begin
  if mid is null then
    raise exception 'Ta fiche n’est pas dans le registre « Membres du club » : demande à un admin de t’y inscrire.' using errcode = '42501';
  end if;
  perform set_config('gsa.moi', club::text || '|' || mid, true);
  update public.gsa_club_membres m set data = m.data || jsonb_build_object('prive', coalesce(masquer, false))
  where m.club_id = club and m.id = mid;
  perform set_config('gsa.moi', '', true);
  return coalesce(masquer, false);
end $$;
grant execute on function public.gsa_ma_confidentialite(uuid, boolean) to authenticated;

-- Liste des membres du club : droit « Membres du club » ou admin dans l'une de ses entités (gsa_membres_acces), ou
-- caissier. Données masquées par la personne : vides (« masque »), sauf pour elle ; IBAN : aux caissiers et à elle.
create or replace function public.gsa_membres_liste(club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  caisse boolean = public.gsa_caissier_club(club);
  mid text;
begin
  if not (caisse or public.gsa_membres_acces(club)) then
    raise exception 'Réservé aux personnes qui ont le droit « Membres du club » et aux caissiers' using errcode = '42501';
  end if;
  mid = public.gsa_mon_membre(club);
  return (
    select coalesce(jsonb_agg(
      (m.data - 'email' - 'telephone' - 'iban' - 'prive')
      || jsonb_build_object('id', m.id, 'moi', m.id is not distinct from mid, 'prive', coalesce((m.data ->> 'prive')::boolean, false))
      || case
           when coalesce((m.data ->> 'prive')::boolean, false) and m.id is distinct from mid
             then jsonb_build_object('email', '', 'telephone', '', 'iban', '', 'masque', true)
           else jsonb_build_object('email', coalesce(m.data ->> 'email', ''), 'telephone', coalesce(m.data ->> 'telephone', ''))
             || case when caisse or m.id is not distinct from mid then jsonb_build_object('iban', coalesce(i.iban, '')) else '{}'::jsonb end
         end
      order by lower(m.data ->> 'nom'), lower(m.data ->> 'prenom'), m.id), '[]'::jsonb)
    from public.gsa_club_membres m
    left join public.gsa_club_iban i on i.club_id = m.club_id and i.membre_id = m.id
    where m.club_id = club
  );
end $$;
grant execute on function public.gsa_membres_liste(uuid) to authenticated;
