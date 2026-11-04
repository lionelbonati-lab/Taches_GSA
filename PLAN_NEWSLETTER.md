# Plan : la newsletter du mois

## Demandes du président (04.11.2026)

1. *On fait une newsletter chaque mois. On doit pouvoir y rattacher des infos, pour que la personne qui la prépare les
   ait chaque mois. Quand on planifie un événement, on doit pouvoir mettre une communication pour la newsletter. La
   newsletter doit apparaître dans l'agenda, comme un événement.*
2. *Beaucoup plus simple : la personne voit les points rattachés à la newsletter et la liste de leurs remarques.* Le
   texte de l'info est la remarque du point. Il faut un bouton sur les événements. Les points de la newsletter peuvent
   figurer à l'ordre du jour.
3. *Un bouton en haut, à côté de « Nouvel événement », d'une autre couleur. La liste des newsletters ne doit pas se
   mélanger à celle des événements.*
4. *Une newsletter peut contenir plusieurs points ou plusieurs événements différents. La newsletter n'est rien de plus
   qu'un point auquel on rattache d'autres points : des informations, des points de groupes ou d'événements différents.
   Pour simplifier la tâche de celui qui fait la newsletter, on peut rassembler les remarques des points rattachés dans
   la remarque de la newsletter.*

Les versions 1 à 3 faisaient de la newsletter un événement qui revient chaque mois. La version 4 les remplace : la
newsletter est un point.

## Ce qui est en place (version 4)

- **La newsletter est un point**, rangé dans « Communication › Newsletter ». Il revient chaque mois (répétition
  « Chaque mois ») et porte le champ `newsletter` (`src/data/newsletter.ts`).
- **Bouton orange « Newsletter »** en haut de Agenda › Événements, à côté de « + Nouvel événement ». Il ouvre la
  newsletter en cours : le point `newsletter` pas encore terminé au délai le plus proche. S'il n'y en a pas, il en crée
  une : « Newsletter », pour le 1er du mois prochain, chaque mois.
- **Y rattacher des infos** : dans n'importe quel point, « Point principal » › Newsletter. Ou, depuis la newsletter,
  « + Nouveau point rattaché » ou « Rattacher un point existant ». Le texte de l'info est la **remarque** du point.
- **Bouton « Newsletter » sur la carte d'un événement à venir** (s'il y a une newsletter en cours). Il ouvre un point
  déjà rempli :
  - titre « Newsletter : … » ;
  - remarque avec la date, l'heure, le lieu et la description de l'événement ;
  - rangé chez l'événement : place de son étiquette ou sa sous-section, sinon « Communication › Newsletter » ;
  - rattaché à l'événement **et** à la newsletter ;
  - son délai est celui de la newsletter, avec un avertissement si elle paraît après l'événement.
- **« Rassembler leurs remarques »**, dans la fiche de la newsletter et de tout point qui a des points rattachés.
  - Il reprend, dans sa remarque, le titre, la remarque et les liens de chaque point rattaché, dans l'ordre des
    sections et sous-sections. On obtient le texte de la newsletter, prêt à copier.
  - Il faut ensuite enregistrer le point.
  - Une remarque déjà écrite n'est remplacée qu'après confirmation.
- **Newsletter envoyée** : on la passe à « Terminé ». Celle du mois suivant est alors créée, **sans** les remarques
  rassemblées ni les documents. Les points rattachés restent avec celle qui est partie.
- **Agenda** : la newsletter est un point en orange, à son délai, comme un événement. Elle est montrée même dans
  « Mes points » à qui la voit.
- **Ordre du jour** : la newsletter et ses points y figurent comme les autres points (décision du 04.11.2026).
- **Chronologie d'un événement qui se répète** : ‹ › à côté de la date passent à la date précédente ou suivante.
  Cela reste de la version 3.
- **Rien sur le serveur** : `newsletter` est un champ du point, sans migration ni déploiement.

## À savoir

- **Rattachement à un seul niveau.** Un point qui a déjà un point principal, ou qui a lui-même des points rattachés,
  ne peut pas être rattaché à la newsletter. Il faut alors créer un point d'info à part (« + Nouveau point rattaché »).
- **Il faut voir la newsletter pour s'y rattacher.** Qui ne voit pas son point (rôle sans « Voir toutes les tâches »)
  ne peut pas s'y rattacher. Le mettre « Pour info » sur la newsletter le lui permet.
- **Version réelle** : un événement « Newsletter » créé avec la version 3 (case « Newsletter du club ») redevient un
  événement ordinaire. On peut le supprimer.
- **Démo** : pas de newsletter d'exemple, comme pour les autres points. Le bouton orange la crée.
