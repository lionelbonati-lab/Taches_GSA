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

Les données de départ viennent du tableau **« Suivi des tâches » du G.S. Ajoie** (12 sections, séances de comité 2026-27, événements du club). Seules les lignes à partir du 01.09.2026 sont reprises (63 lignes) ; les lignes sans délai sont conservées, sauf celles d'événements antérieurs.

- **Une sous-section présente plusieurs fois devient une tâche principale** (du nom de la sous-section, ex. « AG 13.03.2027 », « Prochain comité », « Newsletter ») et **chaque ligne devient une tâche liée** avec tout ce qu'elle avait dans le tableau : responsable(s), délai (lié à la séance si c'était une formule), statut, remarque, répétition. Résultat : 74 tâches, dont 11 tâches principales et 36 tâches liées.
- **Statuts simplifiés** : À faire, En cours, En attente, Terminé, Annulé (« A valider » → En cours, « A discuter » → À faire, « Sans nouvelles » → En attente, « OK » et « Info » → Terminé). La liste reste modifiable dans la console admin.
- Les données déjà enregistrées dans le navigateur sont mises à niveau automatiquement : tâches du tableau remplacées, tâches créées dans l'appli gardées (statut converti), sondages / emails / PV rattachés à la tâche regroupée. Les délais en formule du tableau (`=Comité_3+7`, `=AG_2027`) sont devenus des **délais liés** à la séance / l'AG, et les responsables en formule (`=Caissier`, `=Secretaire`) servent à l'**attribution par poste** des tâches annuelles.

Le site étant public : prénoms + initiale du nom uniquement, noms de tiers masqués (démissions, radiations, relances, remboursements), emails fictifs (`@gsajoie.example`), pas de téléphones.

Connexion par simple clic sur un nom (sans mot de passe) :

| Qui | Rôle(s) |
|---|---|
| Lionel B. (Président) | Admin – tout, dont la console admin et l'Ordre du jour |
| Maxime R. (Secrétaire) | Secrétaire – voit/gère tout sauf console admin, listes et Ordre du jour ; tient le **PV** |
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

- **Accueil** : compteurs de mes tâches par statut (**un clic ouvre la liste filtrée**, « En retard » compris), mes tâches en retard, échéances à 7 jours, emails à envoyer, prochaine séance, avancement des événements.
- **Tâches** : section, sous-section, tâche, responsable(s), statut, délai, remarque, tâche principale / tâches liées, sous-tâches ; « Mes tâches / Toutes », filtres, tri, vue tableau ou kanban (glisser-déposer), export CSV, impression.
- **Agenda** : vue **mensuelle** (lundi → dimanche) des séances de comité, événements, délais des tâches, fins de sondage ; filtres par type, « Mes tâches / Toutes », tâches terminées au choix. **+** sur chaque jour (ou boutons du panneau du jour) pour **ajouter une séance de comité, une tâche ou un événement** à cette date (selon les droits ; nouvelle séance numérotée d'après la précédente, 19h30). Clic sur un élément pour l'ouvrir ; **glisser-déposer** sur un autre jour pour changer sa date (une séance déplacée entraîne les délais qui lui sont liés). Sur mobile : pastilles de couleur par jour, liste du jour touché en dessous.
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

## Tâches liées et sous-tâches

Une tâche peut être **liée à une tâche principale** (un niveau) : par ex. « AG 13.03.2027 » avec « Reserver le lieu », « Organiser le repas », « Préparer le PowerPoint »… Chaque tâche liée est une tâche à part entière (responsables, délai lié, statut, remarque, documents, sondages, emails, répétition).

- Dans une tâche : champ **Tâche principale** (liste par section) ; une tâche liée affiche en haut « ↳ Tâche liée à … » (clic pour ouvrir la tâche principale).
- Dans une tâche principale : section **Tâches liées** avec avancement (« 3/8 terminées »), statut, responsables et délai de chacune (clic pour l'ouvrir), **+ Nouvelle tâche liée** (section, sous-section et délai repris), **🔗 Lier une tâche existante**, ✕ pour délier (la tâche reste), « Voir dans la liste ».
- Liste des tâches : repères « ↳ tâche principale » et « 🔗 3/8 tâches liées », filtre « Tâche principale » (la tâche et ses tâches liées), filtres « Tâches principales » / « Tâches liées » ; export CSV : colonne « Tâche principale ».
- Ordre du jour : les tâches liées s'affichent sous leur tâche principale ; une tâche principale qui porte le nom de sa sous-section devient la ligne de la sous-section. Onglet PV : tâches liées en retrait sous leur tâche principale.
- Tâche récurrente : l'occurrence suivante d'une tâche liée est rattachée à l'occurrence suivante de sa tâche principale.
- Supprimer une tâche principale garde ses tâches liées (sans tâche principale).

Les **sous-tâches** restent une simple checklist (case à cocher + intitulé), cochables aussi pendant la séance dans l'onglet PV.

## Emails programmés

Dans une tâche, **📧 Programmer un email** : destinataires (responsables cochés par défaut, autres membres, adresses supplémentaires), **quand** (1 mois / 2 semaines / 1 semaine / 3 jours avant le délai, la veille, le jour même, 1 à 7 jours après pour une relance, ou date précise) et heure, objet et message avec champs automatiques ({tâche}, {délai}, {section}, {responsables}, {statut}, {remarque}, {lien}, {expéditeur}) et aperçu. Option « Ne pas envoyer si la tâche est déjà terminée ».

- Un email calé sur le délai **suit le délai** s'il change (y compris un délai lié à un événement).
- États : 🕓 programmé, 📨 à envoyer, ✅ envoyé (date), ⛔ annulé, ✔️ pas envoyé car tâche terminée ; actions Envoyer maintenant, Modifier, Annuler, Reprogrammer, Supprimer. Repère 📧 et filtre « Avec email programmé » dans Tâches.
- Tâche récurrente : les emails sont reconduits avec l'occurrence suivante (destinataires qui suivent le poste).
- Trois exemples programmés par le président (dont un déjà à envoyer).

Limite de la démo : sans serveur, l'appli ne peut pas envoyer d'email elle-même. À l'heure prévue, l'auteur reçoit une notification 🔔 (et de l'appareil si activée) ; **✉ Envoyer** ouvre l'email déjà rempli dans sa messagerie, puis « Marquer comme envoyé ». La version réelle l'enverra automatiquement à l'heure prévue.

## Documents joints

Dans une tâche (et dans l'ajout rapide sur mobile) : **📎 Fichier** (PDF, Word, Excel, images… 10 Mo max), **📷 Photo** (appareil photo du téléphone, photo réduite automatiquement) et **🔗 Lien** (Google Drive, Dropbox, ClubDesk…). Clic sur un document pour l'ouvrir ; aperçu des images ; repère 📎 dans les listes ; noms des documents sous la tâche dans l'ordre du jour.

Démo : le contenu des fichiers reste dans le navigateur de la personne qui les ajoute (les autres ne les voient pas) et est effacé par « Réinitialiser la démo ». La version réelle les stockera sur le serveur, partagés entre tous.

## Sondages

Onglet **📊 Sondages** (filtres À voter / En cours / Terminés), sondages liés à une tâche (dans la fiche de la tâche) ou rattachés à une section :

- **Oui / Non / Abstention**, **choix unique ou multiple**, **choix de dates** (type Doodle, avec tableau des disponibilités) ;
- votants au choix (raccourcis Comité / Tout le monde), réponses **nominatives ou anonymes**, date limite facultative, réponse modifiable tant que le sondage est ouvert ;
- résultats en barres, meilleure option ★, liste des personnes en attente ; clôturer / rouvrir / modifier / supprimer (créateur ou droit « Gérer tous les sondages ») ;
- notification 🔔 et encadré sur l'accueil quand un sondage attend ta réponse ; résultats résumés sous leur section dans l'**ordre du jour**.

Droits : « Créer des sondages » (Admin, Secrétaire, Comité par défaut) et « Gérer tous les sondages » (Admin, Secrétaire). Quatre sondages d'exemple, sans réponses : change d'utilisateur pour voter.

## Ordre du jour

Onglet **📝 Ordre du jour** (droit « Onglet Ordre du jour », donné au Président ; attribuable à d'autres rôles dans la console admin). Il prépare le document de la **prochaine séance**, présenté comme les ordres du jour Word du club, **sans tableau** :

- en-tête : « Comité 29.10.26 », début de séance, lieu, **convoqués** (avec initiales), ligne **Excusés** à compléter ;
- **Ordre du jour** numéroté : **1. Section** (gras) › **a. Sous-section** › **■ point** (tâche avec initiales du responsable, délai, et selon le cas « ⚠ en retard », « pour le Comité 6 », « ✓ fait », statut, remarque) › **◦ détails** (checklist, documents joints, sondage lié) ;
- toutes les tâches de la section ensemble (retards, séance, séance suivante, terminées), sections sans point affichées seules ; sondages sous leur section ; points particuliers de la séance en fin de liste ;
- cadre de notes et prochaine séance en pied de page.

Réglages (mémorisés) : mise en forme **Liste numérotée** ou **Tableaux**, **niveau de détail** (complet / sections et sous-sections / sections seulement), séances, éléments inclus, regroupement (section, responsable, aucun) et tri, option « Séparer par échéance », détails affichés, statuts et sections inclus, titre, nom du club, orientation, taille du texte.
Actions : **Imprimer / PDF**, **Archiver dans la séance** (copie figée consultable et réimprimable dans l'onglet Comité), **Envoyer par email** aux membres du comité, **Copier le texte** (même numérotation, prêt à coller dans Word, un email ou WhatsApp).

## PV (secrétaire)

Onglet **🖊️ PV** (droit « Onglet PV », donné au Secrétaire et à l'Admin ; attribuable dans la console admin). Pour la séance choisie (par défaut celle du jour ou la prochaine) :

- **Prise de notes** : reprend l'ordre du jour (sections, sous-sections, tâches, sondages) avec une zone de notes sous chaque section, chaque tâche (📝) et chaque sondage, plus « Divers » ; enregistrement automatique pendant la frappe.
- **Séance** : ▶ Démarrer (heure de début, état des tâches mémorisé) / ⏹ Terminer ; présences (Présent / Excusé, « Tous présents »), invités.
- **Mise à jour des tâches pendant la séance** : statut et délai directement sur la ligne, ✏️ modification complète, **+ Nouvelle tâche décidée** (échéance : prochaine séance) ; les tâches modifiées sont surlignées avec le détail du changement (↻ statut / délai / responsable). Seules les modifications faites depuis l'onglet PV figurent dans le PV (pas celles faites plus tard dans l'onglet Tâches).
- **📄 PV** : document « Procès-verbal – Comité 29.10.26 » avec heures, lieu, présents / excusés / absents / invités, points traités numérotés (notes, décisions, changements), nouvelles tâches décidées et prochaine séance ; option « Inclure tous les points de l'ordre du jour ».
- **Imprimer / PDF**, **Copier le texte**, **Envoyer par email** au comité, **✅ Valider et archiver** : la secrétaire valide seule ; le PV validé est archivé dans la séance (onglet Comité, 📝) et le comité est notifié 🔔.
- **Correction après coup** : un PV validé passe en lecture seule ; **✏️ Corriger le PV** rouvre notes, présences et points (modifications de tâches comprises), **Annuler la correction** revient à la version validée. La nouvelle validation crée la **version 2** (« corrigée le … », email « PV corrigé »), l'ancienne version reste archivée et le comité est notifié.

## Notifications (démo)

Cloche 🔔 dans l'en-tête (ordinateur et mobile), avec pastille du nombre de notifications non lues :

- 🆕 une tâche t'est attribuée par quelqu'un d'autre ;
- 📧 un email que tu as programmé arrive à son heure d'envoi (message à l'écran si l'appli est ouverte) ;
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
