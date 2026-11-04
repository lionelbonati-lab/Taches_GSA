# Plan : la newsletter du mois, avec ses infos, dans l'agenda

Demande du président (04.11.2026) : *on fait une newsletter chaque mois. On doit pouvoir y joindre des infos, pour que
la personne qui la prépare ait tout chaque mois. Quand on planifie un événement, on doit pouvoir mettre une
communication pour la newsletter. La newsletter doit apparaître dans l'agenda, un peu comme un événement.*

Aujourd'hui, « Newsletter » n'est qu'une **sous-section** de la section « Communication » : on peut y ranger des points,
mais rien ne réunit les infos d'un mois ni ne montre la newsletter dans l'agenda.

## En bref

- **La newsletter est un événement de l'agenda qui revient chaque mois** (par exemple le 1er, ou le premier vendredi),
  avec une case **« 📰 Newsletter du club »**. **Chaque occurrence est une édition** (« Newsletter de décembre 2026 »).
  Elle profite ainsi de tout ce qui existe déjà pour les événements : calendrier, export `.ics`, lien d'abonnement,
  accueil, déplacement d'une date, édition supprimée (pas de newsletter en juillet), répétition.
- **Une info pour la newsletter est une « communication »** rattachée à une édition : un titre, un texte, des images,
  des fichiers ou des liens (affiche, inscription), et l'**événement annoncé** s'il y en a un. Tous ceux qui voient les
  événements peuvent en proposer une.
- **Depuis un événement**, un bouton **📰 Annoncer** prépare la communication (nom, date, heure, lieu, description déjà
  remplis) et propose **la dernière édition avant l'événement** dont le bouclage n'est pas passé.
- **La rédaction** (nouveau droit « Préparer la newsletter ») ouvre l'édition du mois. Elle y trouve toutes les infos
  proposées. Elle les retient, les met en ordre, copie le texte prêt à coller dans son outil d'envoi, puis marque
  l'édition comme envoyée.
- **Dans l'agenda** : la newsletter le jour de l'envoi (📰, avec le nombre d'infos) et son **bouclage** quelques jours
  avant (le dernier jour pour proposer une info).

## Pourquoi une « communication » à part, et pas un point ?

L'appli dit qu'un point peut être une simple information. On pourrait donc ranger chaque info dans
« Communication › Newsletter ». Trois raisons de ne pas le faire :

1. **Un point n'est rattaché qu'à un seul événement** (`eventId`). Une communication en vise deux : l'édition de la
   newsletter et l'événement qu'elle annonce.
2. **Tout le monde ne peut pas créer de point dans « Communication »**. Un responsable d'activité membre de l'étiquette
   « Bruntrutaine » range ses points seulement dans la Bruntrutaine (`peutRanger`, `store.tsx`). Or chacun doit pouvoir
   proposer une info.
3. **Les infos rempliraient la liste des points, l'ordre du jour et le PV du comité**, alors qu'elles ne sont pas des
   choses à faire.

Les points de « Communication › Newsletter » restent des points : par exemple « Trouver un nouveau rédacteur ». L'édition
les montre en bas, pour mémoire.

## Ce que l'on voit

**Parcours type**

1. Le président crée l'événement **« Newsletter »** : tous les mois le 1er, case **📰 Newsletter du club** cochée, bouclage
   **7 jours avant**. Dans Rôles et droits, il donne **« Préparer la newsletter »** au rôle de la personne qui la fait.
2. David prépare la **Bruntrutaine du 27.02.2027**. Sur la carte de l'événement, il clique **📰 Annoncer**. La fiche est
   déjà remplie. L'appli propose « Newsletter de février (envoi le 01.02, bouclage le 25.01) ». Si c'est déjà trop tard,
   elle l'avertit : « La prochaine édition paraît après l'événement ». David ajoute l'affiche et le lien d'inscription,
   puis envoie.
3. La rédactrice reçoit une 🔔 « Nouvelle info pour la newsletter de février ». Dans l'agenda, le 25.01 :
   **« Bouclage newsletter »** ; le 01.02 : **« 📰 Newsletter de février · 4 infos »**.
4. Le jour du bouclage, elle ouvre l'édition. Elle retient trois infos et reporte la quatrième au mois suivant. Elle
   les met en ordre, clique **Copier le texte** et colle le texte dans son outil d'envoi. Puis elle clique
   **Marquer comme envoyée**.

**Où on la trouve**

| Endroit | Ce qui change |
|---|---|
| **Agenda › Calendrier** | La newsletter le jour de l'envoi (📰, nombre d'infos) ; le bouclage en repère discret (filtre « Newsletter »). Un clic ouvre l'édition (pas la chronologie). « + » d'un jour : **Proposer une info pour la newsletter**. |
| **Agenda › Newsletter** (nouvelle page) | L'édition en cours, puis les suivantes. Pour chacune : envoi, bouclage (« dans 5 jours »), les infos proposées, et le bouton **+ Proposer une info**. Les éditions passées sont repliées en bas, comme les séances passées. |
| **Agenda › Événements** | Sur chaque carte d'événement, le bouton **📰 Annoncer**, ou « 📰 Annoncé en décembre » s'il l'est déjà. La carte de la newsletter montre la prochaine édition et son nombre d'infos. |
| **Fiche d'un événement** | Case **📰 Newsletter du club** et **bouclage N jours avant** (seulement si l'événement se répète). Pour un nouvel événement : case **« L'annoncer dans la newsletter »**, qui ouvre la fiche de la communication une fois l'événement enregistré. |
| **Accueil** | Bloc **📰 Newsletter**, masquable comme les autres : prochaine édition, bouclage, nombre d'infos, « + Proposer une info ». Pour la rédaction : le nombre d'infos à trier. |
| **Recherche (Ctrl+K)** | Trouve les communications (titre, texte) et ouvre leur édition. |

**Fiche d'une communication** : édition (liste des éditions à venir, la conseillée en tête), titre, texte (même éditeur
que les notes, avec gras, listes et liens), images et fichiers (comme les documents d'un point), événement annoncé
(choix parmi les événements, avec date et lieu repris), mot pour la rédaction. On voit qui l'a proposée et quand.

**L'édition, pour la rédaction**

- Chaque info a un état : **Proposée → Retenue → Publiée**, ou **Pas retenue** (avec un mot à l'auteur), ou **Reportée** à
  l'édition suivante.
- Les infos se rangent avec ▲ ▼ : c'est l'ordre de la newsletter.
- **Copier le texte** : les infos retenues, dans l'ordre, avec titre, texte, date et lieu des événements et liens. En
  texte simple et en HTML, pour coller dans Clubdesk, Mailchimp, Brevo ou un traitement de texte.
- **PDF / Imprimer** (même moteur que l'ordre du jour) : pour relire ou envoyer à un relecteur.
- **Images** : chacune s'ouvre et s'enregistre, ou bien « Tout télécharger ».
- **Marquer comme envoyée** : les infos retenues passent à « Publiée ». Celles qui restent sont proposées pour l'édition
  suivante, après confirmation.
- Si une édition est supprimée (pas de newsletter en juillet), ses infos passent dans l'édition suivante.

**Droits**

| Qui | Voit les éditions et les infos | Propose une info | Modifie une info | Retient, ordonne, publie |
|---|---|---|---|---|
| Ceux qui voient les événements (comité, responsables d'activité, secrétaire…) | oui | oui | les siennes, tant qu'elles ne sont pas publiées | non |
| Rôles avec **« Préparer la newsletter »** (nouveau droit, Rôles et droits) | oui | oui | toutes | oui |
| Admins | oui | oui | toutes | oui |
| Gérer les événements (`events.manage`) | — | — | — | crée ou règle l'événement newsletter |

## Données

```ts
// Événement qui se répète, coché « Newsletter du club » : chaque occurrence est une édition.
interface ClubEvent {
  // … champs actuels …
  newsletter?: { bouclageJours?: number }; // 7 par défaut
}

/** Info proposée pour une édition de la newsletter. */
interface Communication {
  id: string;
  newsletterId: string;          // l'événement newsletter (la série)
  edition?: string;              // AAAA-MM-JJ : l'occurrence ; absente = à placer (édition supprimée)
  titre: string;
  texte: string;                 // texte riche (noteRiche.ts)
  documents?: TaskDoc[];         // images, affiche, liens (files.ts, comme les points)
  eventId?: string;              // événement annoncé
  occurrence?: string;           // … son occurrence, s'il se répète
  etat: 'proposee' | 'retenue' | 'publiee' | 'ecartee';
  ordre?: number;                // ordre dans l'édition
  motRedaction?: string;         // de l'auteur à la rédaction
  reponse?: string;              // de la rédaction à l'auteur (« pas retenue parce que… »)
  par: string; le: string; modifieLe?: string;
}

interface AppData { /* … */ communications?: Communication[] }
// Permission : 'newsletter.rediger'
```

Où brancher le code :

- `src/data/types.ts` : les types ci-dessus et la permission.
- `src/data/newsletter.ts` (nouveau) : éditions d'une newsletter (`occurrencesEntre`), bouclage, édition conseillée pour
  un événement, nom de l'édition (« de décembre 2026 »), texte compilé (texte et HTML).
- `src/data/cloud.ts` : `communications` dans `ARRAY_KINDS`. `pushServeur.ts` : dans `LISTES`, pour les rappels.
- `src/data/series.ts` : déplacer ou supprimer une occurrence, ou couper la série (« celui-ci et les suivants »). Les
  communications suivent leur édition, comme les points qui suivent `delaiRef.occurrence`.
- `src/pages/Calendar.tsx` : éléments `newsletter` et `bouclage`, filtre, clic vers l'édition, « + » du jour.
- `src/pages/Agenda.tsx` : bouton 📰 Annoncer sur les cartes, sous-onglet Newsletter (`navigation.ts`).
- `src/components/EventModal.tsx` : case « Newsletter du club » et bouclage ; « L'annoncer dans la newsletter ».
- Nouveaux composants : `Newsletter.tsx` (page et édition) et `CommunicationModal.tsx` (fiche). On réutilise
  `DocsField`, `ZoneTexte`, `BoutonPdf` et `Modal`.
- Accueil (`Dashboard.tsx`), recherche (`recherche.ts`), notifications (`notifs.ts`), sauvegarde et import
  (`backup.ts`), annuler (via `update`, rien à faire), historique (texte du journal).
- Démo (`seedData.ts`) : un événement « Newsletter » chaque mois, le 1er, avec le bouclage à 7 jours. **Aucune
  communication d'exemple**, comme pour les points.

**Serveur.** `gsa_items` accepte une nouvelle collection sans migration. Tous les membres du club la lisent
(`gsa_ligne_lisible` ne filtre que `tasks`, `emails`, `notifications`, `log`) et peuvent y écrire. Les fichiers vont dans
le dossier du club, comme ceux des points. **`gsa-agenda` lit déjà les événements** : la newsletter est dans les
agendas abonnés sans redéploiement. Seuls le 📰 dans le nom et le bouclage demanderaient de la redéployer (facultatif).
Pour **protéger** les communications (seuls l'auteur, la rédaction et les admins modifient ou suppriment), il faut une
petite migration **067**. Elle est facultative au début : l'appli fait déjà ce contrôle.

## Étapes (une session par étape conseillée)

Règles habituelles : publier à la fin de chaque étape ; tests Playwright (`tests/demo.spec.ts`, `mobile.spec.ts`) ;
données fictives seulement. Côté serveur : migrations appliquées par le président, aucun déploiement sans son accord,
essais d'abord sur la base de test (`outils/base-test/LISEZMOI.md`).

1. **N1 : la newsletter dans l'agenda (démo).** Types, `newsletter.ts`, case « 📰 Newsletter du club » et bouclage dans
   la fiche d'un événement, 📰 et bouclage dans le calendrier (filtre, téléphone compris), carte de la newsletter dans
   Événements, communications qui suivent leur édition (`series.ts`), `cloud.ts`, sauvegarde, démo. **3 à 5 M.**
2. **N2 : proposer une info.** Fiche d'une communication (édition conseillée, avertissement « trop tard », texte, images,
   événement annoncé). On l'ouvre depuis 📰 Annoncer (carte d'événement), « L'annoncer dans la newsletter » (nouvel
   événement), « + » d'un jour de l'agenda et la page Newsletter. Modifier ou retirer la sienne, recherche.
   **3 à 5 M.**
3. **N3 : l'édition pour la rédaction.** Page Agenda › Newsletter (éditions à venir, passées repliées). États, ordre,
   report, mot à l'auteur. Copier le texte (texte et HTML), PDF, images. Marquer comme envoyée. Droit
   « Préparer la newsletter » dans Rôles et droits. **4 à 6 M.**
4. **N4 : rappels et accueil.** 🔔 à la rédaction pour chaque info proposée. Rappel à la rédaction le jour du bouclage
   (« 6 infos à trier »). Rappel aux contributeurs 3 jours avant le bouclage, réglable dans Réglages › Notifications.
   Bouclage dans le résumé du lundi. Bloc 📰 de l'accueil. Notifications sur téléphone : `gsa-push` à redéployer, avec
   accord. **2 à 4 M.**
5. **N5 : version réelle et documentation.** Essai complet sur la base de test (lecture, écriture, fichiers, temps réel,
   abonnement d'agenda). Migration 067 facultative (protection), à appliquer par le président. README (section
   « Newsletter »), « Comment ça marche ? » (`Aide.tsx`), `SUPABASE_SETUP.md`. **1 à 3 M.**

**Total : 13 à 23 M tokens** (ordre de grandeur, contexte relu compris). N1 et N2 suffisent déjà pour le principal :
la newsletter dans l'agenda, et les infos qu'on y joint depuis un événement.

## À confirmer avant de commencer

Ma recommandation est indiquée en premier.

1. **Qui prépare la newsletter ?** Un **droit « Préparer la newsletter »** donné à un rôle (comme les autres droits de
   l'appli), ou une liste de personnes réglée sur l'événement newsletter.
2. **Qui peut proposer une info ?** **Tous ceux qui voient les événements**, ou aussi les membres (rôle « Membre »).
3. **Les infos proposées sont-elles visibles de tous avant l'envoi ?** **Oui, en lecture**, ce qui évite les doublons.
   Ou seulement l'auteur et la rédaction.
4. **Date d'envoi et bouclage par défaut** : **le 1er du mois, bouclage 7 jours avant**, ou un autre rythme (premier
   vendredi…).
5. **Avec quel outil la newsletter est-elle envoyée** (Clubdesk, Mailchimp, Brevo, email…) ? Cela décide du format de
   « Copier le texte ». Le texte simple et le HTML couvrent la plupart des cas.

## Plus tard (hors de ce plan)

- Lier une communication à un point, et ajouter « 📰 Newsletter » dans « Ajouter : » de la fiche d'un point.
- Envoyer la newsletter depuis l'appli (Brevo, Clubdesk), ou en publier une archive en ligne.
- Plusieurs newsletters (par exemple celle de l'école de cyclisme) : le modèle le permet déjà (`newsletterId`), mais il
  faudrait l'écran pour les choisir.
- Point récurrent « Préparer la newsletter », calé quelques jours avant chaque édition, dans les points de la rédaction.
