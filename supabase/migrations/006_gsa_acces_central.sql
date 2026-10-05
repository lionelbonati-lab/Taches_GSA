-- Accès du comité central aux données d'une entité (appliqué le 05.10.2026).
--
-- Par défaut, les données d'une entité (sous-comité, groupe, équipe d'événement) ne sont visibles que de ses
-- membres. Ses admins peuvent ouvrir l'accès au comité central dont elle dépend (committees.info ->> 'central') :
--   - « aucun » (défaut, ou absent) : le comité central ne voit rien ;
--   - « lecture » : les membres actifs du comité central consultent tout (tâches, séances, membres, fichiers…) ;
--   - « ecriture » : ils peuvent aussi ajouter et modifier des tâches (avec leurs emails programmés,
--     notifications et entrées du journal) et joindre des fichiers, sans supprimer de tâche ni toucher
--     aux membres, rôles, séances ou réglages de l'entité.
-- Seuls les admins de l'entité changent ce réglage (le comité central ne se l'accorde pas lui-même).
-- Migration additive : sans réglage, rien ne change.

-- Niveau d'accès de l'utilisateur connecté, s'il est membre actif du comité central de l'entité (sinon vide).
create or replace function public.gsa_acces_central(c uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when x.info ->> 'central' in ('lecture', 'ecriture') and public.gsa_is_member(x.parent_id) then x.info ->> 'central' end
  from public.committees x
  where x.id = c and x.parent_id is not null;
$$;

alter policy gsa_items_select on public.gsa_items
  using (public.gsa_is_member(committee_id) or public.gsa_acces_central(committee_id) is not null);
alter policy gsa_items_insert on public.gsa_items
  with check (public.gsa_is_member(committee_id)
    or (public.gsa_acces_central(committee_id) = 'ecriture' and kind in ('tasks', 'emails', 'notifications', 'log')));
alter policy gsa_items_update on public.gsa_items
  using (public.gsa_is_member(committee_id)
    or (public.gsa_acces_central(committee_id) = 'ecriture' and kind in ('tasks', 'emails', 'notifications', 'log')))
  with check (public.gsa_is_member(committee_id)
    or (public.gsa_acces_central(committee_id) = 'ecriture' and kind in ('tasks', 'emails', 'notifications', 'log')));

-- Garde-fous : en plus des règles de 003, le comité central (accès « écriture ») ne supprime pas de tâche.
create or replace function public.gsa_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_admin boolean;
  now_admin boolean;
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  if auth.uid() is null or public.gsa_is_admin(new.committee_id) then
    return new;
  end if;
  if not public.gsa_is_member(new.committee_id) then
    -- Membre du comité central (les règles d'accès ont déjà limité ce qu'il peut écrire).
    if new.kind = 'tasks' and new.deleted and (tg_op = 'INSERT' or not old.deleted) then
      raise exception 'Le comité central ne supprime pas les tâches d’une entité' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.kind = 'roles' then
    raise exception 'Seul un administrateur peut modifier les rôles' using errcode = '42501';
  end if;
  if new.kind = 'people' then
    now_admin = coalesce((new.data -> 'roles') @> '["admin"]'::jsonb, false);
    if tg_op = 'INSERT' then
      -- Un upsert passe d'abord ici : si la fiche existe déjà, le contrôle se fait à la mise à jour.
      if now_admin and not exists (select 1 from public.gsa_items i where i.committee_id = new.committee_id and i.kind = new.kind and i.id = new.id) then
        raise exception 'Seul un administrateur peut donner le rôle Admin' using errcode = '42501';
      end if;
    else
      was_admin = coalesce((old.data -> 'roles') @> '["admin"]'::jsonb, false);
      if was_admin is distinct from now_admin
         or (was_admin and (new.deleted is distinct from old.deleted or (new.data ->> 'actif') is distinct from (old.data ->> 'actif'))) then
        raise exception 'Seul un administrateur peut modifier un compte administrateur' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

-- Fichiers joints : lecture avec l'accès « lecture » ou « écriture », ajout avec « écriture » ;
-- le retrait d'un fichier reste réservé aux membres de l'entité (gsa_file_member).
create or replace function public.gsa_file_reader(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.gsa_is_member(split_part(name, '/', 1)::uuid) or public.gsa_acces_central(split_part(name, '/', 1)::uuid) is not null
    else false
  end;
$$;
create or replace function public.gsa_file_writer(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.gsa_is_member(split_part(name, '/', 1)::uuid) or public.gsa_acces_central(split_part(name, '/', 1)::uuid) = 'ecriture'
    else false
  end;
$$;
alter policy gsa_fichiers_select on storage.objects
  using (bucket_id = 'gsa-fichiers' and public.gsa_file_reader(name));
alter policy gsa_fichiers_insert on storage.objects
  with check (bucket_id = 'gsa-fichiers' and public.gsa_file_writer(name));
alter policy gsa_fichiers_update on storage.objects
  using (bucket_id = 'gsa-fichiers' and public.gsa_file_writer(name))
  with check (bucket_id = 'gsa-fichiers' and public.gsa_file_writer(name));

-- Fiche des entités (nom, type, couleur, réglages) lisible aussi des membres du comité central : sans cela, ses
-- admins ne pouvaient pas modifier une entité dont ils ne sont pas membres (la mise à jour ne trouvait aucune ligne).
alter policy gsa_committees_select on public.committees
  using (exists (select 1 from public.gsa_members m
    where m.user_id = (select auth.uid()) and (m.committee_id = committees.id or m.committee_id = committees.parent_id)));

-- Fiche d'une entité : le réglage « central » appartient à l'entité. Modifié par quelqu'un d'autre que ses
-- admins (ex. un admin du comité central qui renomme l'entité), il garde sa valeur.
create or replace function public.gsa_committees_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.info ->> 'central', 'aucun') not in ('aucun', 'lecture', 'ecriture') then
    raise exception 'Accès du comité central inconnu : %', new.info ->> 'central' using errcode = '22023';
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if (new.info -> 'central') is distinct from (old.info -> 'central') and not public.gsa_is_admin(old.id) then
    new.info = case when old.info ? 'central' then new.info || jsonb_build_object('central', old.info -> 'central') else new.info - 'central' end;
  end if;
  if public.gsa_is_admin(old.parent_id) then
    return new;
  end if;
  if new.type is distinct from old.type
     or coalesce(new.info -> 'archive', 'false'::jsonb) is distinct from coalesce(old.info -> 'archive', 'false'::jsonb) then
    raise exception 'Seul le comité central change le type d’une entité ou l’archive' using errcode = '42501';
  end if;
  return new;
end $$;

grant execute on function public.gsa_acces_central(uuid) to authenticated;
grant execute on function public.gsa_file_reader(text) to authenticated;
grant execute on function public.gsa_file_writer(text) to authenticated;
