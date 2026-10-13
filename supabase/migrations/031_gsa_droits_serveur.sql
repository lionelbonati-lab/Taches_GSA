-- Tâches GSA — 031 : droits de la fonction serveur gsa-acces (clé secrète, rôle service_role).
--
-- • Registre « Membres du club » (gsa_club_membres, migration 016) : la fonction y retrouve la personne placée dans
--   l'organigramme (ou l'y inscrit) et retire une entité supprimée des groupes. Les droits n'avaient été donnés
--   qu'aux comptes connectés : « permission denied for table gsa_club_membres » en déplaçant quelqu'un.
-- • Entités (committees) : la suppression définitive d'une entité archivée (action supprimerUnite) ; ses données
--   suivent en cascade. Lecture, création et modification (nom, type, info) étaient déjà permises (004, 005).
grant select, insert, update, delete on public.gsa_club_membres to service_role;
grant delete on public.committees to service_role;
