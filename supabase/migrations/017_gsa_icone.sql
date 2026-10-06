-- Tâches GSA — 017 : icône de l'appli installée tirée du logo du club.
-- Les admins du comité central préparent les icônes dans l'appli (Console admin › Logo et couleur) et les déposent
-- dans le bucket public « gsa-public », dossier <id du comité central>/. La publication du site (GitHub Actions)
-- les reprend : fichiers fixes du site, seuls fiables pour l'installation (Android, iPhone, ordinateur).
--   • Lecture publique (ce sont les icônes du site) ; dépôt, remplacement et retrait réservés aux admins du comité central.
--   • Seuls les noms de fichiers attendus sont acceptés (images PNG de 1 Mo au plus, et version.json).
-- Ajout pur : aucune donnée existante n'est modifiée.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gsa-public', 'gsa-public', true, 1048576, array['image/png', 'application/json'])
on conflict (id) do nothing;

-- Fichier d'icône du club (« <comité central>/<nom attendu> ») que la personne connectée peut écrire.
create or replace function public.gsa_icone_ecriture(chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select chemin ~ '^[0-9a-f-]{36}/((icon-192|icon-512|icon-maskable-512|apple-touch-icon|favicon-32|favicon-192|badge-96|raccourci-(tache|mes-taches|remboursement|paiement)(-maskable)?)\.png|version\.json)$'
    and exists (
      select 1 from public.committees c
      where c.id::text = split_part(chemin, '/', 1) and c.parent_id is null and public.gsa_is_admin(c.id)
    );
$$;
revoke all on function public.gsa_icone_ecriture(text) from public, anon;
grant execute on function public.gsa_icone_ecriture(text) to authenticated;

drop policy if exists gsa_icone_select on storage.objects;
create policy gsa_icone_select on storage.objects for select to authenticated
  using (bucket_id = 'gsa-public' and public.gsa_icone_ecriture(name));
drop policy if exists gsa_icone_insert on storage.objects;
create policy gsa_icone_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gsa-public' and public.gsa_icone_ecriture(name));
drop policy if exists gsa_icone_update on storage.objects;
create policy gsa_icone_update on storage.objects for update to authenticated
  using (bucket_id = 'gsa-public' and public.gsa_icone_ecriture(name))
  with check (bucket_id = 'gsa-public' and public.gsa_icone_ecriture(name));
drop policy if exists gsa_icone_delete on storage.objects;
create policy gsa_icone_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gsa-public' and public.gsa_icone_ecriture(name));
