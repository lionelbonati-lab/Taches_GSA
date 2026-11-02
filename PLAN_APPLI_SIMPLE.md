# Plan — une appli plus simple : plus d'entités ni d'organigramme, des étiquettes

Retour du tour de séance (02.11.2026) : l'appli est trop compliquée pour certains. Décision du président : **supprimer
les entités et l'organigramme** ; les événements et les groupes deviennent des **étiquettes** sur les tâches (une vraie
étiquette, pas un « pour info ») : on voit la tâche et on sait qui s'en occupe. Ce plan remplace
`PLAN_CLUB_SANS_ENTITE.md` (son étape 1, la session du club dans la démo, reste utile : une seule personne, ses réglages
au club).

## Décisions

| Sujet | Décision |
| --- | --- |
| Tâches | Une seule liste pour le club. Une tâche peut porter une ou plusieurs **étiquettes** (Bruntrutaine, École de cyclisme, Soirée…). |
| Qui voit une tâche étiquetée | Les **membres de l'étiquette** (liste de personnes réglée sur l'étiquette), en plus des règles actuelles (ses responsables, son auteur, « voir toutes les tâches » du comité). |
| Droits | **Rôles du club** (admin, secrétaire, caissier, membre du comité…) sur la fiche de la personne, plus un ou des **responsables par étiquette** : ils gèrent les tâches de leur étiquette et ses membres. |
| Données existantes | Les tâches et événements des autres entités rejoignent la liste du club avec l'étiquette du nom de leur entité (responsables, discussions, historique gardés). |
| Séances, ordre du jour, PV, caisse, console admin | Ceux du club (aujourd'hui : du comité central). |
| Organigramme, entités, partage entre entités, dépendances, vue « moi » | Supprimés. |

## Étapes

Règles : publier à la fin de chaque étape ; tests Playwright ; données fictives seulement ; serveur : lecture seule
d'abord, migrations appliquées par le président, aucun déploiement sans son accord ; jamais d'écriture destructive.

- **A1 — Étiquettes (démo et version réelle, sans rien retirer)** : modèle (`etiquettes` : nom, couleur, membres,
  responsables ; `Task.etiquettes`), console admin › Étiquettes (admins ; responsables : leurs membres), champ
  « Étiquettes » de la tâche, pastille sur les cartes et la liste, filtre « Étiquette », visibilité pour les membres,
  modification par les responsables.
- **A2 — Démo sans entités** : un seul espace (le club) ; les anciennes entités de la démo deviennent des étiquettes
  (leurs tâches, leurs membres) ; organigramme, choix d'entité, partage, dépendances masqués ; tests réécrits.
- **B1 — Serveur, lecture seule** : rapport de reprise (tâches, événements, personnes et responsables à faire suivre,
  personnes sans fiche au club).
- **B2 — Serveur, migration de reprise** : chaque entité → une étiquette du club (membres : ses places) ; ses tâches et
  événements copiés au comité central avec l'étiquette, responsables reliés aux fiches du club (créées si besoin, sans
  droit) ; entités archivées (rien d'effacé) ; essais sur `outils/base-test` d'abord.
- **B3 — Appli réelle** : un seul espace (le comité central) ; `gsa-push` et `gsa-acces` ajustés si besoin, avec accord.
- **C — Ménage** : retrait du code des entités, de l'organigramme, du partage, de la vue « moi » ; aide, README,
  `SUPABASE_SETUP.md`.

## Estimation des tokens (ordre de grandeur, une session par étape)

| Étape | Tokens |
| --- | --- |
| A1 Étiquettes | 4 à 7 M |
| A2 Démo sans entités | 6 à 10 M |
| B1 Rapport serveur | 0,5 à 1 M |
| B2 Migration de reprise | 4 à 7 M |
| B3 Appli réelle | 3 à 6 M |
| C Ménage | 4 à 8 M |
| **Total** | **22 à 39 M** |
