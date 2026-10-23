import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { entitesDependantes, evenementsDependants } from '../data/externes';
import { nomAppli } from '../data/nomAppli';
import { motSeance } from '../data/seances';
import { useChemin, useNavigation } from '../components/Nav';

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

  geste('Voir ce que j’ai à faire', vers('/'), ' : mes tâches en retard et celles de la semaine. La cloche 🔔 en haut signale ce qui m’attend.');
  geste('Ajouter une tâche, demander un remboursement, payer une facture', 'Le bouton rond « + » en bas à droite, depuis n’importe quelle page. Une nouvelle tâche est pour la prochaine séance de comité (le jour même, à son ordre du jour) ; dans un PV, pour la séance suivante. « Pour quand ? » se change à volonté, ou s’efface avec « ✕ Aucun délai ».');
  geste('Modifier une tâche ou changer son statut', vers('/taches'), ' : clique sur la tâche. « Mes tâches » / « Toutes » choisit la liste.');
  geste('Retrouver une tâche terminée', vers('/taches'), ' : les terminées restent affichées jusqu’au comité suivant, puis sont archivées : bouton « 🗄 Archives ».');
  if (cloud && can('admin.access'))
    geste('Revenir aux données d’hier (erreur, suppression)', vers('/reglages'), ' › « Copies automatiques » : le serveur garde une copie par nuit pendant 30 jours ; « ↩ Restaurer » (l’état actuel est copié juste avant).');
  geste('Ajouter une checklist, un document, une répétition, un email…', 'Dans la fiche de la tâche, la ligne « Ajouter : » en bas. Ce qui est rempli reste affiché.');
  geste('Programmer un email à quelqu’un ou à toute une entité', 'Dans la tâche, « Ajouter : » › « 📧 Email ». Sous « Destinataires », tape un nom, un poste' + (club ? ', une entité (l’email part à toutes ses personnes) ou une personne d’une autre entité' : '') + ', ou une adresse email, puis choisis dans la liste (Entrée au clavier). ✕ retire une puce. À l’heure prévue, une notification 🔔 te propose d’ouvrir l’email rempli dans ta messagerie.');
  const mot = motSeance(club?.current.type).toLowerCase();
  geste(`Une tâche qui revient à chaque ${mot} (correspondance, point des finances…)`, `Dans la tâche, « Ajouter : » › « 🔁 Répétition » › « À chaque ${mot} » : elle est rattachée à la prochaine séance ; une fois terminée, la suivante est créée pour la séance d’après, à son ordre du jour, avec le même écart de délai. Ce n’est pas un doublon : l’appli demande confirmation si on la termine longtemps avant son délai.`);
  if (chemin('/comite')) geste('M’excuser pour une séance', vers('/comite'), ' : « 🚫 Je serai absent(e) » sous la séance.');
  if (chemin('/comite') && can('meetings.manage'))
    geste('Prévoir les séances de l’année prochaine', vers('/comite'), ' : chaque séance revient le même mois ; coche celles à ajouter dans « 🔁 Séances de l’année prochaine ».');
  if (chemin('/ordre-du-jour')) geste('Préparer une séance', vers('/ordre-du-jour'), ' : choisis la séance, relis (clic sur une tâche pour la modifier), puis imprime ou envoie par email.');
  if (chemin('/pv')) geste('Tenir le PV', vers('/pv'), ' : « Prise de notes » pendant la séance, puis « Valider et archiver » et l’envoyer. Avec « 📤 Dépôt du PV validé » (options du PV), la validation ouvre aussi la page où déposer le PDF du PV.');
  if (chemin('/pv') || chemin('/ordre-du-jour'))
    geste('Joindre les fichiers des tâches au PV ou à l’ordre du jour', 'Les pièces jointes de chaque point y sont nommées : un clic sur un fichier l’ouvre (aussi dans un document archivé). PV : « 📄 PV » › « Options du PV » ; ordre du jour : réglages « Contenu ». Coche « 📎 Joindre les fichiers liés » : liste des annexes, puis photos et pages des PDF à la fin, 1, 2 ou 4 par page. Dessous, « Fichiers joints » : décoche les photos à ne pas publier (choix de la séance, l’ordre du jour et le PV chacun le leur).');
  if (chemin('/pv') || chemin('/ordre-du-jour'))
    geste('Envoyer l’ordre du jour ou le PV en PDF, avec des liens cliquables', '« 📄 PDF » (ordre du jour, PV, documents archivés dans la séance) : l’appli crée le PDF elle-même et le télécharge (sur téléphone : partage direct, mail ou WhatsApp). Les adresses web des remarques, notes et checklists, les documents « 🔗 Lien » et les liens des PDF joints y restent cliquables. « 🖨 Imprimer » sert au papier.');
  const miseEnForme = ' : police, interligne, marges, puis chaque élément (titre, sections, points, notes…) en taille, gras, italique, majuscules, couleur ; le fond de l’encadré « Prochaine séance ». La même pour l’ordre du jour et le PV de l’entité.';
  if (chemin('/ordre-du-jour') && can('tab.pv'))
    geste('Changer la police, les couleurs ou la taille des titres de l’ordre du jour et du PV', vers('/ordre-du-jour'), ' › « Mise en page » › « Mise en forme »', miseEnForme);
  else if (chemin('/pv')) geste('Changer la police, les couleurs ou la taille des titres du PV et de l’ordre du jour', vers('/pv'), ' › « 📄 PV » › « 🎨 Mise en forme »', miseEnForme);
  if (chemin('/ordre-du-jour') && can('tab.pv'))
    geste('Garder des réglages de l’ordre du jour pour la prochaine fois (profil)', vers('/ordre-du-jour'), ' › « Profils » : règle le contenu et la mise en page, donne un nom (« Comité ordinaire », « AG »…) puis « 💾 Enregistrer le profil » (avec ou sans la mise en forme). Un clic sur son nom rétablit ces réglages ; 💾 le remplace par les réglages actuels, ✏️ le renomme, 🗑 le supprime. Communs à l’entité.');
  geste('Voter ou poser une question au comité', vers('/sondages'), '. Un sondage qui attend ta réponse apparaît aussi à l’accueil.');
  if (can('polls.create'))
    geste('Fermer un sondage tout seul à une date et une heure', vers('/sondages'), ' : dans le sondage, « Date limite » puis « Heure », avec « 🔒 Clôturer automatiquement » coché. Décoche-le pour une date seulement indicative (le sondage reste ouvert jusqu’à « Clôturer »).');
  geste('Envoyer une tâche ou un sondage par WhatsApp (ou une autre appli)', 'L’icône de partage (trois points reliés) en haut à droite de la tâche ou du sondage : modifie le message si besoin, puis « 💬 WhatsApp », « Autre appli… » (téléphone), « ✉ Email » ou « 📋 Copier ». Le lien ouvre la tâche ou le sondage dans l’appli' + (club ? ', dans la bonne entité' : '') + ' ; il ne donne accès qu’aux personnes qui ont un compte et la voient déjà.');
  if (sondagesEntites && club && club.units.length > 1 && can('polls.create'))
    geste('Poser une question à d’autres entités (École, groupe, CO…)', vers('/sondages'), ' : « + Nouveau sondage » › « Ouvrir aussi à d’autres entités ». Tous leurs membres votent depuis leur entité ; une personne de plusieurs entités ne vote qu’une fois.');
  geste('Rattacher une tâche à un événement, une séance ou une autre tâche', 'Dans la tâche, « Ajouter : » › « 🧩 Rattacher à… » : un événement, une séance de comité, ou une tâche principale (dans une tâche principale : « + Nouvelle tâche rattachée » ou « 🧩 Rattacher une tâche existante » ; repère 🧩 3/8 dans la liste). Pour un délai qui suit la date d’un événement ou d’une séance : « Pour quand ? » › « 📌 ou selon un événement / une séance » (repère 📌). 🔗 sert seulement aux liens web des documents.');
  geste('Proposer une tâche à quelques personnes, pour que l’une d’elles s’en charge', 'Dans la tâche, « Ajouter : » › « 🙋 À prendre », puis « ＋ Proposer à… » : des personnes, tout un rôle (« Comité » : tout le comité, président et secrétaire compris) ou tout le monde (et, au besoin, combien il en faut). Elles la voient dans « Mes tâches » et à l’accueil, avec une notification 🔔 ; la première qui clique « 🙋 Je m’en charge » en devient responsable, et tu es prévenu. Ensuite, elle n’est plus proposée aux autres. Qui n’est pas dispo répond « 🙅 Pas dispo » : tu es prévenu aussi, et la tâche montre qui a décliné. Marche aussi dans une tâche partagée par une autre entité : tu la proposes aux personnes d’ici, les places se comptent avec celles des autres entités.');
  geste('Mettre quelqu’un au courant d’une tâche, sans qu’il s’en occupe', 'Dans la tâche, « Ajouter : » › « 👁 Pour info », puis « ＋ Ajouter… » : une personne d’ici, une autre entité ou une personne d’une autre entité. Une personne d’ici la voit dans « Mes tâches » (👁 Pour info) et à l’accueil, avec une notification 🔔 ; les autres entités la consultent en lecture seule (accueil, Tâches › « 👁 Pour info »). Marche aussi dans une tâche partagée par une autre entité.');
  if (club && club.units.length > 1)
    geste('Partager une tâche avec d’autres entités (comité central, CO, groupe…)', 'Dans la tâche, « Ajouter : » › « 🤝 Partager », puis choisis les entités : elles la voient dans leurs tâches et leur ordre du jour (sous l’événement, ou la section qui porte ton nom) et la modifient comme les leurs. Elle reste enregistrée chez toi, repérée 🤝.');
    geste('Compléter une tâche qu’une autre entité partage avec toi', 'Dans la tâche, « Ajouter : » propose tout : 📎 documents (les fichiers sont rangés chez elle, avec ton nom), 🔁 répétition (elle crée l’occurrence suivante quand la tâche est terminée), 🧩 une séance d’ici (la tâche va à son ordre du jour et à son PV), 🤝 partage avec d’autres entités, 📊 sondage, 📧 email. La supprimer, la rattacher à un événement ou à une autre tâche : dans son entité (« Ouvrir dans … »).');
  if (club && club.current.type !== 'central')
    geste('Mettre une tâche à l’ordre du jour du comité dont dépend l’entité', 'Dans la tâche, « Ajouter : » › « 🧩 Rattacher à… » › « Séance de comité » : choisis une séance du comité (groupe « Séances de … »). La tâche lui est partagée et figure à l’ordre du jour et au PV de cette séance ; repère 🏛️. Pour un délai calé sur elle (« 1 semaine avant le comité d’octobre ») : « Pour quand ? » › « 📌 ou selon un événement / une séance », groupe « Selon une séance de … » ; il suit la date de la séance.');
  if (chemin('/evenements') && can('events.manage')) {
    geste('Donner une heure à un événement, ou le faire revenir chaque semaine', vers('/evenements'), ' : dans l’événement, décoche « Toute la journée » pour les heures de début et de fin ; le menu « Répétition » propose tous les jours, toutes les semaines, tous les mois, tous les ans ou « Personnalisé… » (tous les 2 semaines, certains jours de la semaine, jusqu’à une date ou un nombre de fois).');
    geste('Changer ou supprimer une seule date d’un événement qui se répète', 'Ouvre l’occurrence dans l’agenda (ou glisse-la sur un autre jour) : à l’enregistrement ou à la suppression, choisis « Cet événement », « Cet événement et tous les suivants » ou « Tous les événements ». Les tâches rattachées et les délais calés dessus suivent leur date.');
  }
  if (club && chemin('/evenements'))
    geste('Voir les événements qui dépendent du comité', vers('/evenements'), ' : les sous-comités et équipes d’événement qui en dépendent y sont à la date de leur prochaine édition, marqués « dépend de ce comité », avec l’avancement de leurs tâches partagées et des tâches du comité rattachées à eux (« Voir les tâches → »).');
  if (club && entitesDependantes(club.units, club.current).length)
    geste('Attribuer une tâche du comité à un événement ou à un groupe qui dépend de lui', 'Dans la tâche (nouvelle ou existante), choisis la section « Événements », puis dans « Sous-section » l’un des « Événements qui dépendent de … » et sa section chez lui ; ou la section au nom du groupe (« École de cyclisme »), puis l’une de ses sections (« Sections de … »). À l’enregistrement, la tâche passe chez lui : il la gère comme les siennes ; au comité, elle reste visible et modifiable, partagée 🤝. Ses fichiers joints la suivent (rangés chez lui) ; les emails programmés restent au comité : supprime-les d’abord.');
  if (club && evenementsDependants(club.units, club.current).length)
    geste('Rattacher une tâche du comité à un événement qui dépend de lui', 'Dans la tâche, « 🧩 Rattacher à… » › « Événement », groupe « Événements qui dépendent de … » : sa prochaine édition ou l’un de ses événements. Pour un délai calé sur lui (« 1 semaine avant la soirée ») : « Pour quand ? » › « 📌 ou selon un événement / une séance ». Le nom et la date suivent les changements de l’événement.');
  if (club) geste('Passer à une autre entité (sous-comité, groupe, équipe)', 'Le nom de l’entité en haut à gauche ▾ (l’organigramme du club y est aussi). Chaque entité a ses propres tâches, séances et membres.');
  geste('Installer l’appli sur le téléphone ou l’ordinateur', '« 📲 Installer l’application » dans le menu du compte (« ☰ Plus » sur téléphone).');
  geste('Choisir ce qui s’affiche sur mon accueil, et dans quel ordre', vers('/'), ' : le bouton « ⚙ Personnaliser » à côté de « Bonjour » (⚙ seul sur téléphone). Coche les blocs et les compteurs à voir, séparément sur téléphone et sur ordinateur ; ↑ ↓ change leur ordre. Le bloc « À faire » se règle aussi : nombre de jours (directement dans son titre) et, si tu vois toutes les tâches, les tiennes ou toutes.');
  geste('Thème sombre, notifications', vers('/reglages'), '.');
  if (club) {
    geste('Enregistrer mon IBAN pour mes remboursements', vers('/reglages'), ' › « Mes données au club » : « Enregistrer mon IBAN » ; ou, en demandant un remboursement, coche « Enregistrer mon IBAN ». Toi seul peux le saisir ou le modifier ; seuls les caissiers le voient.');
    geste('Masquer mes coordonnées dans la liste des membres du club', vers('/reglages'), ' › « Mes données au club » : « Masquer mes données personnelles ». Ton email, ton téléphone et ton IBAN n’y apparaissent plus (« 🔒 masqué »).');
  }
  if (club && chemin('/membres-club')) {
    geste('Choisir les colonnes de la liste des membres', vers('/membres-club'), ' : « ⚙️ Colonnes » (afficher, masquer, ↑/↓ pour l’ordre) ; un clic sur un en-tête trie. Ce réglage n’est que pour toi.');
    if (club.membresAcces)
      geste('Gérer les accès d’un membre (rôles, entités, activation)', vers('/membres-club'), ' : clic sur le membre › « Entités et accès ». Dans les entités dont tu es admin : coche ses rôles, crée ou retire son accès à l’appli, « Retirer de l’entité », ou « Ajouter à une entité… ».');
  }
  if (chemin('/propositions')) geste('Proposer une idée pour l’appli, signaler un problème', vers('/propositions'), ' (menu du compte) : le comité central l’étudie et te répond sur la même page, dans « Mes propositions ».');
  // Organigramme : dans le menu des entités (en haut à gauche), pas dans les rubriques.
  const orga = club && <><Link to="/organigramme">Organigramme du club</Link> (menu des entités, en haut à gauche)</>;
  if (orga) geste('Voir qui fait quoi, et ses coordonnées', orga, ' : un clic sur une personne ouvre la fiche de la personne.');
  if (orga && can('people.manage')) geste('Ajouter une personne à l’entité', orga, ' : « ✏️ Modifier l’organigramme », puis « + Ajouter une personne » en bas de la liste des postes de l’entité.');
  if (orga && club && club.units.length > 1)
    geste('Changer le comité dont dépend un groupe ou un événement', orga, ' : sa fiche ⚙️ › « Dépend de » (comité central). Rien n’est déplacé ni copié : l’ancien comité garde les tâches d’avant (ses ordres du jour, PV et paiements aussi) ; le nouveau peut les consulter et en copier (« 📜 Anciennes tâches »). Les admins de l’entité peuvent lui retirer ce droit dans la même fiche (« Dépendances passées »). Revenir à l’ancien comité dans l’heure annule simplement le changement.');
  if (club && club.units.length > 1)
    geste('Reprendre les tâches d’une entité qui dépend désormais de ton comité', vers('/taches'), ' : « 📜 Anciennes tâches » (affiché quand il y en a) : consulte-les, coche celles à reprendre, puis « Copier la sélection » ou « Tout copier ». Chaque copie est une tâche de ton comité, indépendante, marquée « 📋 Copiée depuis le comité … » ; l’original ne change pas.');
  geste('Vérifier qu’un document visé est authentique', vers('/taches'), ' › Filtres › « 💰 Paiements et remboursements » › « 🔎 Vérifier un visa » : tape le n° imprimé en bas du sceau (ex. K7PM-2XQD). Le montant, le bénéficiaire, la date et le nom affichés doivent être ceux du document ; « n° inconnu » : visa retiré, demande supprimée ou sceau qui ne vient pas de l’appli.');
  if (club && club.units.length > 1)
    geste('À quelle caisse va mon ticket ?', 'À celle de ton entité si elle a un caissier ; sinon à celle du comité dont elle dépend (s’il a un caissier), sinon à la caisse centrale. Tu en suis l’état dans « Mes tâches » › « Envoyés à une autre caisse ».');
  // Organigramme par postes : placer les personnes, créer les postes (liés tout seuls par leur nom).
  const fiches = !!club?.organiser && club.units.some((u) => !u.archive && (club?.canManage || u.moiAdmin));
  if (orga && fiches) {
    geste('Placer quelqu’un dans l’organigramme', orga, ' : « ✏️ Modifier l’organigramme », cherche la personne en haut à gauche (ses propositions s’empilent en pilules ; « ＋ Nouvelle personne » si elle n’est pas encore au club), puis glisse-la sur un poste : elle l’occupe ; sur un ★ : elle en devient responsable ; dans les bénévoles d’un groupe : simple bénévole ; sur le cadre d’un comité : un nouveau poste pour elle. Glissée d’un poste à l’autre, elle quitte le premier ; avec Ctrl (ou Alt) enfoncé, elle le garde aussi. Au doigt : touche son nom › « ✋ Déplacer », puis touche l’endroit. « ↶ Annuler » en bas défait le dernier changement.');
    geste('Créer un poste, le lier au ★ d’une autre entité', orga, ' : « ＋ Poste » dans un comité, un groupe ou un événement (à pourvoir : en rouge jusqu’à ce qu’on y glisse quelqu’un). Un poste qui porte le nom d’une entité (ex. « Camp de Pentecôte ») y est lié tout seul : son titulaire en est ★ (co-responsable s’il y en a déjà un) ; changer l’un change l’autre, automatiquement. Un clic sur le nom d’un poste : le renommer, corriger son lien, le libérer ou le supprimer.');
  }
  if (orga) geste('Lire l’organigramme', orga, ' : en haut, les comités (une carte par poste : le poste, le nom ; et une carte par groupe lié à l’un de ses postes ⛓) et, à droite, les groupes dont le responsable ne siège dans aucun comité ; en dessous, les groupes (« ▷ membres » les affiche) ; puis les événements, sous le groupe ou le poste qui en est responsable, sinon sous leur comité : tout le comité en est responsable. Pour gagner de la place, un événement peut se trouver sous un groupe qui n’en organise aucun : son trait passe sous la carte du groupe et remonte à son responsable (« ⛓ … » sur sa carte). Un clic sur un nom : le profil de la personne. « − » sous une carte replie sa branche ; au-dessus : zoom, « ⛶ Plein écran » (tout l’organigramme sur l’écran ; Échap pour revenir) et « 🖨️ Imprimer / PDF » ; à la souris, tire le fond pour te déplacer.');
  if (orga && club?.organiser) {
    geste('Réorganiser l’organigramme', orga, ' : « ✏️ Modifier l’organigramme », puis glisse une carte (un poste, un groupe, un événement) sur un comité, un groupe ou une autre carte : ce qui se passera s’affiche avant de la lâcher (au doigt : sa poignée ⠿ › « Déplacer… »). Glisser un groupe change ses postes liés ⛓ (dans « Sans comité » : il n’en a plus) ; un événement glissé sur un groupe passe sous lui (un poste du groupe lui est lié), sur un poste d’un comité ce poste lui est lié, dans le cadre d’un comité il en dépend et tout le comité en est responsable (toutes ses tâches s’y affichent). Le comité dont dépend un groupe ou un événement se choisit dans sa fiche ⚙️ (« Dépend de », avec ce que ce comité affiche de ses tâches). Glisse aussi le nom d’une personne d’un poste à un autre (Ctrl : elle garde aussi l’ancien) ; sur un poste déjà occupé, au choix : « ＋ Avec … » (plusieurs personnes au même poste, sur une seule carte) ou « À la place de … » ; au doigt : clic sur le nom › « ✋ Déplacer », puis touche le poste. « ＋ Comité » crée un comité avec président, secrétaire et caissier ; « ＋ Poste » ajoute un poste ; un clic sur le nom d’un poste : le renommer, le libérer, le supprimer. « ↶ Annuler » défait le dernier changement.');
  }
  if (orga && club?.canManage && club.units.some((u) => u.archive))
    geste('Supprimer définitivement une entité archivée', orga, ' : « ✏️ Modifier l’organigramme », « Entités archivées » sous l’organigramme, puis ⚙️ sur l’entité › « 🗑 Supprimer définitivement… ». Tu vois ce qui sera effacé (tâches, séances, fiches, fichiers…), puis tu retapes son nom. Sans retour possible : pour seulement la cacher, laisse-la archivée.');
  if (orga) geste('Revoir l’organigramme d’une année passée', orga, ' : choisis l’année dans « 📅 Aujourd’hui ▾ » en haut de la page. Il s’affiche tel qu’à la fin de cette année-là, en lecture seule ; un clic sur une personne montre ses fonctions cette année-là. « Revenir à aujourd’hui » pour l’organigramme actuel.');
  if (orga && can('admin.access')) geste('Donner l’accès à l’appli à quelqu’un', orga, ' : clic sur son nom (sa fiche doit avoir son email), puis « Créer l’accès ».');
  if (chemin('/admin')) geste('Choisir qui peut faire quoi', vers('/admin'), ' › « Rôles et droits ». Sans « Voir toutes les tâches », on ne voit que ses tâches ; pour une personne extérieure : « + Nouveau rôle » › modèle « Externe ». Les tickets ne se voient que de la caisse, du demandeur, de qui vise et des admins.');
  if (chemin('/admin')) geste('Changer le logo ou la couleur de l’appli', vers('/admin'), ' › « Apparence ».');
  if (chemin('/admin')) geste('Changer l’en-tête de l’ordre du jour, du PV et du bon de paiement', vers('/admin'), ' › « En-tête des documents » : le même pour tous les documents de l’entité.');

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
            <h3>{r.icon} {r.label}</h3>
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
            <h3>🏛️ Entités du club</h3>
            <p className="muted small-note">Le nom de l’entité ouverte, en haut à gauche ▾.</p>
            <ul>
              <li>Passer à une autre de tes entités (sous-comité, groupe, équipe).</li>
              <li><Link to="/organigramme">Organigramme du club</Link> : le comité central, les sous-comités, groupes et équipes, et qui y fait quoi. Un clic sur une personne ouvre sa fiche (coordonnées, rôles, accès à l’appli) ; « ✏️ Modifier l’organigramme » pour ajouter quelqu’un, ranger les cartes ou modifier une entité.</li>
            </ul>
          </div>
        )}
        <div className="aide-rubrique">
          <h3>👤 Mon compte</h3>
          <p className="muted small-note">Ta pastille en haut à droite (« ☰ Plus » sur téléphone).</p>
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
