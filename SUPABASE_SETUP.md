# Version réelle – Supabase

Projet Supabase « Taches_GSA » (région eu-west-1). L'adresse du projet et la clé « publishable » sont dans `src/lib/supabase.ts` (et `.env.example`) : elles sont publiques par nature, les données sont protégées par les règles d'accès de la base (RLS).

## Base de données

`supabase/migrations/003_gsa_donnees_partagees.sql` (appliqué) :

- `gsa_items` : un élément de l'appli par ligne (`kind` = collection : `tasks`, `people`, `meetings`, `log`, `prefs`…, `id`, `pos` = ordre, `data` = contenu jsonb, `deleted` = suppression douce). Diffusée en direct (Realtime).
- `gsa_members` : compte (`auth.users`) ↔ comité (`committees`) ↔ fiche responsable (`person_id`). `owner` = propriétaire (président) : accès et droits d'admin garantis.
- `gsa_is_member(comité)` : propriétaire, ou compte lié à une fiche **active**. `gsa_is_admin(comité)` : idem avec le rôle `admin`.
- Règles : lecture/écriture des éléments pour les membres ; seuls les admins modifient les rôles et les comptes administrateurs (déclencheur `gsa_items_guard`) ; `gsa_members` en lecture seule (sauf le propriétaire qui choisit sa fiche).
- Bucket privé `gsa-fichiers` : fichiers joints, chemin `<comité>/<fichier>`, réservé aux membres du comité.

`supabase/migrations/004_gsa_droits.sql` (appliqué) : droits sur les tables pour les comptes connectés et la fonction serveur. Le projet n'ouvre pas automatiquement les nouvelles tables à l'API ; sans ces droits, l'appli affiche « permission denied for table gsa_members ».

`supabase/migrations/005_gsa_entites.sql` (appliqué le 05.10.2026) : entités du club.

- `committees` : colonnes `parent_id` (comité central de l'entité ; vide pour le comité central), `type` (`central`, `sous-comite`, `groupe`, `equipe`) et `info` (couleur, description, date, archive). Le comité existant est devenu le comité central, ses données n'ont pas changé.
- Chaque entité a ses propres lignes dans `gsa_items` et ses membres dans `gsa_members` : les règles existantes la rendent invisible des autres entités, comité central compris.
- `gsa_organigramme(club)` : entités, membres actifs (nom, poste, rôles, email ; pas de téléphone) et sections du comité central, pour les seuls membres du club (`gsa_is_club_member`).
- `gsa_proposer_tache(entité, tâche)` : une entité envoie une tâche au comité central (titre, remarque et délai contrôlés, sans responsable, premier statut ouvert, marquée `proposee`) ; `gsa_mes_demandes(entité)` : leur suivi (statut, délai, responsables).
- Nom, couleur, description et date d'une entité : modifiables par ses admins et ceux du comité central ; type et archivage réservés au comité central (déclencheur `gsa_committees_guard`).

`supabase/migrations/006_gsa_acces_central.sql` (appliqué le 05.10.2026) : accès du comité central aux données d'une entité. Ajout pur : aucune donnée modifiée.

- Réglage `info.central` d'une entité : `aucun` (ou absent, par défaut), `lecture` ou `ecriture`. Seuls les admins de l'entité le changent : si un admin du comité central modifie l'entité, le déclencheur `gsa_committees_guard` garde l'ancienne valeur ; une valeur inconnue est refusée.
- `gsa_acces_central(entité)` : le niveau ouvert au compte connecté (`lecture`, `ecriture` ou rien), s'il est membre actif du comité central de l'entité.
- `gsa_items` : lecture pour les membres, ou si un niveau est ouvert ; ajout et modification pour les membres, ou en `ecriture` pour les collections `tasks`, `emails`, `notifications` et `log` seulement. Un non-membre ne peut pas supprimer une tâche (`gsa_items_guard`).
- Fichiers (`gsa-fichiers`) : lecture si un niveau est ouvert, envoi en `ecriture` (`gsa_file_reader`, `gsa_file_writer`) ; suppression réservée aux membres.
- Correction de 005 : la lecture de `committees` (`gsa_committees_select`) inclut les entités du comité central dont on est membre, sans quoi ses admins ne pouvaient pas modifier une entité dont ils ne font pas partie.

`supabase/migrations/007_gsa_logo.sql` (appliqué le 05.10.2026) : logo des entités. Ajout pur : aucune donnée modifiée.

- Logo gardé dans `committees.info.logo` (data URL), modifiable comme la couleur par les admins de l'entité et du comité central ; renvoyé par `gsa_organigramme` et la lecture de `committees`.
- `gsa_committees_guard` (mêmes règles que 006) refuse un logo qui n'est pas une image PNG, JPEG ou WebP en base64, ou qui dépasse 200 Ko (code `22023`, « Logo refusé… ») : pas de SVG ni de script. L'appli réduit l'image à 256 px avant de l'envoyer.
- Les en-têtes de l'ordre du jour et du PV sont des réglages de l'entité (`gsa_items`, ligne `meta` / `entetes`), soumis aux règles existantes.

`supabase/migrations/008_gsa_paiements.sql` (appliqué le 05.10.2026) : première version des tickets à rembourser (remplacée par 009). Aucune donnée modifiée ; `gsa_items_guard` reprend les règles de 006 et contrôle en plus les tickets (`data.paiement` d'une tâche) :

- valider (signer), refuser ou retirer une validation : droit `paiements.valider` ; la signature doit porter la fiche de la personne connectée ;
- un ticket validé ne change plus (montant, bénéficiaire, IBAN, justificatifs) sans ce droit ;
- marquer « payé » ou l'annuler : droit `paiements.payer`, au nom de la personne connectée ;
- un ticket validé ou payé n'est supprimé que par un validateur. Les admins de l'entité ont tous les droits.
- Fonctions ajoutées : `gsa_ma_fiche(entité)`, `gsa_a_droit(entité, droit)` (rôles de la fiche active), `gsa_paiement_check(…)`. Refus : code `42501`, message affiché dans l'appli.
- Les rôles existants reçoivent le droit « Caisse » (rôle Caissier / Trésorier) à la première ouverture de l'appli par un admin de l'entité.

`supabase/migrations/009_gsa_paiements_visa.sql` (appliqué le 05.10.2026) : circuit « photo → caisse → demande de visa → visa → paiement ». Remplace le contrôle de 008, **admins compris** (séparation des rôles). Aucune donnée modifiée.

- un ticket s'envoie à son propre nom (sauf par la caisse) et son demandeur ne change plus ;
- la caisse (`paiements.payer`) demande le visa, à une autre personne que le demandeur, en son propre nom ;
- seule la personne désignée par la caisse vise, jamais le demandeur, avec sa signature, sans changer montant, bénéficiaire ni IBAN ;
- un ticket visé ne change plus (montant, bénéficiaire, IBAN, justificatifs, visa) ; refus : la caisse ou la personne qui vise ; visa retiré : la caisse ou la personne qui a visé ;
- « payé » ou son annulation : la caisse, en son nom, sur un ticket visé ; un ticket visé ou payé n'est supprimé que par la caisse.
- Le modèle du sceau est un réglage de l'entité (`gsa_items`, ligne `meta` / `timbre`) ; la copie visée du ticket est un fichier joint ordinaire (`gsa-fichiers`).

`supabase/migrations/010_gsa_paiements_entites.sql` (appliqué le 05.10.2026) : **une caisse par entité**. Un ticket est enregistré dans l'entité dont on choisit la caisse (comité central, sous-comité, groupe, équipe) ; la caisse de chaque entité ne fait viser que **les membres de son comité** : fiche active de l'entité avec un rôle qui donne l'onglet Comité (`tab.meetings`) ou le droit de viser, ou admin de l'entité (`gsa_fiche_au_comite`). Contrôlé à la demande de visa et au moment du visa (une personne sortie du comité entre-temps ne vise plus). Aucune donnée modifiée. Rôle « Caissier » : créé dans les nouvelles entités ; dans une entité existante sans caisse, il est ajouté à l'ouverture par un admin, à attribuer ensuite dans « Responsables ».

`supabase/migrations/011_gsa_organigramme_caisse.sql` (appliqué le 06.10.2026) : `gsa_organigramme` indique pour chaque membre s'il tient la caisse de son entité (`caisse` : rôle non admin qui donne `paiements.payer`). Le formulaire des tickets ne propose ainsi que les entités qui ont un caissier désigné. Aucune donnée modifiée.

`supabase/migrations/012_gsa_tickets_caisse_centrale.sql` (appliqué le 06.10.2026) : **tout membre du club peut envoyer un ticket à la caisse centrale**, sans être membre du comité central. Aucune donnée modifiée.

- la photo est déposée dans le dossier du comité central sous un nom `tk-…` (règles de stockage `gsa_fichiers_ticket_*` : dépôt sans remplacement, relecture de ses propres dépôts, retrait seulement tant qu'aucun ticket ne les utilise) ;
- `gsa_ticket_central(source, ticket)` contrôle le contenu (objet, montant, bénéficiaire, IBAN, justificatifs déposés par la personne) et crée le ticket chez la caisse centrale, adressé à ses caissiers, avec un demandeur « externe » (entité, nom, compte) ; refusé aux membres du comité central (ils passent par leur propre caisse) et s'il n'y a pas de caissier ;
- `gsa_mes_tickets_centraux()` : la personne connectée suit l'état de ses tickets envoyés ;
- `gsa_paiement_check` : un ticket « externe » ne peut être créé que par `gsa_ticket_central`, son demandeur ne change plus et ne peut pas le viser.

`supabase/migrations/013_gsa_date_edition.sql` (appliqué le 06.10.2026) : `gsa_date_edition(entité, début, fin)` change la date de la prochaine édition d'un sous-comité ou d'une équipe d'événement (`committees.info.date` et `dateFin`, rien d'autre) ; réservé aux admins de l'entité, à ses membres qui ont le droit « Gérer les événements » et aux admins du comité central. Ajout pur, aucune donnée modifiée.

`supabase/migrations/014_gsa_agenda_club.sql` (appliqué le 06.10.2026) : `gsa_agenda_club(club)` donne à tout membre du club les événements de toutes ses entités non archivées (nom, dates, lieu ; pas la description), pour l'agenda du club. Lecture seule, ajout pur.

`supabase/migrations/015_gsa_paiements_factures.sql` (appliqué le 06.10.2026) : remboursements et **paiements de factures**. `gsa_ticket_central` accepte `type: 'facture'` (sous-section « Paiements », échéance facultative dans `delai`) en plus du remboursement ; `gsa_mes_tickets_centraux` renvoie le type. Remplacement des deux fonctions de 012 (même signature, mêmes contrôles) ; aucune donnée modifiée.

`supabase/migrations/016_gsa_membres_club.sql` (**à appliquer**) : **registre « Membres du club »**, une fiche par personne pour tout le club.

- table `gsa_club_membres (club_id, id, data)` (club = comité central) : prénom, nom, email, téléphone, IBAN, couleur, groupes (entités de type groupe) ; contenu normalisé et borné par `gsa_club_membres_guard` ;
- accès (lecture et écriture) : `gsa_membres_acces(club)` = droit `club.membres` ou admin dans l'une des entités du club ; les autres membres n'y ont pas accès ;
- lien des fiches des entités (`gsa_items`, kind `people`, `data.membreId`) par le déclencheur `gsa_items_registre` : lien gardé, sinon membre de même email, sinon nouveau membre ; des coordonnées modifiées dans une entité passent dans le registre, et `gsa_club_membres_diffuse` les recopie dans toutes les autres fiches liées (sans boucle). Suppression d'un membre refusée tant qu'il a une fiche active (`gsa_club_membres_suppression`) ;
- reprise : les fiches existantes sont regroupées par email (comité central d'abord) ; **leurs valeurs ne changent pas**, seul `membreId` est ajouté ;
- le rôle « Secrétaire » du comité central reçoit le droit `club.membres` ; `gsa_organigramme` renvoie aussi le `membreId` de chaque fiche.

Les tables des essais précédents (`001_init.sql`, `002_…` : `tasks`, `people`, `meetings`, `memberships`…) ne sont pas utilisées par l'appli. Elles sont vides et peuvent être supprimées.

## Fonction serveur `gsa-acces`

`supabase/functions/gsa-acces/index.ts` (déployée, vérification de connexion faite dans le code) : appelée par la console admin, réservée aux admins du comité.

- `liste` : comptes du comité (adresse, dernière connexion, mot de passe provisoire pas encore changé).
- `creer` : crée le compte d'un responsable (adresse confirmée d'office, mot de passe provisoire renvoyé une seule fois) et le lie à sa fiche.
- `reinitialiser` : nouveau mot de passe provisoire ; refusé si le compte appartient aussi à une entité dont l'appelant n'est pas admin (un responsable de groupe ne peut pas changer le mot de passe du président).
- `retirer` : supprime le lien (le compte n'a plus accès au comité).
- `creerUnite` (admins du comité central) : crée une entité avec ses données de départ, crée le compte de son responsable s'il n'existe pas (mot de passe provisoire) et rattache les membres de départ qui ont déjà un compte (même adresse email).

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
