# Version réelle – Supabase

Projet Supabase « Taches_GSA » (région eu-west-1). L'adresse du projet et la clé « publishable » sont dans `src/lib/supabase.ts` (et `.env.example`) : elles sont publiques par nature, les données sont protégées par les règles d'accès de la base (RLS).

## Base de données

`supabase/migrations/003_gsa_donnees_partagees.sql` (appliqué) :

- `gsa_items` : un élément de l'appli par ligne (`kind` = collection : `tasks`, `people`, `meetings`, `log`, `prefs`…, `id`, `pos` = ordre, `data` = contenu jsonb, `deleted` = suppression douce). Diffusée en direct (Realtime).
- `gsa_members` : compte (`auth.users`) ↔ comité (`committees`) ↔ fiche responsable (`person_id`). `owner` = propriétaire (président) : accès et droits d'admin garantis.
- `gsa_is_member(comité)` : propriétaire, ou compte lié à une fiche **active**. `gsa_is_admin(comité)` : idem avec le rôle `admin`.
- Règles : lecture/écriture des éléments pour les membres ; seuls les admins modifient les rôles et les comptes administrateurs (déclencheur `gsa_items_guard`) ; `gsa_members` en lecture seule (sauf le propriétaire qui choisit sa fiche).
- Bucket privé `gsa-fichiers` : fichiers joints, chemin `<comité>/<fichier>`, réservé aux membres du comité.

Les tables des essais précédents (`001_init.sql`, `002_…` : `tasks`, `people`, `meetings`, `memberships`…) ne sont pas utilisées par l'appli. Elles sont vides et peuvent être supprimées.

## Fonction serveur `gsa-acces`

`supabase/functions/gsa-acces/index.ts` (déployée, vérification de connexion faite dans le code) : appelée par la console admin, réservée aux admins du comité.

- `liste` : comptes du comité (adresse, dernière connexion, mot de passe provisoire pas encore changé).
- `creer` : crée le compte d'un responsable (adresse confirmée d'office, mot de passe provisoire renvoyé une seule fois) et le lie à sa fiche.
- `reinitialiser` : nouveau mot de passe provisoire.
- `retirer` : supprime le lien (le compte n'a plus accès au comité).

Aucun email n'est envoyé par Supabase (le serveur d'email par défaut est très limité) : l'admin transmet lui-même le mot de passe provisoire.

## Mise en route

1. Rattacher le compte du président au comité comme propriétaire (fait pour « Comité centrale ») :
   ```sql
   insert into public.gsa_members (committee_id, user_id, owner)
   select c.id, u.id, true from public.committees c, auth.users u
   where c.name = '<nom du comité>' and u.email = '<adresse du président>';
   ```
2. Ouvrir l'appli, choisir **Version réelle**, se connecter : l'écran de mise en route propose de reprendre une sauvegarde de la démo ou de partir d'une base vide.
3. Corriger les noms et adresses email dans l'onglet Responsables, puis créer les accès dans la console admin.

## À savoir

- Projet gratuit : Supabase met en pause un projet inactif pendant une semaine (le réactiver depuis le tableau de bord).
- Authentication › Sign In / Providers : on peut désactiver « Allow new users to sign up » (les comptes sont créés par la fonction `gsa-acces`) et activer la protection contre les mots de passe divulgués.
