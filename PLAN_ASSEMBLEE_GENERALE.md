# Plan : un module « Assemblée générale » (ordre du jour, PV signé, votes)

Demande du président (11.11.2026) : *réfléchis à la construction d'un module Assemblée générale. Une page ordre du
jour où l'on placera les points spécifiques à l'AG ; ces points n'auront pas de statut ni de date de délai. Une page PV
sur le même style que les PV de séance, avec la diffusion à 3 fenêtres. La liste de présence et des excusés sera
marquée après coup. Le président et le secrétaire doivent signer le PV à la fin. Proposer des sondages par point
(pour / contre / abstention).*

> **Décision du président (11.11.2026)** : *un nouvel onglet pour l'AG, visible des seules personnes qui en auront le
> droit dans la console admin.* L'onglet **AG** a son propre droit, « Assemblée générale » (console admin › Rôles et
> droits) : les admins l'ont toujours, aucun autre rôle ne l'a d'office.
>
> **Fait le 11.11.2026 : étape AG1** (l'onglet et l'ordre du jour de l'AG ; README, « Assemblée générale (onglet AG) »).
> Le reste de ce plan (PV, liste de présence, signatures) est à faire.

## Le principe

- **Une AG, c'est l'événement « Assemblée générale » de l'agenda** (type choisi sur sa fiche ; dans la démo :
  « Assemblée générale 2027 », le 13.03.2027). Sa date, son heure et son lieu viennent de là. Il reste dans le
  calendrier, dans la chronologie (« D'une AG à l'autre ») et dans l'export. Ses **points de préparation** (réserver la
  salle, préparer les comptes…) restent des points ordinaires, dans sa sous-section (Événements › AG 13.03.2027).
- **Le module ajoute à cette AG son ordre du jour et son PV.** Ils sont dans un nouvel onglet **« AG »** (Assemblée
  générale), avec deux pages, **Ordre du jour** (fait) et **PV** (à faire), visible des seuls rôles qui en ont le droit.
- **Les points de l'AG ne sont pas des points de la liste.** Ils n'ont ni statut, ni délai, ni responsable. Ils ne
  figurent ni dans « Points », ni dans l'ordre du jour ou le PV du comité, ni dans le calendrier. Ce sont les rubriques
  de l'ordre du jour de l'AG (« Approbation des comptes 2026 »), avec un texte, des documents et, au besoin, un vote.
- **Les « sondages par point » sont des votes en salle**, à main levée : le secrétaire note le nombre de pour, de contre
  et d'abstentions. La plupart des membres n'ont pas l'appli : il n'y a donc pas de vote personne par personne, comme
  dans l'onglet « Vote » du PV du comité.
- **Le PV se tient comme celui du comité** : prise de notes, barre d'outils, vue en 3 fenêtres, projection. Les présents
  et les excusés sont marqués **après coup**. **Le président et le secrétaire signent** le PV à la fin.

## 1. Page « Ordre du jour » de l'AG

**Choisir l'AG.** En haut de la page, la prochaine AG de l'agenda. Les AG passées sont dans « Reprendre une ancienne
AG… ». S'il n'y a aucune AG prévue, **+ Nouvelle AG** ouvre la fiche d'un nouvel événement, avec le type « Assemblée
générale » déjà choisi.

**Les points** sont numérotés 1, 2, 3… Chacun a :

- un **intitulé** (« Rapport du président ») ;
- un **texte**, s'il y en a un, imprimé sous l'intitulé (« Le comité propose une cotisation de 80 fr. ») ;
- des **sous-points** a., b., c., sur un seul niveau (« 5. Rapports : a. du président, b. du chef technique, c. du
  caissier ») ;
- des **documents** (fichier, photo, lien), comme ceux d'un point : rapport annuel, comptes, budget. Ils sont montrés
  en projection pendant l'AG et, si on le veut, joints en annexe de la convocation ;
- une case **🗳 Vote** : le point, ou le sous-point, sera voté. La question est proposée d'après l'intitulé
  (« Approbation des comptes 2026 ») et peut être changée. Un point peut avoir **plusieurs votes** (« + Autre vote »),
  par exemple un vote par personne à élire : « Élection de … au comité », « Élection des vérificateurs ». Chaque vote a
  sa **majorité** (voir « Les votes : quelle majorité ? »).

« + Point » en ajoute un. On le déplace en le faisant glisser (ou avec ↑ ↓) et on le retire avec la poubelle.

**Pour commencer :**

- **Reprendre l'AG précédente** : ses points, textes, sous-points et votes, dans le même ordre (sans les documents ni
  les notes). Les années des intitulés avancent d'un an (« Comptes 2026 » devient « Comptes 2027 ») ; c'est à relire.
  C'est le cas habituel, parce que l'ordre du jour d'une AG change peu d'une année à l'autre. Quand on reprend
  l'événement de l'AG pour l'année suivante (« Reprendre », Agenda › Événements), on propose aussi de reprendre son
  ordre du jour.
- **Modèle**, la toute première fois : un ordre du jour classique, à adapter.
  1. Ouverture et bienvenue
  2. Nomination des scrutateurs
  3. Approbation de l'ordre du jour
  4. Approbation du PV de la dernière AG
  5. Rapports (président, chef technique)
  6. Comptes, rapport des vérificateurs, approbation et décharge au comité
  7. Budget et cotisations
  8. Élections
  9. Propositions du comité et des membres
  10. Admissions, démissions, honneurs
  11. Divers
- Au point « Approbation du PV de la dernière AG », un clic joint **le PV signé de l'AG précédente** (📎 : en annexe et
  en projection).

**Le document (la convocation)** a le même en-tête et la même mise en forme que l'ordre du jour du comité (la mise en
forme est commune au club). On y trouve le titre (« Assemblée générale 2027 »), la date, l'heure et le lieu. Ensuite
viennent un **texte d'introduction**, s'il y en a un, et les points numérotés avec leurs textes ; « (vote) » est écrit à
côté des points votés, si on le choisit. À la fin, un **texte de fin**, s'il y en a un (« Les propositions des membres
sont à envoyer au comité jusqu'au … », « Le comité »).

```
                    [en-tête du club]
               ASSEMBLÉE GÉNÉRALE 2027
         Samedi 13 mars 2027, 19h30 – Porrentruy

  Texte d'introduction…

  1. Ouverture et bienvenue
  2. Nomination des scrutateurs
  …
  6. Comptes 2026
     a. Présentation des comptes
     b. Rapport des vérificateurs
     c. Approbation des comptes et décharge au comité      (vote)
  …
  Texte de fin…                                  Le comité
```

**Actions**, comme pour le comité : **PDF**, **Imprimer**, **Copier le texte**, **Envoyer par email**, **Archiver dans
l'AG**, **✏️ Modifier le texte** (version écrite à la main). L'email part au comité ou **aux membres** : on prend les
adresses de « Personnes du club », en copie cachée pour que personne ne voie les adresses des autres.

**Archives** : dans la page (« Reprendre une ancienne AG… ») et sur la carte de l'AG (Agenda › Événements : « Ordre du
jour », « PV signé »).

**Droit** : celui de l'onglet, « Assemblée générale » (console admin › Rôles et droits ; les admins l'ont toujours).
Qui l'a prépare l'ordre du jour ; la mise en forme des documents reste réglée avec le droit « Comité › Ordre du jour ».

## 2. Page « PV » de l'AG

Même style que le PV du comité (`src/pages/Minutes.tsx`), avec ce qui change pour une AG.

**Séance**, en haut de la page :

- ▶ Démarrer / ⏹ Terminer, heures de début et de fin, chrono ;
- **président de l'assemblée** et **secrétaire du PV** : l'appli les propose d'après les postes du club (Président,
  Secrétaire). On peut les changer, par exemple si un vice-président préside. Ce sont eux qui signent le PV ;
- **scrutateurs** : leurs noms, en texte libre ;
- **membres présents ayant droit de vote** : le nombre compté en salle au début de l'AG (« 47 ; majorité absolue :
  24 »). C'est ce nombre qui sert aux votes, puisque la liste de présence n'est marquée qu'après ;
- **invités**, en texte libre (commune, presse, membres d'honneur…).

**Prise de notes.** Les points de l'ordre du jour sont dans le même ordre, chacun avec sa zone de notes, puis vient
**Divers**. Les notes se mettent en forme comme au comité (couleur, gras, italique…). Un point ajouté pendant l'AG
(« + Point ajouté en séance ») se place à la fin, avant Divers. La barre d'outils flottante est la même : annuler,
refaire, point précédent ou suivant, vue en fenêtres, projection, démarrer ou terminer, chrono, enregistrer.

**Votes**, sous chaque point voté et dans l'onglet « Vote » de la vue en fenêtres :

- trois compteurs **Pour**, **Contre** et **Abstention**. On tape le nombre, ou on utilise les gros boutons − et +
  (pratique sur tablette) ;
- deux raccourcis : **À l'unanimité** (tous les votants pour) et **Par acclamation** (pour les élections) ;
- le **résultat** s'affiche tout de suite : « Accepté à l'unanimité », « Accepté par 40 voix contre 3 (4 abstentions) »,
  « Refusé par … ». Un avertissement s'affiche si le total dépasse le nombre de votants ;
- un point ajouté pendant l'AG peut aussi être voté. Le Code civil (art. 67, al. 3) ne permet de décider d'un point qui
  n'est pas à l'ordre du jour que si les statuts le prévoient : l'appli le rappelle à ce moment-là.

**Vue en 3 fenêtres** : c'est la « diffusion » du PV du comité (`src/components/FichePv.tsx`), avec les onglets d'un
point de l'AG.

- **Point** : intitulé, texte, sous-points.
- **Vote** : les compteurs et le résultat, en grand. On peut le glisser dans la fenêtre de droite pour le montrer au
  beamer.
- **Documents**.
- **AG précédente** : ce que le PV de l'AG d'avant dit du même point, quand le point a été repris.
- **Notes de la séance**.
- **Pièces jointes** : en projection, à droite.

Le bandeau montre « Assemblée générale 2027 · samedi 13.03.2027 · 19h30 · Porrentruy », où en est le point
(« 6. Comptes 2026 · 6 / 11 ») et le nombre de votants. Comme au comité, on glisse les onglets d'une fenêtre à l'autre et
on tire les barres entre les fenêtres. L'appareil retient ces choix, rangés à part de ceux du comité pour ne pas les
changer.

**Points pour le comité** (facultatif). Une décision de l'AG qui demande du travail (« Étudier un nouveau maillot »)
peut devenir, d'un clic, un **point ordinaire** du club, dans la section choisie. Il passe ainsi à l'ordre du jour de la
prochaine séance du comité, et le PV de l'AG le note (« Confié au comité »).

## 3. Liste de présence et excusés, après coup

Après l'AG, le secrétaire reprend la liste de présence signée sur papier et les excuses reçues. On peut aussi la
remplir avant l'AG (excuses reçues) ou pendant.

- Le bouton **👥 Liste de présence** du PV de l'AG montre toutes les **personnes du club**, avec une recherche par nom.
- Un appui marque la personne **Présente**, un deuxième **Excusée** (avec un motif, si on le donne), un troisième la
  remet sans marque.
- **+ Quelqu'un d'autre** ajoute une personne qui n'est pas dans la liste du club (son nom, présente ou excusée).
- En haut, les compteurs : « 46 présents, 12 excusés ». Si ce nombre de présents est différent du nombre de votants
  compté en salle, un simple rappel s'affiche (« 47 votants comptés au début de l'AG »).
- La liste peut être **limitée à une étiquette**, par exemple un groupe « Membres de l'association », pour ne pas voir
  les parents, les bénévoles… Ce choix reste pour les AG suivantes.

Dans le PV : « Présents : 46 membres (liste en annexe) », puis **les excusés, avec leur nom**, et les invités. La liste
des présents vient **en annexe**, à la fin du PV (ou dans le PV lui-même, au choix dans les options). Si la liste est
vide au moment de valider, l'appli le signale.

## 4. Signatures du président et du secrétaire

Le PV se termine par les deux signatures :

```
  Porrentruy, le 20 mars 2027

  Président :                      Secrétaire :
  [signature]                      [signature]
  Prénom Nom                       Prénom Nom
  signé le 22.03.2027              signé le 20.03.2027
```

**Le circuit :**

1. Le secrétaire termine le PV (notes, votes, liste de présence), puis clique sur **✅ Valider et faire signer**. Le PV
   est alors figé (lecture seule) et marqué « En attente des signatures ».
2. Le président et le secrétaire reçoivent une notification 🔔. Chacun ouvre le PV, le relit et le **signe** au doigt,
   au stylet ou à la souris, aussi sur téléphone. C'est la même zone de signature que pour le visa des paiements
   (`src/components/SignaturePad.tsx`).
3. Quand les deux ont signé, le PV est **signé**. Il est archivé dans l'AG (PDF avec les signatures) et le comité est
   notifié. Si une page de dépôt est réglée, elle s'ouvre, comme pour le PV du comité.
4. **Corrections.** Le président peut **demander une correction**, avec un message ; le secrétaire peut **corriger le
   PV**. Dans les deux cas, les signatures sont retirées et la version corrigée (version 2) doit être signée à nouveau.
   La version signée d'avant reste dans les archives.

**Signer sur le même appareil**, à la fin de l'AG (la tablette du secrétaire, par exemple) : « Signer ici », à côté du
nom du président. Dans la version réelle, le président tape alors **son mot de passe**, pour prouver que c'est bien lui
qui signe (comme pour le visa des paiements).

**Sécurité, version réelle.** Comme pour le visa des paiements (`supabase/migrations/043_gsa_visa_securise.sql`), le
serveur contrôle les signatures :

- seule la personne qui signe (le président ou le secrétaire du PV) peut poser sa signature ;
- elle doit avoir tapé son mot de passe il y a moins de 10 minutes ;
- la signature porte la date du serveur ;
- un PV signé ne peut plus changer sans que ses signatures soient retirées.

Cela demande une migration, `067`, que le président applique après un essai sur la base de test.

## Les votes : quelle majorité ?

Chaque vote a sa majorité, choisie à la préparation et modifiable pendant l'AG :

- **majorité des voix exprimées** : plus de pour que de contre ; les abstentions ne comptent pas ;
- **majorité absolue des votants** : plus de la moitié des votants comptés en salle ; les abstentions comptent comme des
  non ;
- **deux tiers** des voix exprimées, par exemple pour modifier les statuts.

Le Code civil (art. 67) parle de « la majorité des voix des membres présents », sauf si les statuts disent autre chose.
La **majorité par défaut du club** se règle donc une seule fois, selon les statuts, dans les options du PV de l'AG.

## Les données

Une nouvelle liste du club, **`assemblees`**, avec une fiche par AG (l'événement et sa date ; pour un événement qui se
répète chaque année, une fiche par date). Elle garde :

- l'**ordre du jour** : points, sous-points, textes, documents, votes prévus, textes d'introduction et de fin, version
  écrite à la main, archives ;
- le **PV** : heures, président, secrétaire, scrutateurs, votants, invités, notes, résultats des votes, présents,
  excusés, options, signatures, versions, archives.

Sur le serveur, elle s'enregistre comme les autres listes (une ligne par fiche), donc **sans nouvelle table**. Seule la
protection des signatures demande une migration (étape AG6).

**Rien ne change pour le comité** : l'ordre du jour et le PV du comité, leurs réglages et leur vue en fenêtres restent
tels quels.

## Étapes

Règles habituelles : publier à la fin de chaque étape, tests Playwright, données fictives seulement. Côté serveur, la
migration est appliquée par le président, et rien n'est déployé sans son accord. Le README et « Comment ça marche ? »
sont mis à jour à chaque étape.

1. **AG1 — Ordre du jour** (démo) : liste `assemblees`, onglet « AG » et son droit, page Ordre du jour (points,
   sous-points, textes, documents, votes prévus, glisser pour changer l'ordre), reprise de l'AG précédente, modèle,
   document, PDF, impression, copie, email, archive, texte modifié à la main. **3 à 5 M.** **Fait le 11.11.2026**
   (`src/pages/OrdreDuJourAg.tsx`, `src/data/assemblee.ts`, `tests/assemblee.spec.ts`). La liste `assemblees` passe
   déjà par le serveur comme les autres listes : rien à y faire pour l'ordre du jour.
2. **AG2 — PV : prise de notes et votes** : séance (heures, président, secrétaire, scrutateurs, votants, invités), notes
   par point et Divers, votes et résultats, barre d'outils, document du PV, options, PDF, impression, copie, email,
   dépôt. **4 à 6 M.**
3. **AG3 — Vue en 3 fenêtres** : le cadre des fenêtres est sorti de `FichePv.tsx` pour servir aux deux PV (sans rien
   changer pour le comité) ; onglets de l'AG ; vote en grand au beamer. **2 à 3 M.**
4. **AG4 — Liste de présence après coup** : liste du club, recherche, présent ou excusé, personnes hors liste, limite à
   une étiquette, annexe du PV. **1 à 2 M.**
5. **AG5 — Signatures** (démo) : valider et faire signer, signer, demander une correction, versions, archive signée,
   notifications. **1,5 à 2,5 M.**
6. **AG6 — Serveur** : migration `067` (signatures protégées, mot de passe redemandé), essais sur la base de test (la
   liste `assemblees` passe déjà par le serveur depuis AG1). **1 à 2,5 M.**

**Total : 13 à 21 M tokens** (ordre de grandeur, contexte relu compris). Les étapes 1 et 2 suffisent pour tenir une
première AG ; les étapes 3 à 6 peuvent suivre.

Fichiers principaux : `src/data/types.ts` ; `src/data/assemblee.ts` (nouveau : reprise, modèle, votes, majorités,
textes) ; `src/pages/OrdreDuJourAg.tsx` et `src/pages/PvAg.tsx` (nouveaux) ; `src/components/FicheAg.tsx`,
`src/components/Fenetres.tsx` (cadre commun aux deux PV), `src/components/PresencesAg.tsx`,
`src/components/SignaturesPv.tsx` ; `src/data/navigation.ts`, `src/App.tsx`, `src/data/cloud.ts` ;
`src/pages/Aide.tsx`, `README.md`, `tests/demo.spec.ts` ; `supabase/migrations/067_gsa_ag_signatures.sql`.

## À confirmer

1. ~~Une rubrique à part, ou deux pages de plus dans « Comité » ?~~ **Décidé le 11.11.2026** : un onglet à part, « AG »,
   avec son propre droit dans la console admin.
2. **L'AG est l'événement de l'agenda** (type « Assemblée générale »), comme dans la démo. Je propose de retirer la
   case « Assemblée générale » de la fiche d'une **séance**, pour qu'une séance reste une séance du comité. Les séances
   déjà cochées resteraient lues par la chronologie. D'accord ?
3. **Votes à main levée, en nombres** (pour, contre, abstention), notés par le secrétaire : c'est bien ce que tu
   imagines ? Ou pensais-tu à un **vote dans l'appli**, chacun sur son téléphone (seulement pour ceux qui ont un
   compte) ?
4. **Majorité par défaut** : que disent les statuts du club (voix exprimées, ou membres présents) ?
5. **Liste de présence** : toutes les personnes du club, ou seulement une étiquette (les membres de l'association) ?
   Les présents nommés dans le PV, ou seulement en annexe ?
6. **Signatures** : chacun depuis son compte, et aussi sur la tablette du secrétaire à la fin de l'AG (avec le mot de
   passe de celui qui signe) ?
7. **Convocation par email aux membres** : utile, ou la convocation part autrement (courrier, site du club) ?
8. **Points pour le comité** depuis le PV de l'AG : utiles dès le début, ou plus tard ?
