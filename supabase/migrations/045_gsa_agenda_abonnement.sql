-- Tâches GSA — 045 : abonnement à l'agenda par lien privé (Google Agenda, Calendrier d'Apple, Outlook).
-- Chaque personne peut avoir, par entité, un lien secret vers un fichier d'agenda (.ics) que son agenda relit tout seul
-- (fonction « gsa-agenda »). Le lien ne contient que le jeton : la fonction lit les données comme la personne
-- elle-même (mêmes règles d'accès que dans l'appli) ; plus membre de l'entité ou lien réinitialisé / supprimé :
-- plus rien. Seule la personne voit son lien ; elle le crée, change ses choix, le réinitialise ou le supprime
-- avec les fonctions ci-dessous.
-- Ajout pur : une table et deux fonctions, aucune donnée existante modifiée.
-- Retour en arrière : drop function public.gsa_abonnement_agenda(uuid, jsonb, boolean),
-- public.gsa_abonnement_agenda_supprimer(uuid) ; drop table public.gsa_agenda_abonnements.

create table if not exists public.gsa_agenda_abonnements (
  -- 64 caractères hexadécimaux tirés au hasard (deux UUID v4) : impossible à deviner.
  jeton text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  user_id uuid not null references auth.users(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  -- Choix : seances, evenements, club, sondages (vrai / faux), taches (« non », « mes », « toutes »),
  -- appli (adresse de l'appli, pour les liens des éléments), nomAppli (nom de l'agenda).
  options jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  -- Dernière lecture par un agenda (affichée à la personne : « ton agenda l'a lu le … »).
  lu_le timestamptz,
  unique (user_id, committee_id)
);

alter table public.gsa_agenda_abonnements enable row level security;
revoke all on public.gsa_agenda_abonnements from anon, authenticated;
grant select on public.gsa_agenda_abonnements to authenticated;
drop policy if exists gsa_agenda_abonnements_select on public.gsa_agenda_abonnements;
create policy gsa_agenda_abonnements_select on public.gsa_agenda_abonnements for select to authenticated
  using (user_id = (select auth.uid()));

-- Crée le lien de la personne connectée pour l'entité c, ou change ses choix ; nouveau : nouveau jeton (l'ancien
-- lien ne marche plus). Renvoie le jeton.
create or replace function public.gsa_abonnement_agenda(c uuid, options jsonb, nouveau boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  o jsonb;
  j text;
begin
  if not public.gsa_is_member(c) then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  o := jsonb_strip_nulls(jsonb_build_object(
    'seances', case when jsonb_typeof(options -> 'seances') = 'boolean' then (options ->> 'seances')::boolean else false end,
    'evenements', case when jsonb_typeof(options -> 'evenements') = 'boolean' then (options ->> 'evenements')::boolean else false end,
    'club', case when jsonb_typeof(options -> 'club') = 'boolean' then (options ->> 'club')::boolean else false end,
    'sondages', case when jsonb_typeof(options -> 'sondages') = 'boolean' then (options ->> 'sondages')::boolean else false end,
    'taches', case when options ->> 'taches' in ('non', 'mes', 'toutes') then options ->> 'taches' else 'non' end,
    'appli', case when options ->> 'appli' ~ '^https://[^\s?#"<>\\]{1,200}$' then options ->> 'appli' end,
    'nomAppli', case when length(btrim(options ->> 'nomAppli')) between 1 and 30 and options ->> 'nomAppli' !~ '[\x01-\x1f<>]'
      then btrim(options ->> 'nomAppli') end
  ));
  insert into public.gsa_agenda_abonnements as a (user_id, committee_id, options)
  values ((select auth.uid()), c, o)
  on conflict (user_id, committee_id) do update set
    options = excluded.options,
    jeton = case when nouveau then excluded.jeton else a.jeton end,
    cree_le = case when nouveau then now() else a.cree_le end,
    lu_le = case when nouveau then null else a.lu_le end
  returning a.jeton into j;
  return j;
end $$;

-- Supprime le lien de la personne connectée pour l'entité c.
create or replace function public.gsa_abonnement_agenda_supprimer(c uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.gsa_agenda_abonnements where user_id = (select auth.uid()) and committee_id = c;
$$;

revoke all on function public.gsa_abonnement_agenda(uuid, jsonb, boolean) from public, anon;
revoke all on function public.gsa_abonnement_agenda_supprimer(uuid) from public, anon;
grant execute on function public.gsa_abonnement_agenda(uuid, jsonb, boolean) to authenticated;
grant execute on function public.gsa_abonnement_agenda_supprimer(uuid) to authenticated;
