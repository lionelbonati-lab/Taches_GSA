-- Tâches GSA — 022 : propositions d'amélioration de l'appli.
-- Tout membre du club (comité central ou l'une de ses entités) envoie une idée, un problème ou autre chose au
-- comité central : la proposition est enregistrée dans les données du comité central (gsa_items, kind
-- « propositions »), qui l'étudie et y répond (statut, réponse) depuis l'appli comme ses autres données.
-- gsa_proposer_amelioration : envoi ; le nom de l'auteur et son entité sont pris sur le serveur (sa fiche),
-- la clé de l'auteur est son compte (auth.uid()). gsa_mes_propositions : l'auteur en suit le statut et la réponse.
-- Ajout pur : deux nouvelles fonctions ; aucune donnée existante modifiée.

create or replace function public.gsa_proposer_amelioration(club uuid, source uuid, proposition jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  moi uuid := (select auth.uid());
  par text;
  unite text;
  genre text := case when proposition ->> 'genre' in ('idee', 'probleme', 'autre') then proposition ->> 'genre' else 'autre' end;
  texte text := left(btrim(coalesce(proposition ->> 'texte', '')), 4000);
  page text := case when coalesce(proposition ->> 'page', '') ~ '^/[A-Za-z0-9/_?=&.%-]{0,199}$' then proposition ->> 'page' end;
  le text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  pid text := 'am' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  if moi is null or not exists (select 1 from public.committees where id = club and parent_id is null) or not public.gsa_is_club_member(club) then
    raise exception 'Réservé aux membres du club' using errcode = '42501';
  end if;
  if texte = '' then
    raise exception 'La proposition est vide' using errcode = '22023';
  end if;
  if (select count(*) from public.gsa_items i
      where i.committee_id = club and i.kind = 'propositions' and i.data ->> 'auteur' = moi::text and i.data ->> 'le' > to_char((now() - interval '1 day') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS')) >= 20 then
    raise exception 'Trop de propositions aujourd’hui : réessaie demain' using errcode = '22023';
  end if;

  -- Nom : sa fiche dans l'entité d'où il écrit, sinon au comité central, sinon dans une autre entité du club.
  select nullif(btrim(coalesce(p.data ->> 'prenom', '') || ' ' || coalesce(p.data ->> 'nom', '')), '') into par
  from public.gsa_members m
  join public.committees c on c.id = m.committee_id
  join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
  where m.user_id = moi and (c.id = club or c.parent_id = club)
  order by (m.committee_id = source) desc, (c.id = club) desc, c.name
  limit 1;
  select c.name into unite from public.committees c where c.id = source and (c.id = club or c.parent_id = club);

  insert into public.gsa_items (committee_id, kind, id, pos, data)
  values (club, 'propositions', pid, 0, jsonb_strip_nulls(jsonb_build_object(
    'id', pid,
    'genre', genre,
    'texte', texte,
    'page', page,
    'le', le,
    'par', coalesce(par, 'Membre du club'),
    'unite', unite,
    'auteur', moi::text,
    'statut', 'nouvelle'
  )));
  return pid;
end $$;

create or replace function public.gsa_mes_propositions(club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.gsa_is_club_member(club) then
    raise exception 'Réservé aux membres du club' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', i.id,
      'genre', i.data ->> 'genre',
      'texte', i.data ->> 'texte',
      'page', i.data ->> 'page',
      'le', i.data ->> 'le',
      'par', i.data ->> 'par',
      'unite', i.data ->> 'unite',
      'statut', coalesce(i.data ->> 'statut', 'nouvelle'),
      'reponse', i.data ->> 'reponse',
      'reponduLe', i.data ->> 'reponduLe',
      'reponduPar', i.data ->> 'reponduPar',
      'supprimee', i.deleted
    )) order by i.data ->> 'le' desc), '[]'::jsonb)
    from public.gsa_items i
    where i.committee_id = club and i.kind = 'propositions' and i.data ->> 'auteur' = (select auth.uid())::text
  );
end $$;

grant execute on function public.gsa_proposer_amelioration(uuid, uuid, jsonb) to authenticated;
grant execute on function public.gsa_mes_propositions(uuid) to authenticated;
