# Plan — une appli plus simple : plus d'entités ni d'organigramme, des étiquettes

Retour du tour de séance (02.11.2026) : l'appli est trop compliquée pour certains. Décisions du président :

- **supprimer les entités et l'organigramme** (et ce qui en dépend : partage entre entités, dépendances, vue « moi »,
  choix d'entité, anciennes tâches) ;
- **tout le reste est gardé** : tâches (liste, kanban, fiche, statuts, checklist, rattachées, répétition, délais liés,
  « À prendre », « Pour info », fichiers, historique), messagerie, comité (séances, excusés, ordre du jour, PV, en-tête),
  agenda et événements (reprise d'édition, export), sondages, emails programmés, paiements (caisse, visa, bon),
  notifications (cloche, téléphone, résumé), accueil, recherche, personnes du club, comptes, rôles et droits, console
  admin, sauvegarde, import, export, annuler/refaire, rapport d'erreurs, propositions ;
- **étiquettes** : une étiquette est un **événement** ou un **groupe**, avec ses tâches dédiées ; **pas de rôles par
  étiquette** (pas de responsable d'étiquette : les droits sont les rôles du club, sur la fiche de la personne).

## Repartir de zéro ou démonter ?

Le code compte environ 40 800 lignes ; ce qui est propre aux entités et à l'organigramme, environ 7 400 lignes dans
des fichiers à part, plus des morceaux dans la couche de données et quelques écrans. Comme **tout le reste est gardé**
(environ 80 % du code), une réécriture devrait refaire presque toute l'appli : de l'ordre de **45 à 70 M tokens**. Le
**démontage direct** (supprimer d'un coup la couche des entités, garder les modules qui marchent) coûte environ moitié
moins (**21 à 34 M**) et ne casse pas ce qui fonctionne. **Recommandé : le démontage direct**, en une passe (pas de
« masquer d'abord, retirer ensuite »).

## Cible

- **Un seul espace** : le club (sur le serveur : l'espace actuel du comité central, qui a déjà 84 tâches, 10 séances,
  9 événements). Une seule couche de données (un `StoreProvider`), plus de session/façade, plus d'arrière-plan.
- **Personnes** : celles du club, avec leurs **rôles du club** (admin, secrétaire, caissier, membre du comité…) sur leur
  fiche ; plus de places par entité.
- **Étiquettes** : `{ id, nom, couleur, type: 'evenement' | 'groupe', date?, dateFin?, membres }`. Une tâche porte une ou
  plusieurs étiquettes ; liste, cartes, filtre (déjà en place, étape A1). Les **membres** de l'étiquette voient ses
  tâches (hypothèse, choisie le 02.11 : « étiquettes avec leurs membres » ; à confirmer). Une étiquette « événement »
  (avec sa date) apparaît dans l'agenda et l'accueil (prochains événements) ; ses tâches y mènent.
- **Retirés de l'étape A1** : les responsables d'étiquette et leurs droits.

## Étapes (une session par étape conseillée)

Règles : publier à la fin de chaque étape ; tests Playwright ; données fictives seulement ; serveur : lecture seule
d'abord, migrations appliquées par le président, aucun déploiement sans son accord ; jamais d'écriture destructive ;
base de test : `outils/base-test/LISEZMOI.md`.

1. **D1 — Démo, démontage** : un seul espace ; suppression des fichiers et chemins propres aux entités (organigramme,
   partage, dépendances, vue « moi », vue du club, choix d'entité, anciennes tâches…) ; étiquettes « événement » /
   « groupe » avec membres, sans responsables ; données de démo : les anciennes entités deviennent des étiquettes (leurs
   tâches, leurs personnes au club) ; tests réécrits. **10 à 16 M.**
2. **D2 — Serveur, lecture seule** : rapport de reprise (tâches, événements, personnes et responsables à ramener au club,
   personnes sans fiche au club). **0,5 à 1 M.**
3. **D3 — Migration de reprise et appli réelle** : chaque entité → une étiquette du club (type selon l'entité : équipe /
   sous-comité → événement, groupe → groupe ; membres : ses places) ; ses tâches et événements copiés dans l'espace du
   club avec l'étiquette, responsables reliés aux fiches du club (créées si besoin, rôle « Membre ») ; entités archivées
   (rien d'effacé) ; appli réelle sur un seul espace. Essais sur la base de test d'abord. **6 à 10 M.**
4. **D4 — Fonctions serveur** : `gsa-push`, `gsa-agenda`, `gsa-acces` ajustées à un seul espace si besoin, redéployées
   avec accord. **2 à 4 M.**
5. **D5 — Ménage et documentation** : aide, README, `SUPABASE_SETUP.md`, `PERSONNES_DU_CLUB.md`. **2 à 3 M.**

**Total : 21 à 34 M tokens** (ordre de grandeur, contexte relu compris).

## Déjà fait

- **A1 (02.11.2026)** : étiquettes des tâches (modèle, fiche, pastilles, filtre, membres qui voient ; responsables, à
  retirer en D1) ; version réelle : rangées au comité central, `gsa_items` « etiquettes », sans migration.
- `PLAN_CLUB_SANS_ENTITE.md`, étape 1 (session du club dans la démo) : remplacée par le démontage (D1 la retire).
