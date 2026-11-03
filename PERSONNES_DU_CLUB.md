# Personnes du club — les règles

Décisions prises avec le président du club (octobre 2026), revues pour l'appli à un seul espace (novembre 2026,
`PLAN_APPLI_SIMPLE.md`). Référence pour la suite ; le README décrit les écrans.

## Principe

Les personnes font partie du **club** : une fiche par personne. Les **tâches** font aussi partie du club (un seul espace,
plus d'entités ni d'organigramme). Ce qu'une personne voit et peut faire dépend de ses **rôles du club**, sur sa fiche,
et de ses **étiquettes** (événements, groupes) : membre d'une étiquette, elle en voit les tâches.

## Décisions

| Sujet | Décision |
| --- | --- |
| Liste des personnes | Une liste unique, « Personnes du club » (nom, email, téléphone, couleur ; IBAN à part), avec ou sans accès à l'appli (licenciés, parents, bénévoles…). Les fiches en double sont fusionnées (même fiche du registre ou même email). |
| Fiche dans l'appli | Une personne du club peut avoir une fiche dans l'appli : son **poste**, ses **rôles**, ses **étiquettes**. « Lui donner une fiche dans l'appli » (rôle de base « Membre ») ; ses coordonnées restent celles de la liste du club. |
| Droits | Ceux de ses **rôles du club** (Console admin › Rôles et droits), cumulables, éventuellement limités à certaines sections. Admin, secrétaire, caissier, comité, membre, bénévole, externe… |
| Étiquettes | Un **événement** (avec sa date) ou un **groupe**. Ses **membres** voient ses tâches ; **pas de responsable d'étiquette** : pour modifier, ce sont les rôles qui comptent. Réglées avec le droit « Gérer sections, statuts et étiquettes » (bouton « Étiquettes » de la page Tâches, console admin, ou fiche de la personne). |
| Qui gère les personnes | Le droit « Gérer les personnes du club » : ajouter, modifier, retirer une personne du club, donner l'accès. Chacun corrige ses propres coordonnées (Réglages › Mon profil). |
| Coordonnées | Le droit « Coordonnées des personnes du club » ; une personne peut masquer les siennes (« Masquer mes données personnelles »). |
| IBAN | Saisi ou modifié par la personne seule (Réglages, ou en demandant un remboursement) ; vu des caissiers seulement. |
| Page « Personnes du club » | Visible de tout le monde (noms, postes, rôles, étiquettes ; coordonnées selon le droit). |
| Comptes | Un par personne (son email), donné une fois (« Accès à l'appli » sur sa fiche) ; il ouvre l'espace du club tant que sa fiche dans l'appli est active. |
| Personne sans fiche dans l'appli | Peut avoir un compte : elle ne voit que les tâches qui lui sont confiées (son nom sur la tâche), en change le statut et coche leur checklist. |
| Responsables d'une tâche | Toute personne qui a une fiche dans l'appli. Quelqu'un sans fiche (un parent, un bénévole…) : « ＋ Quelqu'un d'autre… », son nom est noté sur la tâche ; s'il reçoit une fiche, la tâche devient la sienne. |
| Séances | Convoqués : les personnes dont un rôle donne la page « Séances » (admin, secrétaire, comité…) ; ni les membres, ni les bénévoles, ni les personnes à qui une seule tâche est confiée. |
| Retrait du club | Sa fiche dans l'appli est désactivée et son accès retiré ; ses tâches gardent son nom (« ancienne personne »), à réattribuer ; l'historique reste. Jamais le dernier admin du club. |

## Choix technique

Deux fiches liées : la **fiche du club** (registre `gsa_club_membres` sur le serveur ; coordonnées, confidentialité ;
IBAN dans `gsa_club_iban`) et la **fiche dans l'appli** (`people`, dans les données de l'espace du club : poste, rôles,
couleur, liée par `membreId`). Les coordonnées ne vivent que dans la fiche du club. Les étiquettes gardent la liste de
leurs membres (`membres`, identifiants des fiches dans l'appli). Le compte est lié à la personne du club
(`gsa_club_comptes`) et à sa fiche dans l'appli (`gsa_members`).

## Historique

1. Démo — Personnes du club : liste unique, fiche unique, droit « Gérer les personnes », coordonnées pour tout le club.
2. Démo — Accès selon l'organigramme ; responsables dans tout le club ; convocations.
3. Démo — Personnes sans place avec compte : écran « Mes tâches ».
4. Serveur, lecture seule : rapport de fusion ; aucune fusion nécessaire.
5. Serveur : migrations 055 (la liste du club pour toute personne du club, coordonnées et gestion selon les droits) et
   056 (un compte par personne, tâches confiées aux personnes sans fiche) ; fonction `gsa-acces` (`club.ts`).
6. Ménage : plus d'accès entité par entité. Étapes 1 à 6 faites le 28.10.2026.
7. **Un seul espace** (`PLAN_APPLI_SIMPLE.md`, étapes D1 à D5, 02 et 03.11.2026) : plus d'organigramme ni de places
   par entité ; poste, rôles et étiquettes sur la fiche de la personne. Sur le serveur, la reprise (059) a relié les
   places des entités aux fiches du club (créées au besoin avec le rôle « Membre », ou réactivées), fait de leurs
   membres ceux des étiquettes et rattaché au club les comptes qui n'avaient accès qu'à des entités.
