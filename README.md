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

La démo part de l'organisation du **G.S. Ajoie** (12 sections, séances de comité 2026-27, événements du club, sous-comités et groupes), **sans aucune tâche** : chaque testeur part de zéro et crée les siennes. Pas de sondage ni d'email programmé d'exemple non plus.

Le site étant public, **aucun nom** : chaque personne est désignée par son **poste** (numéroté quand plusieurs personnes ont le même : Compétition 1 et 2, Bénévole 1 à 3…), adresses fictives (`president@gsajoie.example`…), pas de téléphones. Les données de démo déjà enregistrées dans un navigateur (avec les anciens noms et tâches) sont remises à zéro automatiquement à la première visite.

Connexion par simple clic sur un poste (sans mot de passe) :

| Poste | Rôle(s) |
|---|---|
| Président | Admin – tout, dont la console admin, l'Ordre du jour et la création d'entités |
| Secrétaire | Secrétaire – voit/gère tout sauf console admin, listes et Ordre du jour ; tient le **PV** |
| Caissier | Comité **+** Caissier (gère toutes les tâches de Comptabilité) |
| Vice-président, Compétition 1 et 2, École de cyclisme, Gruppetto | Comité – voit tout, modifie ses propres tâches |
| Natation, Bruntrutaine, Montvoie, Course préparation 1 et 2, Coach JS, Camp de Pentecôte, Bénévole 1 à 3 | Responsable d'activité – uniquement ses propres tâches |

L'écran de connexion liste aussi les membres des sous-comités, groupes et équipes (Moniteur 1 et 2, Aide-moniteur, Entraîneur route, Coureur, Parcours et sécurité…) : chacun retrouve les entités dont il fait partie. Exemples : **École de cyclisme** (comité central, responsable de l'école de cyclisme, soirée récréative), **Bruntrutaine** (président du CO Bruntrutaine), **Moniteur 1** (seulement l'école de cyclisme).

Accès du comité central dans la démo : l'**École de cyclisme** le laisse **consulter**, le **CO Bruntrutaine** le laisse **modifier / ajouter**, les autres entités sont fermées. Connecté comme **Président**, ouvrir l'une ou l'autre depuis l'organigramme ou le menu des entités.

## Rôles et permissions

Tout se règle dans **Console admin → Rôles & permissions**, sans toucher au code :

- **Créer un rôle** (vide ou copie d'un rôle existant), le renommer, changer sa couleur, le dupliquer, le supprimer (une fois retiré à tout le monde).
- **Cocher les droits** de chaque rôle : tâches (voir toutes, créer/assigner, modifier toutes, modifier les siennes, supprimer), onglets visibles (Comité, Événements, Responsables), gestion (séances, événements, responsables), administration.
- **Limiter un rôle à certaines sections** : ses droits « Tâches » ne s'appliquent alors qu'à ces sections.
- **Cumuler plusieurs rôles** par personne (onglet Utilisateurs) : chaque rôle apporte ses droits sur ses propres sections.
- Garde-fous : le rôle Admin est verrouillé, chacun garde au moins un rôle, il reste toujours un admin actif.

## Organisation du club (entités)

Le club = le **comité central** et ses entités, chacune avec **ses propres responsables, rôles, sections, statuts, tâches, séances et événements**, invisibles des autres entités (le comité central ne voit pas leurs tâches, et inversement, sauf si l'entité lui ouvre l'accès : voir plus bas) :

| Type | Pour quoi | Modèle de départ (modifiable ensuite) |
|---|---|---|
| 🏛️ Comité central | Direction du club | Les données actuelles |
| 🎪 Sous-comité | Organisation d'un événement (ex. CO Bruntrutaine), avec son président | Rôles Président (admin) / Membre du comité / Bénévole ; sections Organisation générale, Logistique, Bénévoles, Communication, Finances et sponsors |
| 🚴 Groupe | Activité permanente (école de cyclisme, groupe compétition…) avec ses propres utilisateurs | Rôles Responsable (admin) / Moniteur / Membre du groupe ; sections Activités, Encadrement, Matériel, Administration |
| 🎉 Équipe d'événement | Événement sans comité qui réunit quelques personnes, souvent déjà actives ailleurs | Rôles Responsable (admin) / Membre de l'équipe ; sections Préparation, Jour J, Après l'événement |

Statuts de départ : ceux du club (À faire, En cours, En attente, Terminé, Annulé).

- **Organigramme** (onglet **Club**, ou menu de l'entité en haut à gauche) : toutes les entités et leurs membres (nom, poste, rôles, adresse email ; pas de numéros de téléphone), visible par tous les membres du club. Vue **Personnes** : l'annuaire, avec tous les postes de chacun.
- **Changer d'entité** : le menu en haut à gauche liste les entités dont on fait partie. Une même personne peut avoir un poste dans plusieurs entités (reconnue par son adresse email).
- **Créer une entité** (admins du comité central) : « + Nouvelle entité » dans l'organigramme → nom, type, date, couleur, description, **responsable** (admin de l'entité, choisi dans l'annuaire ou nouvelle personne) et membres de départ (annuaire). Dans la version réelle, le compte du responsable est créé avec un mot de passe provisoire (à lui transmettre), et les membres qui ont déjà un compte retrouvent l'entité dans leur menu.
- **Gérer son entité** : le président / responsable est admin de son entité ; il y gère membres, rôles, sections, statuts et accès (console admin), et peut en modifier le nom, la couleur, la description et la date. Le type et l'**archivage** (jamais de suppression) sont réservés au comité central. Onglet Responsables/Membres : **📇 Depuis l'annuaire du club** reprend une personne d'une autre entité.
- **Demandes au comité central** : depuis l'accueil d'une entité, **+ Demande** envoie une tâche au comité central (titre, détails, délai, section). Elle arrive dans ses tâches sans responsable, marquée **📨 nom de l'entité**, et apparaît dans « Demandes reçues » sur son accueil et dans les notifications de ceux qui attribuent les tâches. L'entité en suit l'avancement (statut, délai, qui s'en occupe) sans voir le reste des tâches du comité central.
- **Accès du comité central** : chaque sous-comité, groupe ou équipe choisit ce que les membres du comité central peuvent faire de ses données, dans **Console admin › Accès du comité central** (ou la fiche de l'entité dans l'organigramme). Seuls les admins (★) de l'entité changent ce réglage ; le comité central le voit, grisé.
  - 🔒 **Rien voir** (par défaut) : l'entité reste fermée au comité central.
  - 👁 **Consulter** : les membres du comité central ouvrent l'entité (bouton **👁 Consulter** sur sa carte, ou rubrique « Ouvertes au comité central » du menu des entités) et voient tout en lecture seule : tâches, séances, événements, membres, fichiers. Rien n'est modifié, pas même les réglages d'affichage.
  - ✏️ **Consulter et modifier / ajouter** : en plus, ils créent et modifient des tâches (avec emails programmés, notifications et fichiers joints). Ces tâches portent le badge **🏛️ Comité central**, et le journal de l'entité note « … par Prénom Nom (comité central) ». Pas de suppression, et pas de membres, rôles, séances ni réglages de l'entité.
  - Un bandeau rappelle qu'on visite l'entité, avec un bouton de retour au comité central. Le visiteur n'est pas ajouté aux membres de l'entité, et la visite n'est pas reprise au prochain lancement.

## Onglets

- **Accueil** : compteurs de mes tâches par statut (**un clic ouvre la liste filtrée**, « En retard » compris), mes tâches en retard, échéances à 7 jours, emails à envoyer, prochaine séance, avancement des événements.
- **Tâches** : section, sous-section, tâche, responsable(s), statut, délai, remarque, tâche principale / tâches liées, sous-tâches ; « Mes tâches / Toutes », filtres, tri, vue tableau ou kanban (glisser-déposer), export CSV, impression.
- **Agenda** : vue **mensuelle** (lundi → dimanche) des séances de comité, événements, délais des tâches, fins de sondage ; filtres par type, « Mes tâches / Toutes », tâches terminées au choix. **+** sur chaque jour (ou boutons du panneau du jour) pour **ajouter une séance de comité, une tâche ou un événement** à cette date (selon les droits ; nouvelle séance numérotée d'après la précédente, 19h30). Clic sur un élément pour l'ouvrir ; **glisser-déposer** sur un autre jour pour changer sa date (une séance déplacée entraîne les délais qui lui sont liés). Sur mobile : pastilles de couleur par jour, liste du jour touché en dessous.
- **Comité** : séances (date, lieu, ordre du jour, notes/PV) et tâches liées.
- **Événements** : événements du club, avancement des tâches liées.
- **Responsables** : poste, nom, prénom, email, portable (liens mail / appel).
- **Club** : organigramme et annuaire du club (voir ci-dessus).
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

Droits : « Créer des sondages » (Admin, Secrétaire, Comité par défaut) et « Gérer tous les sondages » (Admin, Secrétaire). Pour tester un vote à plusieurs, change d'utilisateur (bouton « Changer »).

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

## Sauvegarde des données

Réglages → **Sauvegarde des données** : **⬇ Télécharger une sauvegarde** crée un fichier `.json` avec tout (tâches, séances, PV, sondages, emails, responsables, rôles, réglages et fichiers joints) ; **⬆ Restaurer une sauvegarde** (admin) remplace les données de ce navigateur par celles du fichier (format mis à niveau automatiquement). Sert à passer d'un appareil à l'autre et à reprendre les données saisies dans la démo dans la version définitive. Ne pas déposer ce fichier dans le dépôt GitHub (public).

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

## Version réelle (Supabase)

La version réelle utilise la même appli, à la même adresse : au premier passage, un écran d'accueil propose **Version réelle** (membres du comité, email + mot de passe, données partagées en direct) ou **Démo** (données fictives dans le navigateur, pour faire essayer). Le choix est retenu sur l'appareil ; on change depuis la page de connexion ou les Réglages.

Liens directs : https://lionelbonati-lab.github.io/Taches_GSA/?demo (à envoyer aux testeurs) et https://lionelbonati-lab.github.io/Taches_GSA/?reel (membres du comité).

- **Synchronisation** : le badge en haut à gauche indique ☁ À jour, ⏳ Envoi… ou ⚠ Hors ligne (avec le nombre de modifications en attente, envoyées au retour du réseau).

- **Données** : chaque élément (tâche, séance, responsable, entrée du journal…) est une ligne de la table `gsa_items` ; seuls les éléments modifiés sont envoyés, avec une file d'attente en cas de coupure, et les modifications des autres membres arrivent en direct (`src/data/cloud.ts`).
- **Accès** : console admin › Utilisateurs › **Créer l'accès** crée le compte d'un responsable avec un mot de passe provisoire (à lui transmettre), qu'il remplace à la première connexion. Désactiver une fiche coupe l'accès. Aucun email n'est envoyé par le serveur.
- **Mise en route** : à la première connexion du président, reprise d'une sauvegarde de la démo (Réglages › Sauvegarde) ou base vide.
- **Fichiers joints** : stockage privé du serveur, dossier du comité.
- **Entités** : chaque sous-comité, groupe ou équipe est un comité du serveur rattaché au comité central, avec ses propres données ; organigramme et demandes passent par des fonctions du serveur qui ne laissent sortir que le nécessaire. L'accès du comité central (consulter, modifier / ajouter) est appliqué par les règles du serveur, pas seulement par l'appli.

Détails techniques (tables, règles d'accès, fonction serveur) : [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
