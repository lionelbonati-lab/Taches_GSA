# Version réelle – Supabase

Projet Supabase « Taches_GSA » (région eu-west-1). L'adresse du projet et la clé « publishable » sont dans `src/lib/supabase.ts` (et `.env.example`) : elles sont publiques par nature, les données sont protégées par les règles d'accès de la base (RLS).

## État actuel (après l'étape D5, 03.11.2026)

Un seul espace, le club (`PLAN_APPLI_SIMPLE.md`) : sur le serveur, c'est l'ancien **comité central** (`committees`, type
`central`). Les anciennes entités (sous-comités, groupes, équipes) ont été **reprises** dans le club le 03.11.2026
(migrations 059 et 060) : chacune est devenue une étiquette du club, avec ses tâches et ses personnes ; elles restent
dans `committees`, **archivées** (`info.archive`, `info.reprise`), avec leurs données d'avant la reprise. Rien n'a été
effacé.

- **Ce que l'appli utilise** : `gsa_items` de l'espace du club, « Personnes du club » (`gsa_club_membres`,
  `gsa_club_iban`), un compte par personne (`gsa_club_comptes`, `gsa_members`), le stockage `gsa-fichiers` (dossier du
  club, et dossiers des anciennes entités pour les fichiers des tâches reprises : `gsa_fichier_repris`), les copies de
  nuit (`gsa_copies`), les notifications sur l'appareil (`gsa_push_*`), l'abonnement à l'agenda, les propositions, les
  erreurs, les mots de passe oubliés ; les fonctions serveur `gsa-acces`, `gsa-agenda`, `gsa-push` (étape D4, plus bas).
- **Ce qui reste des entités sans servir** : leurs lignes (archivées), les clés de l'organigramme dans `committees.info`
  (plus bas), le déclencheur `gsa_statuts_club` (058), qui recopie encore les statuts du club dans les entités archivées
  (sans effet visible), et des règles d'accès d'avant (fichiers partagés entre entités, 041). Laissés tels quels : ils ne
  gênent pas et ne s'effacent pas sans risque.
- **Fonctions SQL devenues inutiles** : 23 fonctions des entités que plus rien n'appelle (ni l'appli, ni les fonctions
  serveur, ni une règle, un déclencheur, une tâche planifiée ou une autre fonction) : **migration 061**, à appliquer par
  le président (plus bas). Inventaire refait le 03.11.2026 sur le serveur, en lecture seule : les 146 fonctions du schéma
  `public` sont toutes dans les migrations du dépôt, sauf 5 créées en dehors (`is_assigned`, `is_lead`, `is_member`,
  `is_super_admin`, `keep_one_admin`), que ni l'appli ni les fonctions serveur n'appellent (laissées) ; tâches planifiées : `gsa-copie-quotidienne`
  (036) et `gsa-push` (047), seulement.
- **Lire la suite** : les descriptions des migrations 005 à 058 racontent comment le serveur a été construit, quand le
  club avait des entités et un organigramme ; ce qui vaut aujourd'hui est résumé ici.

## Base de données

`supabase/migrations/003_gsa_donnees_partagees.sql` (appliqué) :

- `gsa_items` : un élément de l'appli par ligne (`kind` = collection : `tasks`, `people`, `meetings`, `log`, `prefs`…, `id`, `pos` = ordre, `data` = contenu jsonb, `deleted` = suppression douce). Diffusée en direct (Realtime).
- `gsa_members` : compte (`auth.users`) ↔ comité (`committees`) ↔ fiche responsable (`person_id`). `owner` = propriétaire (président) : accès et droits d'admin garantis.
- `gsa_is_member(comité)` : propriétaire, ou compte lié à une fiche **active**. `gsa_is_admin(comité)` : idem avec le rôle `admin`.
- Règles : lecture/écriture des éléments pour les membres ; seuls les admins modifient les rôles et les comptes administrateurs (déclencheur `gsa_items_guard`) ; `gsa_members` en lecture seule (sauf le propriétaire qui choisit sa fiche).
- Bucket privé `gsa-fichiers` : fichiers joints, chemin `<comité>/<fichier>`, réservé aux membres du comité.

`supabase/migrations/004_gsa_droits.sql` (appliqué) : droits sur les tables pour les comptes connectés et la fonction serveur. Le projet n'ouvre pas automatiquement les nouvelles tables à l'API ; sans ces droits, l'appli affiche « permission denied for table gsa_members ».

`supabase/migrations/005_gsa_entites.sql` (appliqué le 05.10.2026) : entités du club.

- `committees` : colonnes `parent_id` (comité central de l'entité ; vide pour le comité central), `type` (`central`, `sous-comite`, `groupe`, `equipe`) et `info` (couleur, description, date, archive). Le comité existant est devenu le comité central, ses données n'ont pas changé.
- Chaque entité a ses propres lignes dans `gsa_items` et ses membres dans `gsa_members` : les règles existantes la rendent invisible des autres entités, comité central compris.
- `gsa_organigramme(club)` : entités, membres actifs (nom, poste, rôles, email ; pas de téléphone) et sections du comité central, pour les seuls membres du club (`gsa_is_club_member`).
- `gsa_proposer_tache(entité, tâche)` : une entité envoie une tâche au comité central (titre, remarque et délai contrôlés, sans responsable, premier statut ouvert, marquée `proposee`) ; `gsa_mes_demandes(entité)` : leur suivi (statut, délai, responsables). Plus utilisées par l'appli depuis le 28.10.2026 (demandes au comité central retirées : on partage la tâche avec lui) ; elles restent sur le serveur, sans effet.
- Nom, couleur, description et date d'une entité : modifiables par ses admins et ceux du comité central ; type et archivage réservés au comité central (déclencheur `gsa_committees_guard`).

`supabase/migrations/006_gsa_acces_central.sql` (appliqué le 05.10.2026) : accès du comité central aux données d'une entité. Ajout pur : aucune donnée modifiée. **L'appli ne le propose plus** (plus de réglage ni de visite) : le comité dont une entité dépend voit ses tâches par la migration 027. Les valeurs `info.central` déjà enregistrées sont gardées telles quelles (l'appli ne les touche pas) ; la migration 028 ferme cet accès.

- Réglage `info.central` d'une entité : `aucun` (ou absent, par défaut), `lecture` ou `ecriture`. Seuls les admins de l'entité le changent : si un admin du comité central modifie l'entité, le déclencheur `gsa_committees_guard` garde l'ancienne valeur ; une valeur inconnue est refusée.
- `gsa_acces_central(entité)` : le niveau ouvert au compte connecté (`lecture`, `ecriture` ou rien), s'il est membre actif du comité central de l'entité.
- `gsa_items` : lecture pour les membres, ou si un niveau est ouvert ; ajout et modification pour les membres, ou en `ecriture` pour les collections `tasks`, `emails`, `notifications` et `log` seulement. Un non-membre ne peut pas supprimer une tâche (`gsa_items_guard`).
- Fichiers (`gsa-fichiers`) : lecture si un niveau est ouvert, envoi en `ecriture` (`gsa_file_reader`, `gsa_file_writer`) ; suppression réservée aux membres.
- Correction de 005 : la lecture de `committees` (`gsa_committees_select`) inclut les entités du comité central dont on est membre, sans quoi ses admins ne pouvaient pas modifier une entité dont ils ne font pas partie.

`supabase/migrations/007_gsa_logo.sql` (appliqué le 05.10.2026) : logo des entités. Ajout pur : aucune donnée modifiée.

- Logo gardé dans `committees.info.logo` (data URL), modifiable comme la couleur par les admins de l'entité et du comité central ; renvoyé par `gsa_organigramme` et la lecture de `committees`.
- `gsa_committees_guard` (mêmes règles que 006) refuse un logo qui n'est pas une image PNG, JPEG ou WebP en base64, ou qui dépasse 200 Ko (code `22023`, « Logo refusé… ») : pas de SVG ni de script. L'appli réduit l'image à 256 px avant de l'envoyer.
- Les en-têtes de l'ordre du jour et du PV sont des réglages de l'entité (`gsa_items`, ligne `meta` / `entetes`), soumis aux règles existantes.

`supabase/migrations/008_gsa_paiements.sql` (appliqué le 05.10.2026) : première version des tickets à rembourser (remplacée par 009). Aucune donnée modifiée ; `gsa_items_guard` reprend les règles de 006 et contrôle en plus les tickets (`data.paiement` d'une tâche) :

- valider (signer), refuser ou retirer une validation : droit `paiements.valider` ; la signature doit porter la fiche de la personne connectée ;
- un ticket validé ne change plus (montant, bénéficiaire, IBAN, justificatifs) sans ce droit ;
- marquer « payé » ou l'annuler : droit `paiements.payer`, au nom de la personne connectée ;
- un ticket validé ou payé n'est supprimé que par un validateur. Les admins de l'entité ont tous les droits.
- Fonctions ajoutées : `gsa_ma_fiche(entité)`, `gsa_a_droit(entité, droit)` (rôles de la fiche active), `gsa_paiement_check(…)`. Refus : code `42501`, message affiché dans l'appli.
- Les rôles existants reçoivent le droit « Caisse » (rôle Caissier / Trésorier) à la première ouverture de l'appli par un admin de l'entité.

`supabase/migrations/009_gsa_paiements_visa.sql` (appliqué le 05.10.2026) : circuit « photo → caisse → demande de visa → visa → paiement ». Remplace le contrôle de 008, **admins compris** (séparation des rôles). Aucune donnée modifiée.

- un ticket s'envoie à son propre nom (sauf par la caisse) et son demandeur ne change plus ;
- la caisse (`paiements.payer`) demande le visa, à une autre personne que le demandeur, en son propre nom ;
- seule la personne désignée par la caisse vise, jamais le demandeur, avec sa signature, sans changer montant, bénéficiaire ni IBAN ;
- un ticket visé ne change plus (montant, bénéficiaire, IBAN, justificatifs, visa) ; refus : la caisse ou la personne qui vise ; visa retiré : la caisse ou la personne qui a visé ;
- « payé » ou son annulation : la caisse, en son nom, sur un ticket visé ; un ticket visé ou payé n'est supprimé que par la caisse.
- Le modèle du sceau est un réglage de l'entité (`gsa_items`, ligne `meta` / `timbre`) ; la copie visée du ticket est un fichier joint ordinaire (`gsa-fichiers`).

`supabase/migrations/010_gsa_paiements_entites.sql` (appliqué le 05.10.2026) : **une caisse par entité**. Un ticket est enregistré dans l'entité dont on choisit la caisse (comité central, sous-comité, groupe, équipe) ; la caisse de chaque entité ne fait viser que **les membres de son comité** : fiche active de l'entité avec un rôle qui donne l'onglet Comité (`tab.meetings`) ou le droit de viser, ou admin de l'entité (`gsa_fiche_au_comite`). Contrôlé à la demande de visa et au moment du visa (une personne sortie du comité entre-temps ne vise plus). Aucune donnée modifiée. Rôle « Caissier » : créé dans les nouvelles entités ; dans une entité existante sans caisse, il est ajouté à l'ouverture par un admin, à attribuer ensuite dans « Responsables ».

`supabase/migrations/011_gsa_organigramme_caisse.sql` (appliqué le 06.10.2026) : `gsa_organigramme` indique pour chaque membre s'il tient la caisse de son entité (`caisse` : rôle non admin qui donne `paiements.payer`). Le formulaire des tickets ne propose ainsi que les entités qui ont un caissier désigné. Aucune donnée modifiée.

`supabase/migrations/012_gsa_tickets_caisse_centrale.sql` (appliqué le 06.10.2026) : **tout membre du club peut envoyer un ticket à la caisse centrale**, sans être membre du comité central. Aucune donnée modifiée.

- la photo est déposée dans le dossier du comité central sous un nom `tk-…` (règles de stockage `gsa_fichiers_ticket_*` : dépôt sans remplacement, relecture de ses propres dépôts, retrait seulement tant qu'aucun ticket ne les utilise) ;
- `gsa_ticket_central(source, ticket)` contrôle le contenu (objet, montant, bénéficiaire, IBAN, justificatifs déposés par la personne) et crée le ticket chez la caisse centrale, adressé à ses caissiers, avec un demandeur « externe » (entité, nom, compte) ; refusé aux membres du comité central (ils passent par leur propre caisse) et s'il n'y a pas de caissier ;
- `gsa_mes_tickets_centraux()` : la personne connectée suit l'état de ses tickets envoyés ;
- `gsa_paiement_check` : un ticket « externe » ne peut être créé que par `gsa_ticket_central`, son demandeur ne change plus et ne peut pas le viser.

`supabase/migrations/013_gsa_date_edition.sql` (appliqué le 06.10.2026) : `gsa_date_edition(entité, début, fin)` change la date de la prochaine édition d'un sous-comité ou d'une équipe d'événement (`committees.info.date` et `dateFin`, rien d'autre) ; réservé aux admins de l'entité, à ses membres qui ont le droit « Gérer les événements » et aux admins du comité central. Ajout pur, aucune donnée modifiée.

`supabase/migrations/014_gsa_agenda_club.sql` (appliqué le 06.10.2026) : `gsa_agenda_club(club)` donne à tout membre du club les événements de toutes ses entités non archivées (nom, dates, lieu ; pas la description), pour l'agenda du club. Lecture seule, ajout pur.

`supabase/migrations/015_gsa_paiements_factures.sql` (appliqué le 06.10.2026) : remboursements et **paiements de factures**. `gsa_ticket_central` accepte `type: 'facture'` (sous-section « Paiements », échéance facultative dans `delai`) en plus du remboursement ; `gsa_mes_tickets_centraux` renvoie le type. Remplacement des deux fonctions de 012 (même signature, mêmes contrôles) ; aucune donnée modifiée.

`supabase/migrations/016_gsa_membres_club.sql` (appliqué le 06.10.2026) : **registre « Membres du club »**, une fiche par personne pour tout le club.

- table `gsa_club_membres (club_id, id, data)` (club = comité central) : prénom, nom, email, téléphone, IBAN, couleur, groupes (entités de type groupe) ; contenu normalisé et borné par `gsa_club_membres_guard` ;
- accès (lecture et écriture) : `gsa_membres_acces(club)` = droit `club.membres` ou admin dans l'une des entités du club ; les autres membres n'y ont pas accès ;
- lien des fiches des entités (`gsa_items`, kind `people`, `data.membreId`) par le déclencheur `gsa_items_registre` : lien gardé, sinon membre de même email, sinon nouveau membre ; des coordonnées modifiées dans une entité passent dans le registre, et `gsa_club_membres_diffuse` les recopie dans toutes les autres fiches liées (sans boucle). Suppression d'un membre refusée tant qu'il a une fiche active (`gsa_club_membres_suppression`) ;
- reprise : les fiches existantes sont regroupées par email (comité central d'abord) ; **leurs valeurs ne changent pas**, seul `membreId` est ajouté ;
- le rôle « Secrétaire » du comité central reçoit le droit `club.membres` ; `gsa_organigramme` renvoie aussi le `membreId` de chaque fiche.

`supabase/migrations/017_gsa_icone.sql` (appliqué le 06.10.2026) : **nom et icône de l'appli installée** (icône tirée du logo du club). Bucket public `gsa-public` (PNG et JSON, 1 Mo au plus par fichier) : dossier `<id du comité central>/` avec les images préparées par l'appli (Console admin › Apparence) et `version.json` (icône du club ou non, nom choisi). Lecture publique (ce sont les icônes du site) ; dépôt, remplacement et retrait réservés aux admins du comité central (`gsa_icone_ecriture`), et seulement pour les noms de fichiers attendus. La publication du site (`scripts/icones-club.mjs`, workflows « Publication GitHub Pages » et « Nom et icône de l'appli ») reprend ces images après contrôle (PNG à la bonne taille) et écrit le nom dans le manifest et la page, sinon garde le nom et l'icône d'origine. Ajout pur, aucune donnée modifiée.

`supabase/migrations/018_gsa_taches_transmises.sql` (appliqué le 07.10.2026) : `gsa_taches_transmises(comité central)` donne aux membres du comité central les tâches que les sous-comités, groupes et équipes lui **transmettent** (case « Transmettre au comité central » de la tâche, `data.auCentral`) : titre, délai, statut, responsables, remarque, checklist, pour son ordre du jour. Pas les tickets ; entités archivées exclues. Lecture seule, ajout pur.

`supabase/migrations/019_gsa_taches_partagees.sql` (appliqué le 07.10.2026) : **tâches partagées entre entités**. Une tâche reste dans son entité ; `data.partage` liste les entités du club avec qui elle est partagée (`data.auCentral` de 018 vaut pour le comité central). `gsa_taches_partagees(entité)` donne à ses membres les tâches que les autres entités du club lui partagent (sans les documents, avec les statuts de l'entité d'origine). `gsa_modifier_tache_partagee(entité, entité d'origine, tâche, modification)` enregistre une modification faite depuis une entité du partage, dans l'entité d'origine : seuls titre, délai (qui ne suit alors plus son événement / sa séance), statut (de l'entité d'origine), remarque, checklist, responsables (fiches de l'entité d'origine), `respPartage` (responsables choisis par les entités du partage), le rangement de l'entité qui modifie et « modifiée par » sont repris ; le partage, les documents, les liens et la répétition restent. Pas de suppression ; pas les tickets ; entités archivées exclues. Ajout pur : deux fonctions, aucune donnée modifiée ; `gsa_taches_transmises` (018) n'est plus utilisée par l'appli.

`supabase/migrations/020_gsa_entite_membres.sql` (appliqué le 07.10.2026) : **toute une entité parmi les membres d'une autre** (organigramme). Les admins d'une entité B y ajoutent « tous les membres de A » (meta `membresDe` de B : `[{uniteId, role}]`, contrôlé par `gsa_items_liens_garde` : admins de B seulement). B reçoit une fiche liée par membre propre de A (`data.viaEntite`, `data.viaFiche`), tenue à jour par des déclencheurs (`gsa_items_liens`, `gsa_members_liens` → `gsa_liens_synchro`), quel que soit l'auteur de la modification : arrivées et départs (fiche désactivée, tâches gardées), coordonnées, couleur, accès à l'appli (`gsa_members`) ; pas de doublon d'un membre propre de B ; une fiche liée retirée à la main (`data.exclu`) ne revient pas ; une fiche liée n'est jamais admin. `gsa_organigramme` donne en plus `viaEntite` de chaque fiche et `liens` de chaque entité. Ajout pur : nouvelles fonctions, déclencheurs et index ; aucune donnée existante modifiée. Sans elle, l'appli n'affiche pas le choix « Tous les membres de … ». **Remplacée par 030** : plus de nouveau lien, les liens existants sont retirés.

`supabase/migrations/021_gsa_sondages_entites.sql` (appliqué le 07.10.2026) : **sondages ouverts à d'autres entités**. Un sondage reste dans son entité ; `data.entites` liste d'autres entités du club dont tous les membres votent aussi. `gsa_sondages_partages(entité)` donne à ses membres les sondages que les autres entités (non archivées) lui ouvrent ; `gsa_voter_sondage_partage(entité, entité du sondage, sondage, réponses, texte)` enregistre la réponse de la personne connectée dans l'entité du sondage, sous sa clé de vote (`gsa_cle_vote` : sa fiche dans l'entité du sondage si elle en est votante, sinon `entité:fiche` ; une même personne une seule fois, reconnue par `gsa_identites` : fiche du registre, email, fiche liée de 020). Contrôles : membre de l'entité, sondage toujours ouvert à elle et pas clôturé (date limite comprise), réponses parmi celles du sondage (une seule sans choix multiple). Ajout pur : quatre fonctions, aucune donnée modifiée. Sans elle, l'appli n'affiche pas le choix des entités.

`supabase/migrations/022_gsa_propositions.sql` (appliqué le 07.10.2026) : **propositions d'amélioration de l'appli**. Rangées dans les données du comité central (`gsa_items`, kind `propositions`), que ses admins traitent depuis l'appli (statut, réponse). `gsa_proposer_amelioration(comité central, entité ouverte, proposition)` : tout membre du club envoie une idée, un problème ou autre chose (texte de 4000 caractères au plus, page de l'appli concernée) ; le serveur y met le nom de l'auteur (sa fiche), son entité, la date, et son compte comme clé d'auteur ; 20 propositions par jour et par personne au plus. `gsa_mes_propositions(comité central)` : l'auteur en suit le statut et la réponse (retirées comprises). Ajout pur : deux fonctions, aucune donnée existante modifiée. Sans elle, la page « Proposer une amélioration » l'indique et n'envoie rien.

`supabase/migrations/023_gsa_organigramme_postes.sql` (appliqué le 08.10.2026) : **organigramme « colonne vertébrale »** (fiches à trois zones, postes, postes liés). Les postes d'une entité sont dans ses données (`gsa_items`, kind `meta`, id `postes` : `[{id, nom, titulaire, lien}]`) ; `gsa_organigramme` les renvoie aussi (clé `postes`). `gsa_postes_garde` : un poste **lié** (`lien` : le ★ d'une autre entité) ne se crée ni ne change que par le serveur (fonction `gsa-acces`, qui vérifie les droits des deux entités) ; les postes sans lien restent modifiables comme avant (fiches des personnes).

`supabase/migrations/024_gsa_visa_direct.sql` (appliqué le 08.10.2026) : **visa direct d'une facture** par la personne qui l'envoie. `gsa_paiement_check` (012) accepte qu'une facture passe à « visé » sans demande de visa, à la création ou depuis « reçu » / « refusé », si son demandeur est la personne connectée, a le droit de viser (rôle « peut viser », ou admin) et fait partie du comité, n'est pas caissier (rôle « Caisse »), si l'entité a un caissier, si la facture n'est pas à son propre nom (prénom nom ou nom prénom) et si le visa porte sa signature. Pas pour un remboursement ni pour un ticket externe (`gsa_ticket_central`). Le reste du circuit est inchangé.

`supabase/migrations/025_gsa_comptes.sql` (appliqué le 12.10.2026) : **comptes, mot de passe oublié, super-admin**.

- **Mot de passe provisoire appliqué par le serveur** : le drapeau `doit_changer_mdp` est maintenant dans `app_metadata` (que l'utilisateur ne peut pas modifier) ; les comptes qui l'avaient dans `user_metadata` le reçoivent aussi. `gsa_compte_ok()` lit le jeton : tant que le drapeau est posé, `gsa_is_member`, `gsa_is_admin`, `gsa_a_droit` et `gsa_ma_fiche` répondent non, donc aucune règle d'accès ne laisse lire ni écrire (mêmes corps qu'avant sinon). Le déclencheur `gsa_mdp_change` (sur `auth.users`) retire le drapeau quand l'utilisateur change lui-même son mot de passe ; un mot de passe provisoire donné par la fonction `gsa-acces` le repose.
- **Super-admins** (`gsa_super_admins`, `gsa_est_super_admin()`) : au-dessus des entités ; au départ, le ou les propriétaires du comité central. En ajouter un : `insert into public.gsa_super_admins (user_id) select id from auth.users where email = '<adresse>';`
- **Demandes de mot de passe** (`gsa_demandes_mdp`, lue seulement par le serveur) : `gsa_demandes_mdp_entite(entité)` donne à ses admins les demandes en attente (7 jours) de ses membres, avec `peut` = l'appelant peut la valider (`gsa_peut_approuver_mdp` : super-admin ; sinon admin d'une entité où la personne est membre active, jamais pour soi, un propriétaire ou un super-admin, et pour chaque entité où la personne est admin, admin de cette entité ou du comité central).
- Pour la fonction `gsa-acces` seulement : `gsa_comptes_club()` (comptes, entités, état), `gsa_compte_par_email`, `gsa_fusionner_comptes(garder, absorber)` (rattachements, super-admin, tickets envoyés à la caisse centrale, propositions, entités créées).

Ajout pur, sauf le drapeau recopié dans `app_metadata` ; les données des entités ne changent pas.

`supabase/migrations/026_gsa_organigrammes_annuels.sql` (appliqué le 13.10.2026) : **historique de l'organigramme par année**, en lecture seule, visible de tout le club.

- `gsa_organigrammes` (club, année, photo, date) : lue par tous les membres du club (`gsa_is_club_member`) ; aucune écriture possible depuis l'appli (ni droit, ni règle).
- `gsa_photo_organigramme(club)` : appelée par l'appli après chaque lecture de l'organigramme. Le serveur prend la photo lui-même avec `gsa_organigramme` (rien ne vient de l'appli), sans adresses e-mail ni contenu des fiches d'entités (seulement couleur, dates, archivage, « Dépend de », place de la carte et ordre des cartes d'un comité), et n'écrit que l'**année en cours** (heure de Zurich), seulement si elle a changé. Une année passée garde sa dernière photo : rien ne la modifie plus.
- Retirer une personne d'une photo (demande d'effacement) : à faire dans l'éditeur SQL, par le propriétaire du projet.

Ajout pur : une table, une fonction ; aucune donnée existante modifiée. Sans elle, l'appli n'affiche pas le choix de l'année.

`supabase/migrations/027_gsa_taches_dependance.sql` (appliquée le 13.10.2026) : **les tâches d'une entité dans le comité dont elle dépend**.

- `gsa_dependance(entité)` : le comité dont elle dépend, comme l'appli (`info.dependDe` ; sans valeur, inconnue, archivée ou en boucle : le comité central ; une ancienne valeur vers un groupe ou un événement : son comité).
- `info.tachesDependance` (réglé dans sa fiche ⚙️) : ce que cette entité-là affiche de ses tâches — `toutes`, sans valeur : seulement celles partagées avec elle (comme avant), `rien` : aucune, même partagées. Les autres entités : les tâches partagées avec elles. Jamais les tickets.
- `gsa_reglage_taches(entité)` (privée) : ce réglage, sauf pour un **événement** auquel aucun poste n'est lié (meta `postes`, `lien`) dans son comité ou l'une des entités de ce comité, hors archivées : tout le comité en est responsable, donc `toutes`.
- `gsa_taches_partagees` et `gsa_modifier_tache_partagee` (019) suivent cette règle (`gsa_tache_visible`) ; le reste de leur corps est inchangé.
- `gsa_committees_guard` (007) : `tachesDependance` contrôlé ; « Dépend de » ne change que par les admins du comité central (sinon l'ancienne valeur reste).

Aucune donnée existante modifiée ; sans réglage, rien ne change, sauf pour un événement sans poste lié (toutes ses tâches dans son comité). Sans elle, le réglage s'enregistre mais la version réelle continue d'afficher seulement les tâches partagées.

`supabase/migrations/028_gsa_fermer_acces_central.sql` (appliquée le 13.10.2026) : **accès du comité central fermé**. `gsa_acces_central` (006) ne donne plus aucun accès : seuls les membres d'une entité lisent et modifient ses données et ses fichiers ; le comité dont elle dépend voit ses tâches par la migration 027. Aucune donnée modifiée (les valeurs `info.central` restent, sans effet). Retour en arrière : relancer la définition de `gsa_acces_central` de la migration 006.

`supabase/migrations/029_gsa_externes_finances.sql` (appliquée le 13.10.2026) : **le serveur n'envoie à chacun que les tâches qu'il peut voir** (externes, bénévoles, finances). Jusqu'ici, tout membre recevait toutes les données de l'entité et l'appli cachait le reste.

- `gsa_items` (règles `gsa_items_select` et `gsa_items_update`, fonction `gsa_ligne_lisible`) : pour les membres de l'entité, les tâches lisibles (`gsa_tache_lisible`) : admins, responsables, la personne qui l'a créée, rôles « Voir toutes les tâches » qui couvrent sa section (`gsa_a_droit_section` : rôle sans section = toutes). Les **tickets** (tâche avec `paiement`), à part : la caisse (`paiements.payer`), le demandeur, la personne à qui le visa est demandé ou qui l'a visé, responsables, auteur, admins — « Voir toutes les tâches » ne suffit pas. Emails programmés : ceux des tâches lisibles et les siens ; notifications : reçues ou envoyées ; journal : `admin.access` et ses propres entrées. Le reste (séances, événements, personnes, sondages, réglages…) : tous les membres, comme avant.
- Écriture : on ne modifie que ce qu'on peut lire ; une ligne qu'on vient d'écrire reste lisible pendant cette écriture (`updated_by`, `updated_at` posés par `gsa_items_guard`), sinon un upsert qui confie une tâche à quelqu'un d'autre serait refusé. Ajout : comme avant (membres).
- Fichiers (`gsa_file_reader`, règles `gsa_fichiers_update` et `gsa_fichiers_delete`) : un fichier joint à des tâches (`documents`, visa signé compris) ne se lit, ne se remplace et ne se supprime que si l'une d'elles est lisible ; les autres fichiers : membres de l'entité.
- Tâches des autres entités (`gsa_taches_partagees`, `gsa_modifier_tache_partagee`, ancienne `gsa_taches_transmises`) : admins et « Voir toutes les tâches » de l'entité qui les reçoit ; sinon celles dont on est responsable (`gsa_partagee_lisible` : même fiche du registre des membres du club ou même email, comme l'appli).
- Coût : environ 0,4 ms par tâche, entrée du journal ou notification au chargement (≈ 0,2 s avec les volumes actuels).

Aucune donnée modifiée. Retour en arrière : relancer les règles et fonctions de 003, 006, 018 et 027.

`supabase/migrations/030_gsa_dependances.sql` (appliquée le 13.10.2026) : **dépendances** (changement de comité, caisse du comité, fin des membres liés).

- **Changement de « Dépend de »** : rien n'est déplacé ni copié. `gsa_committees_guard` note la période qui se termine dans `info.historiqueDependance` (tenu par le serveur seulement, 20 périodes au plus) : le comité d'alors, la date, le réglage des tâches d'alors et la liste des tâches de l'entité à ce moment (hors tickets). Revenir au comité d'avant dans l'heure efface le changement au lieu d'ajouter une période. De l'extérieur, seul le champ `copie` de la dernière période se change (retirer ou rendre le droit de copie), par les admins de l'entité ou du comité central.
- **Ancien comité** : il garde les tâches de sa période, selon le réglage d'alors, comme avant ; rien de nouveau ne lui arrive.
- **Nouveau comité** : `gsa_anciennes_taches(entité)` donne à ses membres (mêmes règles de lecture que 029) les anciennes tâches des entités qui dépendent de lui, en lecture seule (sans les documents, avec leur nombre) ; `gsa_modifier_tache_partagee` les refuse. La copie est faite par l'appli : une tâche du comité, indépendante, avec la mention « copiée depuis le comité X, le … » (`data.copieDe`). Le droit dure tant que l'entité dépend de ce comité. Ordres du jour, PV et tickets ne sont pas concernés.
- `gsa_taches_partagees` suit cette règle (`gsa_tache_dans`) ; `gsa_dependance` passe par `gsa_dependance_choisie` (même résultat qu'en 027).
- **Caisse** : les tickets envoyés depuis une entité vont à la caisse du comité dont elle dépend s'il a un caissier (fiche active d'un rôle avec « Caisse », `gsa_caissiers`), sinon à la caisse centrale (`gsa_caisse_de`). `gsa_ticket_central` (même signature) et `gsa_depot_ticket` (dépôt du justificatif) suivent cette caisse ; un membre de la caisse visée y saisit son ticket directement.
- **Fin des membres liés (020)** : `gsa_items_liens_garde` refuse tout nouveau lien ; le retrait reste possible. Le bloc de migration retire les liens existants (fiches liées désactivées par 020, leurs tâches restent) ; l'entité qui comptait tous les membres du comité dont elle dépend passe au réglage `toutes` (« Afficher les tâches »).

Données modifiées : les entités qui avaient des membres liés (meta `membresDe` vidée, `info.tachesDependance` à `toutes` si le lien venait du comité dont elles dépendent). Retour en arrière : relancer les définitions de 027 (`gsa_dependance`, `gsa_committees_guard`), 029 (`gsa_taches_partagees`, `gsa_modifier_tache_partagee`), 020 (`gsa_items_liens_garde`), 015 (`gsa_ticket_central`) et 012 (`gsa_depot_ticket`) ; les liens retirés se remettent à la main.

`supabase/migrations/031_gsa_droits_serveur.sql` (appliquée le 13.10.2026) : **droits de la fonction `gsa-acces`** (clé secrète). Elle lit et écrit le registre « Membres du club » (`gsa_club_membres` : personne placée dans l'organigramme, entité supprimée retirée des groupes) et supprime une entité archivée (`delete` sur `committees`, données en cascade). Sans elle : « Registre des membres : permission denied for table gsa_club_membres » en déplaçant quelqu'un dans l'organigramme, et la suppression d'une entité est refusée. Aucune donnée modifiée.

`supabase/migrations/032_gsa_seances_comite.sql` (appliquée le 13.10.2026) : **séances du comité dont dépend l'entité**, pour y lier une tâche. Nouvelle fonction `gsa_seances_comite(unite)` (lecture seule, membres de l'entité) : `{ comite, seances: [{ id, titre, date, heure }] }` du comité donné par `gsa_dependance` (030) ; ni ordre du jour, ni notes, ni PV, ni excusés ; `comite` vide pour le comité central. La tâche garde la séance choisie (`data.seanceComite` : entité, séance, titre, date) et l'appli la partage avec ce comité : `gsa_taches_partagees` la lui donne déjà (règle 030), l'appli la place à l'ordre du jour de cette séance, et `gsa_modifier_tache_partagee` garde ce champ. Ces séances servent aussi de repère à « Pour quand ? » (« 1 semaine avant … ») : l'appli relit leurs titres et dates et met à jour les tâches liées. Sans elle, le formulaire indique que les séances du comité seront proposées après la mise à jour du serveur. Aucune donnée modifiée ; retour en arrière : `drop function public.gsa_seances_comite(uuid);`.

`supabase/migrations/033_gsa_sections_dependantes.sql` (appliquée le 13.10.2026) : **sections des entités qui dépendent du comité**, pour lui attribuer une tâche (formulaire d'une tâche : section au nom d'un groupe › « Sections de … »). Nouvelle fonction `gsa_sections_dependantes(unite)` (lecture seule, membres de l'entité) : `[{ uniteId, sections: [{ id, nom }] }]` des entités non archivées dont `gsa_dependance` (030) est l'entité ; ni sous-sections, ni tâches. Avec la migration 035, la tâche est ensuite **enregistrée chez l'entité** (sections d'un groupe, et section d'un événement où la ranger). Sans 033, le formulaire indique que les sections seront proposées après la mise à jour. Ajout pur, aucune donnée modifiée.

`supabase/migrations/034_gsa_iban_confidentialite.sql` (appliquée le 13.10.2026) : **IBAN à part** (table `gsa_club_iban`, lue et écrite par le serveur seul : `gsa_mon_iban`, par la personne elle-même ; `gsa_membres_liste` le donne aux caissiers) et **confidentialité** (`gsa_ma_confidentialite` : email, téléphone et IBAN masqués dans la liste des membres). Les IBAN déjà saisis dans le registre y ont été déplacés (rien d'effacé).

`supabase/migrations/035_gsa_taches_attribuees.sql` (appliquée le 13.10.2026) : une tâche que le comité **attribue à un groupe ou à un événement qui dépend de lui** (sa sous-section) est **enregistrée chez eux**, partagée avec le comité (où elle reste visible et modifiable, à la même place). Nouvelle fonction `gsa_attribuer_tache(unite, cible, tache, statut)` : la personne connectée est membre du comité et peut y créer des tâches dans la section ; l'entité dépend du comité (`gsa_dependance`, 030), n'est pas archivée ; pas de ticket ; identifiant libre et section existante chez elle. Gardés : les responsables qui ont une fiche chez elle (les autres restent ceux du comité, `respPartage`), le partage (avec le comité en plus), la séance du comité liée (`seanceComite`), les liens (pas les fichiers) ; statut de l'entité du même nom, sinon du même état ; `attribueePar` (comité, personne, date). L'appli retire ensuite la tâche du comité (tâche existante). Sans elle, le formulaire affiche que le serveur n'est pas à jour et rien n'est changé. Ajout pur, aucune donnée existante modifiée.

`supabase/migrations/036_gsa_copies_auto.sql` (appliquée le 14.10.2026) : **copie automatique des données de chaque entité, chaque nuit, gardée 30 jours**. Active l'extension `pg_cron` et planifie la tâche `gsa-copie-quotidienne` (01:17 UTC, vers 2 h ou 3 h à Zurich) ; une première copie est faite à l'application. Nouvelle table `gsa_copies` (aucun accès direct : RLS sans règle, droits retirés) : les lignes non supprimées de `gsa_items` de l'entité, telles quelles, avec une empreinte (md5) — une copie identique à la précédente n'est pas refaite. Chaque nuit, les copies de plus de 30 jours sont effacées, **sauf la plus récente de chaque entité** (seul effacement, limité à cette nouvelle table). Les fichiers joints ne sont pas copiés (ils restent dans `gsa-fichiers`, que la restauration ne touche pas) ; l'IBAN et le registre du club non plus. Fonctions des admins de l'entité (`gsa_is_admin`) : `gsa_copies_liste(unite)`, `gsa_copie(unite, copie)`, `gsa_copier_maintenant(unite)`. Dans l'appli : Console admin › Sauvegarde (autrefois Réglages) › **Copies automatiques** (liste, ⬇ téléchargement en fichier de sauvegarde, ↩ restauration avec copie de l'état actuel juste avant, 📸 Copier maintenant). Sans 036, Réglages indique que la mise à jour est à appliquer. Ajout pur, aucune donnée existante modifiée. Vérifier après coup : `select jobname, schedule from cron.job;` et `select committee_id, faite_le, lignes from public.gsa_copies order by faite_le desc;`.

`supabase/migrations/037_gsa_pour_info.sql` (appliquée) : **« 👁 Pour info » sur une tâche** — des personnes ou des entités la voient sans s'en occuper (`data.pourInfo` : `personnes` de l'entité de la tâche, `unites` du club, `autres` = personnes d'autres entités par entité ; jamais pour les tickets). `gsa_tache_lisible` (029) est redéfinie avec un seul bloc de plus : une personne mentionnée lit la tâche dans son entité, même sans « Voir toutes les tâches ». Nouvelle fonction `gsa_taches_pour_info(unite)` : les tâches des autres entités du club pour info de l'entité ouverte (lues par ses admins et les rôles « Voir toutes les tâches ») ou de la personne connectée, en lecture seule, comme `gsa_anciennes_taches` (liens joints transmis, fichiers comptés seulement). Sans 037, l'appli enregistre la liste mais les personnes mentionnées d'ici sans « Voir toutes les tâches » ne lisent pas la tâche, et les autres entités ne la reçoivent pas. Ajout pur, aucune donnée modifiée ; retour en arrière : relancer `gsa_tache_lisible` de 029.

`supabase/migrations/038_gsa_a_prendre.sql` (appliquée) : **« 🙋 À prendre »** — une tâche proposée à quelques personnes de son entité, l'une d'elles s'en charge elle-même (`data.aPrendre` : `personnes` = fiches de l'entité, `nombre` = personnes qu'il faut, 1 si absent ; une place est prise tant que la personne proposée est responsable ; jamais pour les tickets). `gsa_tache_lisible` (037) est redéfinie avec un seul bloc de plus : une personne à qui la tâche est proposée la lit, même sans « Voir toutes les tâches ». Nouvelle fonction `gsa_prendre_tache(unite, tache)` (« 🙋 Je m'en charge ») : vérifie que la tâche est proposée à la personne connectée, n'est ni un ticket, ni supprimée, ni terminée, et qu'il reste une place (ligne verrouillée : deux clics en même temps, le second trouve la place prise), puis l'ajoute aux responsables ; rien d'autre ne change. Sans 038, l'appli enregistre la proposition mais les personnes proposées sans « Voir toutes les tâches » ne lisent pas la tâche, et « Je m'en charge » répond que le serveur n'est pas à jour. Ajout pur, aucune donnée modifiée ; retour en arrière : relancer `gsa_tache_lisible` de 037 et supprimer `gsa_prendre_tache`.

`supabase/migrations/039_gsa_pas_dispo.sql` (appliquée) : **« 🙅 Pas dispo »** sur une tâche à prendre — la personne à qui elle est proposée décline ; elle s'ajoute à `data.aPrendre.refus` et l'auteur voit qui a décliné. Nouvelle fonction `gsa_pas_dispo(unite, tache)` : mêmes contrôles que `gsa_prendre_tache` (fiche dans l'entité, tâche proposée à la personne, ni ticket ni supprimée), refusée si elle en est déjà responsable ; ligne verrouillée et modifiée sur le serveur, une place prise au même moment n'est pas écrasée. `gsa_prendre_tache` (038) est redéfinie : elle retire en plus la personne de `refus` quand elle change d'avis. Sans 039, « Pas dispo » répond que le serveur n'est pas à jour. Ajout pur, aucune donnée modifiée ; retour en arrière : relancer `gsa_prendre_tache` de 038 et supprimer `gsa_pas_dispo`.

`supabase/migrations/040_gsa_partagees_a_prendre.sql` (appliquée) : **« 🙋 À prendre » et « 👁 Pour info » dans les tâches partagées** — une entité avec qui la tâche est partagée la propose à ses propres personnes et met des personnes ou des entités au courant. Les propositions d'une entité du partage sont rangées dans `data.aPrendre.partage[entité]` (`personnes` = ses fiches, `refus`, `par` = qui les a proposées) ; celles qui s'en chargent deviennent ses responsables (`respPartage[entité]`). Les places se comptent toutes entités confondues (nouvelle fonction interne `gsa_places_prises`, non appelable par les utilisateurs). Redéfinies avec la même règle et un bloc de plus : `gsa_prendre_tache` (039 : places comptées ensemble), `gsa_partagee_lisible` (029 : une personne à qui la tâche est proposée dans son entité la lit) et `gsa_modifier_tache_partagee` (030 : enregistre les propositions de l'entité qui modifie — ses fiches seulement, ses « Pas dispo » gardés, celles des autres entités inchangées — le nombre de personnes qu'il faut, et la liste « Pour info », vérifiée : personnes de l'entité de la tâche, entités du club). Nouvelle fonction `gsa_repondre_partagee(unite, source, tache, prend)` : « Je m'en charge » ou « Pas dispo » depuis l'entité `unite` (fiche dans l'entité, tâche partagée avec elle et proposée à la personne ici ; ligne verrouillée, comme `gsa_prendre_tache`). Sans 040, ces réponses disent que le serveur n'est pas à jour et les propositions faites depuis une entité du partage ne sont pas enregistrées. Ajout pur, aucune donnée modifiée ; retour en arrière : relancer `gsa_partagee_lisible` de 029, `gsa_modifier_tache_partagee` de 030, `gsa_prendre_tache` de 039, et supprimer `gsa_repondre_partagee` et `gsa_places_prises`.

`supabase/migrations/041_gsa_partagees_documents.sql` (appliquée) : **documents, fichiers, répétition, séance et partage depuis les entités du partage** — dans une tâche partagée par une autre entité, « Ajouter : » propose tous les boutons. `gsa_taches_partagees` (030) renvoie désormais les documents de la tâche et `v` = 41 (l'appli sait alors que ces parties se modifient d'ici ; sans 041, elle les laisse à l'entité de la tâche). `gsa_modifier_tache_partagee` (040) enregistre en plus, depuis l'entité `unite` : la **liste des documents** (ceux de la tâche gardés tels quels ou retirés ; nouveaux liens http/https et fichiers déposés dans le dossier de l'entité de la tâche sous `<entité>/pt-…`, vérifiés dans le stockage et au nom de qui les a déposés, `parNom` « Prénom Nom (Entité) » ; fonction interne `gsa_docs_partagee`, non appelable par les utilisateurs), la **répétition** (« à chaque séance » seulement si elle l'était déjà), une **séance de `unite`** (`seanceComite`, si la tâche n'est liée ni à une séance de son entité ni à celle d'une autre) et le **partage** (autres entités du club, pas l'entité de la tâche ; `unite` reste comme elle était ; la séance d'une entité retirée est retirée). Sans clé `documents` (appli d'avant), les documents sont gardés ; répétition, séance et partage renvoyés tels quels ne changent pas. Stockage : trois règles de plus sur `storage.objects`, créées seulement si absentes — `gsa_fichiers_partage_insert` (dépôt `<entité>/pt-…` par un membre du club, sans remplacement : `gsa_depot_partage`), `gsa_fichiers_partage_select` (relecture de ses dépôts ; lecture des fichiers d'une tâche que la personne voit depuis une autre entité : `gsa_fichier_partage_lisible`, même règle que la tâche) et `gsa_fichiers_partage_delete` (ses dépôts, tant qu'aucune tâche ne les utilise). L'occurrence suivante d'une tâche répétée terminée depuis une autre entité est créée par l'appli à l'ouverture par un membre de l'entité de la tâche. Ajout pur, aucune donnée modifiée ; retour en arrière : relancer `gsa_taches_partagees` de 030 et `gsa_modifier_tache_partagee` de 040, supprimer les règles `gsa_fichiers_partage_insert` / `_select` / `_delete` et les fonctions `gsa_depot_partage`, `gsa_fichier_partage_lisible` et `gsa_docs_partagee`.

`supabase/migrations/042_gsa_agenda_heures_repetition.sql` (appliquée le 15.10.2026) : **heures et répétitions des événements dans l'agenda du club**. `gsa_agenda_club(club)` (014) est redéfinie à l'identique, avec quatre champs de plus pour chaque événement des autres entités : `heure` et `heureFin` (« 19:30 » ; absentes = toute la journée), `repetition` (la règle : `freq` jour / semaine / mois / an, `intervalle`, `jours`, `mensuel`, `jusquau`, `nombre` ; transmise seulement si c'est un objet) et `sauf` (les occurrences supprimées ; seulement si c'est une liste). Toujours pas la description. Sans 042, les événements périodiques des autres entités n'apparaissent qu'à leur première date, sans heure. Les heures et répétitions de l'entité ouverte n'en dépendent pas (enregistrées dans `gsa_items`, comme le reste de l'événement). Ajout pur, aucune donnée modifiée ; retour en arrière : relancer `gsa_agenda_club` de 014.

`supabase/migrations/043_gsa_visa_securise.sql` (appliquée le 19.10.2026) : **visa sécurisé**. `gsa_paiement_check` (024) est redéfinie à l'identique, plus un bloc pour tout nouveau visa (normal ou direct) : **mot de passe saisi il y a moins de 10 minutes** (`gsa_auth_recente(600)` : date de la connexion par mot de passe inscrite dans le jeton, `amr` ; l'appli redemande le mot de passe au moment de signer), **n° de visa** `validation.code` au format `XXXX-XXXX` (sans 0, O, 1, I) et **unique** dans tous les tickets (index `gsa_items_visa_code_idx`), **date du visa** `validation.le` à l'heure du serveur (10 minutes avant, 5 minutes après au plus). Le reste du circuit ne change pas : « payé », retrait du visa, suppression et visas déjà donnés (sans numéro) passent comme avant. Nouvelle fonction `gsa_verifier_visa(code)` : le ticket visé ou payé qui porte ce n° (entité, titre, type, montant, bénéficiaire, signataire, visa direct, date, état, date du paiement ; ni IBAN, ni justificatifs, ni signature), pour un membre du club de ce ticket ; `null` sinon (n° inconnu, visa retiré, ticket supprimé, autre club). Sans 043, l'appli vise toujours (le n° est enregistré et imprimé, le mot de passe demandé) mais le serveur ne l'exige pas, et « Vérifier un visa » indique que la migration manque. Ajouts seulement, aucune donnée modifiée ; retour en arrière : relancer `gsa_paiement_check` de 024.

`supabase/migrations/044_gsa_sondages_heure_limite.sql` (appliquée le 21.10.2026) : **clôture automatique des sondages à la date et à l'heure limite**. Un sondage peut avoir une heure limite (`data.heureLimite`, « 18:00 », heure de Suisse) en plus de sa date limite, et une date limite seulement indicative (`data.clotureAuto = false` : il reste ouvert jusqu'à « Clôturer »). L'appli applique la règle pour les sondages de l'entité ; la migration la fait respecter par le serveur pour les réponses des autres entités du club : `gsa_voter_sondage_partage` (021) est redéfinie à l'identique, sauf le contrôle de la date limite (refus à partir de la date et de l'heure limite, heure de Suisse ; sans heure, à la fin du jour comme avant ; aucun refus pour une date indicative). Sans 044, le serveur ne regarde que la date : une réponse d'une autre entité passe encore après l'heure limite le jour même, et un sondage à date indicative la refuse après la date. Aucune donnée modifiée ; retour en arrière : relancer `gsa_voter_sondage_partage` de 021.

`supabase/migrations/045_gsa_agenda_abonnement.sql` (appliquée le 26.10.2026, avec la fonction `gsa-agenda` ci-dessous) : **abonnement à l'agenda par lien privé**. Table `gsa_agenda_abonnements` : un lien par personne et par entité (`jeton` de 64 caractères tirés au hasard, `options` : séances, événements, agenda du club, fins de sondage, délais des tâches, adresse et nom de l'appli ; `lu_le` : dernière lecture par un agenda). Chacun ne lit que le sien (RLS) ; `gsa_abonnement_agenda(c, options, nouveau)` le crée ou change ses choix (membres de l'entité seulement ; `nouveau` : nouveau jeton, l'ancien lien ne marche plus), `gsa_abonnement_agenda_supprimer(c)` le supprime. Sans 045, la fenêtre « Exporter » de l'Agenda le dit (« pas encore installé ») ; le fichier .ics marche sans. Ajout pur ; retour en arrière : supprimer les deux fonctions et la table.

`supabase/migrations/046_gsa_pour_info_vus.sql` (appliquée le 26.10.2026) : **retour des « ✓ Vu » sur les tâches « Pour info »**. Quand une personne mentionnée pour info marque « ✓ Vu », c'est noté sur la tâche (`data.pourInfoVus` : clé « pour info » → date, et qui pour une entité), et l'auteur le voit sur les pastilles de la fiche (verte avec ✓ et la date ; rouge tant que ce n'est pas vu ; pour une entité mentionnée en entier, chacune des personnes qui la reçoivent compte : orange tant qu'une partie seulement l'a vue). Seul le serveur l'écrit : `gsa_pour_info_vu(unite, tache, depuis)` ajoute les clés de la personne connectée (elle-même ; elle au titre de son entité, `u:entité:fiche`, si elle en est admin ou « Voir toutes les tâches »), la première fois compte ; `gsa_pour_info_destinataires(unite, tache)` donne, pour chaque entité mentionnée en entier, les fiches des personnes qui la reçoivent (actives, avec un compte, admins ou « Voir toutes les tâches » ; membres du club seulement) ; le déclencheur `gsa_items_vus_garde` garde `pourInfoVus` tel qu'il est sur toute autre écriture (ni ajout ni effacement par l'appli, même par une copie en retard). Sans 046, le « ✓ Vu » ne retire la tâche que de l'accueil de la personne, et l'appli l'indique (« mise à jour 046 à appliquer ») ; les « Vu » déjà donnés sont reportés sur la tâche une fois 046 en place. Ajout pur ; retour en arrière : supprimer le déclencheur, puis les fonctions `gsa_items_vus_garde`, `gsa_pour_info_vu` et `gsa_pour_info_destinataires`.

`supabase/migrations/047_gsa_push.sql` (appliquée le 26.10.2026, avec la fonction `gsa-push` ci-dessous) : **notifications sur téléphone (ou ordinateur), même l'appli fermée** (« Web Push »). Chacun active les notifications sur ses appareils (Réglages › Notifications) : l'appareil s'inscrit dans `gsa_push_abonnements` (adresse d'envoi donnée par le navigateur, ses deux clés de chiffrement, nom de l'appareil ; 10 appareils par personne au plus) par `gsa_push_abonner(adresse, cle, secret, appareil)` ; `gsa_push_desabonner(adresse)` le retire, `gsa_push_etat(adresse)` dit s'il est inscrit, combien d'appareils et le dernier envoi. Personne ne lit les tables directement (ni l'appli, ni les visiteurs). Toutes les 5 minutes, la planification `gsa-push` (pg_cron) lance `gsa_push_lancer()`, qui appelle la fonction (extension `pg_net`, installée dans le schéma `extensions`) avec la clé de lancement de `gsa_push_reglages` (tirée au hasard ici) si au moins un appareil est inscrit. `gsa_push_envois` garde ce qui a déjà été envoyé (60 jours). Les clés d'identité du serveur (VAPID) sont créées par la fonction à la première inscription et gardées dans `gsa_push_reglages` : rien à régler à la main. Sans 047, Réglages le dit (« mise à jour 047 à appliquer »). Ajout pur ; retour en arrière : `select cron.unschedule('gsa-push')`, puis supprimer les quatre fonctions et les trois tables.

`supabase/migrations/048_gsa_sans_acces_anonyme.sql` (appliquée le 26.10.2026) : **fonctions du serveur fermées aux visiteurs non connectés**. Par défaut, une fonction du schéma `public` peut être appelée avec la seule clé publique de l'appli (rôle `anon`, visible par tous) : les fonctions `gsa_*` vérifiaient déjà qui appelle et ne répondaient rien sans compte, mais restaient appelables. 048 retire ce droit à `anon` (et à `public`) sur chaque fonction `gsa_*` qui l'avait encore (61 au 26.10.2026) ; `authenticated` et `service_role` gardent le leur, donc rien ne change pour l'appli connectée, les règles d'accès (RLS, fichiers), ni les fonctions `gsa-acces`, `gsa-agenda` et `gsa-push`. Les fonctions qui ne sont pas `gsa_*` ne sont pas touchées. Un contrôle final arrête la migration si une fonction `gsa_*` reste ouverte. Aucune donnée modifiée ; retour en arrière : `grant execute on function public.<nom>(<arguments>) to anon;` pour la fonction concernée.

`supabase/migrations/049_gsa_commentaires.sql` (appliquée le 26.10.2026) : **discussion sur une tâche**. Les commentaires sont gardés sur la tâche (`data.commentaires` : `{id, par, u?, nom, le, texte, modifieLe?}` ; `par` = fiche de l'auteur, `u` = son entité quand ce n'est pas celle de la tâche). Seul le serveur les écrit : `gsa_commenter(unite, tache, depuis, texte, cle, supprimer)` ajoute un commentaire (1 à 2000 caractères, 200 par tâche) si la personne connectée voit la tâche depuis l'entité `depuis` (sa propre entité, une entité du partage, ou une mention « Pour info »), corrige ou retire le sien (`cle`), et laisse un admin de l'entité de la tâche retirer n'importe lequel ; pas sur un ticket de paiement. Un nouveau commentaire ajoute une notification 💬 (`kind = 'notifications'`, `type: 'comment'`) aux responsables, à l'auteur de la tâche, aux responsables des entités du partage et aux personnes qui ont déjà commenté, chacun dans son entité (fiche active, entité non archivée du club), sauf l'auteur du commentaire. Le déclencheur `gsa_items_commentaires_garde` garde `commentaires` tel qu'il est sur toute autre écriture (ni ajout, ni modification, ni effacement par l'appli, même par une copie en retard). Sans 049, l'appli l'indique à l'envoi (« mise à jour 049 à appliquer »). Ajout pur ; retour en arrière : supprimer le déclencheur, puis les fonctions `gsa_items_commentaires_garde` et `gsa_commenter`.

`supabase/migrations/050_gsa_historique.sql` (appliquée le 26.10.2026) : **historique d'une tâche** (qui a changé quoi et quand). Table `gsa_historique` (entité, tâche, date, compte, nom affiché, `quoi` : création, suppression, rétablissement ou modification, `champs` : `{champ: [avant, après]}`), lue ni écrite directement par personne. Le déclencheur `gsa_historique_noter` (après chaque écriture d'une tâche dans `gsa_items`) note les champs changés au nom de la personne connectée (sa fiche dans l'entité de la tâche ; depuis une autre entité : « Prénom Nom (Entité) ») ; il ignore les champs notés ailleurs ou techniques (commentaires, « Vu », date de modification…), confond les valeurs vides, ne garde d'un paiement que son état et son montant (pas l'IBAN), regroupe les changements d'une même personne à moins de 10 minutes, garde 100 lignes par tâche, et n'empêche jamais l'enregistrement de la tâche en cas d'erreur (simple avertissement dans les journaux). `gsa_historique_tache(unite, tache, depuis)` rend l'historique si la personne voit la tâche depuis l'entité ouverte (mêmes règles que la discussion, 049), avec les noms des personnes, statuts et sections cités. Sans 050, l'appli l'indique en dépliant l'historique (« mise à jour 050 à appliquer »). Ajout pur ; retour en arrière : supprimer le déclencheur, les fonctions `gsa_historique_noter`, `gsa_historique_valeur` et `gsa_historique_tache`, puis la table.

`supabase/migrations/051_gsa_erreurs.sql` (appliquée le 26.10.2026) : **rapport d'erreurs de l'appli**. Quand une page ne s'affiche pas ou qu'une erreur de script survient, l'appli la signale d'elle-même ; les admins du comité central (et les super-admins) la voient dans **Console admin › Erreurs de l'appli**. Table `gsa_erreurs` (une ligne par erreur différente dans le club, reconnue à son « empreinte » : message et emplacement dans le code, sans les numéros), lue ni écrite directement par personne : message, origine, emplacement (8 lignes au plus par pile), page sans ce qui suit « ? », version publiée, appareil, entité ouverte, première et dernière fois, nombre de fois et de personnes touchées (comptes, 50 au plus), réglée ou non. Ni noms ni contenu des données. `gsa_signaler_erreur(entite, …)` : pour une personne connectée avec une fiche dans l'entité ; une erreur connue est comptée (et rouverte si elle était réglée) ; 20 erreurs nouvelles par personne et par jour, 300 par club (les plus anciennes partent), effacée après 90 jours sans réapparaître ; ne renvoie rien et n'échoue jamais. `gsa_erreurs_liste(entite)`, `gsa_erreur_reglee(entite, id, reglee)` et `gsa_erreurs_effacer(entite)` (efface les réglées) : admins du comité central ou super-admins. Côté appli, chaque erreur part une fois par ouverture, 10 au plus ; les coupures de réseau, les mises à jour de l'appli (fichier introuvable) et les extensions du navigateur sont laissées de côté. Sans 051, rien n'est envoyé et la page l'indique (« mise à jour 051 à appliquer »). Ajout pur ; retour en arrière : supprimer les fonctions `gsa_signaler_erreur`, `gsa_erreurs_club`, `gsa_erreurs_liste`, `gsa_erreur_reglee` et `gsa_erreurs_effacer`, puis la table.

`supabase/migrations/055_gsa_personnes_du_club.sql` (appliquée le 28.10.2026) : **« Personnes du club » pour tout le monde** (`PERSONNES_DU_CLUB.md`). La liste du club (`gsa_membres_liste`) se lit par toute personne qui a une place dans une entité active du club ; les coordonnées, avec le droit « Coordonnées des personnes du club » (`tab.people`) ou « Gérer les personnes du club » (`people.manage`) dans l'une de ses entités (ou « Personnes du club », admin d'une entité, caissiers ; chacun voit les siennes ; les données masquées le restent). Ajouter, modifier, retirer : droit « Gérer les personnes » (`gsa_personnes_gerer`, règles d'écriture de `gsa_club_membres` remplacées ; `gsa_enregistrer_membres(club, membres)` pour l'appli). `gsa_personnes_droits(club)` donne les trois droits à l'appli. Aucune donnée modifiée.

`supabase/migrations/056_gsa_comptes_club.sql` (appliquée le 28.10.2026) : **un compte par personne du club ; ses accès suivent ses places**.

- `gsa_club_comptes` (club, personne du club, compte) : une personne, un compte ; un compte, une personne par club. Rempli au départ avec les 11 comptes déjà liés à une fiche ; écrit seulement par la fonction `gsa-acces` ; chacun lit sa ligne.
- Déclencheurs : une fiche active d'une entité du club (pas archivée), liée à une personne qui a un compte, ouvre l'entité à ce compte (`gsa_acces_place`) quand elle arrive (nouvelle, réactivée, liée à une autre personne) et quand la personne reçoit son compte. Une fiche retirée ferme l'accès comme avant. Au départ : 1 accès manquant ouvert.
- `gsa_mon_membre` passe d'abord par `gsa_club_comptes` ; `gsa_mes_comptes_club()` (l'écran de démarrage : place ou pas) ; `gsa_mes_taches_confiees(club)` et `gsa_modifier_tache_confiee(club, unite, tache, statut, coches)` : une personne sans place voit ses tâches confiées (son nom sur la tâche) et en change le statut ou la checklist, rien d'autre ; `gsa_compte_club_etat(club, membre)` : pour qui gère les personnes, son compte et ce que la personne connectée peut en faire (une place ★ : admins de l'entité ou du comité central).

`supabase/migrations/057_gsa_sauvegarde_club.sql` (appliquée le 28.10.2026) : **sauvegarde de tout le club** depuis Console admin › Sauvegarde. `gsa_sauvegarde_club(club)` (super-admins seulement, `gsa_est_super_admin`) rend en une fois toutes les entités du club, archivées comprises (nom, type, entité parente, réglages de `committees.info`, et leurs lignes de `gsa_items` non supprimées, comme les copies de chaque nuit, 036) et le registre « Personnes du club » (`gsa_club_membres`) ; ni IBAN (`gsa_club_iban`) ni comptes. Une règle de lecture du stockage `gsa-fichiers` en plus (`gsa_fichiers_super_admin`) : les super-admins lisent les fichiers joints de toutes les entités, pour les mettre dans le fichier ; rien d'autre ne change. La restauration se fait entité par entité par ses admins, comme avant (l'état actuel est d'abord copié, 036). Sans 057, le bouton l'indique (« migration 057 »). Ajout pur, aucune donnée modifiée ; retour en arrière : `drop policy gsa_fichiers_super_admin on storage.objects`, puis supprimer les fonctions `gsa_fichiers_super_admin(text)` et `gsa_sauvegarde_club(uuid)`.

`supabase/migrations/058_gsa_statuts_club.sql` (appliquée le 28.10.2026) : **les mêmes statuts dans tout le club**, ceux du comité central. Ils se règlent dans sa console admin (Sections et statuts) ; le déclencheur `gsa_statuts_club` (après chaque écriture d'un statut dans `gsa_items`) les recopie dans toutes les entités du club (`gsa_statuts_aligner(entite)` : mêmes identifiants, noms, couleurs, « terminée » et ordre ; écrit sans `client_id`, pour que l'appli qui a écrit reçoive aussi la version du serveur) ; un statut écrit dans une autre entité (nouvelle entité, ancienne version de l'appli, restauration) la réaligne sur le comité central. Un statut d'une entité absent du comité central est retiré s'il ne sert à aucune de ses tâches, sinon gardé à la fin. Aucune tâche modifiée. Au départ, toutes les entités sont alignées (le 28.10.2026 : chacune reçoit les 5 statuts propres au comité central, « Annulé » prend sa couleur ; aucune tâche n'utilise de statut absent du comité central). Les fonctions ne s'appellent pas depuis l'appli. Sans 058, les consoles des entités montrent déjà les statuts sans les modifier, mais ceux du comité central ne sont pas recopiés. Retour en arrière : supprimer le déclencheur `gsa_statuts_club`, puis les fonctions `gsa_statuts_club_suivre()` et `gsa_statuts_aligner(uuid)` (les statuts recopiés restent).

`supabase/migrations/059_gsa_reprise_entites.sql` (appliquée le 03.11.2026 ; étape D3 de `PLAN_APPLI_SIMPLE.md`, règles décidées le 03.11.2026) : **reprise des entités dans l'espace du club**. Chaque entité devient une étiquette du club ; ses personnes, ses tâches, ses événements et l'historique de ses tâches viennent dans l'espace du club ; l'entité est archivée. **Rien n'est effacé** ; chaque ligne du club modifiée est d'abord recopiée dans `gsa_reprise_avant`. Essayée sur la base de test (`outils/base-test/reprise_donnees.sql`, `reprise_verif.sql`), jamais sur le serveur.

- **Avant** : relancer le rapport `outils/reprise/rapport_reprise.sql` (lecture seule) et le relire ; télécharger la sauvegarde du club (Console admin › Sauvegarde). Choisir un moment calme (personne en train de modifier une tâche d'une entité).
- **Appliquer** : coller le fichier dans l'éditeur SQL de Supabase et l'exécuter. Il crée la table `gsa_reprise_avant`, les fonctions `gsa_reprise_cle`, `gsa_fichier_repris` et `gsa_reprise_entites(club)`, la règle de lecture `gsa_fichiers_repris_select`, puis fait la reprise et affiche son bilan (« Reprise des entités de … : … » : par entité, l'étiquette, les tâches, les événements, les fiches reliées, l'historique, la section).
- **Ce qu'elle fait**, entité par entité (celles qui n'ont pas encore `info.reprise`, archivées comprises) :
  - **étiquette** `et-<entité>` (`gsa_items`, kind `etiquettes`) : groupe → « groupe » ; sous-comité ou équipe → « événement », avec sa date (et son dernier jour) ; sa couleur ; ses **membres** : ses fiches actives (pas les fiches « liées » d'une autre entité) ;
  - **personnes** : chaque fiche de l'entité est reliée à la fiche du club qui a la même fiche du registre (`membreId`), sinon la même adresse, sinon le même prénom et nom ; une personne active sans fiche au club en reçoit une (`p-<fiche>`, rôle **« Membre »**, créé au besoin : ses tâches, celles de ses étiquettes, l'agenda ; son poste dans l'entité suivi du nom de l'entité) ; une **fiche inactive** du club dont la personne est active dans l'entité est **réactivée** avec son rôle ; les **comptes** qui n'avaient accès qu'à des entités sont rattachés à leur fiche du club (`gsa_acces_place`) ;
  - **tâches** : recopiées avec l'étiquette, leurs personnes (responsables, auteur, messages, pour info, « ✓ Vu », à prendre, circuit de paiement) reliées aux fiches du club ; **identifiant gardé** (une ancienne ligne supprimée du club, d'une tâche déplacée autrefois vers l'entité, est reprise) sauf si une tâche vivante du club l'a déjà ; statut du club (même identifiant, sinon même nom, sinon le premier ouvert) ; rangement : la sous-section de « Événements » du même nom si elle existe, sinon un **groupe** dans sa section (même nom ou nom proche, créée au besoin), un **événement** dans une sous-section de « Événements » (nom proche, créée au besoin) ; séance de l'entité : lien retiré (le délai reste) ; messages et « ✓ Vu » recopiés tels quels (`gsa.commentaires`, `gsa.pour_info_vus`) ;
  - **événements** recopiés dans l'agenda du club ; **historique** des tâches recopié (l'entrée de la reprise porte « Reprise des entités ») ; lectures des discussions et réglages d'affichage des personnes qui n'en ont pas encore au club ;
  - **tâches du club** attribuées à l'entité (`evenementEntite`), partagées avec elle (`partage`) ou confiées à l'un de ses responsables (`respPartage`) : son étiquette, ce responsable ; un délai « N jours avant » sa date devient un délai calé sur **la date de l'étiquette** (`delaiRef.type = 'etiquette'`) ;
  - **fichiers joints** : ils restent dans le dossier de l'entité ; `gsa_fichier_repris` les ouvre aux personnes du club qui voient la tâche ;
  - l'entité est **archivée** (`info.archive`), avec `info.reprise` (date, étiquette, archivée avant ou non) ; ses données restent.
- **Après** : le rapport est presque vide (les entités reprises n'y figurent plus) ; l'appli ouvre l'espace du club pour tout le monde (les entités archivées ne sont plus proposées). Rejouer la migration ne change rien.
- **Retour en arrière** (sans rien effacer) : les lignes d'avant sont dans `gsa_reprise_avant` (club, genre, identifiant, supprimée ou non, contenu) et les entités gardent leurs données ; la copie automatique de la nuit précédente reste disponible (Console admin › Sauvegarde).
- **Vérifiée sur le serveur le 03.11.2026** (lecture seule) : 10 entités archivées, chacune avec son étiquette ; 3 fiches créées (rôle « Membre »), 1 fiche réactivée, plus aucun compte qui n'aurait accès qu'à des entités ; tâches rangées comme prévu, messages, fichiers joints, événements et historique repris ; plus aucun champ des entités sur les tâches du club ; 15 lignes gardées dans `gsa_reprise_avant`. Seul écart : les 4 délais calés sur la date d'une entité n'ont pas été calés sur l'étiquette, leur lien ayant déjà été retiré par l'appli entre D1 et la reprise (voir 060).

`supabase/migrations/060_gsa_reprise_delais.sql` (appliquée le 03.11.2026, vérifiée : 4 délais calés sur la date de leur étiquette, dates inchangées) : **délais calés sur la date d'une étiquette, rétablis**. Entre la publication de D1 (02.11.2026) et la reprise, l'appli retirait le lien « N jours avant » des tâches du club attribuées à une entité (elle ne trouvait plus la date de l'entité) ; leur date n'a pas changé. D'après la dernière copie de nuit d'avant D1 (`gsa_copies`), chaque tâche du club qui y avait un délai calé sur la date d'une entité reprise, et qui n'en a plus, reçoit un délai calé sur la date de l'étiquette de cette entité (même décalage). Sur le serveur (simulation en lecture seule) : 4 tâches, dates inchangées. Rejouable, lignes d'avant dans `gsa_reprise_avant`. À coller dans l'éditeur SQL ; elle affiche le nombre de délais rétablis.

`supabase/migrations/061_gsa_menage_fonctions.sql` (**pas encore appliquée** ; étape D5, à appliquer par le président) :
**ménage des fonctions des entités**. Retire 23 fonctions que plus rien n'appelle depuis l'espace unique et la reprise :
tâches partagées entre entités (`gsa_modifier_tache_partagee`, `gsa_repondre_partagee`, `gsa_docs_partagee`,
`gsa_taches_partagees`, `gsa_tache_visible`, `gsa_anciennes_taches`, `gsa_sections_dependantes`), tâches transmises,
attribuées ou proposées à une autre entité (`gsa_taches_transmises`, `gsa_attribuer_tache`, `gsa_proposer_tache`,
`gsa_mes_demandes`), sondages ouverts à d'autres entités (`gsa_voter_sondage_partage`, `gsa_sondages_partages`,
`gsa_cle_vote`, `gsa_identites`), « pour info » entre entités (`gsa_taches_pour_info`, `gsa_pour_info_destinataires`),
organigramme (`gsa_organigramme`, `gsa_photo_organigramme`), séances du comité vues d'une entité (`gsa_seances_comite`),
date d'une édition (`gsa_date_edition`), agenda du club vu d'une entité (`gsa_agenda_club`), tickets envoyés à la caisse
centrale (`gsa_mes_tickets_centraux`).

- **Pourquoi** : la plupart sont « security definer » et ouvertes aux comptes connectés ; certaines écrivent encore dans
  les tâches des entités archivées (tâches partagées, sondages partagés, tâches attribuées ou proposées). Les retirer
  ferme ces portes. Aucune donnée, table ni règle n'est touchée ; les fonctions encore utilisées restent, même celles
  dont le nom parle d'entités (ex. `gsa_demandes_mdp_entite`), ainsi que la reprise (`gsa_reprise_entites`,
  `gsa_reprise_cle`) et la lecture des fichiers repris (`gsa_fichier_repris`).
- **Vérifié** le 03.11.2026 : sur le serveur, en lecture seule, les 23 fonctions existent et rien ne les cite (règles,
  déclencheurs, tâches planifiées, autres fonctions, vues) ; dans le dépôt, ni l'appli (`src/`) ni les fonctions serveur
  (`supabase/functions/`) ne les appellent. **Essayée sur la base de test** (`outils/base-test/LISEZMOI.md`) : rejouable,
  la reprise reste « vérifiée » (`reprise_verif.sql`), les 117 fonctions encore utilisées sont toutes là et aucune ne
  cite une fonction retirée.
- **Appliquer** : coller le fichier dans l'éditeur SQL de Supabase et l'exécuter ; il affiche `fonctions_restantes = 0`.
  Rien à redéployer, rien à changer dans l'appli. Une version de l'appli d'avant l'espace unique, restée ouverte dans un
  navigateur, n'aurait plus ces fonctions : elle se met à jour au rechargement.
- **Retour en arrière** : relancer la définition de la fonction dans sa dernière migration (indiquée en commentaire
  dans 061), avec les `grant` / `revoke` qui la suivent.

`supabase/migrations/062_gsa_etiquettes_discussions.sql` (**appliquée le 03.11.2026**, après la publication de l'appli qui
la suit) : **étiquettes côté serveur, discussion d'un point étiqueté réservée à ses membres**.

- **Étiquettes** : les membres d'une étiquette lisent les points qui la portent (`gsa_tache_lisible`), avec leurs fichiers
  et emails, comme l'appli et la démo le montraient déjà (avant, le serveur ne les leur envoyait pas).
- **Discussions** : elles sortent des points, une ligne `discussions` par point (écrite par `gsa_commenter` seulement ;
  une ligne envoyée par l'appli est ignorée, sans erreur). Point étiqueté : lue et écrite par les seuls membres de ses
  étiquettes (ni admins, ni « Voir toutes les tâches », ni responsables qui n'en sont pas membres) ; sinon, comme le
  point. Seuls ceux qui lisent la discussion sont prévenus ; une notification de message ne se lit plus, hors son
  destinataire et son auteur, que par qui lit la discussion. Fonctions internes `gsa_dans_etiquette`,
  `gsa_tache_etiquetee`, `gsa_discussion_lisible` fermées aux comptes.
- **Vérifiée** : sur la base de test (`outils/base-test/etiquettes_verif.sh`, « Tout est bon ») ; sur le serveur après
  application : 10 messages repris dans 6 discussions (3 réservées au club, 3 dans une entité archivée), plus aucun
  message dans les points, aucune ligne d'historique ajoutée ; en lecture seule, un membre de l'étiquette (rôle
  « Membre ») voit ses 8 points et lit les 3 discussions réservées, une personne du comité hors étiquette voit les
  points mais ni leurs discussions ni les notifications de leurs messages.
- **Retour en arrière** : voir l'en-tête du fichier (messages remis dans les points, puis définitions d'avant :
  038, 029, 049, 053). Une appli d'avant 062 affiche les discussions vides (rien n'est perdu) : elle se met à jour au
  rechargement.

`supabase/migrations/063_gsa_discussion_participants.sql` (**appliquée le 03.11.2026**, après la publication de l'appli
qui la suit) : **ajouter une personne à la discussion d'un point**, même si elle n'est pas membre de ses étiquettes.

- Personnes ajoutées gardées dans la ligne `discussions` (`data.participants`, écrite par le serveur seulement).
  `gsa_discussion_ajouter(unite, tache, fiche, retirer)` : qui lit la discussion ajoute une personne active du club ou
  retire une personne ajoutée (chacun peut se retirer) ; la personne ajoutée est prévenue (notification `discussion`)
  et reçoit tout de suite le point. Elle lit la discussion (même réservée à une étiquette) et le point, y écrit et est
  prévenue des messages ; un message garde les personnes ajoutées. `gsa_dans_discussion` fermée aux comptes.
- **Vérifiée** : sur la base de test (`outils/base-test/discussion_verif.sh` et `etiquettes_verif.sh`, « Tout est bon ») ;
  sur le serveur après application, dans une transaction annulée (rien n'est resté) : une personne du comité hors
  étiquette ne lisait pas la discussion réservée, la lit une fois ajoutée par un membre, et reçoit la notification.
- Fonction `gsa-push` redéployée en **v11** (même jour, `verify_jwt` désactivé comme avant) : seul `notifs.js` change
  (`npm run fonction`), pour le texte de la notification « … t'ajoute à la discussion de … » sur les téléphones ; contenu
  déployé relu, identique au dépôt. Version d'avant : v10.
- **Retour en arrière** : voir l'en-tête du fichier (définitions de 062, puis suppression des deux fonctions ajoutées).

`supabase/migrations/064_gsa_instantane.sql` (**appliquée le 03.11.2026**, suivie aussitôt de `gsa-push` **v12**) :
**instantané**.

- **Étiquette** : quand ses membres changent (ou qu'elle est supprimée ou rétablie), ses points et leurs discussions sont
  relus par ceux qui les voient (ligne réécrite telle quelle) : un nouveau membre les reçoit en direct, sans recharger.
- **Notifications sur téléphone** : chaque écriture qui ajoute une notification appelle `gsa-push` tout de suite
  (`gsa_push_notifier`, un appel par écriture ; un échec de l'appel n'empêche jamais l'écriture) ; la planification
  toutes les 5 minutes reste (échéances, retards, résumé de la semaine). `gsa-push` v12 : un seul passage à la fois
  (`gsa_push_reglages.en_cours`, repris après 3 minutes), un appel pendant un passage le fait recommencer
  (`a_refaire`) : jamais deux envois de la même notification.
- **Vérifiée** : base de test (`outils/base-test/instantane_verif.sh`, « Tout est bon ») ; `gsa-push` v12 lancée en local
  (Deno) contre la base de test, avec un faux service de notification lent : deux appels à 0,7 s d'écart → le second
  « occupé », le premier fait deux passages, la notification n'est reçue qu'une fois ; verrou posé → « occupé » ;
  verrou resté posé 5 min → repris. `deno check` sans erreur. Sur le serveur, dans une transaction annulée : une
  notification ajoutée met un appel de `gsa-push` en file, un changement de membres renvoie les 3 points de l'étiquette.
- **Retour en arrière** : voir l'en-tête du fichier ; `gsa-push` v11 ignore les colonnes du verrou.

`supabase/migrations/065_gsa_etiquettes_protegees.sql` (**appliquée par le président le 03.11.2026**, vérifiée : le
déclencheur `gsa_items_etiquettes_garde` est en place) : **étiquettes protégées des applis pas à jour**.

- **Pourquoi** : le 03.11.2026 (20:13 et 20:56), une appli restée ouverte sur une version d'avant les étiquettes a effacé
  toutes les étiquettes du club : elle charge toutes les lignes, ne connaît pas « etiquettes » et demande à effacer ce
  qu'elle croit disparu, à chaque envoi.
- **Garde** : une étiquette n'est retirée par l'appli que si la demande porte la marque `data.retiree = true` (envoyée par
  l'appli depuis E2, `cloud.ts`) ; sinon la demande est ignorée sans erreur (rien n'est écrit). Le serveur (SQL, sans
  compte connecté) n'est pas concerné ; une étiquette retirée peut être rétablie. Aucune donnée modifiée.
- **Vérifiée** sur la base de test (9 cas : création ; effacement sans marque ignoré, en insertion comme en mise à jour ;
  effacement voulu ; rétablie par l'appli et par le serveur ; modification normale ; autres lignes effacées comme avant).
- **Restauration** faite ensuite en SQL (accord du président) : 11 étiquettes rétablies, doublon « Soirée récréative »
  fusionné, « Comité » retiré des points qui ont une autre étiquette (copie de l'état d'avant gardée hors du dépôt).
- **Retour en arrière** : `drop trigger gsa_items_etiquettes_garde on public.gsa_items; drop function public.gsa_items_etiquettes_garde();`

`supabase/migrations/066_gsa_discussions_etiquettes.sql` (**à appliquer**, éditeur SQL) : **une discussion par étiquette**.

- **Sa ligne** : « discussions », identifiant `et:<étiquette>`, `{ etiquette, commentaires }` ; écrite par le serveur
  seulement (`gsa_etiquette_commenter` : ajouter, corriger le sien, retirer ; un admin membre retire n'importe lequel ;
  les 500 derniers messages gardés). Une ligne envoyée par l'appli est ignorée (062).
- **Qui la lit** : les membres de l'étiquette, et eux seuls (`gsa_ligne_lisible` complétée, `gsa_etiquette_lisible`) ;
  étiquette retirée : plus personne. Nouveau message : une notification 💬 à chaque autre membre actif (type « comment »,
  `taskId` `et:<étiquette>`), lue par lui, l'auteur et les membres ; `gsa-push` l'envoie sur les téléphones sans
  changement (lien vers Messages). Membres changés (064) : la discussion de l'étiquette est aussi renvoyée.
- **Vérifiée** sur la base de test (9 cas : membre écrit et lit ; admin non membre refusé et ne lit pas ; nouveau
  membre prévenu et lit ; corriger le message d'un autre refusé ; un admin membre retire ; ligne de l'appli ignorée ;
  étiquette retirée ; discussion d'un point inchangée) ; `etiquettes_verif.sh`, `discussion_verif.sh` et
  `instantane_verif.sh` toujours « Tout est bon ». Les fonctions remplacées étaient identiques au dépôt sur le serveur.
- Sans elle, l'appli dit « mise à jour 066 à appliquer » quand on écrit dans la discussion d'une étiquette.
- **Retour en arrière** : voir l'en-tête du fichier.

`supabase/migrations/067_gsa_temps.sql` (**appliquée par le président le 11.11.2026**, vérifiée sur le serveur : table,
règles, déclencheur, contraintes et droits identiques au dépôt, pas de diffusion en direct) : **compteur de temps
personnel** (`PLAN_COMPTEUR_TEMPS.md`, README « Mon compteur de temps »).

- **Table `gsa_temps`** : une ligne par entrée du compteur (compteur lancé puis arrêté, ajout, temps automatique) et une
  ligne `reglages`, au compte connecté (`compte`, `id`, `data`, `supprime`, `modifie`). `modifie` est posé par le serveur
  (déclencheur `gsa_temps_modifie`) : les appareils relisent ce qui a changé depuis. Une entrée retirée garde sa ligne,
  vidée (`supprime`), le temps que les autres appareils l'apprennent ; l'appli l'efface au bout de 60 jours.
- **Qui la lit** : chacun ses lignes, et rien d'autre (règles sur `compte = auth.uid()`), **ni les admins, ni les
  super-admins** ; mot de passe provisoire pas encore changé : rien (`gsa_compte_ok`). 4 Ko au plus par ligne. Compte
  supprimé (ou fusionné dans un autre) : ses lignes partent avec lui. Ni diffusion en direct, ni copie de nuit, ni
  sauvegarde du club.
- **Vérifiée** sur la base de test (`outils/base-test/temps_verif.sh`, 23 cas : écrire, modifier, relire les siennes ;
  ne rien lire ni écrire chez un autre, admin compris ; ni sans connexion, ni avec un mot de passe provisoire ; taille ;
  compte supprimé). Ajout pur : aucune table ni fonction existante modifiée.
- Sans elle, le compteur reste sur l'appareil (Réglages le dit) et il est envoyé une fois la mise à jour faite.
- **Retour en arrière** : `drop table public.gsa_temps; drop function public.gsa_temps_modifie();`

`supabase/migrations/069_gsa_effacements_proteges.sql` (**appliquée le 12.11.2026** avec l'accord du président, vérifiée
sur le serveur : déclencheur `gsa_items_effacement_garde` en place, celui de 065 retiré) : **séries d'événements et
assemblées générales protégées des applis pas à jour**, comme les étiquettes (065).

- **Pourquoi** : le 10.11.2026 à 22h08 puis le 12.11.2026 à 11h57, un appareil resté sur une version de l'appli d'avant
  le 03.11.2026 a effacé les trois séries d'événements du club (et, la seconde fois, les deux assemblées générales), sans
  aucune action de sa part : cette version ne connaît pas ces sortes de lignes et demande à les effacer. Les étiquettes
  (065) n'ont rien eu.
- **Garde** (celle de 065, étendue) : une ligne « etiquettes », « seriesEvenements » ou « assemblees » n'est retirée par
  l'appli que si la demande porte `data.retiree = true` (envoyée par l'appli depuis le 12.11.2026, `cloud.ts`,
  `RETRAIT_VOULU`) ; sinon la demande est ignorée sans erreur. Le serveur (SQL, sans compte connecté) n'est pas concerné.
  Une sorte de ligne ajoutée plus tard : à ajouter dans la migration et dans `RETRAIT_VOULU`.
- **Vérifiée** sur la base de test (`outils/base-test/effacements_verif.sh`, 30 cas, « Tout est bon » : pour chacune des
  trois sortes, effacement sans marque ignoré en insertion comme en mise à jour, effacement voulu, rétablissement par
  l'appli et par le serveur ; un événement s'efface comme avant).
- **Restauration** faite ensuite en SQL : les lignes effacées le 12.11.2026 à 11h57 par cet appareil (3 séries, 2
  assemblées) rétablies ; les liens (événements `dansSerie`, étiquettes `serieId`) étaient intacts. La série
  « Newsletter » retirée le 10.11.2026 à 22h18 depuis l'appli (geste voulu) n'est pas rétablie.
- **Retour en arrière** : voir l'en-tête du fichier (puis rejouer 065).

`supabase/migrations/070_gsa_versions.sql` (**appliquée le 12.11.2026**, vérifiée sur le serveur : déclencheur
`gsa_items_a_version_garde` en place, actif et premier des déclencheurs « avant », fonction fermée aux comptes) : **une modification
partie d'une version dépassée est refusée** (deux personnes sur le même élément).

- **Pourquoi** : chaque élément (sondage, séance, point…) est envoyé en entier et le serveur gardait la dernière version
  reçue. Deux votes à moins d'une seconde d'écart, ou un appareil revenu en ligne avec une version ancienne, effaçaient
  sans message ce que les autres avaient fait entre-temps sur cet élément (tous leurs votes, par exemple).
- **Règle** : l'appli joint à chaque modification la version du serveur dont elle part (`data.versionDe` = `updated_at`
  de la ligne qu'elle connaissait). Si la ligne a changé (ou a été supprimée) depuis, la modification est refusée (code
  `P0409`) ; l'appli relit la version du serveur, y fusionne ses propres changements (`src/data/fusion.ts` : champ par
  champ, fiches d'une liste par id, listes simples par ajouts et retraits) et renvoie. Un même champ changé des deux
  côtés : la dernière saisie l'emporte, avec un message ; un élément supprimé entre-temps reste supprimé, avec un message.
  Le contrôle se fait ligne verrouillée : deux envois simultanés ne passent pas tous les deux.
- **Sans marque** (appli pas encore à jour, fonctions du serveur, nouvel élément) : rien ne change. La marque n'est
  jamais enregistrée. Premier déclencheur « avant » (`gsa_items_a_version_garde`), les suivants ne la voient pas.
- **Ordre** : appliquer la migration, puis publier l'appli. Une appli publiée avant n'est pas protégée et ses envois
  laisseraient la marque dans les données (sans effet : l'appli la retire à la lecture).
- **Vérifiée** sur la base de test (`outils/base-test/versions_verif.sh`, 22 cas, « Tout est bon » : création, bonne
  version, version dépassée refusée sans rien écrire, code P0409, sans marque, marque illisible, mise à jour simple,
  supprimé entre-temps, point (date du contenu inchangée), membre non admin, aucune marque enregistrée) ; deux envois
  simultanés : le second attend le premier, puis est refusé. Côté appli : `tests/synchro.spec.ts` (deux votes à la
  fois, appareil hors ligne rouvert plus tard, même champ des deux côtés, élément supprimé, appli pas à jour).
- **Retour en arrière** : voir l'en-tête du fichier. L'appli continue alors d'envoyer la marque, sans protection.

Anciennes clés de l'organigramme dans `committees.info` (restées dans les entités archivées ; l'appli ne les lit plus) :

- `info.dependDe` : le comité dont dépend l'entité ; absent, inconnu (l'ancien `aucun`) ou en boucle : le comité central ; une ancienne valeur vers un groupe ou un événement : le comité dont celui-ci dépend. La carte d'un groupe (et l'événement sous le groupe qui l'organise) se plaçait par les postes liés ⛓, pas par cette clé.
- `info.rangement` (liste de 300 clés au plus) : l'ordre des cartes dans le cadre d'un comité, choisi en les glissant.
- `info.tachesDependance` : `toutes` ou `rien` (absent : seulement les tâches partagées) ; voir la migration 027.
- `info.historiqueDependance` : les dépendances passées (comité, date de fin, réglage, tâches, droit de copie) ; écrit par le serveur (migration 030), l'appli n'en change que le droit de copie de la dernière.

Les tables des essais précédents (`001_init.sql`, `002_…` : `tasks`, `people`, `meetings`, `memberships`…) ne sont pas utilisées par l'appli. Elles sont vides et peuvent être supprimées.

## Fonctions serveur (étape D4 : un seul espace)

**Déployées le 03.11.2026** (accord du président), avec `verify_jwt` désactivé comme avant (chaque fonction vérifie
elle-même ce qui doit l'être) : `gsa-agenda` **v3**, `gsa-push` **v9**, `gsa-acces` **v11** ; le contenu déployé a été
relu, identique au dépôt. Versions d'avant (d'avant D1, qui lisaient encore les entités) : `gsa-agenda` v2, `gsa-push`
v8, `gsa-acces` v10.

**Redéployées le 03.11.2026** (accord du président), après le renommage « tâche » → « point » des textes de l'appli
(`npm run fonction` : seuls `notifs.js` et `agenda.js` changent ; `index.ts` et `webpush.ts` identiques), `verify_jwt`
toujours désactivé : `gsa-push` **v10** (textes des notifications : « 3 de tes points sont en retard », « Point
récurrent reconduit », « 2 points à faire »…), `gsa-agenda` **v4** (rien de visible dans l'agenda : seuls les noms des
droits changent). Contenu déployé relu, identique au dépôt. Contrôles : `gsa-push` v10 au passage planifié de 12 h 05
(UTC) : 200 `{"personnes":1,"envois":0}`, démarrage sans erreur au journal ; `gsa-agenda` v4 appelée depuis la base
(pg_net) avec un jeton inconnu : 404 « Lien d'agenda inconnu ou supprimé. ». `gsa-acces` inchangée (v11). Versions
d'avant : `gsa-push` v9, `gsa-agenda` v3.

**Contrôles faits après le déploiement**, sans rien écrire dans les données : `gsa-push` (planification toutes les
5 minutes) répond 200 `{"personnes":1,"envois":0}`, sans erreur au journal, et lit l'espace du club (plus les entités
archivées) ; `gsa-agenda` avec un jeton inconnu : 404 « Lien d'agenda inconnu ou supprimé. » (la base est bien lue) ;
`gsa-acces` sans connexion : 401 « Connexion requise. », aussi pour une ancienne action d'entité.

Avant le déploiement de `gsa-push`, un risque déjà présent a été levé : un email programmé dont l'**objet** contient
`{lien}` faisait échouer, côté serveur (sans adresse de l'appli), le calcul des notifications de la personne ; le
`{lien}` y est maintenant laissé vide (`src/data/emails.ts`, `notifs.js` régénéré).

**Essais avant déploiement** (03.11.2026) : `deno check` sans erreur pour les trois ; `gsa-agenda` et `gsa-push` lancées
avec Deno contre la base de test (données fictives, reprise faite) : lien d'agenda du club et ancien lien vers une
entité reprise, appareil fictif qui reçoit une notification chiffrée une seule fois ; `retirerDuClub` (`gsa-acces`)
essayé sur une base simulée en mémoire (dernier admin refusé, fiches désactivées dans le club et l'ancienne entité).

**À vérifier dans l'appli** (président) : Réglages › Notifications › « Envoyer une notification d'essai » (`gsa-push`,
`essai`) ; Agenda › Exporter › « Créer mon lien privé », puis ouvrir le lien (`gsa-agenda`) ; menu du compte ›
« Comptes du club » (super-admin) et « Mots de passe oubliés » (`gsa-acces`). La première passe de `gsa-push` sur
l'espace du club, pour qui n'y avait pas encore d'appareil noté, n'envoie rien (ce qui est déjà là est seulement noté).

### `gsa-acces`

Fichiers : `supabase/functions/gsa-acces/index.ts`, `comptes.ts`, `club.ts` (l'organigramme, `orga.ts` et
`organigramme.js`, et la suppression d'entités, `suppression.ts`, sont retirés). Les comptes sont créés avec la clé
secrète, adresse confirmée d'office ; aucun email : l'admin transmet lui-même le mot de passe provisoire.

- **Mot de passe oublié et comptes** (`comptes.ts`, migration 025) :
  - `demandeMdp` (sans connexion) : enregistre une demande aux admins ; même réponse que l'adresse existe ou non ; 3 par compte et par jour, 30 par heure en tout ;
  - `approuverMdp` / `refuserMdp` : un admin qui peut la valider (règle `gsa_peut_approuver_mdp`) donne un mot de passe provisoire (renvoyé une seule fois) ou refuse ;
  - super-admins : `comptes` (liste du club), `reinitialiserCompte`, `bloquer` / `debloquer` (pas soi-même), `fusionner`.
  - Un compte au mot de passe provisoire ne peut appeler aucune action (sauf `demandeMdp`).
- **Comptes des personnes du club** (`club.ts`, migration 056) : droits calculés par le serveur (`gsa_compte_club_etat`, au nom de la personne connectée ; les entités archivées n'y comptent plus) :
  - `compteClub` : donne l'accès à une personne du club (email de sa fiche ; compte existant repris, sinon créé avec un mot de passe provisoire) ; sa fiche active dans l'espace du club lui ouvre l'appli ;
  - `mdpCompteClub` : nouveau mot de passe provisoire ;
  - `retirerCompteClub` : retire son compte (accès, sauf propriétaire) ; sa fiche reste ;
  - `retirerDuClub` : ses fiches actives désactivées (espace du club et anciennes entités, sans quoi le registre refuse le retrait ; refusé pour le dernier admin du club), son compte et sa fiche du registre retirés ; ses tâches gardent son nom.
- Les anciennes actions (`liste`, `creer`, `reinitialiser`, `retirer`, `creerUnite`, `responsable`, organigramme, `supprimerUnite`) répondent « Action inconnue ».

### `gsa-agenda`

Fichiers : `supabase/functions/gsa-agenda/index.ts`, `agenda.js` (de `src/data/agendaServeur.ts` par `npm run fonction`).
Sans compte (`verify_jwt` désactivé) : l'agenda de la personne relit `…/functions/v1/gsa-agenda/<jeton>.ics`. Le jeton
(migration 045) dit qui et quel espace ; un ancien lien vers une entité reprise (`info.reprise`) sert l'espace du club.
Les données sont lues **comme la personne** (rôle `authenticated`, ses droits) : séances, événements, **étiquettes
datées** (« agenda du club »), délais des tâches (les siennes ou toutes, selon ses droits), fins de sondage, comme
« Exporter » dans l'appli. Plus membre, mot de passe provisoire, lien réinitialisé ou supprimé : 404.

### `gsa-push`

Fichiers : `supabase/functions/gsa-push/index.ts`, `notifs.js` (de `src/data/pushServeur.ts` par `npm run fonction`),
`webpush.ts` (chiffrement RFC 8291 et signature RFC 8292, Web Crypto, sans bibliothèque).

- `cle` : la clé publique du serveur (VAPID), créée à la première demande ;
- `essai` (personne connectée, jeton vérifié dans le code) : une notification d'essai sur ses appareils ;
- `tourner` (planification de 047, en-tête `x-gsa-cle` = la clé de lancement) : pour chaque personne inscrite, dans
  l'espace du club (ses espaces non archivés), les notifications de la cloche 🔔 calculées **comme dans l'appli**
  (`notifs.js`, étiquettes comprises), avec ses réglages et en lisant les données **comme elle** ; seules partent celles
  pas encore envoyées et pas lues (lire une discussion dans l'appli marque ses 💬 lues). Rien la nuit (22 h – 7 h) ;
  au-delà de trois d'un coup, un seul message qui les résume.

Limite : sur iPhone et iPad, l'appli doit être installée sur l'écran d'accueil (iOS 16.4 ou plus récent).

## Emails du mot de passe oublié

Le lien « 📧 Recevoir un lien par email » passe par le serveur d'emails de Supabase. Celui fourni d'office n'envoie qu'aux membres de l'équipe du projet (et 2 emails par heure) : il faut un serveur SMTP. Tant qu'il n'est pas réglé, l'appli propose de demander aux admins.

**Fait le 12.10.2026** : SMTP réglé (la limite d'envoi est passée de 2 à 30 emails par heure). Essai du point 6 réussi le 13.10.2026 (email reçu, nouveau mot de passe choisi depuis le lien, connexion).

1. **Brevo** (gratuit, 300 emails par jour) : créer un compte sur brevo.com, puis :
   - *Senders, Domains & Dedicated IPs* › ajouter et valider l'adresse d'envoi (par ex. l'adresse du club) ;
   - *SMTP & API* › onglet *SMTP* › **Generate a new SMTP key**. Noter le serveur (`smtp-relay.brevo.com`, port `587`), l'identifiant (`…@smtp-brevo.com`) et la clé.
2. **Supabase** › *Authentication* › *Emails* › *SMTP Settings* : activer **Enable custom SMTP** ; adresse d'envoi = l'adresse validée chez Brevo, nom = « Tâches GSA » ; serveur, port, identifiant, mot de passe = la clé SMTP.
3. *Authentication* › *URL Configuration* :
   - **Site URL** : `https://lionelbonati-lab.github.io/Taches_GSA/`
   - **Redirect URLs** : ajouter `https://lionelbonati-lab.github.io/Taches_GSA/**`
4. *Authentication* › *Emails* › *Templates* › **Reset password** :
   - Sujet : `Tâches GSA – choisir un nouveau mot de passe`
   - Corps :
     ```html
     <h2>Nouveau mot de passe</h2>
     <p>Bonjour,</p>
     <p>Tu as demandé à changer ton mot de passe de Tâches GSA. Clique sur le lien ci-dessous pour en choisir un nouveau :</p>
     <p><a href="https://lionelbonati-lab.github.io/Taches_GSA/?reel&mdp={{ .TokenHash }}">Choisir mon nouveau mot de passe</a></p>
     <p>Ce lien est valable 1 heure et ne fonctionne qu'une seule fois. Si tu n'as rien demandé, ignore ce message : ton mot de passe ne change pas.</p>
     ```
   Le lien ouvre l'appli, qui vérifie le jeton (`verifyOtp`) : il marche aussi sur un autre appareil que celui de la demande. (Avec le modèle d'origine de Supabase, le lien marche aussi, sur le même navigateur.)
5. *Authentication* › *Sign In / Providers* › *Email* : **Email OTP Expiration** = `3600` (1 heure, valeur par défaut).
6. Essai : page de connexion › « Mot de passe oublié » › « 📧 Recevoir un lien par email » avec sa propre adresse.

## Mise en route

1. Rattacher le compte du président au comité comme propriétaire (fait pour « Comité centrale ») :
   ```sql
   insert into public.gsa_members (committee_id, user_id, owner)
   select c.id, u.id, true from public.committees c, auth.users u
   where c.name = '<nom du comité>' and u.email = '<adresse du président>';
   ```
2. Ouvrir l'appli, choisir **Version réelle**, se connecter : l'écran de mise en route propose de reprendre une sauvegarde de la démo ou de partir d'une base vide.
3. Corriger les noms et adresses email dans « Personnes du club » (clic sur chaque personne), puis donner les accès (fiche de la personne › « Accès à l'appli » › « Donner l'accès »).

## À savoir

- Projet gratuit : Supabase met en pause un projet inactif pendant une semaine (le réactiver depuis le tableau de bord).
- Authentication › Sign In / Providers : on peut désactiver « Allow new users to sign up » (les comptes sont créés par la fonction `gsa-acces`).
- Mots de passe : la protection contre les mots de passe divulgués (Authentication › Sign In / Providers › Email, comparaison avec HaveIBeenPwned) n'existe qu'à partir de l'offre Pro ; sur le projet gratuit, l'avertissement « Leaked password protection disabled » des conseils de sécurité reste donc affiché. On peut au moins y fixer une longueur minimale (8 caractères ou plus) et exiger lettres et chiffres.
- Conseils de sécurité (Advisors › Security Advisor) : « RLS enabled, no policy » sur `gsa_club_iban`, `gsa_copies`, `gsa_demandes_mdp` (et `gsa_push_reglages`, `gsa_push_abonnements`, `gsa_push_envois`) est voulu : personne ne lit ces tables directement, seules les fonctions du serveur y touchent.
