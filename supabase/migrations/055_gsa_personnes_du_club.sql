-- Tâches GSA — 055 : « Personnes du club » (PERSONNES_DU_CLUB.md) : la liste unique du club, pour tout le monde.
--
-- Les personnes font partie du club ; l'organigramme les place dans les entités. La liste du club (le registre
-- « Membres du club », gsa_club_membres, 016) :
-- • se lit par toute personne du club (une place active dans l'une de ses entités : gsa_personnes_voir) et par les
--   caissiers (comme avant) : noms, groupes ;
-- • avec les coordonnées (email, téléphone) pour qui a le droit « Coordonnées des personnes du club » (tab.people) ou
--   « Gérer les personnes du club » (people.manage : on ne gère pas des coordonnées qu'on ne voit pas) dans l'une de ses
--   entités, le droit « Personnes du club » (club.membres) ou est admin d'une entité (comme avant), et pour les
--   caissiers ; chacun voit les siennes. Les données masquées par une personne le restent ; l'IBAN, aux caissiers et
--   à elle seule (034) ;
-- • s'écrit (ajouter, modifier, supprimer) par qui a le droit « Gérer les personnes du club » (people.manage) dans
--   l'une de ses entités, le droit « Personnes du club » ou est admin d'une entité (gsa_personnes_gerer).
-- • gsa_personnes_droits(club) : ces trois droits pour la personne connectée (écrans de l'appli).
-- • gsa_enregistrer_membres(club, membres) : ajoute ou modifie des personnes du club (droit « Gérer les personnes ») ;
--   la garde de 034 s'applique (champs connus, données masquées gardées, IBAN à part).
-- Ajout : six fonctions ; gsa_membres_liste (034) et les règles d'écriture de gsa_club_membres (016) remplacées. La
-- lecture directe de la table reste réservée au droit « Personnes du club » et aux admins (l'appli lit la liste par
-- gsa_membres_liste). Aucune donnée modifiée.
-- Pour revenir en arrière : relancer gsa_membres_liste de 034 et les règles gsa_club_membres_insert, _update et
-- _delete de 016, puis supprimer les fonctions gsa_personnes_droits, gsa_personnes_gerer, gsa_personnes_coordonnees,
-- gsa_personnes_voir, gsa_club_droit et gsa_enregistrer_membres.

-- Droit `perm` dans l'une de ses entités actives du club (rôle de sa place active ; Admin : tous les droits).
create or replace function public.gsa_club_droit(club uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gsa_compte_ok() and exists (
    select 1
    from public.gsa_members m
    join public.committees c on c.id = m.committee_id
    where m.user_id = (select auth.uid()) and (c.id = club or c.parent_id = club)
      and not coalesce((c.info ->> 'archive')::boolean, false)
      and public.gsa_a_droit(c.id, perm)
  )
$$;
grant execute on function public.gsa_club_droit(uuid, text) to authenticated;

-- Personne du club : une place active dans l'une de ses entités actives (club : le comité central).
create or replace function public.gsa_personnes_voir(club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.committees k where k.id = club and k.parent_id is null)
    and exists (
      select 1
      from public.gsa_members m
      join public.committees c on c.id = m.committee_id
      where m.user_id = (select auth.uid()) and (c.id = club or c.parent_id = club)
        and not coalesce((c.info ->> 'archive')::boolean, false)
        and public.gsa_is_member(c.id)
    )
$$;
grant execute on function public.gsa_personnes_voir(uuid) to authenticated;

-- Coordonnées des personnes du club : droit « Coordonnées » ou « Gérer les personnes » dans l'une de ses entités, ou
-- l'accès au registre (016).
create or replace function public.gsa_personnes_coordonnees(club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gsa_membres_acces(club) or public.gsa_club_droit(club, 'tab.people') or public.gsa_club_droit(club, 'people.manage')
$$;
grant execute on function public.gsa_personnes_coordonnees(uuid) to authenticated;

-- Gérer les personnes du club : droit « Gérer les personnes » dans l'une de ses entités, ou l'accès au registre (016).
create or replace function public.gsa_personnes_gerer(club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gsa_membres_acces(club) or public.gsa_club_droit(club, 'people.manage')
$$;
grant execute on function public.gsa_personnes_gerer(uuid) to authenticated;

-- Les trois droits de la personne connectée, pour l'appli.
create or replace function public.gsa_personnes_droits(club uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'voir', public.gsa_personnes_voir(club) or public.gsa_caissier_club(club) or public.gsa_membres_acces(club),
    'coordonnees', public.gsa_personnes_coordonnees(club) or public.gsa_caissier_club(club),
    'gerer', public.gsa_personnes_gerer(club))
$$;
grant execute on function public.gsa_personnes_droits(uuid) to authenticated;

-- Liste du club (034) : pour toute personne du club ; coordonnées selon le droit (les siennes toujours).
create or replace function public.gsa_membres_liste(club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  caisse boolean = public.gsa_caissier_club(club);
  coords boolean;
  mid text;
begin
  if not (caisse or public.gsa_membres_acces(club) or public.gsa_personnes_voir(club)) then
    raise exception 'Réservé aux personnes du club' using errcode = '42501';
  end if;
  coords = caisse or public.gsa_personnes_coordonnees(club);
  mid = public.gsa_mon_membre(club);
  return (
    select coalesce(jsonb_agg(
      (m.data - 'email' - 'telephone' - 'iban' - 'prive')
      || jsonb_build_object('id', m.id, 'moi', m.id is not distinct from mid, 'prive', coalesce((m.data ->> 'prive')::boolean, false))
      || case
           when coalesce((m.data ->> 'prive')::boolean, false) and m.id is distinct from mid
             then jsonb_build_object('email', '', 'telephone', '', 'iban', '', 'masque', true)
           when not coords and m.id is distinct from mid
             then jsonb_build_object('email', '', 'telephone', '')
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

-- Écriture de la liste du club : droit « Gérer les personnes » (ou l'accès au registre, comme avant).
drop policy if exists gsa_club_membres_insert on public.gsa_club_membres;
create policy gsa_club_membres_insert on public.gsa_club_membres for insert to authenticated with check (public.gsa_personnes_gerer(club_id));
drop policy if exists gsa_club_membres_update on public.gsa_club_membres;
create policy gsa_club_membres_update on public.gsa_club_membres for update to authenticated
  using (public.gsa_personnes_gerer(club_id)) with check (public.gsa_personnes_gerer(club_id));
drop policy if exists gsa_club_membres_delete on public.gsa_club_membres;
create policy gsa_club_membres_delete on public.gsa_club_membres for delete to authenticated using (public.gsa_personnes_gerer(club_id));

-- Ajouter ou modifier des personnes du club (l'appli : nouvelle personne, coordonnées, groupes, import).
create or replace function public.gsa_enregistrer_membres(club uuid, membres jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  x jsonb;
  n integer = 0;
begin
  if not public.gsa_personnes_gerer(club) then
    raise exception 'Réservé aux personnes qui ont le droit « Gérer les personnes du club »' using errcode = '42501';
  end if;
  if jsonb_typeof(membres) is distinct from 'array' or jsonb_array_length(membres) > 500 then
    raise exception 'Liste de personnes invalide' using errcode = '22023';
  end if;
  for x in select e from jsonb_array_elements(membres) e loop
    if jsonb_typeof(x) is distinct from 'object' or btrim(coalesce(x ->> 'id', '')) = '' or length(x ->> 'id') > 200 then
      raise exception 'Personne du club invalide' using errcode = '22023';
    end if;
    insert into public.gsa_club_membres (club_id, id, data)
    values (club, x ->> 'id', x - 'id' - 'masque' - 'moi' - 'prive')
    on conflict (club_id, id) do update set data = excluded.data;
    n = n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.gsa_enregistrer_membres(uuid, jsonb) from public, anon;
grant execute on function public.gsa_enregistrer_membres(uuid, jsonb) to authenticated;
