-- Tâches GSA — 026 : organigramme, historique par année (lecture seule, visible de tout le club).
--
-- • gsa_organigrammes : une photo de l'organigramme par club et par année (entités, personnes, fonctions, postes,
--   disposition des cartes), lue par tous les membres du club. Personne ne l'écrit directement : aucun droit d'écriture,
--   aucune règle qui le permette.
-- • gsa_photo_organigramme(club) : appelée par l'appli de tout membre du club après chaque lecture de l'organigramme.
--   Le serveur prend la photo lui-même (gsa_organigramme : rien ne vient de l'appli) et ne touche qu'à l'année en
--   cours (heure de Zurich) : une année passée garde l'état de sa dernière photo, sans retour possible. Une photo
--   identique à la précédente n'écrit rien, et sa date reste celle du dernier changement vu.
-- • Pas d'adresses e-mail dans les photos, ni le contenu des fiches d'entités (seulement couleur, dates, archivage,
--   « dépend de », place de la carte et ordre des cartes d'un comité) : les logos restent ceux d'aujourd'hui.
-- Ajout pur : une table, une fonction ; aucune donnée existante modifiée.

create table if not exists public.gsa_organigrammes (
  club_id uuid not null references public.committees (id) on delete cascade,
  annee int not null,
  data jsonb not null,
  maj timestamptz not null default now(),
  primary key (club_id, annee)
);

alter table public.gsa_organigrammes enable row level security;
drop policy if exists gsa_organigrammes_lecture on public.gsa_organigrammes;
create policy gsa_organigrammes_lecture on public.gsa_organigrammes for select to authenticated
  using (public.gsa_is_club_member(club_id));
revoke all on public.gsa_organigrammes from anon, authenticated;
grant select on public.gsa_organigrammes to authenticated;
grant select, insert, update, delete on public.gsa_organigrammes to service_role;

create or replace function public.gsa_photo_organigramme(club uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  an int := extract(year from now() at time zone 'Europe/Zurich')::int;
  photo jsonb;
  n int;
begin
  if not exists (select 1 from public.committees where id = club and parent_id is null) then
    raise exception 'Comité central inconnu' using errcode = '22023';
  end if;
  -- gsa_organigramme vérifie que la personne connectée est membre du club.
  select coalesce(jsonb_agg(
      (u - 'moi' - 'moiAdmin' - 'sections' - 'info' - 'membres')
      || jsonb_build_object(
        'moi', false,
        'moiAdmin', false,
        'info', coalesce((
          select jsonb_object_agg(i.k, i.v) from jsonb_each(case when jsonb_typeof(u -> 'info') = 'object' then u -> 'info' else '{}'::jsonb end) as i(k, v)
          where i.k in ('couleur', 'date', 'dateFin', 'archive', 'dependDe', 'carte', 'rangement')
        ), '{}'::jsonb),
        'membres', coalesce((
          select jsonb_agg((m - 'email') || jsonb_build_object('email', '') order by j)
          from jsonb_array_elements(case when jsonb_typeof(u -> 'membres') = 'array' then u -> 'membres' else '[]'::jsonb end) with ordinality as x(m, j)
        ), '[]'::jsonb)
      ) order by k), '[]'::jsonb)
    into photo
    from jsonb_array_elements(public.gsa_organigramme(club)) with ordinality as o(u, k);
  insert into public.gsa_organigrammes as g (club_id, annee, data, maj)
    values (club, an, photo, now())
    on conflict (club_id, annee) do update set data = excluded.data, maj = excluded.maj
      where g.data is distinct from excluded.data;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.gsa_photo_organigramme(uuid) from public, anon;
grant execute on function public.gsa_photo_organigramme(uuid) to authenticated, service_role;
