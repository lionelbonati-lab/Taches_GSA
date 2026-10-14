-- Tâches GSA — 036 : copie automatique des données de chaque entité, chaque nuit, gardée 30 jours.
--
-- • gsa_copies : chaque nuit (01:17 UTC, soit vers 2 h ou 3 h à Zurich), le serveur garde une copie complète des
--   données de chaque entité : toutes ses lignes de gsa_items non supprimées (tâches, séances, PV, sondages, emails,
--   responsables, rôles, réglages, journal…). Une copie identique à la précédente n'est pas refaite : une entité qui ne
--   change pas n'en ajoute pas. Les fichiers joints ne sont pas copiés : ils restent dans le stockage (gsa-fichiers),
--   que la restauration ne touche pas.
-- • Chaque nuit, les copies de plus de 30 jours sont effacées, sauf la plus récente de chaque entité (une entité qui ne
--   change plus garde toujours sa dernière copie). C'est le seul effacement de cette migration, et il ne porte que sur
--   la nouvelle table gsa_copies.
-- • Personne ne lit ni n'écrit la table directement (aucun droit, aucune règle). Les admins de l'entité (gsa_is_admin)
--   passent par :
--     gsa_copies_liste(unite)       : ses copies (date, nombre d'éléments, taille, automatique ou manuelle) ;
--     gsa_copie(unite, copie)       : le contenu d'une copie (téléchargement, ou restauration par l'appli) ;
--     gsa_copier_maintenant(unite)  : une copie tout de suite (l'appli en fait aussi une avant chaque restauration).
--   Une copie ne contient rien qu'un admin ne lise déjà dans l'appli (gsa_ligne_lisible : tout, pour un admin) ; l'IBAN
--   (gsa_club_iban, 034) et le registre du club n'y sont pas.
-- • pg_cron : l'extension est activée ici et planifie « gsa-copie-quotidienne ». Une première copie est faite tout de
--   suite, à l'application de la migration.
-- Ajout pur : une extension, une table, des fonctions et une tâche planifiée ; aucune donnée existante modifiée.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create table if not exists public.gsa_copies (
  id bigint generated always as identity primary key,
  committee_id uuid not null references public.committees (id) on delete cascade,
  faite_le timestamptz not null default now(),
  manuelle boolean not null default false,
  lignes int not null,
  taille int not null,
  empreinte text not null,     -- md5 du contenu : une copie identique à la précédente n'est pas refaite
  donnees jsonb not null       -- [{ kind, id, pos, data }] : les lignes de gsa_items, telles quelles
);
create index if not exists gsa_copies_unite_idx on public.gsa_copies (committee_id, faite_le desc);

alter table public.gsa_copies enable row level security;
revoke all on public.gsa_copies from anon, authenticated;

-- Copie des données de l'entité, si elles ont changé depuis sa dernière copie. Vrai : copie faite.
create or replace function public.gsa_copier(unite uuid, manuelle boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb;
  n int;
  e text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'id', i.id, 'pos', i.pos, 'data', i.data) order by i.kind, i.id), '[]'::jsonb), count(*)
    into d, n
    from public.gsa_items i
    where i.committee_id = unite and not i.deleted;
  if n = 0 then
    return false;
  end if;
  e := md5(d::text);
  if e is not distinct from (select c.empreinte from public.gsa_copies c where c.committee_id = unite order by c.faite_le desc, c.id desc limit 1) then
    return false;
  end if;
  insert into public.gsa_copies (committee_id, manuelle, lignes, taille, empreinte, donnees)
    values (unite, coalesce(manuelle, false), n, octet_length(d::text), e, d);
  return true;
end $$;

-- Chaque nuit : une copie de chaque entité qui a changé, puis les copies de plus de 30 jours effacées (sauf la plus
-- récente de chaque entité). Renvoie le nombre de copies faites.
create or replace function public.gsa_copie_quotidienne() returns int
language plpgsql security definer set search_path = '' as $$
declare
  u uuid;
  n int := 0;
begin
  for u in select c.id from public.committees c
           where exists (select 1 from public.gsa_items i where i.committee_id = c.id and not i.deleted) loop
    if public.gsa_copier(u, false) then
      n := n + 1;
    end if;
  end loop;
  delete from public.gsa_copies c
  where c.faite_le < now() - interval '30 days'
    and c.id <> (select l.id from public.gsa_copies l where l.committee_id = c.committee_id order by l.faite_le desc, l.id desc limit 1);
  return n;
end $$;

-- Copies de l'entité, la plus récente d'abord (admins de l'entité).
create or replace function public.gsa_copies_liste(unite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.gsa_is_admin(unite) is not true then
    raise exception 'Réservé aux admins de l’entité' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'faiteLe', c.faite_le, 'manuelle', c.manuelle, 'lignes', c.lignes, 'taille', c.taille)
      order by c.faite_le desc, c.id desc), '[]'::jsonb)
    from public.gsa_copies c
    where c.committee_id = unite);
end $$;

-- Contenu d'une copie de l'entité (admins de l'entité).
create or replace function public.gsa_copie(unite uuid, copie bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d jsonb;
begin
  if public.gsa_is_admin(unite) is not true then
    raise exception 'Réservé aux admins de l’entité' using errcode = '42501';
  end if;
  select c.donnees into d from public.gsa_copies c where c.committee_id = unite and c.id = copie;
  if d is null then
    raise exception 'Copie introuvable' using errcode = '22023';
  end if;
  return d;
end $$;

-- Copie tout de suite (admins de l'entité). Faux : rien n'a changé depuis la dernière copie.
create or replace function public.gsa_copier_maintenant(unite uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if public.gsa_is_admin(unite) is not true then
    raise exception 'Réservé aux admins de l’entité' using errcode = '42501';
  end if;
  return public.gsa_copier(unite, true);
end $$;

revoke all on function public.gsa_copier(uuid, boolean) from public, anon, authenticated;
revoke all on function public.gsa_copie_quotidienne() from public, anon, authenticated;
revoke all on function public.gsa_copies_liste(uuid) from public, anon;
revoke all on function public.gsa_copie(uuid, bigint) from public, anon;
revoke all on function public.gsa_copier_maintenant(uuid) from public, anon;
grant execute on function public.gsa_copies_liste(uuid) to authenticated;
grant execute on function public.gsa_copie(uuid, bigint) to authenticated;
grant execute on function public.gsa_copier_maintenant(uuid) to authenticated;

-- Chaque nuit à 01:17 UTC (même nom : la tâche est remplacée si la migration est rejouée).
select cron.schedule('gsa-copie-quotidienne', '17 1 * * *', 'select public.gsa_copie_quotidienne()');

-- Première copie de chaque entité.
select public.gsa_copie_quotidienne();
