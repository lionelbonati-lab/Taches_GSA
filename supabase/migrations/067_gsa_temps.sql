-- Tâches GSA — 067 : compteur de temps personnel (PLAN_COMPTEUR_TEMPS.md).
--
-- Un chronomètre à soi, indicatif, pour noter le temps donné au club (bouton ⏱ de l'appli, page « Mon temps »).
-- Personne d'autre que soi ne le voit : ni les autres membres, ni les admins, ni les super-admins.
-- • Table gsa_temps : une ligne par entrée du compteur (compteur lancé puis arrêté, ajout, temps automatique) et une
--   ligne « reglages », au compte connecté (compte = auth.uid()). data : le contenu, écrit par l'appli
--   (src/data/compteur.ts, compteurEtat.tsx) ; supprime : entrée retirée (contenu vidé ; la ligne reste pour que les
--   autres appareils l'apprennent, l'appli l'efface au bout de 60 jours) ; modifie : posé par le serveur à chaque
--   écriture (les appareils relisent ce qui a changé depuis leur dernière lecture).
-- • Règles : chacun lit, ajoute, modifie et efface ses propres lignes, et rien d'autre ; un compte au mot de passe
--   provisoire pas encore changé, rien du tout (gsa_compte_ok, 025). Contenu de 4 Ko au plus par ligne, identifiant de
--   40 caractères au plus.
-- • Compte supprimé (fusionné dans un autre, par exemple) : ses lignes partent avec lui.
-- Ajout pur : une table, ses règles, un déclencheur ; aucune donnée existante modifiée. Pas de diffusion en direct, pas
-- dans les copies de nuit ni dans la sauvegarde du club (données personnelles : l'export CSV de « Mon temps » en tient
-- lieu).
-- Sans elle, l'appli garde le compteur sur l'appareil et l'envoie une fois la mise à jour faite.
-- Pour revenir en arrière : drop table public.gsa_temps; drop function public.gsa_temps_modifie();

create table if not exists public.gsa_temps (
  compte uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) between 1 and 40),
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 4000),
  supprime boolean not null default false,
  modifie timestamptz not null default now(),
  primary key (compte, id)
);
create index if not exists gsa_temps_modifie_idx on public.gsa_temps (compte, modifie);
alter table public.gsa_temps enable row level security;
revoke all on table public.gsa_temps from public, anon, authenticated;
grant select, insert, update, delete on table public.gsa_temps to authenticated;

-- Date de modification : celle du serveur, à chaque écriture (jamais celle de l'appareil).
create or replace function public.gsa_temps_modifie() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.modifie := now();
  return new;
end $$;
revoke all on function public.gsa_temps_modifie() from public, anon, authenticated;
drop trigger if exists gsa_temps_modifie on public.gsa_temps;
create trigger gsa_temps_modifie before insert or update on public.gsa_temps
  for each row execute function public.gsa_temps_modifie();

-- Chacun ses lignes, et elles seules.
drop policy if exists gsa_temps_select on public.gsa_temps;
create policy gsa_temps_select on public.gsa_temps for select to authenticated
  using (compte = (select auth.uid()) and public.gsa_compte_ok());
drop policy if exists gsa_temps_insert on public.gsa_temps;
create policy gsa_temps_insert on public.gsa_temps for insert to authenticated
  with check (compte = (select auth.uid()) and public.gsa_compte_ok());
drop policy if exists gsa_temps_update on public.gsa_temps;
create policy gsa_temps_update on public.gsa_temps for update to authenticated
  using (compte = (select auth.uid()) and public.gsa_compte_ok())
  with check (compte = (select auth.uid()) and public.gsa_compte_ok());
drop policy if exists gsa_temps_delete on public.gsa_temps;
create policy gsa_temps_delete on public.gsa_temps for delete to authenticated
  using (compte = (select auth.uid()) and public.gsa_compte_ok());
