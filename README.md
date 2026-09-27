# Tâches GSA – démo

👉 **Version en ligne : https://lionelbonati-lab.github.io/Taches_GSA/** (installable sur ordinateur et téléphone)

Application de démonstration pour gérer les tâches du comité du club.
**Aucune base de données** : les données sont fictives et les modifications sont gardées uniquement dans le navigateur (localStorage). Le bouton « Réinitialiser la démo » (écran de connexion ou Réglages) recharge les données d'origine.

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173 (accessible aussi depuis un téléphone du même réseau)
npm run build      # version statique dans dist/
```

## Données et comptes de démo

Les données de départ viennent du tableau **« Suivi des tâches » du G.S. Ajoie** (108 tâches, 12 sections, séances de comité 2026-27, événements du club). Les délais en formule du tableau (`=Comité_3+7`, `=AG_2027`) sont devenus des **délais liés** à la séance / l'AG, et les responsables en formule (`=Caissier`, `=Secretaire`) servent à l'**attribution par poste** des tâches annuelles.

Le site étant public : prénoms + initiale du nom uniquement, noms de tiers masqués (démissions, radiations, relances, remboursements), emails fictifs (`@gsajoie.example`), pas de téléphones.

Connexion par simple clic sur un nom (sans mot de passe) :

| Qui | Rôle(s) |
|---|---|
| Lionel B. (Président) | Admin – tout, dont la console admin et l'Ordre du jour |
| Maxime R. (Secrétaire) | Secrétaire – voit/gère tout sauf console admin, listes et Ordre du jour |
| Marie-France J. (Caissier) | Comité **+** Caissier (gère toutes les tâches de Comptabilité) |
| Damien, Christophe, Ismaël, Noah, Stéphanie | Comité – voit tout, modifie ses propres tâches |
| Dieter, Clément, Christian, Romain, Heinz, Sarah, Jérôme, Aude, Mèg, Alphonse | Responsable d'activité – uniquement ses propres tâches |

## Rôles et permissions

Tout se règle dans **Console admin → Rôles & permissions**, sans toucher au code :

- **Créer un rôle** (vide ou copie d'un rôle existant), le renommer, changer sa couleur, le dupliquer, le supprimer (une fois retiré à tout le monde).
- **Cocher les droits** de chaque rôle : tâches (voir toutes, créer/assigner, modifier toutes, modifier les siennes, supprimer), onglets visibles (Comité, Événements, Responsables), gestion (séances, événements, responsables), administration.
- **Limiter un rôle à certaines sections** : ses droits « Tâches » ne s'appliquent alors qu'à ces sections.
- **Cumuler plusieurs rôles** par personne (onglet Utilisateurs) : chaque rôle apporte ses droits sur ses propres sections.
- Garde-fous : le rôle Admin est verrouillé, chacun garde au moins un rôle, il reste toujours un admin actif.

## Onglets

- **Accueil** : mes tâches en retard, échéances à 7 jours, prochaine séance, avancement des événements.
- **Tâches** : section, sous-section, tâche, responsable(s), statut, délai, remarque, checklist ; « Mes tâches / Toutes », filtres, tri, vue tableau ou kanban (glisser-déposer), export CSV, impression.
- **Comité** : séances (date, lieu, ordre du jour, notes/PV) et tâches liées.
- **Événements** : événements du club, avancement des tâches liées.
- **Responsables** : poste, nom, prénom, email, portable (liens mail / appel).
- **Réglages** : thème clair/sombre, vue par défaut.
- **Console admin** : rôles, activation des comptes, matrice de permissions, sections/sous-sections, statuts, journal d'activité.

## Délais liés à un événement

Dans une tâche, le champ **Délai** propose « Date fixe » ou directement la liste des prochains événements et séances de comité, puis **Quand ?** (le jour même, la veille, 1 semaine avant, 1 mois avant, le lendemain…).
Le délai **suit ensuite automatiquement** la date : si le tournoi est déplacé d'une semaine, toutes ses tâches liées bougent avec lui. Repère 🔗 dans les listes (le survol indique la référence), filtre « Délai lié » dans Tâches.

## Tâches récurrentes

Champ **Répétition** d'une tâche : chaque semaine, mois, trimestre, semestre ou année (repère 🔁, filtre « Tâches récurrentes »).
Quand la tâche passe à un statut de clôture (« Terminé »), la suivante est **créée automatiquement** avec le délai décalé, le statut « À faire » et la checklist remise à zéro. Elle est attribuée **au poste** (ex. Trésorier) : si le titulaire a changé entre-temps, elle va à son successeur. Une tâche rouverte puis refermée ne crée pas de doublon.

## Ordre du jour

Onglet **📝 Ordre du jour** (droit « Onglet Ordre du jour », donné au Président ; attribuable à d'autres rôles dans la console admin). Il prépare le document A4 de la **prochaine séance**, sur le modèle des ordres du jour du club :

- en-tête : séance, date, heure de début, lieu, **convoqués** (avec initiales) et tableau **Présent / Excusé** à cocher ;
- points particuliers saisis dans la séance (onglet Comité) ;
- **toutes les tâches sous chaque section**, dans l'ordre des sous-sections : en retard, à faire pour la séance, pour la séance suivante et terminées depuis la séance précédente, ensemble ; colonne **« Pour »** (⚠ Retard, Comité 5, Comité 6, ✓ Fait) ; sections sans tâche affichées « Rien à signaler » ;
- colonne vide « Suivi / décision », cadre de notes, prochaine séance en pied de page.

Réglages (mémorisés) : séances, éléments inclus, regroupement (section, responsable, aucun) et tri, option « Séparer par échéance » (retards / séance / suivante / terminées en parties distinctes), colonnes, statuts et sections inclus, titre, nom du club, orientation, taille du texte.
Actions : **Imprimer / PDF**, **Archiver dans la séance** (copie figée consultable et réimprimable dans l'onglet Comité), **Envoyer par email** aux membres du comité, **Copier le texte** (pour WhatsApp, Word…).

## Notifications (démo)

Cloche 🔔 dans l'en-tête (ordinateur et mobile), avec pastille du nombre de notifications non lues :

- 🆕 une tâche t'est attribuée par quelqu'un d'autre ;
- ✏️ une de tes tâches est modifiée par quelqu'un d'autre (statut, délai, contenu) ; 🔁 tâche récurrente reconduite ;
- ⏰ échéance proche (le jour même à 14 jours avant, réglable) ;
- ⚠️ résumé quotidien de tes tâches en retard ;
- 🗓️ prochaine séance de comité (et « ordre du jour disponible » s'il a été archivé).

Un clic ouvre directement la tâche (ou la liste filtrée / l'onglet Comité). Réglages → Notifications : choix des types, délais de prévenance, et **notifications de l'appareil** (téléphone / ordinateur, après autorisation) avec un bouton de test.

Limite de la démo : sans serveur, les notifications sont calculées dans le navigateur et celles de l'appareil ne partent qu'à l'ouverture de l'appli. La version réelle (base partagée + serveur) pourra les envoyer application fermée, y compris sur iPhone une fois l'appli installée.

## Mobile et installation (PWA)

Sous 768 px : barre de navigation en bas, tâches en cartes avec changement de statut d'un tap, bouton **+** pour l'ajout rapide.

L'application peut s'installer comme une vraie appli (icône, fenêtre dédiée, fonctionne hors connexion) via le bouton **📲 Installer l'application** (en-tête, menu « Plus » sur mobile, ou Réglages → Application) :

| Appareil | Comment |
|---|---|
| Ordinateur – Chrome / Edge | Bouton « Installer l'application » ou icône d'installation dans la barre d'adresse |
| Mac – Safari | Fichier › Ajouter au Dock |
| Android – Chrome | Bouton « Installer l'application » ou menu ⋮ › Installer l'application |
| iPhone / iPad – Safari | Bouton Partager › Sur l'écran d'accueil |

Un appui long (ou clic droit) sur l'icône installée propose les raccourcis **Nouvelle tâche** et **Mes tâches**.

L'installation n'est possible que depuis une adresse **https://** : utilise la version en ligne ci-dessus (ou `npm run build && npm run preview` puis http://localhost:4173 sur l'ordinateur qui fait tourner l'appli).

## Publication (GitHub Pages)

Le workflow `.github/workflows/deploy-pages.yml` construit et publie l'application à chaque push sur la branche principale ; on peut aussi le relancer à la main (onglet **Actions › Publication GitHub Pages › Run workflow**). L'application installée se met à jour d'elle-même au lancement suivant.

Réglages GitHub nécessaires (une seule fois) :
1. **Settings › General › Danger Zone › Change visibility › Public** (Pages n'est pas disponible sur un dépôt privé avec un compte gratuit).
2. **Settings › Pages › Build and deployment › Source : GitHub Actions**.

## Pour la suite

Toute la gestion des données est isolée dans `src/data/store.tsx` : c'est le seul fichier à remplacer pour brancher une vraie base (ex. Supabase) avec de vrais comptes.
