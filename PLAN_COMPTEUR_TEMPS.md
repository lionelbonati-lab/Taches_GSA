# Plan : un compteur de temps personnel (indicatif)

Demande du président (11.11.2026) : *compter le temps que chacun passe sur la plateforme, en vue éventuellement d'une
rémunération.* Puis le même jour : *je n'ai pas pensé à la surveillance du travail, ce n'était pas le but. Plus simple :
un compteur propre à chacun, qui reste indicatif, sans rémunération. On l'enclenche et on l'éteint à la main, avec de
petits boutons pour ajouter du temps. On peut même envisager un mode automatique optionnel.*

> **Décisions du président (11.11.2026)** : le bouton ⏱ dans la barre du haut ; le mode automatique compte tout seul ;
> le libellé « Sur quoi ? » est gardé, facultatif ; les boutons +5, +15, +30 min, +1 h et −5 min ; chacun active le
> compteur s'il le veut. Pas de raccourci sur l'icône de l'appli installée (la liste des raccourcis est déjà pleine).
>
> **Fait le 11.11.2026 : étapes C1 à C4** (README, « Mon compteur de temps » ; migration 067 appliquée par le président
> le même jour, SUPABASE_SETUP.md). C5 n'est pas fait : pas de raccourci (décision ci-dessus), et le bloc d'accueil reste à décider.
>
> La première version de ce plan (temps mesuré par le serveur, heures validées et payées) est écartée : voir « Ce qui a
> été écarté », à la fin.

## Le principe

- **Un chronomètre à soi**, pour noter le temps qu'on donne au club, dans l'appli **et en dehors** (téléphoner,
  préparer une course, monter les tentes) : on le lance, on fait son travail, on l'arrête.
- **Indicatif** : pour soi, sans validation ni paiement. **Personne d'autre ne le voit, admins compris.** Ce n'est ni
  un pointage, ni une feuille d'heures.
- **Facultatif** : il n'apparaît que pour ceux qui l'activent (Réglages › « Mon compteur de temps »). Sinon, rien
  n'est compté.
- **Mode automatique** en option, éteint par défaut : il compte le temps pendant lequel on utilise l'appli.

## 1. Le compteur

**Où** : une fois le compteur activé, un bouton **⏱** apparaît dans la barre du haut, à côté de la cloche (sur
ordinateur comme sur téléphone). Compteur arrêté : ⏱ seul. Compteur en marche : **⏱ 0:42**, en couleur, et le temps
avance.

**Le panneau**, qui s'ouvre d'un clic sur ⏱ :

```
⏱ 0:42 · depuis 14h05                         [ ■ Arrêter ]
Ajouter à aujourd'hui :  [+5 min] [+15 min] [+30 min] [+1 h] [−5 min]
Sur quoi ?  [ Préparation course de côte ▾ ]   (facultatif)
Aujourd'hui 1 h 25 · Cette semaine 6 h 10 · Ce mois 18 h 40
Voir le détail →
```

- **▶ Démarrer / ■ Arrêter**, et rien d'autre. À l'arrêt, la séance est notée (« 14h05 – 14h47, 42 min »).
- **Le compteur tourne même quand l'appli est fermée** : il retient l'heure de départ, pas un décompte. On peut le
  lancer sur son téléphone, fermer l'appli, passer ses coups de fil et l'arrêter depuis son ordinateur. C'est le même
  compteur sur tous ses appareils.
- **Les petits boutons** : +5 min, +15 min, +30 min et +1 h ajoutent du temps à aujourd'hui (pour le travail fait sans
  avoir lancé le compteur) ; −5 min corrige (le total du jour ne descend jamais sous zéro). Chaque ajout est noté et
  peut être retiré. « Pour un autre jour… » ajoute du temps à une date passée.
- **Sur quoi ?** (facultatif) : quelques mots, choisis parmi ses derniers libellés ou tapés. Le libellé sert au
  détail ; on peut l'ignorer.
- **Compteur oublié** : s'il tourne depuis plus de 4 h (durée réglable), un message s'affiche à l'ouverture suivante :
  « Le compteur tourne depuis 14h05 (5 h 20). [Arrêter maintenant] [Arrêter à …] [Continuer] ».

## 2. Le mode automatique (optionnel)

C'est possible, et simple :

- **Éteint par défaut** : chacun l'allume soi-même (Réglages › Mon compteur de temps › « Compter automatiquement mon
  temps dans l'appli »).
- Il compte le temps pendant lequel l'appli est **à l'écran et utilisée**, c'est-à-dire avec un geste (clic, touche,
  défilement) dans les 2 dernières minutes. Une appli oubliée ouverte ne compte pas.
- **Pas de double compte** : quand le compteur manuel tourne, le temps automatique se confond avec lui, et une minute
  ne compte qu'une fois. De même pour deux appareils ouverts en même temps.
- Dans le détail, on distingue « ⏱ compteur », « ＋ ajouté » et « ⚡ automatique » ; le total les additionne.
- Limite : il ne voit que l'appli. Le travail fait ailleurs se note avec le compteur ou les petits boutons.

Variante possible (question 2) : au lieu de compter tout seul, le mode automatique **propose** de compter (« 35 min
dans l'appli aujourd'hui sans compteur : les ajouter ? »). C'est plus discret, et chacun garde la main.

## 3. Le détail : « Mon temps »

Une page à soi (panneau ⏱ › « Voir le détail », ou Réglages) :

- **Totaux** : aujourd'hui, cette semaine, ce mois, cette année, avec une petite barre par jour (semaine), par
  semaine (mois) ou par mois (année).
- **Liste par jour** : chaque séance du compteur et chaque ajout, avec leur libellé. On peut corriger l'heure de début
  ou de fin (le jour et les minutes d'un ajout), changer le libellé ou retirer une entrée. Le temps automatique du jour
  tient en une ligne (hors compteur), qu'on peut retirer.
- **Par libellé**, si on en met (« Préparation course de côte : 6 h 30 »).
- **Exporter (CSV)**, pour soi : tableur, ou bilan de son bénévolat si on veut le transmettre soi-même.
- **Tout effacer** : tout son historique d'un coup, après confirmation.

En option (question 4) : un bloc **« ⏱ Mon temps »** sur l'accueil (aujourd'hui, la semaine, un bouton Démarrer), à
placer ou masquer comme les autres blocs. Pas de raccourci sur l'icône de l'appli installée : la liste est déjà pleine
(décision du 11.11.2026).

## 4. Qui voit quoi

- **Personne d'autre que soi**, admins et super-admins compris. Il n'y a ni page « temps du club », ni total par
  personne.
- Aucun droit à régler dans la console admin : chacun l'active ou non pour soi.
- Si un jour le club veut un total du bénévolat (rapport annuel, subventions), chacun pourrait choisir de **partager
  son total** (un chiffre par saison), jamais le détail. Ce n'est pas prévu dans ce plan.

## 5. Comment ce serait construit

- **Les données** : des entrées à soi. Ce sont les séances du compteur (début, fin), les ajouts (date, minutes) et le
  temps automatique (début, fin), chacun avec un libellé facultatif, plus le compteur en cours (heure de départ). Le
  total d'un jour réunit les plages du compteur et du mode automatique (une minute ne compte qu'une fois), puis ajoute
  les ajouts.
- **Démo** : tout est gardé dans le navigateur, par personne.
- **Version réelle** : **une table à part sur le serveur** (`gsa_temps`), où chacun ne lit et n'écrit que ses propres
  lignes. C'est la règle du serveur, admins compris. On ne passe pas par les données partagées du club (`gsa_items`) :
  le serveur y laisse les réglages de chacun (`prefs`) lisibles par les autres membres, même si l'appli ne les montre
  pas. La migration 067 n'ajoute que la table et sa règle d'accès, sans toucher aux données existantes. Quand un compte
  est supprimé, ses lignes partent avec lui.
- **Hors ligne** : Démarrer, Arrêter et les ajouts marchent sans réseau. Ils sont gardés sur l'appareil et envoyés au
  retour du réseau, comme le reste de l'appli.
- **Hors du reste de l'appli** : rien dans le journal d'activité, ni dans l'historique, ni dans « Annuler » (le
  compteur a ses propres corrections), ni dans la sauvegarde du club (ce sont des données personnelles ; l'export CSV
  sert de sauvegarde à soi).
- **Code** :
  - un module `src/data/compteur.ts` : totaux, réunion des plages, compteur oublié, mode automatique ;
  - un composant `src/components/Compteur.tsx` : le bouton ⏱ et son panneau, dans la barre du haut (`Layout`) ;
  - la page « Mon temps » et la case dans Réglages ;
  - des tests de la démo : démarrer, arrêter, +15 min, mode automatique sans double compte, appli rechargée.

## Étapes

| Étape | Contenu | Taille |
| --- | --- | --- |
| **C1** ✅ | Compteur manuel : ⏱ dans la barre du haut, Démarrer / Arrêter, petits boutons, compteur oublié, totaux du jour et de la semaine ; activation dans Réglages. Démo. | Petite |
| **C2** ✅ | Page « Mon temps » : liste par jour, corrections, libellés, totaux, export CSV, tout effacer. Démo. | Petite |
| **C3** ✅ | Version réelle : table `gsa_temps` (chacun ses lignes), même compteur sur tous ses appareils, hors ligne. | Petite à moyenne |
| **C4** ✅ | Mode automatique, optionnel et éteint par défaut, sans double compte. | Petite |
| **C5** (option) | Bloc d'accueil « ⏱ Mon temps » (à décider) ; pas de raccourci (liste pleine). | Petite |

C1 et C2 se font d'abord dans la démo, pour essayer. C3 suit pour la version réelle.

## Questions (réponses du 11.11.2026)

1. **Le bouton ⏱** : dans la barre du haut, à côté de la cloche (proposé), ou seulement sur l'accueil ? **Barre du haut.**
2. **Le mode automatique** : il compte tout seul (proposé, puisqu'il est optionnel), ou il propose seulement d'ajouter
   le temps passé dans l'appli ? **Il compte tout seul.**
3. **Le libellé « Sur quoi ? »** : le garder facultatif (proposé), ou s'en passer pour rester le plus simple possible ?
   **Gardé, facultatif.**
4. **Le bloc d'accueil et le raccourci** (C5) : à faire, ou pas ? **Pas de raccourci (liste déjà pleine) ; le bloc
   d'accueil reste à décider.**
5. **Les boutons d'ajout** : +5, +15, +30 min, +1 h et −5 min (proposé), ou d'autres valeurs ? **Oui.**
6. **Pour tout le monde** : chacun l'active s'il le veut (proposé), ou un admin peut aussi le cacher pour tout le club ?
   **Chacun l'active s'il le veut.**

## Ce qui a été écarté (11.11.2026)

La première version de ce plan (`PLAN_TEMPS_DE_TRAVAIL.md`, commit `2130606`) prévoyait de compter le temps passé dans
l'appli sur le serveur, puis de faire déclarer des heures, validées par le comité et payées par la caisse, en vue d'une
rémunération. Elle est écartée : *ce n'était pas le but*, et un compteur d'activité qui sert à payer revient à
surveiller le travail.

Si l'idée d'une rémunération revient, la piste notée était la suivante : payer des heures déclarées et validées (pas le
temps mesuré), par le circuit de la caisse. Il faudrait d'abord vérifier :

- l'AVS (salaires jusqu'à 2 500 fr. par an et par employeur : cotisations seulement à la demande de la personne) ;
- l'assurance accidents et les impôts ;
- les statuts du club ;
- le budget, à voter à l'AG.

Le texte complet reste dans l'historique du dépôt.
