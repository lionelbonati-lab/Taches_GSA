-- Tâches GSA — 047 : notifications sur téléphone (ou ordinateur), même l'appli fermée (« Web Push »).
-- Chaque personne active les notifications sur ses appareils (Réglages › Notifications) : l'appareil s'inscrit ici.
-- Toutes les 5 minutes, la planification (pg_cron) lance la fonction « gsa-push » : pour chaque personne inscrite,
-- elle calcule les notifications de la cloche 🔔, dans chacune de ses entités, comme l'appli et avec les mêmes règles
-- d'accès, puis envoie celles qui n'ont pas encore été envoyées ni lues dans l'appli. Rien la nuit (22 h – 7 h) :
-- ce qui arrive pendant la nuit part le matin, en un seul message au-delà de trois.
-- Rien à régler à la main : la clé qui autorise la planification et les clés d'identité du serveur (VAPID) sont créées
-- ici et par la fonction, et restent dans une table que l'appli ne peut pas lire.
-- Ajout pur : extension pg_net (appel de la fonction), trois tables, quatre fonctions et une planification ; aucune
-- donnée existante modifiée.
-- Retour en arrière : select cron.unschedule('gsa-push'); drop function public.gsa_push_lancer(),
-- public.gsa_push_abonner(text, text, text, text), public.gsa_push_desabonner(text), public.gsa_push_etat(text);
-- drop table public.gsa_push_envois, public.gsa_push_abonnements, public.gsa_push_reglages.

create extension if not exists pg_net;

-- Une seule ligne. cle_lancement : jeton que la planification envoie à la fonction (64 caractères hexadécimaux tirés au
-- hasard). vapid_* : clés d'identité du serveur auprès des services de notification (Google, Apple, Mozilla…),
-- créées par la fonction à la première inscription ; la publique est donnée aux appareils, la privée signe les envois.
create table if not exists public.gsa_push_reglages (
  id integer primary key default 1 check (id = 1),
  cle_lancement text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  vapid_publique text,
  vapid_privee jsonb
);
insert into public.gsa_push_reglages (id) values (1) on conflict (id) do nothing;
alter table public.gsa_push_reglages enable row level security;
revoke all on public.gsa_push_reglages from anon, authenticated;

-- Appareils inscrits : adresse d'envoi donnée par le navigateur et ses deux clés de chiffrement. Le contenu des
-- notifications est chiffré pour l'appareil : le service de notification ne le lit pas.
create table if not exists public.gsa_push_abonnements (
  endpoint text primary key check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null check (length(p256dh) between 80 and 100),
  auth text not null check (length(auth) between 16 and 30),
  -- Nom lisible de l'appareil (« iPhone », « Android », « Ordinateur »).
  appareil text check (length(appareil) <= 120),
  cree_le timestamptz not null default now(),
  envoye_le timestamptz,
  -- Envois refusés d'affilée (au-delà de 10, l'appareil est retiré).
  echecs integer not null default 0
);
create index if not exists gsa_push_abonnements_user on public.gsa_push_abonnements (user_id);
alter table public.gsa_push_abonnements enable row level security;
revoke all on public.gsa_push_abonnements from anon, authenticated;

-- Notifications déjà envoyées à la personne (« <entité>|<clé> ») ; « base|<entité> » : à la première lecture de
-- l'entité, ce qui était déjà là est noté sans être envoyé. Les lignes de plus de 60 jours sont effacées.
create table if not exists public.gsa_push_envois (
  user_id uuid not null references auth.users(id) on delete cascade,
  cle text not null,
  envoye_le timestamptz not null default now(),
  primary key (user_id, cle)
);
alter table public.gsa_push_envois enable row level security;
revoke all on public.gsa_push_envois from anon, authenticated;

-- Inscrit l'appareil (adresse, clé, secret) pour la personne connectée ; une adresse déjà inscrite passe à elle (même
-- appareil, autre compte). Au plus 10 appareils par personne : les plus anciens sont retirés. Renvoie leur nombre.
create or replace function public.gsa_push_abonner(adresse text, cle text, secret text, appareil text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  moi uuid := (select auth.uid());
  n integer;
begin
  if moi is null or not public.gsa_compte_ok() then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if adresse is null or adresse !~ '^https://' or length(adresse) > 1000 or cle !~ '^[A-Za-z0-9_-]{80,100}$' or secret !~ '^[A-Za-z0-9_-]{16,30}$' then
    raise exception 'Inscription de l’appareil invalide' using errcode = '22023';
  end if;
  insert into public.gsa_push_abonnements as a (endpoint, user_id, p256dh, auth, appareil)
  values (adresse, moi, cle, secret, left(appareil, 120))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, appareil = excluded.appareil, cree_le = now(), echecs = 0;
  delete from public.gsa_push_abonnements
  where user_id = moi and endpoint in (select endpoint from public.gsa_push_abonnements where user_id = moi order by cree_le desc offset 10);
  select count(*) into n from public.gsa_push_abonnements where user_id = moi;
  return n;
end $$;

-- Retire l'appareil (seulement s'il est à la personne connectée).
create or replace function public.gsa_push_desabonner(adresse text) returns void
language sql security definer set search_path = '' as $$
  delete from public.gsa_push_abonnements where endpoint = adresse and user_id = (select auth.uid());
$$;

-- État pour la personne connectée : cet appareil est-il inscrit, combien d'appareils en tout, dernier envoi.
create or replace function public.gsa_push_etat(adresse text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'inscrit', coalesce(bool_or(a.endpoint = adresse), false),
    'appareils', count(a.endpoint),
    'envoye', max(a.envoye_le))
  from public.gsa_push_abonnements a where a.user_id = (select auth.uid());
$$;

revoke all on function public.gsa_push_abonner(text, text, text, text) from public, anon;
revoke all on function public.gsa_push_desabonner(text) from public, anon;
revoke all on function public.gsa_push_etat(text) from public, anon;
grant execute on function public.gsa_push_abonner(text, text, text, text) to authenticated;
grant execute on function public.gsa_push_desabonner(text) to authenticated;
grant execute on function public.gsa_push_etat(text) to authenticated;

-- Lancée par la planification : appelle la fonction gsa-push avec la clé de lancement, si un appareil est inscrit.
create or replace function public.gsa_push_lancer() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.gsa_push_abonnements) then
    return;
  end if;
  perform net.http_post(
    url := 'https://akmpyrikdudvkbwdhesr.supabase.co/functions/v1/gsa-push',
    body := jsonb_build_object('action', 'tourner'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-gsa-cle', (select r.cle_lancement from public.gsa_push_reglages r where r.id = 1)),
    timeout_milliseconds := 60000);
end $$;
revoke all on function public.gsa_push_lancer() from public, anon, authenticated;

select cron.schedule('gsa-push', '*/5 * * * *', 'select public.gsa_push_lancer()');
