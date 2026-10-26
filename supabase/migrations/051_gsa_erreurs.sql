-- Tâches GSA — 051 : rapport d'erreurs de l'appli, pour les admins du comité central.
--
-- Quand l'appli rencontre une erreur (page qui ne s'affiche pas, erreur de script), elle la signale d'elle-même ; les
-- admins du comité central (et les super-admins) les voient dans la console admin (« Erreurs de l'appli »).
-- • Table gsa_erreurs : une ligne par erreur différente dans le club (empreinte calculée par l'appli : message et
--   emplacement, sans les numéros qui changent d'une version à l'autre), avec le nombre de fois, le nombre de personnes
--   touchées (comptes, 50 au plus), la première et la dernière fois, et la dernière page, version, origine, entité et
--   appareil. Ni noms, ni contenu des données. Personne ne la lit ni ne l'écrit directement.
-- • gsa_signaler_erreur(entite, empreinte, message, origine, pile, page, version, navigateur) : pour une personne connectée
--   avec une fiche dans `entite`. Textes raccourcis ; une erreur déjà connue est comptée (et rouverte si elle était
--   réglée) ; 20 erreurs nouvelles par personne et par jour au plus, 300 erreurs par club (les plus anciennes partent),
--   90 jours sans réapparaître : effacée. Ne renvoie rien et n'échoue pas (l'appli ne doit pas boucler sur ses erreurs).
-- • gsa_erreurs_liste(entite) : les erreurs du club de l'entité (à regarder d'abord, puis les plus récentes ; 300 au plus),
--   pour un admin du comité central ou un super-admin.
-- • gsa_erreur_reglee(entite, id, reglee) : marquer une erreur comme réglée (ou la rouvrir) ;
--   gsa_erreurs_effacer(entite) : effacer les erreurs réglées. Mêmes droits que la liste.
-- Ajout pur : une table et quatre fonctions nouvelles ; aucune donnée modifiée.
-- Pour revenir en arrière : supprimer les fonctions gsa_signaler_erreur, gsa_erreurs_liste, gsa_erreur_reglee et
-- gsa_erreurs_effacer, puis la table gsa_erreurs.

create table if not exists public.gsa_erreurs (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.committees (id) on delete cascade,
  empreinte text not null,
  message text not null,
  origine text,
  pile text,
  page text,
  version text,
  navigateur text,
  entite uuid,
  premiere timestamptz not null default now(),
  derniere timestamptz not null default now(),
  nombre integer not null default 1,
  comptes uuid[] not null default '{}',
  reglee boolean not null default false,
  unique (club_id, empreinte)
);
create index if not exists gsa_erreurs_derniere_idx on public.gsa_erreurs (club_id, derniere);
alter table public.gsa_erreurs enable row level security;
revoke all on table public.gsa_erreurs from public, anon, authenticated;

create or replace function public.gsa_signaler_erreur(entite uuid, empreinte text, message text, origine text default null,
  pile text default null, page text default null, version text default null, navigateur text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  qui uuid := auth.uid();
  club uuid;
  cle text := left(btrim(coalesce(empreinte, '')), 80);
  texte text := left(btrim(coalesce(message, '')), 500);
begin
  if qui is null or cle = '' or texte = '' or public.gsa_ma_fiche(entite) is null then
    return;
  end if;
  select coalesce(c.parent_id, c.id) into club from public.committees c where c.id = entite;
  if club is null then
    return;
  end if;
  -- Erreur nouvelle : 20 par personne et par jour au plus.
  if not exists (select 1 from public.gsa_erreurs e where e.club_id = club and e.empreinte = cle)
     and (select count(*) from public.gsa_erreurs e
          where e.club_id = club and e.premiere > now() - interval '1 day' and e.comptes[1] = qui) >= 20 then
    return;
  end if;
  insert into public.gsa_erreurs as e (club_id, empreinte, message, origine, pile, page, version, navigateur, entite, comptes)
  values (club, cle, texte, left(origine, 40), left(pile, 4000), left(page, 300), left(version, 60), left(navigateur, 300), entite,
    array[qui])
  on conflict on constraint gsa_erreurs_club_id_empreinte_key do update set
    message = excluded.message,
    origine = excluded.origine,
    pile = coalesce(excluded.pile, e.pile),
    page = excluded.page,
    version = excluded.version,
    navigateur = excluded.navigateur,
    entite = excluded.entite,
    derniere = now(),
    nombre = least(e.nombre, 999999) + 1,
    comptes = case when qui = any (e.comptes) or cardinality(e.comptes) >= 50 then e.comptes else e.comptes || qui end,
    reglee = false;
  -- Ménage : 90 jours sans réapparaître, et 300 erreurs par club au plus.
  delete from public.gsa_erreurs e
  where e.club_id = club
    and (e.derniere < now() - interval '90 days'
      or e.id in (select x.id from public.gsa_erreurs x where x.club_id = club order by x.derniere desc offset 300));
exception when others then
  raise warning 'gsa_signaler_erreur : %', sqlerrm;
end $$;

-- Admin du comité central du club de l'entité (ou super-admin) : le club, sinon une erreur.
create or replace function public.gsa_erreurs_club(entite uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  club uuid;
begin
  select coalesce(c.parent_id, c.id) into club from public.committees c where c.id = entite;
  if club is null or not (public.gsa_is_admin(club) or public.gsa_est_super_admin()) then
    raise exception 'Réservé aux admins du comité central' using errcode = '42501';
  end if;
  return club;
end $$;

create or replace function public.gsa_erreurs_liste(entite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  club uuid := public.gsa_erreurs_club(entite);
  r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id::text, 'message', e.message, 'origine', e.origine, 'pile', e.pile, 'page', e.page, 'version', e.version,
      'navigateur', e.navigateur, 'entite', c.name,
      'premiere', to_char(e.premiere at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'derniere', to_char(e.derniere at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'nombre', e.nombre, 'personnes', cardinality(e.comptes), 'reglee', e.reglee)
    order by e.reglee, e.derniere desc), '[]'::jsonb)
    into r
  from public.gsa_erreurs e
  left join public.committees c on c.id = e.entite
  where e.club_id = club;
  return r;
end $$;

create or replace function public.gsa_erreur_reglee(entite uuid, id bigint, reglee boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare
  club uuid := public.gsa_erreurs_club(entite);
begin
  update public.gsa_erreurs e set reglee = coalesce(gsa_erreur_reglee.reglee, true)
  where e.club_id = club and e.id = gsa_erreur_reglee.id;
end $$;

create or replace function public.gsa_erreurs_effacer(entite uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  club uuid := public.gsa_erreurs_club(entite);
  n integer;
begin
  delete from public.gsa_erreurs e where e.club_id = club and e.reglee;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.gsa_signaler_erreur(uuid, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.gsa_erreurs_club(uuid) from public, anon, authenticated;
revoke all on function public.gsa_erreurs_liste(uuid) from public, anon;
revoke all on function public.gsa_erreur_reglee(uuid, bigint, boolean) from public, anon;
revoke all on function public.gsa_erreurs_effacer(uuid) from public, anon;
grant execute on function public.gsa_signaler_erreur(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.gsa_erreurs_liste(uuid) to authenticated;
grant execute on function public.gsa_erreur_reglee(uuid, bigint, boolean) to authenticated;
grant execute on function public.gsa_erreurs_effacer(uuid) to authenticated;
