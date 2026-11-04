# Plan : la newsletter du mois (version simple)

Demande du président (04.11.2026) : *on fait une newsletter chaque mois. On doit pouvoir y rattacher des infos, pour
que la personne qui la prépare les ait chaque mois. Quand on planifie un événement, on doit pouvoir mettre une
communication pour la newsletter. La newsletter doit apparaître dans l'agenda, comme un événement.*

Précision (04.11.2026) : *quelque chose de beaucoup plus simple. La personne voit les points rattachés à la newsletter
et la liste de leurs remarques.* Une première version de ce plan, plus lourde, est remplacée par celle-ci.

## Le principe

- **La newsletter est un événement** de l'agenda qui revient **tous les mois**. Chaque date est une édition.
- **Une info pour la newsletter est un point** rattaché à cette édition. **Sa remarque est le texte de l'info.**
- **La personne qui prépare la newsletter** ouvre l'édition. Elle voit **la liste des points et de leurs remarques**,
  et peut tout copier d'un clic.

Rien de nouveau dans les données : pas de nouveau type, pas de migration, rien à déployer sur le serveur.

## Ce qui marche déjà aujourd'hui

1. **Créer la newsletter** : Agenda › Événements › **+ Nouvel événement**, nom « Newsletter », Répétition
   **Tous les mois**. Elle est alors dans l'agenda chaque mois, ainsi que dans l'export `.ics` et le lien d'abonnement.
2. **Rattacher une info à une édition** : dans la fiche d'un point, **Pour quand ? › Newsletter**, puis le champ
   **Occurrence** pour choisir l'édition (par exemple le 01.02.2027). Le texte de l'info s'écrit dans la **remarque**.
   Le délai du point devient la date de la newsletter, et il suit cette date si l'édition est déplacée.
3. **Info sur un événement** (la Bruntrutaine, par exemple) : on crée le point **dans la sous-section de l'événement**
   (Événements › Bruntrutaine 27.02.27) et on le cale sur la newsletter de février. Le point garde l'étiquette de la
   Bruntrutaine : l'équipe de l'événement le voit, et il figure dans la chronologie de l'événement. Il est aussi
   rattaché à la newsletter.
4. **Que la personne de la newsletter voie tous ces points** : si son rôle ne voit pas tous les points, on lui donne
   l'**étiquette** de l'événement Newsletter (case « Étiquette » de sa fiche, avec elle comme membre). Les points
   rattachés à la newsletter reçoivent cette étiquette d'office.

## Ce qu'il faut ajouter

### 1. La liste des remarques d'une édition (l'essentiel)

Un clic sur la newsletter (dans l'agenda, ou sur sa carte dans Événements) ouvre déjà sa **chronologie**. On y ajoute
un bouton **« Remarques »** qui montre, pour **cette édition seulement** :

- chaque point : son **titre**, puis sa **remarque** en entier, ses fichiers et liens (images, affiche…) et qui l'a
  proposé ;
- les points sont dans l'ordre de la liste des points (section, sous-section) ;
- un bouton **Copier**, qui copie tous les titres et toutes les remarques, prêts à coller dans l'outil d'envoi ;
- un bouton **Imprimer / PDF**.

Les points d'une édition sont ceux calés sur cette date (Occurrence). Ceux qui sont rattachés à la newsletter avec
une date fixe vont dans l'édition qui suit leur délai.

Ce bouton marche pour **tout événement**, pas seulement la newsletter : par exemple pour relire d'un coup les remarques
des points de la Bruntrutaine.

Fichiers : `src/components/Chronologie.tsx` (bouton, points de l'occurrence) et un petit composant pour la liste ;
`tests/demo.spec.ts`.

### 2. Raccourci depuis un événement (facultatif)

Sur la carte d'un événement (Agenda › Événements), un bouton **📰 Newsletter** ouvre un **nouveau point déjà rempli** :

- titre « Newsletter : Bruntrutaine » ;
- rangé dans la sous-section de l'événement ;
- calé sur **la dernière édition avant l'événement** ;
- remarque préremplie avec la date, l'heure et le lieu de l'événement.

On complète la remarque et on enregistre. Sans ce raccourci, on fait la même chose avec un point ordinaire (voir
« Ce qui marche déjà », point 3).

Fichier : `src/pages/Agenda.tsx` (carte d'un événement).

### 3. Démo et aide

- Démo (`seedData.ts`) : un événement « Newsletter » tous les mois, le 1er. Pas de point d'exemple, comme d'habitude.
- README et « Comment ça marche ? » (`Aide.tsx`) : quelques lignes « Newsletter ».

## À savoir

- Ces points sont des points comme les autres. Avec un délai proche d'une séance, ils figurent aussi à l'**ordre du
  jour**. Si on ne le veut pas, il faudra en reparler : par exemple, ne pas mettre à l'ordre du jour les points
  rattachés à la newsletter.
- Une fois la newsletter envoyée, la personne passe les points à **Terminé**, et l'édition suivante repart vide.
- Un mois sans newsletter : on supprime cette date-là (« Cet événement »). Les points de cette édition perdent leur
  lien et gardent leur délai : il faut les recaler sur l'édition suivante.

## Étapes

Une seule session suffit pour 1 et 3 ; le raccourci (2) peut suivre dans la même session ou plus tard. Règles
habituelles : publier à la fin, tests Playwright, données fictives seulement. **Environ 1 à 2 M tokens** en tout.

## À confirmer

1. **Le texte de l'info dans la remarque du point** : est-ce bien ce que tu imagines ?
2. **Le raccourci 📰 depuis un événement** (partie 2) : le faire maintenant, ou attendre de voir à l'usage ?
3. **Les points de la newsletter à l'ordre du jour** : ça te va, ou il faut les en retirer ?
