-- Tâches GSA — 057 : sauvegarde de tout le club, depuis la console admin (super-admins du club).
--
-- • gsa_sauvegarde_club(club) : pour un super-admin (gsa_est_super_admin, 025), en une fois, toutes les entités du club
--   (archivées comprises) : leur nom, type, entité parente et réglages (committees), et toutes leurs lignes de gsa_items non
--   supprimées (tâches, séances, PV, sondages, emails, personnes, rôles, réglages, journal…), comme les copies de chaque
--   nuit (036) ; et le registre « Personnes du club » (gsa_club_membres). Ni IBAN (gsa_club_iban, 034), ni comptes.
--   Lecture seule ; l'appli en fait un fichier, avec les fichiers joints.
-- • gsa_fichiers_super_admin : les super-admins lisent aussi les fichiers joints de toutes les entités (stockage
--   gsa-fichiers), pour les mettre dans la sauvegarde. Une règle de lecture en plus, à côté de celles de 003 et 006 ;
--   rien d'autre ne change (écriture, suppression).
-- • La restauration se fait entité par entité, par ses admins (console admin de l'entité, comme avant) : rien de nouveau
--   côté serveur.
-- Ajout pur : deux fonctions et une règle de lecture ; aucune donnée modifiée.
-- Pour revenir en arrière :
--   drop policy if exists gsa_fichiers_super_admin on storage.objects;
--   drop function if exists public.gsa_fichiers_super_admin(text);
--   drop function if exists public.gsa_sauvegarde_club(uuid);

create or replace function public.gsa_sauvegarde_club(club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.gsa_est_super_admin() then
    raise exception 'Réservé aux super-admins du club' using errcode = '42501';
  end if;
  if not exists (select 1 from public.committees k where k.id = club and k.parent_id is null) then
    raise exception 'Club introuvable' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'entites', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', c.id, 'nom', c.name, 'type', c.type, 'parentId', c.parent_id, 'info', coalesce(c.info, '{}'::jsonb),
          'lignes', coalesce((
            select jsonb_agg(jsonb_build_object('kind', i.kind, 'id', i.id, 'pos', i.pos, 'data', i.data) order by i.kind, i.pos, i.id)
            from public.gsa_items i
            where i.committee_id = c.id and not i.deleted), '[]'::jsonb))
        order by (c.parent_id is not null), c.name, c.id)
      from public.committees c
      where c.id = club or c.parent_id = club), '[]'::jsonb),
    'personnes', coalesce((
      select jsonb_agg(m.data || jsonb_build_object('id', m.id) order by lower(m.data ->> 'nom'), lower(m.data ->> 'prenom'), m.id)
      from public.gsa_club_membres m
      where m.club_id = club), '[]'::jsonb));
end $$;
revoke all on function public.gsa_sauvegarde_club(uuid) from public, anon;
grant execute on function public.gsa_sauvegarde_club(uuid) to authenticated;

-- Fichier du stockage gsa-fichiers lisible par un super-admin : celui d'un dossier d'entité (un seul club par serveur).
create or replace function public.gsa_fichiers_super_admin(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gsa_est_super_admin()
    and exists (select 1 from public.committees c where c.id::text = split_part(gsa_fichiers_super_admin.name, '/', 1))
$$;
revoke all on function public.gsa_fichiers_super_admin(text) from public, anon;
grant execute on function public.gsa_fichiers_super_admin(text) to authenticated;

drop policy if exists gsa_fichiers_super_admin on storage.objects;
create policy gsa_fichiers_super_admin on storage.objects for select to authenticated
  using (bucket_id = 'gsa-fichiers' and public.gsa_fichiers_super_admin(name));
