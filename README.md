# Tâches GSA – démo

Application de démonstration pour gérer les tâches du comité du club.
**Aucune base de données** : les données sont fictives et les modifications sont gardées uniquement dans le navigateur (localStorage). Le bouton « Réinitialiser la démo » (écran de connexion ou Réglages) recharge les données d'origine.

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173 (accessible aussi depuis un téléphone du même réseau)
npm run build      # version statique dans dist/
```

## Comptes de démo (clic sur le nom, sans mot de passe)

| Utilisateur | Poste | Rôle(s) |
|---|---|---|
| Marc Rochat | Président | Admin – tout, y compris la console admin |
| Claire Dubois | Secrétaire | Secrétaire – voit/gère tout sauf la console admin et les listes |
| Julien Meylan | Trésorier | Comité **+** Trésorier (gère toutes les tâches de la section Finances) |
| Sophie, Luca, Emma, Nicolas, Thomas | Membres | Comité – voit tout, ne modifie que ses propres tâches |
| Léa Rey | Bénévole buvette | Bénévole manifestations – ne voit que la section Manifestations |
| Anne Perrin | Ancienne membre | Compte désactivé |

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

⚠️ Les navigateurs n'autorisent l'installation que depuis une adresse **https://** (ou `localhost` sur l'ordinateur qui fait tourner l'appli). Pour tester sur ordinateur : `npm run build && npm run preview` puis ouvrir http://localhost:4173. Pour l'installer sur un téléphone, il faut publier le dossier `dist/` sur un hébergement HTTPS (GitHub Pages, Netlify, Vercel…).

## Pour la suite

Toute la gestion des données est isolée dans `src/data/store.tsx` : c'est le seul fichier à remplacer pour brancher une vraie base (ex. Supabase) avec de vrais comptes.
