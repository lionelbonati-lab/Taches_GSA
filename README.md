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

| Utilisateur | Poste | Rôle |
|---|---|---|
| Marc Rochat | Président | Admin – tout, y compris la console admin |
| Claire Dubois | Secrétaire | Secrétaire – voit/gère tout sauf la console admin et les listes |
| Sophie, Julien, Luca, Emma, Nicolas, Thomas | Membres | Comité – voit tout, ne modifie que ses propres tâches |
| Anne Perrin | Ancienne membre | Compte désactivé |

Les droits de chaque rôle sont modifiables dans **Console admin → Permissions**.

## Onglets

- **Accueil** : mes tâches en retard, échéances à 7 jours, prochaine séance, avancement des événements.
- **Tâches** : section, sous-section, tâche, responsable(s), statut, délai, remarque, checklist ; « Mes tâches / Toutes », filtres, tri, vue tableau ou kanban (glisser-déposer), export CSV, impression.
- **Comité** : séances (date, lieu, ordre du jour, notes/PV) et tâches liées.
- **Événements** : événements du club, avancement des tâches liées.
- **Responsables** : poste, nom, prénom, email, portable (liens mail / appel).
- **Réglages** : thème clair/sombre, vue par défaut.
- **Console admin** : rôles, activation des comptes, matrice de permissions, sections/sous-sections, statuts, journal d'activité.

## Mobile

Sous 768 px : barre de navigation en bas, tâches en cartes avec changement de statut d'un tap, bouton **+** pour l'ajout rapide. Installable sur l'écran d'accueil (PWA) une fois servie en HTTPS.

## Pour la suite

Toute la gestion des données est isolée dans `src/data/store.tsx` : c'est le seul fichier à remplacer pour brancher une vraie base (ex. Supabase) avec de vrais comptes.
