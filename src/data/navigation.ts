import type { IconeNom } from '../components/icones';
import type { Permission, UnitType } from './types';
import { UNIT_TYPES } from './units';

// Navigation : quelques rubriques, chacune avec ses pages (sous-onglets). Les adresses des pages ne changent pas
// (liens déjà envoyés, raccourcis installés). Le texte « aide » s'affiche en haut de la page et dans « Comment ça marche ? ».

export type NavPage = { to: string; label: string; icon: IconeNom; aide: string; perm?: Permission; club?: boolean; registre?: boolean; demandes?: boolean; superAdmin?: boolean };
export type NavRubrique = { id: string; label: string; icon: IconeNom; mobile?: boolean; pages: NavPage[] };

const RUBRIQUES: NavRubrique[] = [
  {
    id: 'accueil',
    label: 'Accueil',
    icon: 'accueil',
    mobile: true,
    pages: [{ to: '/', label: 'Accueil', icon: 'accueil', aide: 'Ton résumé : tâches en retard, à faire cette semaine, prochaine séance et prochains événements.' }],
  },
  {
    id: 'taches',
    label: 'Tâches',
    icon: 'taches',
    mobile: true,
    pages: [
      {
        to: '/taches',
        label: 'Tâches',
        icon: 'taches',
        aide: 'Toutes les tâches, remboursements et paiements de factures. Clique sur une tâche pour l’ouvrir ; le bouton « + » en ajoute une.',
      },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: 'calendrier',
    mobile: true,
    pages: [
      { to: '/agenda', label: 'Calendrier', icon: 'calendrier', aide: 'Le mois en un coup d’œil : séances, événements, échéances des tâches et fins de sondage. Clique sur un jour pour le détail.' },
      { to: '/evenements', label: 'Événements', icon: 'evenements', perm: 'tab.events', aide: 'Les manifestations, avec l’avancement des tâches qui les préparent.' },
    ],
  },
  {
    id: 'comite',
    label: 'Comité',
    icon: 'seances',
    mobile: true,
    pages: [
      { to: '/comite', label: 'Séances', icon: 'seances', perm: 'tab.meetings', aide: 'Date et lieu de chaque séance, les excusés, et l’ordre du jour et le PV une fois archivés.' },
      {
        to: '/ordre-du-jour',
        label: 'Ordre du jour',
        icon: 'odj',
        perm: 'tab.pv',
        aide: 'Avant la séance : l’ordre du jour se prépare tout seul à partir des tâches. Relis-le, puis imprime-le, envoie-le ou archive-le.',
      },
      {
        to: '/pv',
        label: 'PV',
        icon: 'pv',
        perm: 'tab.minutes',
        aide: 'Pendant la séance : présences, notes sous chaque point, nouvelles tâches. Ensuite : valider et envoyer le PV.',
      },
      { to: '/sondages', label: 'Sondages', icon: 'sondage', aide: 'Décider entre deux séances : pose une question, chacun vote depuis l’appli.' },
    ],
  },
  {
    // L'organigramme du club n'est pas une rubrique : il s'ouvre depuis le menu des entités (en haut à gauche).
    id: 'personnes',
    label: 'Membres du club',
    icon: 'membres',
    pages: [{ to: '/membres-club', label: 'Membres du club', icon: 'membres', registre: true, aide: 'L’annuaire de tout le club, avec ou sans accès à l’appli ; on y gère aussi les accès de chacun aux entités.' }],
  },
];

/** Menu du compte (en haut à droite ; « Plus » sur téléphone). */
export const PAGES_COMPTE: NavPage[] = [
  { to: '/reglages', label: 'Réglages', icon: 'reglages', aide: 'Ton compte, ton IBAN, la confidentialité de tes données, l’affichage, les notifications et la sauvegarde.' },
  { to: '/admin', label: 'Console admin', icon: 'admin', perm: 'admin.access', aide: 'Les réglages de l’entité, réservés à ses admins. Choisis ce que tu veux régler.' },
  {
    to: '/mots-de-passe',
    label: 'Mots de passe oubliés',
    icon: 'cle',
    perm: 'admin.access',
    demandes: true,
    aide: 'Des membres de l’entité ont oublié leur mot de passe et n’ont pas pu utiliser le lien par e-mail. Vérifie que la demande vient bien d’eux, puis donne-leur un mot de passe provisoire : ils choisiront le leur à la connexion. Une seule validation suffit, quelle que soit leur entité.',
  },
  {
    to: '/comptes',
    label: 'Comptes du club',
    icon: 'comptes',
    superAdmin: true,
    aide: 'Super-admin : tous les comptes du club et leurs entités. Nouveau mot de passe provisoire, blocage, et fusion de deux comptes d’une même personne.',
  },
  {
    to: '/propositions',
    label: 'Proposer une amélioration',
    icon: 'idee',
    club: true,
    aide: 'Une idée pour l’appli, ou quelque chose qui ne marche pas ? Écris-le ici : le comité central l’étudie et te répond sur cette page.',
  },
  { to: '/aide', label: 'Comment ça marche ?', icon: 'aide', aide: 'Où trouver quoi, et les gestes courants.' },
];

/** Nom d'une page de l'appli (« Comité › PV »), quels que soient les droits ; l'adresse elle-même si inconnue. */
export function libellePage(to: string) {
  if (to === '/organigramme') return 'Organigramme';
  for (const r of RUBRIQUES) {
    const p = r.pages.find((x) => x.to === to);
    if (p) return r.pages.length > 1 ? `${r.label} › ${p.label}` : p.label;
  }
  const p = PAGES_COMPTE.find((x) => x.to === to);
  return p ? p.label : to;
}

type Acces = { can: (p: Permission) => boolean; club: boolean; registre: boolean; type: UnitType; demandes?: boolean; superAdmin?: boolean };

/** Rubriques et pages visibles, avec les noms de l'entité ouverte (« Séances », « Réunions », « Membres »…). */
export function navigation({ can, club, registre, type, demandes = false, superAdmin = false }: Acces) {
  const visible = (p: NavPage) =>
    (!p.perm || can(p.perm)) && (!p.club || club) && (!p.registre || registre) && (!p.demandes || demandes) && (!p.superAdmin || superAdmin);
  const nom = (p: NavPage): NavPage =>
    p.to === '/comite' && type === 'equipe' ? { ...p, label: 'Réunions' } : p;
  const rubriques = RUBRIQUES.map((r) => {
    const pages = r.pages.filter(visible).map(nom);
    // Une seule page : la rubrique prend son nom (ex. « Sondages » sans les séances).
    const seule = pages.length === 1 && r.pages.length > 1 ? pages[0] : null;
    const label = seule ? seule.label : r.id === 'comite' ? UNIT_TYPES[type].seances : r.label;
    return { ...r, label, icon: seule ? seule.icon : r.icon, pages };
  }).filter((r) => r.pages.length > 0);
  return { rubriques, compte: PAGES_COMPTE.filter(visible) };
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
