import type { Permission, UnitType } from './types';
import { UNIT_TYPES } from './units';

// Navigation : quelques rubriques, chacune avec ses pages (sous-onglets). Les adresses des pages ne changent pas
// (liens déjà envoyés, raccourcis installés). Le texte « aide » s'affiche en haut de la page et dans « Comment ça marche ? ».

export type NavPage = { to: string; label: string; icon: string; aide: string; perm?: Permission; club?: boolean; registre?: boolean };
export type NavRubrique = { id: string; label: string; icon: string; mobile?: boolean; pages: NavPage[] };

const RUBRIQUES: NavRubrique[] = [
  {
    id: 'accueil',
    label: 'Accueil',
    icon: '🏠',
    mobile: true,
    pages: [{ to: '/', label: 'Accueil', icon: '🏠', aide: 'Ton résumé : tâches en retard, à faire cette semaine, prochaine séance et prochains événements.' }],
  },
  {
    id: 'taches',
    label: 'Tâches',
    icon: '✅',
    mobile: true,
    pages: [
      {
        to: '/taches',
        label: 'Tâches',
        icon: '✅',
        aide: 'Toutes les tâches, remboursements et paiements de factures. Clique sur une tâche pour l’ouvrir ; le bouton « + » en ajoute une.',
      },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: '📅',
    mobile: true,
    pages: [
      { to: '/agenda', label: 'Calendrier', icon: '📅', aide: 'Le mois en un coup d’œil : séances, événements, échéances des tâches et fins de sondage. Clique sur un jour pour le détail.' },
      { to: '/evenements', label: 'Événements', icon: '🎉', perm: 'tab.events', aide: 'Les manifestations, avec l’avancement des tâches qui les préparent.' },
    ],
  },
  {
    id: 'comite',
    label: 'Comité',
    icon: '🗓️',
    mobile: true,
    pages: [
      { to: '/comite', label: 'Séances', icon: '🗓️', perm: 'tab.meetings', aide: 'Date et lieu de chaque séance, les excusés, et l’ordre du jour et le PV une fois archivés.' },
      {
        to: '/ordre-du-jour',
        label: 'Ordre du jour',
        icon: '📝',
        perm: 'tab.pv',
        aide: 'Avant la séance : l’ordre du jour se prépare tout seul à partir des tâches. Relis-le, puis imprime-le, envoie-le ou archive-le.',
      },
      {
        to: '/pv',
        label: 'PV',
        icon: '🖊️',
        perm: 'tab.minutes',
        aide: 'Pendant la séance : présences, notes sous chaque point, nouvelles tâches. Ensuite : valider et envoyer le PV.',
      },
      { to: '/sondages', label: 'Sondages', icon: '📊', aide: 'Décider entre deux séances : pose une question, chacun vote depuis l’appli.' },
    ],
  },
  {
    id: 'personnes',
    label: 'Personnes',
    icon: '👥',
    pages: [
      {
        to: '/organigramme',
        label: 'Organigramme',
        icon: '🏛️',
        club: true,
        aide: 'Le comité central, les sous-comités, groupes et équipes d’événement, et les postes de chacun. Un clic sur un poste ouvre la fiche de la personne (coordonnées, rôles, accès à l’appli) ; « + Ajouter une personne » sous l’entité.',
      },
      { to: '/membres-club', label: 'Membres du club', icon: '📇', registre: true, aide: 'L’annuaire de tout le club, avec ou sans accès à l’appli.' },
    ],
  },
];

/** Menu du compte (en haut à droite ; « Plus » sur téléphone). */
export const PAGES_COMPTE: NavPage[] = [
  { to: '/reglages', label: 'Réglages', icon: '⚙️', aide: 'Ton compte, l’affichage, les notifications et la sauvegarde.' },
  { to: '/admin', label: 'Console admin', icon: '🛡️', perm: 'admin.access', aide: 'Les réglages de l’entité, réservés à ses admins. Choisis ce que tu veux régler.' },
  { to: '/aide', label: 'Comment ça marche ?', icon: '❓', aide: 'Où trouver quoi, et les gestes courants.' },
];

type Acces = { can: (p: Permission) => boolean; club: boolean; registre: boolean; type: UnitType };

/** Rubriques et pages visibles, avec les noms de l'entité ouverte (« Séances », « Réunions », « Membres »…). */
export function navigation({ can, club, registre, type }: Acces) {
  const visible = (p: NavPage) => (!p.perm || can(p.perm)) && (!p.club || club) && (!p.registre || registre);
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
