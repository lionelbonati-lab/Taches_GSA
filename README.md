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

Tout se règle dans **Console admin › Rôles et droits**, sans toucher au code :

- **Créer un rôle** (vide ou copie d'un rôle existant), le renommer, changer sa couleur, le dupliquer, le supprimer (une fois retiré à tout le monde).
- **Cocher les droits** de chaque rôle : tâches (voir toutes, créer/assigner, modifier toutes, modifier les siennes, supprimer), pages visibles (Séances, Ordre du jour, PV, Événements, Responsables, Membres du club), gestion (séances, événements, responsables), administration.
- **Limiter un rôle à certaines sections** : ses droits « Tâches » ne s'appliquent alors qu'à ces sections.
- **Cumuler plusieurs rôles** par personne (Personnes › Responsables / Membres › Modifier) : chaque rôle apporte ses droits sur ses propres sections.
- Garde-fous : le rôle Admin est verrouillé, chacun garde au moins un rôle, il reste toujours un admin actif.

## Organisation du club (entités)

Le club = le **comité central** et ses entités, chacune avec **ses propres responsables, rôles, sections, statuts, tâches, séances et événements**, invisibles des autres entités (le comité central ne voit pas leurs tâches, et inversement, sauf si l'entité lui ouvre l'accès : voir plus bas) :

| Type | Pour quoi | Modèle de départ (modifiable ensuite) |
|---|---|---|
| 🏛️ Comité central | Direction du club | Les données actuelles |
| 🎪 Sous-comité | Organisation d'un événement (ex. CO Bruntrutaine), avec son président | Rôles Président (admin) / Membre du comité (gère aussi les événements et la date de l'édition) / Caissier / Bénévole ; sections Organisation générale, Logistique, Bénévoles, Communication, Finances et sponsors |
| 🚴 Groupe | Activité permanente (école de cyclisme, groupe compétition…) avec ses propres utilisateurs | Rôles Responsable (admin) / Moniteur / Membre du groupe ; sections Activités, Encadrement, Matériel, Administration |
| 🎉 Équipe d'événement | Événement sans comité qui réunit quelques personnes, souvent déjà actives ailleurs | Rôles Responsable (admin) / Membre de l'équipe ; sections Préparation, Jour J, Après l'événement |

Statuts de départ : ceux du club (À faire, En cours, En attente, Terminé, Annulé).

- **Organigramme** (Personnes › **Organigramme**, ou menu de l'entité en haut à gauche) : toutes les entités et leurs membres (nom, poste, rôles, adresse email ; pas de numéros de téléphone), visible par tous les membres du club. Vue **Personnes** : l'annuaire, avec tous les postes de chacun.
- **Changer d'entité** : le menu en haut à gauche liste les entités dont on fait partie. Une même personne peut avoir un poste dans plusieurs entités (reconnue par son adresse email).
- **Créer une entité** (admins du comité central) : « + Nouvelle entité » dans l'organigramme → nom, type, date, couleur, description, **responsable** (admin de l'entité, choisi dans l'annuaire ou nouvelle personne) et membres de départ (annuaire). Dans la version réelle, le compte du responsable est créé avec un mot de passe provisoire (à lui transmettre), et les membres qui ont déjà un compte retrouvent l'entité dans leur menu.
- **Gérer son entité** : le président / responsable est admin de son entité ; il y gère membres, rôles et accès (Personnes › Membres), sections et statuts (Console admin › Sections et statuts), et peut en modifier le nom, la couleur, la description et la date. Le type et l'**archivage** (jamais de suppression) sont réservés au comité central.
- **Demandes au comité central** : depuis l'accueil d'une entité, **+ Demande** envoie une tâche au comité central (titre, détails, délai, section). Elle arrive dans ses tâches sans responsable, marquée **📨 nom de l'entité**, et apparaît dans « Demandes reçues » sur son accueil et dans les notifications de ceux qui attribuent les tâches. L'entité en suit l'avancement (statut, délai, qui s'en occupe) sans voir le reste des tâches du comité central.
- **Accès du comité central** : chaque sous-comité, groupe ou équipe choisit ce que les membres du comité central peuvent faire de ses données, dans **Console admin › Rôles et droits** (ou la fiche de l'entité dans l'organigramme). Seuls les admins (★) de l'entité changent ce réglage ; le comité central le voit, grisé.
  - 🔒 **Rien voir** (par défaut) : l'entité reste fermée au comité central.
  - 👁 **Consulter** : les membres du comité central ouvrent l'entité (bouton **👁 Consulter** sur sa carte, ou rubrique « Ouvertes au comité central » du menu des entités) et voient tout en lecture seule : tâches, séances, événements, membres, fichiers. Rien n'est modifié, pas même les réglages d'affichage.
  - ✏️ **Consulter et modifier / ajouter** : en plus, ils créent et modifient des tâches (avec emails programmés, notifications et fichiers joints). Ces tâches portent le badge **🏛️ Comité central**, et le journal de l'entité note « … par Prénom Nom (comité central) ». Pas de suppression, et pas de membres, rôles, séances ni réglages de l'entité.
  - Un bandeau rappelle qu'on visite l'entité, avec un bouton de retour au comité central. Le visiteur n'est pas ajouté aux membres de l'entité, et la visite n'est pas reprise au prochain lancement.
- **Logo** : le comité central met le **logo du club**, et chaque entité peut avoir le sien (ex. le logo de la manifestation), dans **Console admin › Apparence** ou la fiche de l'entité dans l'organigramme (admins de l'entité et du comité central). L'image choisie (PNG, JPEG, WebP, GIF ou SVG) est réduite à 256 px avant d'être enregistrée. Le logo remplace celui de l'appli en haut à gauche, s'affiche sur les cartes de l'organigramme et dans le menu des entités, et sert d'image par défaut à l'en-tête de l'ordre du jour et du PV. Une entité sans logo affiche celui du club ; sans logo du club, l'icône de l'appli reste.
- **Couleur de l'appli** (boutons, onglet actif, liens, calendrier…) : même onglet de la console admin, 8 teintes (dont « Vert GSA ») ou « Autre… » (couleur libre). Celle du comité central vaut pour tout le club (bleu d'origine par défaut) ; chaque entité peut choisir la sienne, sinon elle reprend celle du club. La teinte est ajustée automatiquement pour rester lisible (texte blanc sur les boutons, thème clair et sombre).

## Navigation

Cinq rubriques en haut de l'écran (barre du bas sur téléphone, « ☰ Plus » pour le reste) ; une rubrique de plusieurs pages les propose juste en dessous (sous-onglets). Chacun ne voit que les pages permises par ses rôles.

| Rubrique | Pages |
|---|---|
| 🏠 **Accueil** | résumé personnel |
| ✅ **Tâches** | tâches, remboursements et paiements de factures |
| 📅 **Agenda** | Calendrier · Événements |
| 🗓️ **Comité** (« Séances » pour un groupe, « Réunions » pour une équipe) | Séances · Ordre du jour · PV · Sondages |
| 👥 **Personnes** | Responsables (« Membres » hors comité central) · Membres du club · Organigramme |

**Mon compte** (pastille en haut à droite ; « ☰ Plus » sur téléphone) : Réglages, Console admin (admins), **Comment ça marche ?** et déconnexion. Une **phrase d'explication** sous le titre de chaque page dit à quoi elle sert (masquable dans Réglages) ; **Comment ça marche ?** reprend toutes les pages et les gestes courants (selon les droits de chacun), et l'accueil y invite à la première visite. Les adresses des pages n'ont pas changé (liens déjà envoyés, raccourcis).

- **Accueil** : compteurs de mes tâches par statut (**un clic ouvre la liste filtrée**, « En retard » compris), mes tâches en retard, échéances à 7 jours, emails à envoyer, prochaine séance, avancement des événements.
- **Tâches** : section, sous-section, tâche, responsable(s), statut, délai, remarque, tâche principale / tâches liées, sous-tâches ; « Mes tâches / Toutes », filtres, tri, vue tableau ou kanban (glisser-déposer), export CSV, impression.
- **Agenda** : vue **mensuelle** (lundi → dimanche) des séances de comité, événements, délais des tâches, fins de sondage ; filtres par type, « Mes tâches / Toutes », tâches terminées au choix. **+** sur chaque jour (ou boutons du panneau du jour) pour **ajouter une séance de comité, une tâche ou un événement** à cette date (selon les droits ; nouvelle séance nommée d'après son mois, 19h30). Clic sur un élément pour l'ouvrir ; **glisser-déposer** sur un autre jour pour changer sa date (une séance déplacée entraîne les délais qui lui sont liés). Sur mobile : pastilles de couleur par jour, liste du jour touché en dessous.
  **Agenda du club** : les **événements de toutes les entités** (nom, dates, lieu ; pas la description) et la **prochaine édition** de chaque sous-comité et équipe d'événement (🎪, sur un ou plusieurs jours) apparaissent dans l'agenda de **toutes les entités**, à la couleur de l'entité. Une édition n'est pas doublée si l'entité a déjà un événement à cette date. Le bouton **🎪 Agenda du club** permet de choisir les entités à afficher ; ce choix est personnel et propre à chaque entité. Un clic sur une case montre le détail du jour (entité, dates, lieu) ; un clic sur la ligne ouvre l'organigramme.
- **Comité › Séances** : séances (date, lieu, excusés, ordre du jour et PV archivés) et tâches liées. Les séances reviennent **chaque année** : voir plus bas.
- **Agenda › Événements** : événements du club, sur **un ou plusieurs jours** (« Dernier jour »), avancement des tâches liées. Un événement sur plusieurs jours occupe chacun de ses jours dans l'agenda (« 1/3, 2/3… ») ; le glisser déplace tout l'événement. Il reste dans « Prochains événements » tant qu'il n'est pas terminé.
- **Prochaine édition** (sous-comité, équipe d'événement) : la date de la manifestation, sur un ou plusieurs jours, est affichée sur l'accueil et la page Événements de l'entité. **Son comité la change lui-même** (bouton « Changer la date » : ses admins, les membres du comité, qui ont « Gérer les événements » par défaut, et les admins du comité central), et peut déplacer du même coup l'événement de l'agenda (les délais des tâches liées suivent). Une édition passée invite à fixer la suivante.
- **Personnes › Responsables** (comité central) / **Membres** (autres entités) : **un seul écran pour les personnes de l'entité**. Chaque carte montre poste, nom, email, portable (liens mail / appel), rôles et, pour les admins de la version réelle, si la personne a un accès à l'appli. **Modifier** ouvre sa fiche : coordonnées, poste, **rôles** (cumulables ; changés par les admins), **accès à l'appli** (créer, nouveau mot de passe, retirer) et **Retirer de l'entité** (ses tâches restent ; « Personnes retirées » permet de la réactiver). **+ Ajouter une personne** propose les membres du club (registre, ou annuaire des entités pour qui n'y a pas accès) ou une nouvelle personne, puis son poste et son rôle.
- **Personnes › Membres du club** : voir la section suivante.
- **Personnes › Organigramme** : organigramme et annuaire du club (voir ci-dessus).
- **Réglages** : thème clair/sombre, vue par défaut, phrases d'explication, notifications, sauvegarde.
- **Console admin** (menu du compte, admins) : une page d'accueil à cartes explique chaque partie avec un résumé (nombre de rôles, de sections…), puis chaque partie a sa page (`#/admin/droits`, `taches`, `apparence`, `import`, `historique` ; « ‹ Console admin » ou le retour du navigateur pour revenir) :
  - **Personnes et accès** : renvoi vers Personnes › Responsables / Membres (postes, rôles, accès à l'appli) ;
  - **Rôles et droits** : rôles et matrice des droits ; pour un sous-comité, un groupe ou une équipe, aussi l'**accès du comité central** ;
  - **Sections et statuts**, **Apparence** (logo, couleur ; comité central : aussi nom et icône de l'appli installée), **Importer un fichier** (CSV, voir plus bas), **Historique** (journal d'activité).
  - Dans **Sections et statuts**, les sous-sections se **renomment** (les tâches suivent ; un nom déjà pris dans la section est refusé) et se **réordonnent** (▲ ▼) : cet ordre est repris dans les listes de choix, l'ordre du jour et le PV. Le nombre de tâches de chaque sous-section est affiché.

## Membres du club (annuaire) et imports CSV

Page **📇 Membres du club** (rubrique Personnes) : le **registre commun à tout le club**, une seule fiche par personne, **avec ou sans accès à l'appli** (licenciés, parents, bénévoles…) : prénom, nom, email, téléphone, **IBAN** et **groupes** de l'organigramme (École de cyclisme, Groupe compétition…).

- **Qui le voit** : les rôles qui ont le droit « Personnes › Membres du club » (par défaut **Admin** et **Secrétaire**) et **les admins de toutes les entités** (présidents de CO, responsables de groupe…). Lecture et modification. Les autres membres ne le voient pas (l'IBAN reste confidentiel ; il est masqué dans la liste et lisible dans la fiche).
- **Une fiche unique** : dans chaque entité, la personne a un poste et des rôles ; ses coordonnées (prénom, nom, email, téléphone) sont celles du registre. **Modifiées dans le registre ou dans n'importe quelle entité, elles changent partout.** Une personne ajoutée dans une entité est rattachée au membre de même email, ou ajoutée au registre.
- Recherche, filtre par groupe, avec ou sans poste ; postes de chacun dans les entités ; **📤 Exporter** (CSV pour Excel) ; suppression d'un membre seulement s'il n'a plus de poste dans une entité.
- **📥 Importer** : fichier **CSV** (Excel : Fichier › Enregistrer sous › CSV ; Google Sheets : Fichier › Télécharger › CSV) ou **copier-coller** des lignes depuis le tableur, avec la ligne d'en-tête. **⬇️ Télécharger le modèle** donne les colonnes attendues (Prénom, Nom, Email, Téléphone, IBAN, Groupes). Un **aperçu** montre ce que devient chaque ligne avant de valider : nouveau, mise à jour, ignoré (déjà à jour, doublon) ou erreur (nom manquant, email invalide), avec les avertissements (IBAN invalide non importé, groupe inconnu…). Une personne déjà inscrite (**même email, sinon même prénom et nom**) est **mise à jour** : les cellules remplies remplacent ses valeurs, les cellules vides ne changent rien.

**Console admin › Importer un fichier** (chaque entité, ses admins) : même principe (modèle, fichier ou copier-coller, aperçu) pour
- les **responsables / membres** de l'entité : Prénom, Nom, Email, Téléphone, Poste, Rôle (noms des rôles de l'entité, séparés par des virgules). Une personne déjà là est mise à jour (rôles ajoutés à ceux qu'elle a, réactivée si elle avait été retirée) ; une nouvelle est reliée au registre du club. Le rôle Admin n'est donné que par un admin. Les accès à l'appli se créent ensuite dans l'onglet Membres ;
- les **tâches** : Titre, Section, Sous-section, Responsables (prénom et nom, poste ou email), Délai (31.12.2026 ou 2026-12-31), Statut, Remarque. Une valeur inconnue est signalée et remplacée par la valeur par défaut ; une tâche de même titre dans la même section n'est pas reprise ;
- les **événements** : Nom, Date, Date de fin, Lieu, Description ; même nom à la même date = mise à jour.

Les CSV avec point-virgule, virgule ou tabulation, en UTF-8 ou en encodage Windows (Excel), sont reconnus ; les intitulés de colonnes courants aussi (E-mail, Tél, Natel, Fonction, Échéance…).

## Fiche d'une tâche

Un seul formulaire, le même partout (bouton « + Nouvelle tâche », bouton flottant **+**, clic sur une tâche) :

- **toujours visible, l'essentiel** : **Tâche** (que faut-il faire ?), **Section** (la sous-section apparaît seulement si la section en a), **Pour quand ?**, **Qui s'en occupe ?** (les personnes choisies, ✕ pour en retirer une, « ＋ Ajouter… » pour en ajouter ; « Moi » en premier), **Remarque** ; en modification, aussi le **Statut** ;
- **le reste à la demande**, par la ligne **« Ajouter : »** : ☑️ Checklist, 📎 Document, 🔁 Répétition, 🔗 Lier à… (événement, séance de comité, tâche principale, tâches liées), 📊 Sondage et 📧 Email (une fois la tâche enregistrée ; la fenêtre s'ouvre directement). Une partie remplie reste affichée quand on rouvre la tâche ; une partie vide ne prend pas de place.

## Délais liés à un événement

Dans une tâche, **Pour quand ?** est une date ; le lien **📌 ou selon un événement / une séance** propose la liste des prochains événements et séances de comité, puis : un nombre libre de **jours, semaines ou mois**, **avant ou après** (ex. 10 jours avant, 6 semaines avant, 2 mois avant, 3 jours après ; 0 = le jour même). Les mois suivent le calendrier : « 1 mois avant » le 15.11 donne le 15.10.
Le délai **suit ensuite automatiquement** la date : si le tournoi est déplacé d'une semaine, toutes ses tâches liées bougent avec lui. Repère 🔗 dans les listes (le survol indique la référence), filtre « Délai lié » dans Tâches.

## Tâches récurrentes

**Ajouter : 🔁 Répétition** dans une tâche : chaque semaine, mois, trimestre, semestre ou année (repère 🔁, filtre « Tâches récurrentes »).
Quand la tâche passe à un statut de clôture (« Terminé »), la suivante est **créée automatiquement** avec le délai décalé, le statut « À faire » et la checklist remise à zéro. Elle est attribuée **au poste** (ex. Trésorier) : si le titulaire a changé entre-temps, elle va à son successeur. Une tâche rouverte puis refermée ne crée pas de doublon. Une tâche annuelle liée à une séance passe à la séance du même mois l'année suivante (voir « Séances qui reviennent chaque année »).

## Séances qui reviennent chaque année

Une séance de comité **revient chaque année, le même mois** : le comité de mars 2026 a une suite en mars 2027.

- **Nom d'après le mois** : « Comité de mars 2027 », « Comité d’avril 2027 » (« Séance » pour un groupe, « Réunion » pour une équipe). Le nom suit la date : une séance déplacée en avril (dans sa fiche, ou en la glissant dans l'Agenda) devient « … d’avril ». Un titre libre (« Assemblée des membres ») ne change pas. Une deuxième séance dans un mois qui a déjà la sienne s'appelle « Séance extraordinaire de … » et ne revient pas.
- **Fiche de la séance** : case **🔁 Revient chaque année** (cochée par défaut ; décochée = séance unique, marquée « une seule fois » dans la liste). Avertissement si le mois a déjà sa séance annuelle.
- **🔁 Séances de l’année prochaine** (Comité › Séances, pour qui gère les séances) : dès qu'une séance est passée, celle du même mois l'année suivante est proposée, **le même jour de la semaine au même rang** (2e jeudi d'avril → 2e jeudi d'avril ; un 5e mardi → dernier mardi), même heure et même lieu, ordre du jour vide. On coche celles à ajouter (**📅 Ajouter les N séances**), ou **Ne revient plus** pour arrêter un mois.
- **Ajouter / supprimer un comité** : **+ Nouvelle séance** ajoute un mois au rythme annuel. **Supprimer** la seule séance d'un mois arrête ce mois (il n'est plus proposé ; le message le dit) ; pour changer de jour, on modifie plutôt la date.
- **Tâches annuelles liées à une séance** : quand une tâche « 🔁 Chaque année » liée au comité de mars est terminée, la suivante est liée au **comité de mars de l'année suivante** (créé au besoin, s'il n'existe pas encore et que le mois revient chaque année). Un délai lié à la séance (« 2 semaines avant ») est gardé et recalculé sur la nouvelle date. Les autres répétitions (mois, trimestre…) ne reprennent pas la séance.
- **Anciens noms numérotés** (« Comité 4 », « Comité 1 (2027) ») : le panneau **✏️ Nommer les séances d’après leur mois** propose de les renommer en une fois (« Comité de septembre 2026 »), ou **Garder les noms actuels**. Les ordres du jour et PV déjà archivés gardent leur titre.

## Tâches liées et sous-tâches

Une tâche peut être **liée à une tâche principale** (un niveau) : par ex. « AG 13.03.2027 » avec « Reserver le lieu », « Organiser le repas », « Préparer le PowerPoint »… Chaque tâche liée est une tâche à part entière (responsables, délai lié, statut, remarque, documents, sondages, emails, répétition).

- Dans une tâche (**Ajouter : 🔗 Lier à…**) : champ **Tâche principale** (liste par section) ; une tâche liée affiche en haut « ↳ Tâche liée à … » (clic pour ouvrir la tâche principale).
- Dans une tâche principale (cadre **🔗 Liens**) : **Tâches liées** avec avancement (« 3/8 terminées »), statut, responsables et délai de chacune (clic pour l'ouvrir), **+ Nouvelle tâche liée** (section, sous-section et délai repris), **🔗 Lier une tâche existante**, ✕ pour délier (la tâche reste), « Voir dans la liste ».
- Liste des tâches : repères « ↳ tâche principale » et « 🔗 3/8 tâches liées », filtre « Tâche principale » (la tâche et ses tâches liées), filtres « Tâches principales » / « Tâches liées » ; export CSV : colonne « Tâche principale ».
- Ordre du jour : les tâches liées s'affichent sous leur tâche principale ; une tâche principale qui porte le nom de sa sous-section devient la ligne de la sous-section. Page PV : tâches liées en retrait sous leur tâche principale.
- Tâche récurrente : l'occurrence suivante d'une tâche liée est rattachée à l'occurrence suivante de sa tâche principale.
- Supprimer une tâche principale garde ses tâches liées (sans tâche principale).

Les **sous-tâches** restent une simple checklist (case à cocher + intitulé), cochables aussi pendant la séance dans Comité › PV.

## Emails programmés

Dans une tâche enregistrée, **Ajouter : 📧 Email** (puis **📧 Programmer un email** pour les suivants) : destinataires (responsables cochés par défaut, autres membres, adresses supplémentaires), **quand** (1 mois / 2 semaines / 1 semaine / 3 jours avant le délai, la veille, le jour même, 1 à 7 jours après pour une relance, ou date précise) et heure, objet et message avec champs automatiques ({tâche}, {délai}, {section}, {responsables}, {statut}, {remarque}, {lien}, {expéditeur}) et aperçu. Option « Ne pas envoyer si la tâche est déjà terminée ».

- Un email calé sur le délai **suit le délai** s'il change (y compris un délai lié à un événement).
- États : 🕓 programmé, 📨 à envoyer, ✅ envoyé (date), ⛔ annulé, ✔️ pas envoyé car tâche terminée ; actions Envoyer maintenant, Modifier, Annuler, Reprogrammer, Supprimer. Repère 📧 et filtre « Avec email programmé » dans Tâches.
- Tâche récurrente : les emails sont reconduits avec l'occurrence suivante (destinataires qui suivent le poste).

Limite de la démo : sans serveur, l'appli ne peut pas envoyer d'email elle-même. À l'heure prévue, l'auteur reçoit une notification 🔔 (et de l'appareil si activée) ; **✉ Envoyer** ouvre l'email déjà rempli dans sa messagerie, puis « Marquer comme envoyé ». La version réelle l'enverra automatiquement à l'heure prévue.

## Documents joints

Dans une tâche (**Ajouter : 📎 Document**) : **📎 Fichier** (PDF, Word, Excel, images… 10 Mo max), **📷 Photo** (appareil photo du téléphone, photo réduite automatiquement) et **🔗 Lien** (Google Drive, Dropbox, ClubDesk…). Clic sur un document pour l'ouvrir ; aperçu des images ; repère 📎 dans les listes ; noms des documents sous la tâche dans l'ordre du jour.

Démo : le contenu des fichiers reste dans le navigateur de la personne qui les ajoute (les autres ne les voient pas) et est effacé par « Réinitialiser la démo ». La version réelle les stockera sur le serveur, partagés entre tous.

## Sondages

Page **📊 Sondages** (rubrique Comité) (filtres À voter / En cours / Terminés), sondages liés à une tâche (**Ajouter : 📊 Sondage** dans la fiche de la tâche) ou rattachés à une section :

- **Oui / Non / Abstention**, **choix unique ou multiple**, **choix de dates** (type Doodle, avec tableau des disponibilités) ;
- réponse **« Autre »** en option (case à cocher à la création, pour les trois types ; « Autre proposition » pour les dates) : qui la choisit doit écrire sa réponse. Les textes s'affichent sous la ligne « Autre » (sans nom si le sondage est anonyme), dans le tableau des disponibilités et dans le résumé de l'ordre du jour et du PV. « Autre » n'est jamais désignée meilleure option ;
- votants au choix (raccourcis Comité / Tout le monde), réponses **nominatives ou anonymes**, date limite facultative, réponse modifiable tant que le sondage est ouvert ;
- résultats en barres, meilleure option ★, liste des personnes en attente ; clôturer / rouvrir / modifier / supprimer (créateur ou droit « Gérer tous les sondages ») ;
- notification 🔔 et encadré sur l'accueil quand un sondage attend ta réponse ; résultats résumés sous leur section dans l'**ordre du jour**.

Droits : « Créer des sondages » (Admin, Secrétaire, Comité par défaut) et « Gérer tous les sondages » (Admin, Secrétaire). Pour tester un vote à plusieurs, change d'utilisateur (bouton « Changer »).

## Ordre du jour

Page **📝 Ordre du jour** (rubrique Comité ; droit « Comité › Ordre du jour », donné au Président ; attribuable à d'autres rôles dans la console admin). Il prépare le document de la **prochaine séance**, présenté comme les ordres du jour Word du club, **sans tableau** :

- en-tête : « Comité 29.10.26 », début de séance, lieu, **convoqués** (avec initiales), ligne **Excusés** à compléter ;
- **Ordre du jour** numéroté : **1. Section** (gras) › **a. Sous-section** › **■ point** (tâche avec initiales du responsable, délai, et selon le cas « ⚠ en retard », « pour le Comité 6 », « ✓ fait », statut, remarque) › **◦ détails** (checklist, documents joints, sondage lié) ;
- toutes les tâches de la section ensemble (retards, séance, séance suivante, terminées), sections sans point affichées seules ; sondages sous leur section ; points particuliers de la séance en fin de liste ;
- cadre de notes et prochaine séance en pied de page.

Réglages (mémorisés) : mise en forme **Liste numérotée** ou **Tableaux**, **niveau de détail** (complet / sections et sous-sections / sections seulement), séances, éléments inclus, regroupement (section, responsable, aucun) et tri, option « Séparer par échéance », détails affichés, statuts et sections inclus, titre, en-tête, orientation, taille du texte.
**Excusés et points de la séance** (panneau de gauche) : un clic sur un membre l'**excuse** (ou le retire) ; la ligne « Excusés » du document se remplit (case ☒ dans la présentation en tableaux). Chacun peut aussi s'excuser lui-même dans **Comité › Séances** : **🙋 Je serai absent(e)** sur une séance à venir, avec un motif facultatif (« Je serai finalement présent(e) » pour annuler). Les excusés sont repris dans les présences du PV. Les **points particuliers** de la séance s'écrivent aussi ici (un par ligne).

**✏️ Modifier le texte** (droit « Comité › Ordre du jour ») : le document devient modifiable directement (corriger, ajouter ou supprimer des lignes), puis **Enregistrer**. Cette version, gardée dans la séance, est celle que tout le comité voit, imprime, archive, envoie et copie ; les excusés y restent à jour, mais plus les changements de tâches ni de mise en page. **🔄 Revenir à la version générée** l'abandonne.

**En-tête** (Mise en page › **✏️ Modifier l'en-tête…**, avec le droit « Comité › Ordre du jour ») : commun à toute l'entité, avec aperçu :

- image : le **logo de l'entité**, une **image propre** (ex. l'en-tête du papier à lettres du club, réduite à 1400 px de large) ou aucune ; taille petite, moyenne, grande ou **toute la largeur** (bannière) ;
- texte libre sur plusieurs lignes (nom du club, adresse, site… ; la première ligne en gras), ou vide pour n'avoir que l'image ;
- disposition (image à gauche, image et texte opposés, centré, image à droite), couleur, trait sous l'en-tête ;
- la case « Afficher l'en-tête » le masque sur l'ordre du jour.

Par défaut : logo de l'entité et « G.S. Ajoie – Comité » (ou le nom de l'entité). Les ordres du jour et PV archivés reprennent l'image actuelle de l'en-tête (elle n'est pas recopiée dans chaque archive).

Actions : **Imprimer / PDF**, **Archiver dans la séance** (copie figée consultable et réimprimable dans Comité › Séances), **Envoyer par email** aux membres du comité, **Copier le texte** (même numérotation, prêt à coller dans Word, un email ou WhatsApp).

## PV (secrétaire)

Page **🖊️ PV** (rubrique Comité ; droit « Comité › PV », donné au Secrétaire et à l'Admin ; attribuable dans la console admin). Pour la séance choisie (par défaut celle du jour ou la prochaine) :

- **Prise de notes** : reprend l'ordre du jour (sections, sous-sections, tâches, sondages) avec une zone de notes sous chaque section, chaque tâche (📝) et chaque sondage, plus « Divers » ; enregistrement automatique pendant la frappe.
- **Séance** : ▶ Démarrer (heure de début, état des tâches mémorisé) / ⏹ Terminer ; présences (Présent / Excusé, « Tous présents »), invités.
- **Mise à jour des tâches pendant la séance** : statut et délai directement sur la ligne, ✏️ modification complète, **+ Nouvelle tâche décidée** (échéance : prochaine séance) ; les tâches modifiées sont surlignées avec le détail du changement (↻ statut / délai / responsable). Seules les modifications faites depuis la page PV figurent dans le PV (pas celles faites plus tard dans l'onglet Tâches).
- **📄 PV** : document « Procès-verbal – Comité 29.10.26 » avec heures, lieu, présents / excusés / absents / invités, points traités numérotés (notes, décisions, changements), nouvelles tâches décidées et prochaine séance ; option « Inclure tous les points de l'ordre du jour ».
- **✏️ En-tête…** (avec le droit « Comité › PV ») : même réglage que pour l'ordre du jour. Tant qu'il n'est pas modifié, le PV reprend l'en-tête de l'ordre du jour ; « Revenir à l'en-tête de l'ordre du jour » annule un en-tête propre au PV.
- **Imprimer / PDF**, **Copier le texte**, **Envoyer par email** au comité, **✅ Valider et archiver** : la secrétaire valide seule ; le PV validé est archivé dans la séance (onglet Comité, 📝) et le comité est notifié 🔔.
- **Correction après coup** : un PV validé passe en lecture seule ; **✏️ Corriger le PV** rouvre notes, présences et points (modifications de tâches comprises), **Annuler la correction** revient à la version validée. La nouvelle validation crée la **version 2** (« corrigée le … », email « PV corrigé »), l'ancienne version reste archivée et le comité est notifié.

## Remboursements et paiements (dans les tâches)

Pas d'onglet à part : les demandes sont des **tâches** (section des finances). Le **bouton flottant « + »** (en bas à droite, sur téléphone comme sur ordinateur, depuis n'importe quelle page) propose **✅ Nouvelle tâche** (la même fiche que partout) et :

- **🧾 Nouveau remboursement** : rembourser une personne qui a **avancé de l'argent** (photo de son ticket de caisse ; « À rembourser à » : soi-même, une personne de l'entité ou un autre nom). Sous-section « Remboursements ».
- **💳 Nouveau paiement** : payer une **facture directement à qui l'a envoyée** (fournisseur, prestataire…) : photo ou PDF de la facture, « À payer à », IBAN s'il n'est pas sur la facture, **échéance** facultative (= délai de la tâche, visible dans l'agenda). Sous-section « Paiements ».

Le virement ne se fait pas dans l'appli : elle sert à **demander, viser et suivre**. Circuit : **justificatif → caisse → demande de visa → visa → virement**. Un clic sur la tâche ouvre la fenêtre de la demande (état, justificatifs, sceau, actions) au lieu du formulaire de tâche ; son statut suit le circuit (pas de changement direct, ni par glisser-déposer).

1. **Demande** : « + » › remboursement ou paiement (ou les raccourcis **Remboursement** / **Paiement** de l'icône) → **caisse destinataire** (entité ouverte par défaut ; « Envoyer à la caisse de » : une autre de ses entités, ou la **caisse centrale**, ouverte à tous les membres du club), photo prise directement avec l'appareil (📷 Photo) ou fichier existant (📎 Fichier, PDF compris), objet, montant, bénéficiaire, IBAN, remarque. La demande part à la caisse (« 📥 À traiter »).
2. **Caisse** (droit « Caisse », rôle Caissier de l'entité ; les admins seulement si l'entité n'a pas de caissier, sinon un président qui vise ne voit pas les actions de la caisse) : contrôle le ticket puis **demande le visa** à un **membre du comité de son entité** (avec un message facultatif) ; les bénévoles ne sont pas proposés. Le demandeur n'est jamais proposé : **on ne vise pas sa propre demande**. La caisse peut aussi refuser, ou changer de signataire tant que le visa n'est pas donné.
3. **Visa** : la personne désignée ouvre le ticket, **glisse le sceau sur une zone libre de la photo** (taille réglable), peut adapter le texte, puis **signe au doigt, au stylet ou à la souris**. Le sceau « OK pour paiement · montant · date · signature · nom » est incrusté dans une copie du ticket (« ✔ Ticket visé », ajoutée aux justificatifs). Elle peut aussi refuser, avec un motif. Une fois le visa donné, la fenêtre se ferme et la demande revient à la caisse : la personne qui a visé n'a plus d'action possible (seule la caisse peut retirer un visa).
4. **Paiement** : la caisse **télécharge le document fini** (« ⬇️ Télécharger : ticket visé / facture visée » : la photo avec le sceau signé), fait le virement dans son e-banking puis appuie sur **✅ Virement fait (OK)** → « Payé ».

**Une caisse par entité** : chaque entité (comité central, sous-comité d'une manifestation, groupe, équipe) a son rôle **Caissier** (à attribuer dans « Responsables »). **Seules les entités qui ont un caissier désigné reçoivent des tickets** : une entité sans caissier n'est pas proposée, et son formulaire invite à choisir la caisse d'une autre entité. Un bénévole envoie ainsi son ticket directement à la caisse de son entité, sans passer par le comité central. Le ticket reste dans les données de cette entité. Un membre du comité central qui consulte une entité en visiteur n'y envoie pas de ticket : il choisit la caisse de l'une de ses entités.

**Caisse centrale pour tous** : un membre de n'importe quelle entité (bénévole compris) peut envoyer son ticket à la caisse du comité central, sans en faire partie. Le ticket arrive chez la caisse centrale avec le nom du demandeur et son entité (« Bénévole 4 (CO Bruntrutaine) »), et suit le même circuit (visa d'un membre du comité central). Le demandeur en suit l'état dans « Mes tâches » (« Envoyés à la caisse centrale », sous la liste). Dans une entité sans caissier, la caisse centrale est choisie d'office.

**Sceau modifiable** : la caisse règle le modèle (« 🖋 Sceau », affiché quand la liste des tâches est filtrée sur les paiements : Filtres › « 💰 Paiements et remboursements ») : en-tête (ex. « G.S. Ajoie – Caisse »), texte (« OK pour paiement », « Bon pour paiement »…), couleur et **transparence** : du fond (de blanc opaque à entièrement transparent, pour laisser voir le document sous le sceau) et du texte et du cadre, avec un aperçu sur un faux document. La personne qui vise peut encore ajuster la transparence du fond selon la photo. Le droit « peut viser » (console admin, groupe Gestion) place des personnes en tête de la liste proposée à la caisse ; par défaut les admins.

**Accès** : seules la caisse, la personne qui a fait la demande et celle qui doit la viser (tant que le visa est demandé) peuvent ouvrir la demande, admins compris ; les autres la voient dans la liste avec un 🔒, sans pouvoir l'ouvrir. La tâche passe de la caisse à la personne qui vise, revient à la caisse puis se clôt une fois payée ; la liste affiche le montant et l'étape (« CHF 42,50 · ✍️ Visa demandé »). « Mes tâches » montre aussi les demandes qu'on a envoyées, pour en suivre l'état. Filtre « Tâches et paiements » : paiements et remboursements, remboursements seuls ou factures seules (avec le total). Notifications : demande à traiter et virement à faire (caisse), visa demandé (signataire), « visé / remboursé / payé / refusé » (demandeur) ; elles ouvrent directement la demande. **🖨 Bon de paiement** imprime la demande visée : l'en-tête de l'entité, le justificatif d'origine (sans la copie visée) et, en bas, le sceau signé (seule la fenêtre est imprimée). **En-tête du bon** : la caisse de chaque entité le règle (« ✏️ En-tête du bon de paiement… » au-dessus de la liste filtrée sur les paiements, ou « ✏️ En-tête du bon » dans la fenêtre d'une demande visée) : image (logo ou papier à lettres), texte (nom de la caisse, adresse…), couleur, disposition, avec aperçu. Tant qu'il n'est pas réglé, le bon reprend l'en-tête de l'ordre du jour. Les anciens liens `#/paiements` mènent aux tâches. En version réelle, le serveur applique les mêmes règles, admins compris (voir SUPABASE_SETUP.md, migrations 009 et 010).

## Notifications (démo)

Cloche 🔔 dans l'en-tête (ordinateur et mobile), avec pastille du nombre de notifications non lues :

- 🆕 une tâche t'est attribuée par quelqu'un d'autre ;
- 📧 un email que tu as programmé arrive à son heure d'envoi (message à l'écran si l'appli est ouverte) ;
- ✏️ une de tes tâches est modifiée par quelqu'un d'autre (statut, délai, contenu) ; 🔁 tâche récurrente reconduite ;
- ⏰ échéance proche (le jour même à 14 jours avant, réglable) ;
- ⚠️ résumé quotidien de tes tâches en retard ;
- 🗓️ prochaine séance de comité (et « ordre du jour disponible » s'il a été archivé).

Un clic ouvre directement la tâche (ou la liste filtrée / Comité › Séances). Réglages → Notifications : choix des types, délais de prévenance, et **notifications de l'appareil** (téléphone / ordinateur, après autorisation) avec un bouton de test.

Limite de la démo : sans serveur, les notifications sont calculées dans le navigateur et celles de l'appareil ne partent qu'à l'ouverture de l'appli. La version réelle (base partagée + serveur) pourra les envoyer application fermée, y compris sur iPhone une fois l'appli installée.

## Sauvegarde des données

Réglages → **Sauvegarde des données** : **⬇ Télécharger une sauvegarde** crée un fichier `.json` avec tout (tâches, séances, PV, sondages, emails, responsables, rôles, réglages et fichiers joints) ; **⬆ Restaurer une sauvegarde** (admin) remplace les données de ce navigateur par celles du fichier (format mis à niveau automatiquement). Sert à passer d'un appareil à l'autre et à reprendre les données saisies dans la démo dans la version définitive. Ne pas déposer ce fichier dans le dépôt GitHub (public).

## Mobile et installation (PWA)

Sous 768 px : barre de navigation en bas, tâches en cartes avec changement de statut d'un tap, bouton **+** pour ajouter une tâche, un remboursement ou un paiement.

L'application peut s'installer comme une vraie appli (icône, fenêtre dédiée, fonctionne hors connexion) via le bouton **📲 Installer l'application** (en-tête, menu « Plus » sur mobile, ou Réglages → Application) :

| Appareil | Comment |
|---|---|
| Ordinateur – Chrome / Edge | Bouton « Installer l'application » ou icône d'installation dans la barre d'adresse |
| Mac – Safari | Fichier › Ajouter au Dock |
| Android – Chrome | Bouton « Installer l'application » ou menu ⋮ › Installer l'application |
| iPhone / iPad – Safari | Bouton Partager › Sur l'écran d'accueil |

Un appui long (ou clic droit) sur l'icône installée propose les raccourcis **Nouvelle tâche**, **Remboursement**, **Paiement** (ouvrent directement le formulaire) et **Mes tâches**. Sur Android, Chrome ajoute « Paramètres des sites » et le lanceur n'affiche que 4 raccourcis : « Mes tâches », placé en dernier, n'y apparaît pas. Une appli déjà installée prend les nouveaux raccourcis à sa prochaine mise à jour (Android la fait de lui-même, en général dans la journée où l'appli est ouverte) ou en la réinstallant.

**Nom et icône de l'appli** : par défaut « Tâches GSA » et le **logo du G.S. Ajoie** (écran d'accueil, raccourcis, notifications ; les raccourcis ont chacun leur icône). Les admins du comité central les changent dans **Console admin › Apparence** (version réelle), section « Nom et icône de l'appli installée » :
- **Nom** : jusqu'à 30 caractères (sous l'icône, il est coupé au-delà d'une douzaine) ; repris dans l'en-tête de l'appli, l'onglet du navigateur, l'écran de connexion, les notifications, les emails d'accès et le pied des documents imprimés. « Reprendre « Tâches GSA » » revient au nom d'origine.
- **Icône** : mettre le logo du club (plus haut), puis **« Utiliser le logo du club comme icône »** (aperçu de l'icône et des raccourcis, qui prennent la couleur de l'appli du club). « Revenir à l'icône d'origine » remet le logo du G.S. Ajoie. Après un changement du logo ou de la couleur, le panneau propose de mettre l'icône à jour.

L'appli dépose le nom et les images sur le serveur (migration 017) ; le site les publie **dans l'heure** (vérification automatique toutes les heures, workflow « Nom et icône de l'appli » ; « Run workflow » dans l'onglet Actions de GitHub pour le faire tout de suite). Une appli **déjà installée** se met à jour d'elle-même après un moment (Android) ; sinon la supprimer puis la réinstaller (ou la rajouter à l'écran d'accueil sur iPhone / iPad). L'onglet du navigateur montre le logo de l'entité ouverte quand elle a le sien.

> GitHub désactive les tâches planifiées d'un dépôt public resté 60 jours sans modification : si le nom ou l'icône n'est toujours pas en ligne après quelques heures, lancer « Nom et icône de l'appli › Run workflow » dans l'onglet Actions (et réactiver le workflow si GitHub le propose).

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
- **Accès** : Personnes › Responsables / Membres › Modifier › **Créer l'accès** crée le compte d'un responsable avec un mot de passe provisoire (à lui transmettre), qu'il remplace à la première connexion. Désactiver une fiche coupe l'accès. Aucun email n'est envoyé par le serveur.
- **Mise en route** : à la première connexion du président, reprise d'une sauvegarde de la démo (Réglages › Sauvegarde) ou base vide.
- **Fichiers joints** : stockage privé du serveur, dossier du comité.
- **Entités** : chaque sous-comité, groupe ou équipe est un comité du serveur rattaché au comité central, avec ses propres données ; organigramme et demandes passent par des fonctions du serveur qui ne laissent sortir que le nécessaire. L'accès du comité central (consulter, modifier / ajouter) est appliqué par les règles du serveur, pas seulement par l'appli.

Détails techniques (tables, règles d'accès, fonction serveur) : [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
