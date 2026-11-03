import type { IconeNom } from '../components/icones';
import type { Permission } from './types';

// Navigation : quelques rubriques, chacune avec ses pages (sous-onglets). Les adresses des pages ne changent pas
// (liens déjà envoyés, raccourcis installés). Le texte « aide » s'affiche en haut de la page et dans « Comment ça marche ? ».
// Sur téléphone, la barre du bas montre jusqu'à BARRE_MAX rubriques au choix de chacun (`mobile` : celles d'origine), les
// autres sont dans « Plus ».

/** `dans` : page qui s'ouvre depuis une autre, pas depuis les menus. */
export type NavPage = { to: string; label: string; icon: IconeNom; aide: string; perm?: Permission; club?: boolean; registre?: boolean; demandes?: boolean; superAdmin?: boolean; dans?: string };
export type NavRubrique = { id: string; label: string; court?: string; icon: IconeNom; mobile?: boolean; pages: NavPage[] };

const RUBRIQUES: NavRubrique[] = [
  {
    id: 'accueil',
    label: 'Accueil',
    icon: 'accueil',
    mobile: true,
    pages: [{ to: '/', label: 'Accueil', icon: 'accueil', aide: 'Ton résumé : points en retard, à faire cette semaine, prochaine séance et prochains événements.' }],
  },
  {
    id: 'taches',
    label: 'Points',
    icon: 'taches',
    mobile: true,
    pages: [
      {
        to: '/taches',
        label: 'Points',
        icon: 'taches',
        aide: 'Tous les points, remboursements et paiements de factures. Clique sur un point pour l’ouvrir ; le bouton « + » en ajoute un.',
      },
    ],
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: 'message',
    mobile: true,
    pages: [
      {
        to: '/messages',
        label: 'Messages',
        icon: 'message',
        aide: 'Les discussions des points, comme une messagerie : la plus récente en haut, les non lues en gras avec leur nombre. Touche une discussion pour l’ouvrir ; « Nouvelle discussion » en lance une sur un point.',
      },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: 'calendrier',
    mobile: true,
    pages: [
      { to: '/agenda', label: 'Calendrier', icon: 'calendrier', aide: 'Le mois en un coup d’œil : séances, événements, échéances des points et fins de sondage. Clique sur un jour pour le détail.' },
      { to: '/evenements', label: 'Événements', icon: 'evenements', perm: 'tab.events', aide: 'Les manifestations du club, avec l’avancement des points qui les préparent.' },
    ],
  },
  {
    id: 'comite',
    label: 'Comité',
    icon: 'seances',
    mobile: true,
    pages: [
      { to: '/comite', label: 'Séances', icon: 'seances', perm: 'tab.meetings', aide: 'Les séances à venir du comité : date, lieu (placé sur une carte au besoin), excusés, ordre du jour et PV archivés. Les séances passées sont repliées en bas.' },
      {
        to: '/ordre-du-jour',
        label: 'Ordre du jour',
        icon: 'odj',
        perm: 'tab.pv',
        aide: 'Avant la séance : l’ordre du jour se prépare tout seul à partir des points. Relis-le, puis imprime-le, envoie-le ou archive-le.',
      },
      {
        to: '/pv',
        label: 'PV',
        icon: 'pv',
        perm: 'tab.minutes',
        aide: 'Pendant la séance : présences, notes sous chaque point, nouveaux points. Ensuite : valider et envoyer le PV.',
      },
    ],
  },
  {
    id: 'sondages',
    label: 'Sondages',
    icon: 'sondage',
    pages: [{ to: '/sondages', label: 'Sondages', icon: 'sondage', aide: 'Décider entre deux séances : pose une question, chacun vote depuis l’appli.' }],
  },
  {
    // Le club : l'annuaire, avec les rôles et les étiquettes de chacun.
    id: 'personnes',
    label: 'Club',
    icon: 'membres',
    pages: [
      { to: '/membres-club', label: 'Personnes du club', icon: 'membres', registre: true, aide: 'Les personnes du club, avec ou sans accès à l’appli : une fiche par personne, avec ses rôles et ses étiquettes (événements, groupes).' },
    ],
  },
];

/** Menu du compte (en haut à droite ; « Plus » sur téléphone). */
export const PAGES_COMPTE: NavPage[] = [
  {
    to: '/reglages',
    label: 'Réglages',
    icon: 'reglages',
    aide: 'Ton compte, ton IBAN, la confidentialité de tes données, l’affichage et les notifications.',
  },
  {
    to: '/admin',
    label: 'Console admin',
    icon: 'admin',
    perm: 'admin.access',
    aide: 'Les réglages de l’appli, réservés aux admins : rôles et droits, sections, statuts et étiquettes, apparence, en-tête des documents, imports, historique et sauvegarde.',
  },
  {
    to: '/mots-de-passe',
    label: 'Mots de passe oubliés',
    icon: 'cle',
    perm: 'admin.access',
    demandes: true,
    aide: 'Des membres ont oublié leur mot de passe et n’ont pas pu utiliser le lien par e-mail. Vérifie que la demande vient bien d’eux, puis donne-leur un mot de passe provisoire : ils choisiront le leur à la connexion.',
  },
  {
    to: '/comptes',
    label: 'Comptes du club',
    icon: 'comptes',
    superAdmin: true,
    aide: 'Super-admin : tous les comptes du club. Nouveau mot de passe provisoire, blocage, et fusion de deux comptes d’une même personne.',
  },
  {
    to: '/propositions',
    label: 'Proposer une amélioration',
    icon: 'idee',
    club: true,
    aide: 'Une idée pour l’appli, ou quelque chose qui ne marche pas ? Écris-le ici : les admins l’étudient et te répondent sur cette page.',
  },
  { to: '/aide', label: 'Comment ça marche ?', icon: 'aide', aide: 'Où trouver quoi, et les gestes courants.' },
];

/** Nom d'une page de l'appli (« Comité › PV »), quels que soient les droits ; l'adresse elle-même si inconnue. */
export function libellePage(to: string): string {
  for (const r of RUBRIQUES) {
    const p = r.pages.find((x) => x.to === to);
    if (p) return r.pages.length > 1 ? `${r.label} › ${p.label}` : p.label;
  }
  const p = PAGES_COMPTE.find((x) => x.to === to);
  return p ? (p.dans ? `${libellePage(p.dans)} › ${p.label}` : p.label) : to;
}

type Acces = { can: (p: Permission) => boolean; club: boolean; registre: boolean; demandes?: boolean; superAdmin?: boolean };

/** Rubriques et pages visibles selon les droits. */
export function navigation({ can, club, registre, demandes = false, superAdmin = false }: Acces) {
  const visible = (p: NavPage) =>
    (!p.perm || can(p.perm)) && (!p.club || club) && (!p.registre || registre) && (!p.demandes || demandes) && (!p.superAdmin || superAdmin);
  const rubriques = RUBRIQUES.map((r) => {
    const pages = r.pages.filter(visible);
    // Une seule page : la rubrique prend son nom (ex. « Sondages » sans les séances).
    const seule = pages.length === 1 && r.pages.length > 1 ? pages[0] : null;
    const label = seule ? seule.label : r.label;
    return { ...r, label, icon: seule ? seule.icon : r.icon, pages };
  }).filter((r) => r.pages.length > 0);
  return { rubriques, compte: PAGES_COMPTE.filter(visible) };
}

/** Barre du bas (téléphone) : nombre de rubriques à côté de « Plus ». */
export const BARRE_MAX = 5;
export const BARRE_DEFAUT = RUBRIQUES.filter((r) => r.mobile).map((r) => r.id);

/** Rubriques de la barre du bas, dans l'ordre choisi (`choix` : identifiants), sinon celles d'origine. */
export function barreDuBas<R extends { id: string }>(rubriques: R[], choix?: string[]) {
  const prendre = (ids: string[]) => ids.map((id) => rubriques.find((r) => r.id === id)).filter((r): r is R => !!r).slice(0, BARRE_MAX);
  const barre = choix?.length ? prendre(choix) : [];
  return barre.length ? barre : prendre(BARRE_DEFAUT);
}

/** Rubrique et page de l'adresse ouverte. */
export function pageOuverte(rubriques: NavRubrique[], compte: NavPage[], chemin: string) {
  const sur = (p: NavPage) => (p.to === '/' ? chemin === '/' : chemin === p.to || chemin.startsWith(`${p.to}/`));
  for (const r of rubriques) {
    const page = r.pages.find(sur);
    if (page) return { rubrique: r, page };
  }
  const page = compte.find(sur);
  return page ? { rubrique: null, page } : null;
}
