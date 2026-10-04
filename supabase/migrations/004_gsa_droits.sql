-- Droits sur les tables (appliqué le 04.10.2026).
-- Le projet n'ouvre pas automatiquement les nouvelles tables à l'API (aucun droit pour anon / authenticated /
-- service_role) : sans ces droits, l'appli reçoit « permission denied for table gsa_members ».
-- Droits limités à ce que l'appli utilise ; les règles RLS (003) filtrent ensuite ligne par ligne.
grant select, insert, update on public.gsa_items to authenticated;
grant select on public.gsa_members to authenticated;
grant update (person_id) on public.gsa_members to authenticated;
grant select on public.committees to authenticated;

-- Fonction serveur gsa-acces (clé secrète).
grant select, insert, update, delete on public.gsa_items to service_role;
grant select, insert, update, delete on public.gsa_members to service_role;
grant select on public.committees to service_role;
