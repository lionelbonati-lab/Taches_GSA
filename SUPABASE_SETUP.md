# Version réelle – Supabase

Projet Supabase « Taches_GSA » (région eu-west-1). L'adresse du projet et la clé « publishable » sont dans `src/lib/supabase.ts` (et `.env.example`) : elles sont publiques par nature, les données sont protégées par les règles d'accès de la base (RLS).

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
- `gsa_proposer_tache(entité, tâche)` : une entité envoie une tâche au comité central (titre, remarque et délai contrôlés, sans responsable, premier statut ouvert, marquée `proposee`) ; `gsa_mes_demandes(entité)` : leur suivi (statut, délai, responsables).
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

`supabase/migrations/035_gsa_taches_attribuees.sql` (**à appliquer**) : une tâche que le comité **attribue à un groupe ou à un événement qui dépend de lui** (sa sous-section) est **enregistrée chez eux**, partagée avec le comité (où elle reste visible et modifiable, à la même place). Nouvelle fonction `gsa_attribuer_tache(unite, cible, tache, statut)` : la personne connectée est membre du comité et peut y créer des tâches dans la section ; l'entité dépend du comité (`gsa_dependance`, 030), n'est pas archivée ; pas de ticket ; identifiant libre et section existante chez elle. Gardés : les responsables qui ont une fiche chez elle (les autres restent ceux du comité, `respPartage`), le partage (avec le comité en plus), la séance du comité liée (`seanceComite`), les liens (pas les fichiers) ; statut de l'entité du même nom, sinon du même état ; `attribueePar` (comité, personne, date). L'appli retire ensuite la tâche du comité (tâche existante). Sans elle, le formulaire affiche que le serveur n'est pas à jour et rien n'est changé. Ajout pur, aucune donnée existante modifiée.

Organigramme par postes (sans migration : deux clés de plus dans `committees.info`, enregistrées comme la couleur) :

- `info.dependDe` : le comité dont dépend l'entité ; absent, inconnu (l'ancien `aucun`) ou en boucle : le comité central ; une ancienne valeur vers un groupe ou un événement : le comité dont celui-ci dépend. La carte d'un groupe (et l'événement sous le groupe qui l'organise) se place par les postes liés ⛓, pas par cette clé (voir le README).
- `info.rangement` (liste de 300 clés au plus) : l'ordre des cartes dans le cadre d'un comité, choisi en les glissant.
- `info.tachesDependance` : `toutes` ou `rien` (absent : seulement les tâches partagées) ; voir la migration 027.
- `info.historiqueDependance` : les dépendances passées (comité, date de fin, réglage, tâches, droit de copie) ; écrit par le serveur (migration 030), l'appli n'en change que le droit de copie de la dernière.

Les tables des essais précédents (`001_init.sql`, `002_…` : `tasks`, `people`, `meetings`, `memberships`…) ne sont pas utilisées par l'appli. Elles sont vides et peuvent être supprimées.

## Fonction serveur `gsa-acces`

`supabase/functions/gsa-acces/index.ts` (déployée, vérification de connexion faite dans le code) : appelée par la console admin, réservée aux admins du comité.

- `liste` : comptes du comité (adresse, dernière connexion, mot de passe provisoire pas encore changé).
- `creer` : crée le compte d'un responsable (adresse confirmée d'office, mot de passe provisoire renvoyé une seule fois) et le lie à sa fiche.
- `reinitialiser` : nouveau mot de passe provisoire ; refusé si le compte appartient aussi à une entité dont l'appelant n'est pas admin (un responsable de groupe ne peut pas changer le mot de passe du président).
- `retirer` : supprime le lien (le compte n'a plus accès au comité).
- `creerUnite` (admins du comité central) : crée une entité avec ses données de départ, crée le compte de son responsable s'il n'existe pas (mot de passe provisoire) et rattache les membres de départ qui ont déjà un compte (même adresse email).
- `responsable` (admins du comité central, ou de l'entité ; déployée le 07.10.2026) : organigramme câblé, désigne le responsable d'un sous-comité, groupe ou équipe. Reprend sa fiche dans l'entité (fiche du registre ou même adresse) ou la crée, lui donne le rôle Admin et sa fonction, et, sauf « garder aussi », retire le rôle Admin aux responsables actuels (ils restent membres). S'il a déjà un compte dans le club (même adresse), il est rattaché à l'entité ; sinon on crée son accès depuis sa fiche.
- **Mot de passe oublié et comptes** (`comptes.ts`, avec la migration 025 ; déployé le 12.10.2026) :
  - `demandeMdp` (sans connexion) : enregistre une demande aux admins ; même réponse que l'adresse existe ou non ; 3 par compte et par jour, 30 par heure en tout ;
  - `approuverMdp` / `refuserMdp` : un admin qui peut la valider (règle `gsa_peut_approuver_mdp`) donne un mot de passe provisoire (renvoyé une seule fois) ou refuse ; les autres demandes de la personne sont closes ;
  - super-admins : `comptes` (liste du club), `reinitialiserCompte`, `bloquer` / `debloquer` (pas soi-même), `fusionner` (puis suppression du compte fondu, ou blocage si la suppression échoue).
  - Un compte au mot de passe provisoire ne peut appeler aucune action (sauf `demandeMdp`). `reinitialiser` suit aussi la règle `gsa_peut_approuver_mdp`.
- **Organigramme** (déployé le 08.10.2026 ; tout membre du club, droits vérifiés par le serveur) : `organiser` applique un changement de l'organigramme (placer une personne, créer, renommer, lier ou supprimer un poste) avec le moteur de `src/data/organigramme.ts`, rassemblé dans `organigramme.js` par `npm run fonction` (à relancer, puis redéployer, quand ce moteur change ; redéployé le 13.10.2026 : `nouveauPoste` accepte `lien`, pour lier un groupe glissé dans un comité ou un événement glissé sur un groupe). Seuls les admins d'une entité ou du comité central modifient ses fiches ; ce qui suit par un poste lié suit. Il renvoie un **jeton d'annulation** (chiffré, 30 minutes, pour son auteur) : `annulerOrga` remet les fiches touchées comme avant, sauf si quelqu'un les a changées entre-temps. `postes` : à la première ouverture, déduit les postes des fonctions de chacun (sans changer aucun rôle) ; `suivre` : après une modification de fiches (fonction renommée, personne retirée…), met à jour les postes et les postes liés ; `lierEntite` : à la création ou au renommage d'une entité, lie les postes qui portent son nom. Une personne nouvelle est inscrite au registre « Membres du club » ; ses coordonnées viennent toujours du registre.
- **Suppression d'une entité archivée** (`suppression.ts` ; déployé le 13.10.2026 ; droits : migration 031) : `supprimerUnite` (admins du comité central, super-admins), seulement pour une entité du club **déjà archivée**. Avec `apercu` : les nombres de ce qui serait supprimé, sans rien toucher. Sinon `nom` doit être son nom, retapé : l'entité est supprimée avec toutes ses données (`gsa_items`, `gsa_members`… en cascade), puis ses fichiers (`gsa-fichiers`, dossier de l'entité, par l'API de stockage) ; ses postes liés ⛓ dans les autres entités sont déliés, elle est retirée des groupes du registre (`gsa_club_membres`) et le journal du comité central note la suppression. Les comptes restent (pour leurs autres entités).

Les mots de passe provisoires ne partent pas par email : l'admin les transmet lui-même.

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
3. Corriger les noms et adresses email dans l'organigramme du club (menu des entités en haut à gauche, clic sur chaque personne), puis y créer les accès (fiche de la personne › Créer l'accès).

## À savoir

- Projet gratuit : Supabase met en pause un projet inactif pendant une semaine (le réactiver depuis le tableau de bord).
- Authentication › Sign In / Providers : on peut désactiver « Allow new users to sign up » (les comptes sont créés par la fonction `gsa-acces`) et activer la protection contre les mots de passe divulgués.
