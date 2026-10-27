import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { entitesDependantes, evenementsDependants } from '../data/externes';
import { nomAppli } from '../data/nomAppli';
import { motSeance } from '../data/seances';
import { useChemin, useNavigation } from '../components/Nav';
import { Icone } from '../components/icones';

/** « Comment ça marche ? » : où trouver quoi (selon les droits de chacun) et les gestes courants. */
export function Aide() {
  const { can, cloud, sondagesEntites } = useStore();
  const club = useClubOptional();
  const { rubriques, compte } = useNavigation();
  const chemin = useChemin();
  // Lien vers une page accessible, sous son nom de rubrique (« Comité › PV ») ; rien si la personne n'y a pas accès.
  const vers = (to: string) => {
    const c = chemin(to);
    return c ? <Link to={to}>{c}</Link> : null;
  };
  const gestes: [string, ReactNode][] = [];
  const geste = (titre: string, ...texte: ReactNode[]) => gestes.push([titre, texte.map((t, i) => <Fragment key={i}>{t}</Fragment>)]);

  geste('Voir ce que j’ai à faire', vers('/'), ' : mes tâches en retard et celles de la semaine. La cloche en haut signale ce qui m’attend.');
  geste('Ajouter une tâche, demander un remboursement, payer une facture', 'Le bouton rond « + » en bas à droite, depuis n’importe quelle page. Une nouvelle tâche est pour la prochaine séance de comité (le jour même, à son ordre du jour) ; dans un PV, pour la séance suivante ; dans un groupe ou une équipe d’événement sans séance prévue, sans délai. « Pour quand ? » se change à volonté, ou s’efface avec « ✕ Aucun délai ».');
  geste('Retrouver une tâche, un PV, une personne…', 'La loupe en haut (ou Ctrl+K, ou « / ») : tape quelques lettres, sans te soucier des accents. Elle cherche dans l’entité ouverte : tâches (remarques et checklists comprises), séances, texte des PV et ordres du jour archivés, sondages, événements, personnes' + (club ? ' et tes autres entités' : '') + '. ↑ ↓ puis Entrée, ou un clic, pour ouvrir.');
  geste('Modifier une tâche ou changer son statut', vers('/taches'), ' : clique sur la tâche. « Mes tâches » / « Toutes » choisit la liste.');
  geste('Discuter d’une tâche', 'Dans la tâche, la bulle 💬 en haut à droite ouvre la discussion, comme une messagerie : les messages en bulles (les tiens à droite), le champ en bas, Entrée pour envoyer (Maj+Entrée : à la ligne ; sur téléphone, le bouton ➤). Les personnes concernées sont prévenues 🔔 ; la notification ouvre directement la discussion. Dans les listes, la bulle 💬 d’une tâche dit qu’il y a des messages ; la pastille rouge compte ceux que tu n’as pas encore lus.');
  geste('Suivre toutes les discussions', vers('/messages'), ' : toutes les discussions des tâches, comme une messagerie, la plus récente en haut ; les non lues en gras, avec leur nombre (aussi sur l’onglet). Touche une discussion pour l’ouvrir ; « Nouvelle discussion » en lance une sur une tâche en cours.');
  geste('Choisir les onglets du bas sur téléphone', '« Plus », puis « Modifier la barre du bas » (ou Réglages, « Barre du bas ») : coche jusqu’à 5 onglets et range-les avec ↑ ↓. Les autres restent dans « Plus ».');
  geste('Dupliquer une tâche', 'Dans la tâche, l’icône « Dupliquer » (deux feuilles superposées) en haut à droite : une nouvelle tâche s’ouvre, pré-remplie (titre « (copie) », à faire, checklist décochée). Modifie-la, puis « Créer ». Emails programmés et sondages ne sont pas copiés.');
  geste('Revenir sur une action faite par erreur', '« Annuler » en haut (la flèche ↶ sur téléphone) ou Ctrl+Z : défait la dernière action faite ici (tâche créée ou modifiée, statut, présences du PV, réglage…) ; un clic par action. Le survol du bouton dit ce qui sera annulé. Pas pour les paiements, ni après un rechargement de la page. Annulé par erreur ? « Refaire » (la flèche ↷ à côté) ou Ctrl+Y.');
  geste('Retrouver une tâche terminée', vers('/taches'), ' : les terminées restent affichées jusqu’au comité suivant, puis sont archivées : bouton « Archives ».');
  if (cloud && can('admin.access'))
    geste('Revenir aux données d’hier (erreur, suppression)', vers('/reglages'), ' › « Copies automatiques » : le serveur garde une copie par nuit pendant 30 jours ; « ↩ Restaurer » (l’état actuel est copié juste avant).');
  geste('Ajouter une checklist, un document, une répétition, un email…', 'Dans la fiche de la tâche, la ligne « Ajouter : » en bas. Ce qui est rempli reste affiché.');
  geste('Programmer un email à quelqu’un ou à toute une entité', 'Dans la tâche, « Ajouter : » › « Email ». Sous « Destinataires », tape un nom, un poste' + (club ? ', une entité (l’email part à toutes ses personnes) ou une personne d’une autre entité' : '') + ', ou une adresse email, puis choisis dans la liste (Entrée au clavier). ✕ retire une puce. À l’heure prévue, une notification 🔔 te propose d’ouvrir l’email rempli dans ta messagerie.');
  const mot = motSeance(club?.current.type).toLowerCase();
  geste(`Une tâche qui revient à chaque ${mot} (correspondance, point des finances…)`, `Dans la tâche, « Ajouter : » › « Répétition » › « À chaque ${mot} » : elle est rattachée à la prochaine séance ; une fois terminée, la suivante est créée pour la séance d’après, à son ordre du jour, avec le même écart de délai. Ce n’est pas un doublon : l’appli demande confirmation si on la termine longtemps avant son délai.`);
  if (chemin('/comite')) geste('M’excuser pour une séance', vers('/comite'), ' : « Je serai absent(e) » sous la séance.');
  if (chemin('/comite')) geste('Retrouver le PV ou l’ordre du jour d’une séance passée', vers('/comite'), ' : tout en bas, déplie « Séances passées » (les plus récentes d’abord).');
  if (chemin('/comite') && can('meetings.manage'))
    geste('Indiquer le lieu d’une séance sur une carte', vers('/comite'), ' › « Modifier » sous la séance › « Placer sur la carte » : un clic pose l’épingle (glisse-la pour l’ajuster), ou « Chercher » une adresse. Le lieu devient un lien vers la carte dans l’ordre du jour et le PV (PDF compris) ; l’email de l’ordre du jour donne l’itinéraire.');
  if (chemin('/comite') && can('meetings.manage'))
    geste('Prévoir les séances de l’année prochaine', vers('/comite'), ' : chaque séance revient le même mois ; coche celles à ajouter dans « Séances de l’année prochaine ».');
  if (chemin('/ordre-du-jour')) geste('Préparer une séance', vers('/ordre-du-jour'), ' : choisis la séance (seules les séances à venir sont proposées), relis (clic sur une tâche pour la modifier), puis imprime ou envoie par email.');
  if (chemin('/pv')) geste('Tenir le PV', vers('/pv'), ' : « Prise de notes » pendant la séance, puis « Valider et archiver » et l’envoyer. Pour revenir sur le PV d’une séance plus ancienne : « Reprendre un ancien PV… » à côté du choix de la séance. Avec « Dépôt du PV validé » (options du PV), la validation ouvre aussi la page où déposer le PDF du PV.');
  if (chemin('/pv')) geste('Recommencer un PV commencé par erreur', vers('/pv'), ' › « Remettre à zéro » (PV pas encore validé) : notes, présences et heures effacées, tâches changées depuis le PV remises comme avant. « Annuler » en haut revient en arrière.');
  if (chemin('/pv')) geste('Garder les outils du PV sous la main', vers('/pv'), ' : la barre d’icônes flottante (annuler, refaire, section précédente / suivante, nouvelle tâche décidée dans la section à l’écran, démarrer / terminer, chrono de la séance, enregistrer) affiche en titre la section à l’écran ; elle se déplace en tirant sa poignée ⠿ ou son titre ; double-clic : retour à sa place ; elle la garde quand on tourne l’écran ; la flèche en bout la réduit (le chrono reste). Le survol d’une icône dit ce qu’elle fait.');
  if (chemin('/pv')) geste('Mettre un mot en gras, en couleur, souligné ou barré dans les notes du PV', vers('/pv'), ' : choisis le texte dans une note, puis la 2e ligne de la barre flottante : A (couleur : rouge, bleu, vert, orange, violet, gris ; « A » blanc = couleur normale), B gras, I italique, U souligné, S barré (re-clic : retiré). Au clavier : Ctrl+B, Ctrl+I, Ctrl+U. La mise en forme se retrouve dans le PV, le PDF et les archives ; « Copier le texte » et l’email gardent le texte seul.');
  if (chemin('/pv') || chemin('/ordre-du-jour'))
    geste('Joindre les fichiers des tâches au PV ou à l’ordre du jour', 'Les pièces jointes de chaque point y sont nommées : un clic sur un fichier l’ouvre (aussi dans un document archivé). PV : « PV » › « Options du PV » ; ordre du jour : réglages « Contenu ». Coche « 📎 Joindre les fichiers liés » : liste des annexes, puis photos et pages des PDF à la fin, 1, 2 ou 4 par page (« Photos par page » et « Pages de PDF par page » : par ex. tickets à 4, PDF en pleine page). Les images d’une même mise en page sont regroupées, pour ne pas laisser de pages à moitié vides. Dessous, « Fichiers joints » : décoche les photos à ne pas publier, change la mise en page d’un fichier, ou choisis les pages à imprimer d’un PDF (« Pages » : 1-3, 5 ; vide : toutes) (choix de la séance, l’ordre du jour et le PV chacun le leur).');
  if (chemin('/ordre-du-jour'))
    geste('Envoyer l’ordre du jour par email : le texte d’un profil, le PDF d’un autre', vers('/ordre-du-jour'), ' › « Envoyer par email » : choisis le profil du « Texte du mail » (ex. version courte) et celui du « PDF joint » (ex. version complète), ou « Pas de PDF ». Lieu placé sur une carte : « Lien du lieu » ajoute l’itinéraire (Google Maps, Waze ou Plans), qui ouvre l’application de navigation sur téléphone. Sur téléphone, « Partager avec le PDF joint » ; sinon « Ouvrir dans ma messagerie » télécharge le PDF puis ouvre le mail : joins-y le PDF. Profils choisis gardés pour toi, lien du lieu pour l’entité.');
  if (chemin('/pv') || chemin('/ordre-du-jour'))
    geste('Envoyer l’ordre du jour ou le PV en PDF, avec des liens cliquables', '« PDF » (ordre du jour, PV, documents archivés dans la séance) : l’appli crée le PDF elle-même et le télécharge (sur téléphone : partage direct, mail ou WhatsApp). Les adresses web des remarques, notes et checklists, les documents « Lien » et les liens des PDF joints y restent cliquables. « Imprimer » sert au papier.');
  const miseEnForme = ' : police, interligne, marges, puis chaque élément (titre, sections, points, notes…) en taille, gras, italique, majuscules, couleur ; le fond de l’encadré « Prochaine séance ». La même pour l’ordre du jour et le PV de l’entité.';
  if (chemin('/ordre-du-jour') && can('tab.pv'))
    geste('Changer la police, les couleurs ou la taille des titres de l’ordre du jour et du PV', vers('/ordre-du-jour'), ' › « Mise en page » › « Mise en forme »', miseEnForme);
  else if (chemin('/pv')) geste('Changer la police, les couleurs ou la taille des titres du PV et de l’ordre du jour', vers('/pv'), ' › « PV » › « Mise en forme »', miseEnForme);
  if (chemin('/ordre-du-jour') && can('tab.pv'))
    geste('Garder des réglages de l’ordre du jour pour la prochaine fois (profil)', vers('/ordre-du-jour'), ' › « Profils » : règle le contenu et la mise en page, donne un nom (« Comité ordinaire », « AG »…) puis « Enregistrer le profil » (avec ou sans la mise en forme). Un clic sur son nom rétablit ces réglages ; à côté, la disquette le remplace par les réglages actuels, le crayon le renomme, la flèche le remonte, la poubelle le supprime. Ils sont à toi : chacun a les siens.');
  geste('Voter ou poser une question au comité', vers('/sondages'), '. Un sondage qui attend ta réponse apparaît aussi à l’accueil.');
  if (can('polls.create'))
    geste('Fermer un sondage tout seul à une date et une heure', vers('/sondages'), ' : dans le sondage, « Date limite » puis « Heure », avec « 🔒 Clôturer automatiquement » coché. Décoche-le pour une date seulement indicative (le sondage reste ouvert jusqu’à « Clôturer »).');
  geste('Envoyer une tâche ou un sondage par WhatsApp (ou une autre appli)', 'L’icône de partage (trois points reliés) en haut à droite de la tâche ou du sondage : modifie le message si besoin, puis « WhatsApp », « Autre appli… » (téléphone), « Email » ou « Copier ». Le lien ouvre la tâche ou le sondage dans l’appli' + (club ? ', dans la bonne entité' : '') + ' ; il ne donne accès qu’aux personnes qui ont un compte et la voient déjà.');
  if (sondagesEntites && club && club.units.length > 1 && can('polls.create'))
    geste('Poser une question à d’autres entités (École, groupe, CO…)', vers('/sondages'), ' : « + Nouveau sondage » › « Ouvrir aussi à d’autres entités ». Tous leurs membres votent depuis leur entité ; une personne de plusieurs entités ne vote qu’une fois.');
  geste('Rattacher une tâche à un événement, une séance ou une autre tâche', 'Dans la tâche, « Ajouter : » › « Rattacher à… » : un événement, une séance de comité, ou une tâche principale (dans une tâche principale : « + Nouvelle tâche rattachée » ou « Rattacher une tâche existante » ; repère 🧩 3/8 dans la liste). Pour un délai qui suit la date d’un événement ou d’une séance : « Pour quand ? » › « ou selon un événement / une séance » (repère 📌). 🔗 sert seulement aux liens web des documents.');
  geste('Proposer une tâche à quelques personnes, pour que l’une d’elles s’en charge', 'Dans la tâche, « Ajouter : » › « À prendre », puis « ＋ Proposer à… » : des personnes, tout un rôle (« Comité » : tout le comité, président et secrétaire compris) ou tout le monde (et, au besoin, combien il en faut). Elles la voient dans « Mes tâches » et à l’accueil, avec une notification 🔔 ; la première qui clique « Je m’en charge » en devient responsable, et tu es prévenu. Ensuite, elle n’est plus proposée aux autres. Qui n’est pas dispo répond « Pas dispo » : tu es prévenu aussi, et la tâche montre qui a décliné. Marche aussi dans une tâche partagée par une autre entité : tu la proposes aux personnes d’ici, les places se comptent avec celles des autres entités.');
  geste('Mettre quelqu’un au courant d’une tâche, sans qu’il s’en occupe', 'Dans la tâche, « Ajouter : » › « Pour info », puis « ＋ Ajouter… » : une personne d’ici, une autre entité ou une personne d’une autre entité. Une personne d’ici la voit dans « Mes tâches » (Pour info) et à l’accueil, avec une notification 🔔 ; les autres entités la consultent en lecture seule (accueil, Tâches › « Pour info »). Marche aussi dans une tâche partagée par une autre entité.');
  geste('Ne plus voir une tâche « Pour info » sur l’accueil', 'Sur sa carte, « ✓ Vu » : elle quitte l’accueil et reste dans Tâches (Pour info). « Réafficher » dans le titre du bloc la remet.');
  geste('Savoir qui a vu une tâche « Pour info »', 'Ouvre la tâche : dans « 👁 Pour info », la pastille est verte (✓ et la date ; survol : le jour et l’heure) pour qui a marqué « ✓ Vu », rouge pour qui ne l’a pas encore vue. Pour une entité, chacune des personnes qui la reçoivent compte : « 2/5 », orange tant qu’une partie seulement l’a vue ; dessous, qui l’a vue et qui pas encore.');
  if (club && club.units.length > 1)
    geste('Partager une tâche avec d’autres entités (comité central, CO, groupe…)', 'Dans la tâche, « Ajouter : » › « Partager », puis choisis les entités : elles la voient dans leurs tâches et leur ordre du jour (sous l’événement, ou la section qui porte ton nom) et la modifient comme les leurs. Elle reste enregistrée chez toi, repérée 🤝.');
    geste('Compléter une tâche qu’une autre entité partage avec toi', 'Dans la tâche, « Ajouter : » propose tout : documents (les fichiers sont rangés chez elle, avec ton nom), répétition (elle crée l’occurrence suivante quand la tâche est terminée), une séance d’ici (la tâche va à son ordre du jour et à son PV), partage avec d’autres entités, sondage, email. La supprimer, la rattacher à un événement ou à une autre tâche : dans son entité (« Ouvrir dans … »).');
  if (club && club.current.type !== 'central')
    geste('Mettre une tâche à l’ordre du jour du comité dont dépend l’entité', 'Dans la tâche, « Ajouter : » › « Rattacher à… » › « Séance de comité » : choisis une séance du comité (groupe « Séances de … »). La tâche lui est partagée et figure à l’ordre du jour et au PV de cette séance ; repère 🏛️. Pour un délai calé sur elle (« 1 semaine avant le comité d’octobre ») : « Pour quand ? » › « ou selon un événement / une séance », groupe « Selon une séance de … » ; il suit la date de la séance.');
  if (chemin('/evenements') && can('events.manage')) {
    geste('Donner une heure à un événement, ou le faire revenir chaque semaine', vers('/evenements'), ' : dans l’événement, décoche « Toute la journée » pour les heures de début et de fin ; le menu « Répétition » propose tous les jours, toutes les semaines, tous les mois, tous les ans ou « Personnalisé… » (tous les 2 semaines, certains jours de la semaine, jusqu’à une date ou un nombre de fois).');
    geste('Reprendre l’édition de l’an passé, avec ses tâches', vers('/evenements'), ' : sur un événement passé, « Reprendre ». Choisis la date de la nouvelle édition (proposée un an plus tard, le même jour de la semaine ; l’année du nom suit) et les tâches à recopier : elles repartent « à faire », au même écart de l’événement (« 30 jours avant »), checklist décochée, avec les mêmes responsables ou à attribuer ensuite. Dans un sous-comité ou une équipe d’événement, « Changer la date » d’une édition passée le propose aussi.');
    geste('Changer ou supprimer une seule date d’un événement qui se répète', 'Ouvre l’occurrence dans l’agenda (ou glisse-la sur un autre jour) : à l’enregistrement ou à la suppression, choisis « Cet événement », « Cet événement et tous les suivants » ou « Tous les événements ». Les tâches rattachées et les délais calés dessus suivent leur date.');
  }
  if (chemin('/agenda'))
    geste('Mettre l’agenda dans mon agenda personnel (Google, Apple, Outlook)', vers('/agenda'), ' › « Exporter » : coche ce qu’il faut (séances, événements, agenda du club, fins de sondage, délais de tes tâches ou de toutes), à venir ou passé compris, puis « Télécharger le fichier ». Sur iPhone ou Mac, ouvre le fichier puis « Ajouter tout » ; dans Google Agenda, importe-le depuis un ordinateur (Paramètres › Importer et exporter). C’est une copie : importe-la dans un agenda à part pour pouvoir le vider et importer une version à jour.');
  if (chemin('/agenda') && cloud)
    geste('Abonner mon agenda personnel (mise à jour automatique)', vers('/agenda'), ' › « Exporter » › « Créer mon lien privé » (avec les choix cochés au-dessus). Sur iPhone ou Mac : « Ouvrir dans Calendrier », puis « S’abonner ». Google Agenda : « Ajouter à Google Agenda » sur un ordinateur, ou Autres agendas › ＋ › À partir de l’URL, et colle le lien. Outlook : Ajouter un calendrier › S’abonner à partir du web. Ton agenda relit le lien tout seul (après quelques heures selon l’agenda). Garde-le pour toi ; « Nouveau lien » remplace l’ancien, « Supprimer le lien » l’arrête.');
  if (club && chemin('/evenements'))
    geste('Voir les événements qui dépendent du comité', vers('/evenements'), ' : les sous-comités et équipes d’événement qui en dépendent y sont à la date de leur prochaine édition, marqués « dépend de ce comité », avec l’avancement de leurs tâches partagées et des tâches du comité rattachées à eux (« Voir les tâches → »).');
  if (club && entitesDependantes(club.units, club.current).length)
    geste('Attribuer une tâche du comité à un événement ou à un groupe qui dépend de lui', 'Dans la tâche (nouvelle ou existante), choisis la section « Événements », puis dans « Sous-section » l’un des « Événements qui dépendent de … » et sa section chez lui ; ou la section au nom du groupe (« École de cyclisme »), puis l’une de ses sections (« Sections de … »). « Qui s’en occupe ? » propose alors d’abord ses personnes à lui ; tu pourras encore les changer ensuite, depuis la tâche partagée. À l’enregistrement, la tâche passe chez lui : il la gère comme les siennes ; au comité, elle reste visible et modifiable, partagée (icône poignée de main). Ses fichiers joints la suivent (rangés chez lui) ; les emails programmés restent au comité : supprime-les d’abord.');
  if (club && evenementsDependants(club.units, club.current).length)
    geste('Rattacher une tâche du comité à un événement qui dépend de lui', 'Dans la tâche, « Rattacher à… » › « Événement », groupe « Événements qui dépendent de … » : sa prochaine édition ou l’un de ses événements. Pour un délai calé sur lui (« 1 semaine avant la soirée ») : « Pour quand ? » › « ou selon un événement / une séance ». Le nom et la date suivent les changements de l’événement.');
  if (club) geste('Passer à une autre entité (sous-comité, groupe, équipe)', 'Le nom de l’entité en haut à gauche ▾ (l’organigramme du club y est aussi). Chaque entité a ses propres tâches, séances et membres.');
  geste('Installer l’appli sur le téléphone ou l’ordinateur', '« Installer l’application » dans le menu du compte (« Plus » sur téléphone).');
  geste('Choisir ce qui s’affiche sur mon accueil, et dans quel ordre', vers('/'), ' : le bouton « Personnaliser » à côté de « Bonjour » (la roue dentée seule sur téléphone). Coche les blocs et les compteurs à voir, séparément sur téléphone et sur ordinateur ; ↑ ↓ change leur ordre. Le bloc « À faire » se règle aussi : nombre de jours (directement dans son titre) et, si tu vois toutes les tâches, les tiennes ou toutes.');
  geste('Thème sombre, notifications', vers('/reglages'), '.');
  if (cloud) geste('Recevoir les notifications sur mon téléphone, même l’appli fermée', vers('/reglages'), ' › Notifications : coche « Recevoir ces notifications sur cet appareil » (sur chaque appareil), autorise-les, puis « Envoyer une notification d’essai ». Sur iPhone, installe d’abord l’appli sur l’écran d’accueil et coche-la depuis l’appli installée. Rien entre 22 h et 7 h.');
  if (club) {
    geste('Enregistrer mon IBAN pour mes remboursements', vers('/reglages'), ' › « Mes données au club » : « Enregistrer mon IBAN » ; ou, en demandant un remboursement, coche « Enregistrer mon IBAN ». Toi seul peux le saisir ou le modifier ; seuls les caissiers le voient.');
    geste('Masquer mes coordonnées dans la liste des membres du club', vers('/reglages'), ' › « Mes données au club » : « Masquer mes données personnelles ». Ton email, ton téléphone et ton IBAN n’y apparaissent plus (« 🔒 masqué »).');
  }
  if (club && chemin('/membres-club')) {
    geste('Choisir les colonnes de la liste des membres', vers('/membres-club'), ' : « Colonnes » (afficher, masquer, ↑/↓ pour l’ordre) ; un clic sur un en-tête trie. Ce réglage n’est que pour toi.');
    if (club.membresAcces)
      geste('Gérer les accès d’un membre (rôles, entités, activation)', vers('/membres-club'), ' : clic sur le membre › « Entités et accès ». Dans les entités dont tu es admin : coche ses rôles, crée ou retire son accès à l’appli, « Retirer de l’entité », ou « Ajouter à une entité… ».');
  }
  if (chemin('/propositions')) geste('Proposer une idée pour l’appli, signaler un problème', vers('/propositions'), ' (menu du compte) : le comité central l’étudie et te répond sur la même page, dans « Mes propositions ».');
  // Organigramme : dans le menu des entités (en haut à gauche), pas dans les rubriques.
  const orga = club && <><Link to="/organigramme">Organigramme du club</Link> (menu des entités, en haut à gauche)</>;
  if (orga) geste('Voir qui fait quoi, et ses coordonnées', orga, ' : un clic sur une personne ouvre la fiche de la personne.');
  if (orga && can('people.manage')) geste('Ajouter une personne à l’entité', orga, ' : « Modifier l’organigramme », puis « + Ajouter une personne » en bas de la liste des postes de l’entité.');
  if (orga && club && club.units.length > 1)
    geste('Changer le comité dont dépend un groupe ou un événement', orga, ' : la roue dentée de sa fiche › « Dépend de » (comité central). Rien n’est déplacé ni copié : l’ancien comité garde les tâches d’avant (ses ordres du jour, PV et paiements aussi) ; le nouveau peut les consulter et en copier (« Anciennes tâches »). Les admins de l’entité peuvent lui retirer ce droit dans la même fiche (« Dépendances passées »). Revenir à l’ancien comité dans l’heure annule simplement le changement.');
  if (club && club.units.length > 1)
    geste('Reprendre les tâches d’une entité qui dépend désormais de ton comité', vers('/taches'), ' : « Anciennes tâches » (affiché quand il y en a) : consulte-les, coche celles à reprendre, puis « Copier la sélection » ou « Tout copier ». Chaque copie est une tâche de ton comité, indépendante, marquée « 📋 Copiée depuis le comité … » ; l’original ne change pas.');
  geste('Vérifier qu’un document visé est authentique', vers('/taches'), ' › Filtres › « 💰 Paiements et remboursements » › « Vérifier un visa » : tape le n° imprimé en bas du sceau (ex. K7PM-2XQD). Le montant, le bénéficiaire, la date et le nom affichés doivent être ceux du document ; « n° inconnu » : visa retiré, demande supprimée ou sceau qui ne vient pas de l’appli.');
  if (club && club.units.length > 1)
    geste('À quelle caisse va mon ticket ?', 'À celle de ton entité si elle a un caissier ; sinon à celle du comité dont elle dépend (s’il a un caissier), sinon à la caisse centrale. Tu en suis l’état dans « Mes tâches » › « Envoyés à une autre caisse ».');
  // Organigramme par postes : placer les personnes, créer les postes (liés tout seuls par leur nom).
  const fiches = !!club?.organiser && club.units.some((u) => !u.archive && (club?.canManage || u.moiAdmin));
  if (orga && fiches) {
    geste('Placer quelqu’un dans l’organigramme', orga, ' : « Modifier l’organigramme », cherche la personne en haut à gauche (ses propositions s’empilent en pilules ; « ＋ Nouvelle personne » si elle n’est pas encore au club), puis glisse-la sur un poste : elle l’occupe ; sur un ★ : elle en devient responsable ; dans les bénévoles d’un groupe : simple bénévole ; sur le cadre d’un comité : un nouveau poste pour elle. Glissée d’un poste à l’autre, elle quitte le premier ; avec Ctrl (ou Alt) enfoncé, elle le garde aussi. Au doigt : touche son nom › « Déplacer », puis touche l’endroit. « ↶ Annuler » en bas défait le dernier changement.');
    geste('Créer un poste, le lier au ★ d’une autre entité', orga, ' : « ＋ Poste » dans un comité, un groupe ou un événement (à pourvoir : en rouge jusqu’à ce qu’on y glisse quelqu’un). Un poste qui porte le nom d’une entité (ex. « Camp de Pentecôte ») y est lié tout seul : son titulaire en est ★ (co-responsable s’il y en a déjà un) ; changer l’un change l’autre, automatiquement. Un clic sur le nom d’un poste : le renommer, corriger son lien, le libérer ou le supprimer.');
  }
  if (orga) geste('Lire l’organigramme', orga, ' : en haut, les comités (une carte par poste : le poste, le nom ; et une carte par groupe lié à l’un de ses postes ⛓) et, à droite, les groupes dont le responsable ne siège dans aucun comité ; en dessous, les groupes (« ▷ membres » les affiche) ; puis les événements, sous le groupe ou le poste qui en est responsable, sinon sous leur comité : tout le comité en est responsable. Pour gagner de la place, un événement peut se trouver sous un groupe qui n’en organise aucun : son trait passe sous la carte du groupe et remonte à son responsable (« ⛓ … » sur sa carte). Un clic sur un nom : le profil de la personne. « − » sous une carte replie sa branche ; au-dessus : zoom, « Plein écran » (tout l’organigramme sur l’écran ; Échap pour revenir) et « Imprimer / PDF » ; à la souris, tire le fond pour te déplacer.');
  if (orga && club?.organiser) {
    geste('Réorganiser l’organigramme', orga, ' : « Modifier l’organigramme », puis glisse une carte (un poste, un groupe, un événement) sur un comité, un groupe ou une autre carte : ce qui se passera s’affiche avant de la lâcher (au doigt : sa poignée ⠿ › « Déplacer… »). Glisser un groupe change ses postes liés ⛓ (dans « Sans comité » : il n’en a plus) ; un événement glissé sur un groupe passe sous lui (un poste du groupe lui est lié), sur un poste d’un comité ce poste lui est lié, dans le cadre d’un comité il en dépend et tout le comité en est responsable (toutes ses tâches s’y affichent). Le comité dont dépend un groupe ou un événement se choisit avec la roue dentée de sa fiche (« Dépend de », avec ce que ce comité affiche de ses tâches). Glisse aussi le nom d’une personne d’un poste à un autre (Ctrl : elle garde aussi l’ancien) ; sur un poste déjà occupé, au choix : « ＋ Avec … » (plusieurs personnes au même poste, sur une seule carte) ou « À la place de … » ; au doigt : clic sur le nom › « Déplacer », puis touche le poste. « ＋ Comité » crée un comité avec président, secrétaire et caissier ; « ＋ Poste » ajoute un poste ; un clic sur le nom d’un poste : le renommer, le libérer, le supprimer. « ↶ Annuler » défait le dernier changement.');
  }
  if (orga && club?.canManage && club.units.some((u) => u.archive))
    geste('Supprimer définitivement une entité archivée', orga, ' : « Modifier l’organigramme », « Entités archivées » sous l’organigramme, puis la roue dentée de l’entité › « Supprimer définitivement… ». Tu vois ce qui sera effacé (tâches, séances, fiches, fichiers…), puis tu retapes son nom. Sans retour possible : pour seulement la cacher, laisse-la archivée.');
  if (orga) geste('Revoir l’organigramme d’une année passée', orga, ' : choisis l’année dans « Aujourd’hui ▾ » en haut de la page. Il s’affiche tel qu’à la fin de cette année-là, en lecture seule ; un clic sur une personne montre ses fonctions cette année-là. « Revenir à aujourd’hui » pour l’organigramme actuel.');
  if (orga && can('admin.access')) geste('Donner l’accès à l’appli à quelqu’un', orga, ' : clic sur son nom (sa fiche doit avoir son email), puis « Créer l’accès ».');
  if (chemin('/admin')) geste('Choisir qui peut faire quoi', vers('/admin'), ' › « Rôles et droits ». Sans « Voir toutes les tâches », on ne voit que ses tâches ; pour une personne extérieure : « + Nouveau rôle » › modèle « Externe ». Les tickets ne se voient que de la caisse, du demandeur, de qui vise et des admins.');
  if (chemin('/admin')) geste('Changer le logo ou la couleur de l’appli', vers('/admin'), ' › « Apparence ».');
  if (chemin('/admin')) geste('Donner une icône à l’entité', vers('/admin'), ' › « Apparence » › « Choisir une icône… » (ou la fiche de l’entité dans l’organigramme) : elle remplace celle de son type sur sa pastille et dans l’agenda, les événements et l’accueil. « Reprendre celle du type » pour revenir à l’icône d’origine.');
  if (chemin('/admin')) geste('Changer l’en-tête de l’ordre du jour, du PV et du bon de paiement', vers('/admin'), ' › « En-tête des documents » : le même pour tous les documents de l’entité.');
  if (club && club.current.type === 'central' && chemin('/admin'))
    geste('Voir les erreurs rencontrées par les membres', vers('/admin'), ' › « Erreurs de l’appli » : l’appli les signale d’elle-même (une même erreur est comptée, pas répétée). « Copier » pour la faire corriger, puis « Réglée ».');

  return (
    <div className="narrow aide-page">
      <h1>Comment ça marche ?</h1>
      <p className="page-intro">
        {nomAppli()} réunit les tâches, les séances et l’agenda {club ? 'de chaque entité du club' : 'du comité'}. Tout se trouve dans les
        rubriques en haut de l’écran (en bas sur téléphone) ; certaines ont plusieurs pages, choisies juste sous la rubrique.
      </p>

      <section className="panel">
        <h2>Où trouver quoi</h2>
        {rubriques.map((r) => (
          <div key={r.id} className="aide-rubrique">
            <h3><Icone n={r.icon} /> {r.label}</h3>
            <ul>
              {r.pages.map((p) => (
                <li key={p.to}>
                  {r.pages.length > 1 && <><Link to={p.to}>{p.label}</Link> : </>}
                  {p.aide}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {club && (
          <div className="aide-rubrique">
            <h3><Icone n="organigramme" /> Entités du club</h3>
            <p className="muted small-note">Le nom de l’entité ouverte, en haut à gauche ▾.</p>
            <ul>
              <li>Passer à une autre de tes entités (sous-comité, groupe, équipe).</li>
              <li><Link to="/organigramme">Organigramme du club</Link> : le comité central, les sous-comités, groupes et équipes, et qui y fait quoi. Un clic sur une personne ouvre sa fiche (coordonnées, rôles, accès à l’appli) ; « Modifier l’organigramme » pour ajouter quelqu’un, ranger les cartes ou modifier une entité.</li>
            </ul>
          </div>
        )}
        <div className="aide-rubrique">
          <h3><Icone n="compte" /> Mon compte</h3>
          <p className="muted small-note">Ta pastille en haut à droite (« Plus » sur téléphone).</p>
          <ul>
            {compte.filter((p) => p.to !== '/aide').map((p) => (
              <li key={p.to}><Link to={p.to}>{p.label}</Link> : {p.aide}</li>
            ))}
            <li>{cloud ? 'Se déconnecter' : 'Changer d’utilisateur'}.</li>
          </ul>
        </div>
      </section>

      <section className="panel">
        <h2>Les gestes courants</h2>
        <dl className="aide-gestes">
          {gestes.map(([titre, texte]) => (
            <div key={titre}>
              <dt>{titre}</dt>
              <dd>{texte}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="muted small-note">
        Une phrase en haut de chaque page rappelle à quoi elle sert ; on peut la masquer dans {vers('/reglages')}.
      </p>
    </div>
  );
}
