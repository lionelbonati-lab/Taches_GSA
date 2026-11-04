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
5. **D5 — Ménage et documentation** : aide, README, `SUPABASE_SETUP.md`, `PERSONNES_DU_CLUB.md`. **2 à 3 M.** (fait le
   03.11.2026 ; reste à appliquer la migration 061.)

**Total : 21 à 34 M tokens** (ordre de grandeur, contexte relu compris).

## Déjà fait

- **A1 (02.11.2026)** : étiquettes des tâches (modèle, fiche, pastilles, filtre, membres qui voient ; responsables, à
  retirer en D1) ; version réelle : rangées au comité central, `gsa_items` « etiquettes », sans migration.
- `PLAN_CLUB_SANS_ENTITE.md`, étape 1 (session du club dans la démo) : remplacée par le démontage (D1 la retire).
- **D1 (02.11.2026)** : démontage fait, sans migration ni déploiement.
  - **Un seul espace** : une seule couche de données (`store.tsx`) et les services du club (`club.tsx` : l'espace, les
    personnes du club, propositions, sauvegarde…). Supprimés : session et façade du club, vue du club et vue « moi »,
    organigramme (page, lignes, règles serveur), partage et tâches reçues, dépendances et anciennes tâches, tâches
    confiées à d'autres entités, choix d'entité, caisse centrale, icônes et suppression d'entités (26 fichiers). L'ancienne
    adresse `#/organigramme` mène à « Personnes du club ».
  - **Étiquettes** `{ id, nom, couleur, type: 'evenement' | 'groupe', date?, dateFin?, membres }`, sans responsables :
    réglées par le bouton « Étiquettes » (page Tâches) ou la console admin (« Sections, statuts et étiquettes ») ; membres
    aussi sur la fiche de la personne ; les membres voient les tâches. Événement daté : agenda (et export), accueil
    (« Prochains événements », avec ses tâches), recherche ; « Pour info », « À prendre » et emails : ses membres d'un coup.
  - **Démo** (version 9) : la démo d'avant (v8, une entité par clé) est reprise une fois (`data/repriseEntites.ts`) :
    chaque entité devient une étiquette (groupe → groupe, sinon événement avec sa date), ses tâches viennent dans
    l'espace avec l'étiquette (sections : une section à son nom, ses sections en sous-sections), ses personnes au club
    (même fiche, sinon même adresse ou même nom ; sinon nouvelle, rôle « Membre ») et membres de l'étiquette ; réglages,
    lectures, connexion et historique suivent. Données de départ : l'École de cyclisme, le Groupe compétition, la
    Bruntrutaine et la Soirée récréative en étiquettes, leurs personnes au club. Ces règles servent de modèle à D3.
  - **Version réelle, en attendant D3** : elle s'ouvre sur l'espace du comité central (ses données ne sont que lues et
    enregistrées comme avant ; le nom, le logo… se fusionnent avec ce qui est sur le serveur, rien n'est effacé) ; les
    autres entités restent intactes et s'ouvrent encore une à la fois (menu du compte, « Ouvrir « … » »). Une personne
    sans fiche voit ses tâches confiées (inchangé).
  - **À reprendre en D4** : les fonctions serveur gardent leur code généré d'avant (`gsa-push` : `notifs.js` et
    `index.ts`, `gsa-agenda` : `agenda.js`, `gsa-acces` : `organigramme.js`) ; les modules sources (`pushServeur.ts`,
    `agendaServeur.ts`, `notifs.ts`) ont changé : `npm run fonction` (qui ne génère plus `organigramme.js`) puis ajuster
    `gsa-push/index.ts`, et redéployer avec l'accord du président.
  - **Tests** réécrits (34, dont la reprise de la démo d'avant, les étiquettes datées dans l'agenda et l'accueil, une
    personne « Quelqu'un d'autre » qui reçoit une fiche et retrouve ses tâches) ; README et aide mis à jour pour
    l'essentiel (le reste en D5).
- **D2 (02.11.2026)** : rapport de reprise, serveur lu en **lecture seule** (requêtes SELECT, rien d'écrit). La requête
  est versionnée sans données : `outils/reprise/rapport_reprise.sql` (une seule requête, à relancer dans l'éditeur SQL
  juste avant D3 ; ses règles de rapprochement sont celles de `repriseEntites.ts`). Le rapport détaillé, avec les noms
  du club, a été remis au président hors du dépôt (public). En chiffres :
  - **10 entités** → 10 étiquettes (5 groupes, 5 événements), dont 1 archivée et 2 à date passée ;
  - **25 tâches** (11 en cours), dont 24 déjà partagées avec le comité central ; statuts tous ceux du club ; aucun
    remboursement, sondage ni email programmé dans les entités ; **aucun identifiant à changer** (8 tâches reprennent
    l'identifiant de leur ancienne ligne, supprimée, du comité central ; les 17 autres sont libres) ;
  - **personnes** : 4 sans fiche active au club (3 à créer, 1 à réactiver) ; **3 comptes** n'ont accès qu'à des
    entités : à rattacher au comité central, sinon ils perdraient l'accès ;
  - **5 tâches du comité central** liées à une entité (4 avec un délai « N jours avant » sa date, 1 avec un responsable
    dans l'entité) ; **2 événements** répétés à copier ; **2 fichiers** joints (2,4 Mo) dans le dossier d'une entité ;
    **24 entrées d'historique**.
  - Décisions à prendre : voir « Règles de la reprise (D3) » ci-dessous.

- **D3 (03.11.2026)** : **migration 059 appliquée par le président le 03.11.2026**, puis vérifiée (lecture seule) : 10
  entités archivées avec leur étiquette, 3 fiches créées, 1 réactivée, tous les comptes au club, tâches rangées comme
  décidé, messages, fichiers, événements et historique repris, 15 lignes gardées dans `gsa_reprise_avant`. **Écart
  trouvé** : les 4 délais « N jours avant » la date d'une entité avaient déjà perdu leur lien (dates intactes) : l'appli
  publiée en D1 retirait un délai calé dont elle ne trouvait plus la référence, à la première modification venue ; la
  reprise n'a donc pas pu les caler sur l'étiquette. Aucune autre perte (copies de nuit du 02.11 comparées : comité
  central et entités). **Migration corrective 060** (`060_gsa_reprise_delais.sql`, appliquée le 03.11.2026 et vérifiée : 4 délais calés sur leur étiquette, dates inchangées) : elle les cale sur
  la date de l'étiquette d'après la copie de nuit d'avant D1 ; essayée sur la base de test (`reprise_d1.sql`), simulée en
  lecture seule sur le serveur (4 tâches). Leçon pour la suite : avant de publier une version qui ne comprend plus une
  donnée, vérifier que rien ne la retire en silence.
  Ce qui avait été préparé :
  - **Migration `supabase/migrations/059_gsa_reprise_entites.sql`**, à appliquer par le président (mode d'emploi :
    `SUPABASE_SETUP.md`) : les règles ci-dessous, dans une fonction rejouable (`gsa_reprise_entites(club)` ; une entité
    déjà reprise, `info.reprise`, est laissée). Rien n'est effacé : chaque ligne du club modifiée est d'abord recopiée
    dans `gsa_reprise_avant`, les entités gardent leurs données et sont archivées. Points relevés en écrivant la
    migration : les messages et les « ✓ Vu » d'une tâche ne s'écrivent d'habitude que par le serveur (049, 046) : la
    reprise les recopie tels quels ; une fiche active de la personne d'un compte du club rouvre déjà l'accès (056) ; les
    fichiers joints ne se recopient pas en SQL : ils restent dans le dossier de l'entité et une règle de lecture
    (`gsa_fichier_repris`) les ouvre aux personnes du club qui voient la tâche.
  - **Essayée sur la base de test** avec des données fictives qui reproduisent les cas du rapport D2
    (`outils/base-test/reprise_donnees.sql`) : 42 vérifications (`reprise_verif.sql`), migration rejouée sans effet, règle
    des fichiers essayée au nom de comptes fictifs. Sur le serveur, en lecture seule : la règle de rangement donne les
    choix du président (Compétition → « Groupe compétition », École de cyclisme → sa section, Programme hivernal et les
    événements → « Événements », « Week-end VTT » en nouvelle sous-section).
  - **Appli** : délais calés sur la date d'une étiquette « événement » (« Pour quand ? » › « Selon une étiquette
    datée » ; la tâche porte l'étiquette ; le délai suit sa date ; la fenêtre des étiquettes dit combien de tâches la
    suivent). Version réelle : rien d'autre à changer, elle ignore déjà les entités archivées et ouvre le club d'abord ;
    après la migration, le menu « Ouvrir « … » » disparaît de lui-même.
  - **Démo** : la reprise de la démo d'avant suit les mêmes règles (rangement, réactivation, tâches du club liées à une
    entité, délai sur la date de l'étiquette). Tests : 35 (un de plus pour le délai calé sur une étiquette).
  - **Rapport D2** mis à jour : il ne montre plus les entités déjà reprises.

- **D4 (03.11.2026), déployée le 03.11.2026** avec l'accord du président (`gsa-agenda` v3, `gsa-push` v9, `gsa-acces`
  v11, `verify_jwt` désactivé comme avant ; contenu déployé relu, identique au dépôt) : les fonctions serveur suivent
  l'espace unique (détail, contrôles faits et vérifications à faire dans l'appli : `SUPABASE_SETUP.md`, « Fonctions
  serveur »). État des lieux en lecture seule avant : le serveur faisait tourner les versions d'avant D1, identiques au
  dépôt d'avant D1.
  - Contrôles après déploiement, sans écrire dans les données : `gsa-push` (toutes les 5 minutes) répond sans erreur et
    lit l'espace du club ; `gsa-agenda` (jeton inconnu) répond 404 ; `gsa-acces` (sans connexion) répond 401.
  - Juste avant le déploiement : `{lien}` dans l'objet d'un email programmé laissé vide côté serveur (il y faisait
    échouer le calcul des notifications de la personne ; risque d'avant D1, levé).
  - `gsa-push` : `notifs.js` régénéré (`npm run fonction`) ; `index.ts` ne lit plus les « pour info » ni les lectures
    communes des entités (l'appli marque les 💬 lues avec la discussion) et lit les étiquettes. Sans ce changement, la
    fonction régénérée ne démarrait plus (`luesCommunes` retiré en D1).
  - `gsa-agenda` : `agenda.js` régénéré (étiquettes datées comme « agenda du club ») ; `index.ts` lit les étiquettes, plus
    les entités ; un ancien lien vers une entité reprise sert l'espace du club.
  - `gsa-acces` : l'organigramme (`orga.ts`, `organigramme.js`), la suppression d'entités (`suppression.ts`) et les
    anciennes actions par entité sont retirés ; restent les comptes du club et les personnes du club ; « retirer du
    club » désactive ses fiches (club et anciennes entités) et refuse le dernier admin du club.
  - `webpush.ts` : types précisés pour les TypeScript récents (sans effet à l'exécution).
  - Essais : `deno check` sans erreur pour les trois ; `gsa-agenda` et `gsa-push` lancées avec Deno contre la base de
    test ; le retrait du club essayé sur une base simulée. Aucune migration nécessaire.
  - Fonctions SQL des entités devenues inutiles (organigramme, tâches partagées, agenda du club…) : laissées en place,
    à voir en D5 (fait : migration 061).

- **D5 (03.11.2026)** : ménage et documentation, sans déploiement ; **migration 061 préparée, pas appliquée** (à
  appliquer par le président, mode d'emploi : `SUPABASE_SETUP.md`).
  - **Appli** : version réelle sans le menu « Ouvrir « … » » des anciennes entités (archivées depuis 059 ; l'appli ouvre
    l'espace du club) ; textes visibles sans entité, sous-comité, caisse centrale ni comité central (aide, propositions,
    sauvegarde du club, comptes, mot de passe oublié) ; import CSV de la console admin renommé (`ImportsClub`, modèle
    `modele-personnes.csv`) ; icônes des anciens types d'entité retirées ; commentaires du code remis à jour (ceux qui
    expliquent la lecture des anciennes données restent). Le code des fonctions serveur régénéré
    (`npm run fonction`) est identique au déployé : rien à redéployer.
  - **Serveur, en lecture seule** : inventaire des fonctions SQL (graphe des appels : appli, fonctions serveur, règles,
    déclencheurs, tâches planifiées, autres fonctions). **23 fonctions des entités ne sont plus appelées par rien** :
    tâches partagées, transmises, attribuées ou proposées, sondages partagés, « pour info » entre entités, organigramme,
    séances et agenda vus d'une entité, tickets de la caisse centrale. La plupart sont « security definer » et ouvertes
    aux comptes connectés, et certaines écrivent encore dans les entités archivées : **migration 061** les retire (rien
    d'autre : ni donnée, ni table, ni règle). Essayée sur la base de test : rejouable, la reprise reste vérifiée, les 117
    fonctions encore utilisées sont là. Laissés exprès : les règles d'accès des fichiers d'avant (041), le déclencheur
    des statuts (058, sans effet visible), la reprise (`gsa_reprise_entites`) ; 5 fonctions du serveur créées hors du
    dépôt (`is_member`…), que rien n'appelle.
  - **Documentation** : aide de l'appli, README (toutes les descriptions détaillées reprises : plus de partage, de
    tâches d'autres entités, de caisse centrale, d'organigramme ; l'état de la version réelle après la reprise),
    `SUPABASE_SETUP.md` (« État actuel », 061, mise en route), `PERSONNES_DU_CLUB.md` (les règles d'un seul espace),
    `outils/base-test/LISEZMOI.md` (essai de 061).
  - **Tests** : 36 (un de plus : l'aide, les propositions, la console admin et « Personnes du club » ne parlent plus
    d'entités, pour un admin comme pour un membre ; le test échoue bien avec l'ancienne aide).

- **E1 (03.11.2026), étiquettes et sections** : retour du président (une personne mettait sur son point une étiquette
  dont elle n'était pas membre ; un membre du camp VTT pouvait étiqueter « Gruppetto » et ranger son point dans
  n'importe quelle section du comité ; les points du comité n'avaient pas d'étiquette). Sans migration ni déploiement :
  les étiquettes gardent leur place dans `gsa_items` (« etiquettes »), avec deux champs facultatifs (`lieux`, `parDefaut`).
  - **Place d'une étiquette** (section ou sous-section), devinée d'après le nom tant qu'elle n'est pas réglée : sur le
    serveur (lu en lecture seule), 8 étiquettes sur 9 trouvent leur place ; « Course à pied » n'en a pas (à régler).
  - **Étiquettes d'office** : un point rangé à la place d'une étiquette la reçoit, et la perd s'il est rangé ailleurs
    (`suivreLieux`, à chaque modification ; aussi quand on règle les places). Les points d'avant : à leur prochain
    enregistrement, ou « Ajouter l'étiquette de leur place » (fenêtre des étiquettes, rien n'est retiré).
  - **« Comité »** : étiquette des points rangés hors de la place des autres (créée en un clic par un admin ; membres :
    accès aux séances). Sur le serveur : 80 points sans étiquette, aucun n'a de discussion, 4 ont un responsable hors du
    comité (la discussion, une fois « Comité » créée, lui est réservée, comme pour toute étiquette ; on peut l'y ajouter).
  - **Droits** (dans l'appli, comme les droits par section ; le serveur ne les contrôle pas) : à la main, seulement les
    étiquettes dont on est membre (toutes pour « Gérer sections, statuts et étiquettes ») ; sans « Voir tous les points »,
    un membre d'étiquettes placées ne range ses points que dans leur place. Sans étiquette placée : comme avant.
  - Tests : 45 (un de plus : place devinée, « Comité », membre de la Bruntrutaine limité à sa sous-section, comité qui
    n'ajoute que ses étiquettes).

- **E2 (03.11.2026), étiquettes refaites et protégées** : retour du président (« c'est le bordel dans les étiquettes » ;
  plus de flexibilité : des événements gérés par des personnes différentes, pas toutes du comité, chacun voit ce qu'il a
  à voir ; un événement devient une sous-section des événements ; une coche à côté des sections pour les groupes).
  - **Incident** : le 03.11 à 20:13 puis 20:56, une appli restée ouverte sur une version d'avant les étiquettes (avant le
    02.11, sur un compte du club) a effacé toutes les étiquettes : elle ne connaissait pas ces lignes et demandait à les
    effacer à chaque envoi. Les points gardaient leurs étiquettes, leurs membres ne les voyaient plus. **Migration 065**
    (appliquée par le président le 03.11) : le serveur ignore l'effacement d'une étiquette sans la marque que l'appli
    envoie depuis E2 ; essayée sur la base de test (9 cas). **Restauration** (SQL, avec l'accord du président ; copie de
    l'état d'avant gardée) : 11 étiquettes rétablies, le doublon « Soirée récréative » fusionné (membres et points),
    « Comité » retiré des points qui ont une autre étiquette. L'appli (cloud.ts) n'efface plus jamais une sorte de ligne
    qu'elle ne connaît pas. Le sélecteur de couleur n'écrit plus à chaque mouvement (plus de 200 lignes au journal).
  - **Modèle** (sans autre migration) : étiquette d'un événement (`eventId`, case « Étiquette » de l'événement, sa
    sous-section dans « Événements » créée d'office), d'une section (`sectionId`, coche « Groupe »), « Comité »
    (`parDefaut`) ; les anciennes, « à relier », se reprennent depuis l'événement ou la section. La fenêtre
    « Étiquettes » n'en crée plus : vue d'ensemble, couleurs, anciennes étiquettes.
  - **Reste à faire par le président** (appli publiée) : pour chaque événement de l'agenda qui a une étiquette, cocher
    « Étiquette » et « Reprendre » l'ancienne (Week-end VTT / Week-end Pentecôte à départager) ; cocher « Groupe » sur
    Gruppetto, École de cyclisme, Groupe compétition (reprendre « Compétition ») ; décider pour Programme hivernal,
    Sortie de St-Martin, Conférence Yannis, Course à pied (pas d'événement ni de section du même nom : relier, ou laisser).
  - Tests : 46 (étiquettes refaites : groupe, événement et sa sous-section, point rattaché, Comité, membre limité à sa
    sous-section, anciennes étiquettes reprises).

- **E3 (04.11.2026), page Étiquettes et icônes** : retour du président (une icône sur les étiquettes, celle qu'on avait
  faite ; le réglage trop caché dans les menus). Page **Club › Étiquettes** (`/etiquettes`) : les événements (à venir,
  passés repliés), les sections, « Comité », les étiquettes à relier ; pour chacune, icône, couleur, membres ; mêmes
  réglages que le formulaire d'un événement et la console admin (composants partagés, `ReglageEtiquette.tsx`). Icône :
  la bibliothèque des anciennes entités reprise (`IconesEtiquette.tsx`, champ `icone` de l'étiquette ; par défaut selon
  sa sorte), sur toutes les pastilles. La fenêtre « Étiquettes » est remplacée par la page. Sans migration. Tests : 47.

- **E4 (04.11.2026), discussion de l'étiquette** : demande du président (une messagerie par étiquette, pour parler d'une
  manifestation ou d'un groupe en entier). Migration **066** (essayée sur la base de test ; à appliquer) : ligne
  « discussions » `et:<étiquette>`, écrite par `gsa_etiquette_commenter`, lue par ses membres seuls, notifications 💬 aux
  autres membres. Appli : dans Messages (non-lus, « Nouvelle discussion »), bouton « Discussion » (page Étiquettes,
  carte de l'événement) ; même fenêtre que la discussion d'un point. `gsa-push` inchangée. Tests : 48.

- **E5 (04.11.2026), étiquettes du point sur sa discussion** : demande du président (des points de même nom dans des
  événements différents). Messages (liste, recherche, « Nouvelle discussion »), titre de la fenêtre et notification 💬
  montrent les étiquettes du point. Sans migration ; `gsa-push` : `notifs.js` régénéré (le même texte sur téléphone,
  à redéployer). Tests : 53.

## Règles de la reprise (D3), décidées par le président le 03.11.2026

D'après le rapport D2. Ce qui n'est pas écrit ici suit le rapport (`outils/reprise/rapport_reprise.sql`).

1. **Toutes les entités sont reprises**, l'entité archivée comprise : chacune devient une étiquette (groupe → « groupe »,
   sous-comité ou équipe → « événement » avec sa date), avec ses tâches et ses membres (ses fiches actives).
2. **Étiquettes à date passée** : gardées datées.
3. **Personnes** : la fiche du club qui a la même fiche du registre, sinon la même adresse, sinon le même nom. Sans fiche
   au club : **une fiche est créée**, même pour une personne sans compte, avec le rôle **« Membre »** (comme l'appli :
   ses tâches, celles de ses étiquettes, l'agenda ; rôle à créer au club). Une fiche **inactive** du club dont la
   personne est active dans une entité est **réactivée avec son rôle actuel**.
4. **Comptes** : chaque compte qui n'a accès qu'à des entités est rattaché à sa fiche du club (sinon il perdrait
   l'accès).
5. **Rangement des tâches** : seuls les **groupes** ont leur section (la section du club de même nom ou de nom proche,
   ex. « Groupe compétition ») ; les **événements** restent des **sous-sections de « Événements »** (celle qui existe, de
   même nom ou de nom proche, sinon une nouvelle) ; « Programme hivernal », bien qu'il soit un groupe, garde sa
   sous-section existante « Événements › Programme hivernal ». Les sections propres aux entités (Préparation, Jour J,
   Activités…) ne sont pas gardées. Pas de section créée pour une entité sans tâche. (La reprise de la démo, qui crée
   une section par entité, est à aligner sur cette règle.)
6. **Délais calés sur la date d'une entité** (« 3 jours avant la Soirée ») : rattachés à **la date de l'étiquette**.
   Nouveau dans l'appli (démo et version réelle) : « Pour quand ? » propose aussi les étiquettes datées, et le délai
   suit leur date.
7. **Le reste**, comme proposé dans le rapport : les tâches gardent leur identifiant (celles déplacées autrefois depuis
   le comité central reprennent leur ancienne ligne) ; les tâches du comité central attribuées à une entité reçoivent
   son étiquette ; un responsable noté dans une entité (`respPartage`) devient responsable de la tâche ; messages,
   « pour info » et « à prendre » suivent les fiches ; les événements des entités sont copiés dans l'agenda ;
   l'historique des tâches suit ; les fichiers joints des entités doivent rester lisibles depuis le club (recopie dans
   le dossier du club, à préférer) ; les entités sont ensuite archivées, rien n'est effacé.
