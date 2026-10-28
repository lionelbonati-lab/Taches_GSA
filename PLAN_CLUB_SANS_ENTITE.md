# Plan — l'appli du club, sans entité « de base »

Demande du président (28.10.2026) : *un membre se connecte à l'application, pas à une entité. Le club est un tout. Les
tâches font partie des entités, les membres font partie du club.* Plan à exécuter plus tard, étape par étape (une session
par étape conseillée). Suite de `PERSONNES_DU_CLUB.md` (étapes 1 à 6 faites).

## Où on en est (28.10.2026)

- **Personnes** : une liste unique, « Personnes du club » (`gsa_club_membres`) ; un compte par personne (`gsa_club_comptes`,
  056). Dans chaque entité, une **place** (`Person` dans `people`, liée par `membreId`) porte ses rôles ; les tâches,
  votes, paiements, notifications… désignent la personne par l'identifiant de sa place **dans l'entité**.
- **Accès serveur** : `gsa_members` (compte ↔ entité ↔ place), tenu à jour par les places (056) ; toutes les règles
  d'accès (`gsa_is_member`, `gsa_is_admin`…) passent par lui.
- **Appli** : elle charge **une entité de base** (`src/CloudApp.tsx` → `open()`, `entiteDeBase` ; démo :
  `src/DemoApp.tsx`), son `StoreProvider` (`src/data/store.tsx`) et le club (`src/CloudClub.tsx`) ; les autres entités se
  chargent en arrière-plan (`src/data/entites.tsx` : `RegistreEntites`, `useAutres`, `useMesEntites`, `Chez`). La « vue
  moi » (`dataMoi`, `src/data/vueMoi.ts`) réunit leurs tâches.
- **Ce qui dépend encore de l'entité de base** : `useStore()` (utilisé partout : `user`, `can`, `data`, `prefs`) ;
  profil, réglages et lectures (`prefs`, `notifLues`, `discussionsLues` dans `gsa_items` de **chaque** entité, recopiés
  par `useSetPrefsPartout`) ; « Accès désactivé dans X » et bascule (`src/App.tsx`) ; écran à part pour une personne sans
  place (`src/pages/SansPlace.tsx`) ; entité proposée d'office à la création (tâche, séance, événement, sondage) ;
  annuler/refaire (`pileAnnulation.ts`) et rapport d'erreurs (au nom de l'entité de base) ; `gsa-push` lit les réglages
  dans chaque entité (`src/data/pushServeur.ts`).

## Cible

1. **Connexion = la personne du club.** L'appli charge le club, puis **toutes** les entités où la personne a une place,
   à égalité (aucune « de base », aucun `data-entite`).
2. **Profil, réglages, lectures (notifications, discussions) : une seule fois, au club.**
3. **Les entités n'ont plus de fiches de personnes**, seulement des **places** (organigramme) qui donnent les droits
   (★ → Admin, poste → son rôle, bénévole) ; coordonnées seulement dans la fiche du club (déjà le cas).
4. **Sans place (dans aucun comité, groupe ou événement)** : accès à l'appli normale (plus d'écran à part), **sauf les
   écrans propres à un rôle** (ordre du jour, PV, séances, console admin, caisse, visa, gestion des personnes…) :
   accueil, ses tâches confiées et « pour info », messagerie, agenda du club, sondages où il vote, « Personnes du club »
   (noms), et le bouton « + » pour **envoyer un remboursement ou un paiement** (à la caisse centrale par défaut, autre
   caisse au choix) et en suivre l'état.
5. **Tâches, séances, événements, sondages restent dans leur entité** : à la création, choix de l'entité (la dernière
   choisie proposée, sinon le comité central) ; ordre du jour, PV, console admin : entité choisie en haut (déjà le cas).

Choix technique conseillé (le moins risqué pour les données réelles) : **garder les identifiants de place** dans les
données des entités (tâches, votes, paiements, notifications) ; l'appli traduit place ↔ personne du club (`membreId`).
Pas de réécriture des tâches existantes.

## Étapes

Règles pour chaque étape : publier (push) à la fin ; tests Playwright (`npm run build` puis
`npx playwright test -c playwright.local.config.ts`) ; données fictives seulement ; serveur : lecture seule d'abord,
migration appliquée par le président (éditeur SQL), aucun déploiement sans son accord ; jamais d'écriture destructive.

### Étape 0 — Inventaire (lecture seule)

- Lister les usages de `useStore()` par champ (`user`, `can`, `data`, `prefs`, `setPrefs`, `saveTask`…) et classer :
  « personne » (→ club), « une entité précise » (→ `Chez`/entité choisie), « toutes » (→ vue réunie).
- Contrôle serveur (chiffres seulement) : personnes avec des réglages différents d'une entité à l'autre, lectures à
  fusionner.
- Livrable : liste des fichiers à modifier, ajoutée à ce plan.

### Étape 1 — Démo : la session du club

- Nouvelle couche `SessionClub` (au-dessus des entités) : la personne du club (`membreId`), ses places, ses réglages,
  son profil, ses lectures ; stockage démo au club (une clé `taches-gsa-demo-perso`).
- Toutes mes entités chargées comme aujourd'hui l'arrière-plan, **sans entité de base** ; `useStore()` « haut niveau »
  devient une façade sur la session (personne, droits réunis, vue réunie).
- `useSetPrefsPartout`, « Mon profil » : écrivent au club ; fin de la recopie dans chaque entité.
- Tests : démo ouverte sans entité ; mêmes réglages partout ; plus de `data-entite` (adapter `tests/outils.ts`).

### Étape 2 — Démo : les écrans

- Créations (tâche, séance, événement, sondage) : choix de l'entité, la dernière proposée.
- Personne sans place : l'appli normale sans les écrans de rôle (navigation filtrée par droits : aucun droit d'entité)
  ; accueil, tâches confiées, messagerie, agenda, sondages, « + » remboursement / paiement vers la caisse centrale (ou
  une autre au choix) avec son suivi ; retirer `SansPlace` séparé.
- Retirer « Accès désactivé dans X » et la bascule d'entité (`App.tsx`) ; annuler/refaire et rapport d'erreurs par
  entité de la modification.
- Aide (`Aide.tsx`), README.

### Étape 3 — Serveur : préparation (lecture seule)

- Rapport : réglages et lectures par personne et par entité ; ce que donnera la reprise (une valeur par personne : celle
  du comité central, sinon la plus récente).

### Étape 4 — Serveur : migration 059 et appli réelle

- Migration 059 : table `gsa_club_perso` (club, personne du club, sorte : `prefs` / `notifLues` / `discussionsLues` /
  `profil`, données), lue et écrite seulement par la personne elle-même (via `gsa_club_comptes`) ; reprise des valeurs
  actuelles ; fonction `gsa_ma_session_club()` (personne, places, entités). Ajout pur, retour en arrière documenté.
- Appli réelle : `CloudApp` sans `open(m)` d'une entité ; chargement de toutes les entités ; réglages et lectures au club ;
  toutes les entités en direct (temps réel), pas seulement l'une.
- Essais sur la base locale (`/var/lib/postgresql/gsatest`) avant de proposer la migration.

### Étape 5 — Serveur : accès et notifications

- `gsa-push` : réglages et lectures lus au club (`pushServeur.ts`, `npm run fonction`), redéploiement avec accord.
- Liens des notifications : sans entité (`?u=` devient inutile ; `LienRecu` garde la compatibilité des anciens liens).
- Personne sans place : envoyer un ticket (remboursement, facture) à une caisse et le suivre — aujourd'hui
  `gsa_ticket_central` / `gsa_mes_tickets_centraux` demandent une place dans une entité : migration 060 pour les ouvrir
  à toute personne du club qui a un compte (photo du ticket dans le dossier de la caisse, comme 030) ; ses messages,
  agenda et sondages selon les mêmes règles.
- (Facultatif, plus tard) `gsa_members` remplacé par les places pour les règles d'accès : seulement si utile, migration
  à part.

### Étape 6 — Ménage

- Retirer le code devenu inutile (entité de base, `entiteDeBase`, recopies), `PERSONNES_DU_CLUB.md`, README,
  `SUPABASE_SETUP.md`, ce plan marqué fait.

## Estimation des tokens

Ordre de grandeur des tokens traités par session (contexte relu à chaque action compris ; la plus grande part est de la
relecture mise en cache). Une session par étape, démarrée par « Lis `PLAN_CLUB_SANS_ENTITE.md`, étape N », coûte bien
moins qu'une longue session qui enchaîne tout.

| Étape | Travail | Tokens (ordre de grandeur) |
| --- | --- | --- |
| 0 | Inventaire, contrôle serveur en lecture | 1 à 2 M |
| 1 | Démo : session du club, façade `useStore`, réglages au club | 8 à 12 M |
| 2 | Démo : écrans, sans place dans l'appli (sans écrans de rôle, avec tickets), aide | 5 à 8 M |
| 3 | Serveur : rapport en lecture seule | 0,5 à 1 M |
| 4 | Migration 059, appli réelle, essais base locale | 6 à 9 M |
| 5 | `gsa-push`, liens, tickets des personnes sans place (060), redéploiement | 3 à 6 M |
| 6 | Ménage et documentation | 1 à 2 M |
| **Total** | | **26 à 40 M** |

Les étapes 1 et 4 sont les plus lourdes (presque tous les écrans passent par `useStore()`). Chaque étape laisse l'appli
utilisable : on peut s'arrêter entre deux.
