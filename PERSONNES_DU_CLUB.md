# Personnes du club — nouvelle logique (en cours)

Décisions prises avec le président du club (octobre 2026). Référence pour chaque étape ; le README décrit ce qui est déjà en place.

## Principe

Les personnes font partie du **club**, pas d'une entité. Les **tâches** font partie des entités. L'**organigramme** dit, pour chaque
personne et chaque entité, sa place et donc son rôle, ce qui fixe les tâches qu'elle voit et ce qu'elle peut faire.

## Décisions

| Sujet | Décision |
| --- | --- |
| Liste des personnes | Une liste unique : le registre « Membres du club » devient « Personnes du club » (une fiche par personne : nom, email, téléphone, couleur ; IBAN à part). Les fiches en double sont fusionnées (même fiche du registre ou même email). |
| Droits dans une entité | Selon la place dans l'organigramme, ajustable personne par personne : ★ → Admin, poste → le rôle réglé sur ce poste (« Membre » par défaut), bénévole → « Bénévole ». |
| Rôles | Propres à chaque entité (console admin › Rôles et droits), comme aujourd'hui. |
| Comité au-dessus | Voit les tâches des entités qui dépendent de lui selon leur réglage « Ses tâches dans … » (toutes, partagées, aucune). |
| Personne sans place | Peut avoir un compte : elle ne voit que les tâches qui lui sont confiées (et « pour info »). |
| Qui gère les personnes | Le droit « Gérer les personnes » dans n'importe quelle entité : ajouter, modifier, retirer une personne du club. Chacun corrige ses propres coordonnées. |
| Comptes | Un par personne (son email), donné une fois (« Accès à l'appli » sur sa fiche) ; ensuite ses accès suivent ses places dans l'organigramme. |
| Responsables d'une tâche | Toute personne du club (celles de l'entité d'abord). Quelqu'un sans place dans l'entité : la tâche lui est confiée, à lui seul. |
| Coordonnées | Le droit « voir les coordonnées » dans une entité suffit pour voir celles de tout le club. |
| Page « Personnes du club » | Visible de tout le monde (noms et entités ; coordonnées selon le droit). |
| Séances | Convoqués : les ★ et les postes du comité (pas les bénévoles, ni les personnes à qui une seule tâche est confiée). |
| Retrait du club | Ses places et son accès sont retirés ; ses tâches gardent son nom (« ancienne personne »), à réattribuer ; l'historique reste. |

## Choix technique

En coulisse, une **place** par personne et par entité, liée à sa fiche du club (`membreId`), remplace la « fiche par entité » :
les tâches, discussions, votes, historiques et paiements gardent leurs identifiants. Les coordonnées ne vivent que dans la fiche du
club.

## Étapes

1. Démo — Personnes du club : liste unique, fiche unique (coordonnées, places, rôle par entité), droit « Gérer les personnes »,
   coordonnées pour tout le club ; organigramme : placer des personnes du club, rôle donné par chaque poste.
2. Démo — Accès selon l'organigramme ; responsables dans tout le club ; convocations (★ et postes).
3. Démo — Personnes sans place avec compte : écran « Mes tâches ».
4. Serveur, lecture seule : rapport de fusion (chiffres), contrôlé avant toute écriture. Résultat : places déjà liées aux
   personnes du club, aucune fusion nécessaire.
5. Serveur, appliqués un par un :
   - migration 055 : la liste du club pour toute personne du club, coordonnées et gestion selon les droits ;
   - migration 056 : un compte par personne (`gsa_club_comptes`), accès qui suivent les places, tâches confiées aux personnes
     sans place (lecture, statut, checklist), état du compte pour qui gère les personnes ;
   - fonction `gsa-acces` (`club.ts`) : donner l'accès, nouveau mot de passe, retirer l'accès, retirer du club. Garde-fou : une
     place ★ se règle par un admin de cette entité ou du comité central ; jamais le seul ★ d'une entité.
6. Ménage : anciens réglages d'accès entité par entité, aide, README.
