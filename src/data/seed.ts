import { ADMIN_ROLE_ID, ALL_PERMISSIONS, EXTERNE_COULEUR, EXTERNE_PERMS, MEMBRE_PERMS, MEMBRE_ROLE_ID } from './permissions';
import type { AppData, ClubEvent, Etiquette, Person, Role, SerieEvenements } from './types';
import { COMPTA_SECTION, events, meetings, people, sections, statuses } from './seedData';

// Données de départ de la démo (voir seedData.ts) : postes, rôles, sections, séances et événements du club, sans tâches.
// Les anciennes entités de la démo (école de cyclisme, groupe compétition, CO Bruntrutaine, soirée récréative) sont des
// étiquettes ; leurs personnes qui n'étaient pas au comité sont au club avec le rôle « Membre ».

const slug = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const membre = (id: string, prenom: string, nom: string, couleur: string, poste: string): Person => ({
  id, prenom, nom, email: `${slug(prenom)}.${slug(nom)}@gsajoie.example`, telephone: '', couleur, poste, roles: [MEMBRE_ROLE_ID], actif: true,
});

/** Personnes des anciennes entités qui n'étaient pas au comité. */
const MEMBRES: Person[] = [
  membre('p19', 'Antoine', 'Mercier', '#0d9488', 'Moniteur'),
  membre('p20', 'Simon', 'Vincent', '#2563eb', 'Moniteur'),
  membre('p21', 'Noah', 'Chevalier', '#a16207', 'Aide-moniteur'),
  membre('p22', 'Olivier', 'Gauthier', '#4f46e5', 'Entraîneur route'),
  membre('p23', 'Mathieu', 'Marchand', '#be185d', 'Coureur'),
  membre('p24', 'Patrick', 'Aubry', '#15803d', 'Parcours et sécurité'),
  membre('p25', 'Valérie', 'Lefèvre', '#c2410c', 'Inscriptions et caisse'),
  membre('p26', 'Hugo', 'Morel', '#0d9488', 'Ravitaillement'),
];

/**
 * Étiquettes : les groupes (une section cochée « Groupe ») et les événements de l'agenda (case « Étiquette », leur
 * sous-section dans « Événements »), avec leurs membres (etiquettes.ts).
 */
const ETIQUETTES: Etiquette[] = [
  { id: 'et-u-ecole', nom: 'École de cyclisme', couleur: '#059669', type: 'groupe', sectionId: 'sec6', membres: ['p7', 'p14', 'p19', 'p20', 'p21'] },
  { id: 'et-u-competition', nom: 'Groupe compétition', couleur: '#ea580c', type: 'groupe', sectionId: 'sec5', membres: ['p5', 'p6', 'p22', 'p12', 'p23'] },
  { id: 'et-u-bruntrutaine', nom: 'Bruntrutaine', couleur: '#7c3aed', type: 'evenement', date: '2027-02-27', eventId: 'e11', lieux: [{ sectionId: 'sec8', sousSection: 'Bruntrutaine 27.02.27' }], membres: ['p10', 'p2', 'p24', 'p25', 'p16', 'p26'] },
  { id: 'et-u-soiree', nom: 'Soirée récréative', couleur: '#db2777', type: 'evenement', date: '2026-11-28', eventId: 'e10', lieux: [{ sectionId: 'sec8', sousSection: 'Soirée récréative 28.11' }], membres: ['p8', 'p1', 'p7', 'p17', 'p18'] },
];

/**
 * Séries d'événements (seriesEvenements.ts) : le programme hivernal, une activité par jour de la semaine (l'entraînement
 * en salle du mardi, seedData.ts, et ceux ci-dessous), et le championnat interne en 5 manches.
 */
const SERIES: SerieEvenements[] = [
  { id: 'se-hiver', nom: 'Programme hivernal 2026-27', description: 'Une activité par jour de la semaine, ouverte à tous les membres.' },
  { id: 'se-championnat', nom: 'Championnat interne 2027', description: '5 manches ; classement aux points, prix à la finale.' },
];

const hiver = (id: string, nom: string, date: string, heure: string, heureFin: string, lieu: string, jour: number, jusquau: string): ClubEvent => ({
  id, nom, date, heure, heureFin, lieu, description: '', repetition: { freq: 'semaine', jours: [jour], jusquau }, dansSerie: 'se-hiver',
});
const manche = (n: number, nom: string, date: string, lieu: string): ClubEvent => ({
  id: `e-champ-${n}`, nom: `Manche ${n} – ${nom}`, date, lieu, description: '', dansSerie: 'se-championnat',
});

/** Événement de l'école de cyclisme (ancienne entité), qui se répète ; ceux des séries. */
const EVENEMENTS: ClubEvent[] = [
  { id: 'e-u-ecole-e2', nom: 'Entraînement du mercredi', date: '2026-08-19', heure: '14:00', heureFin: '16:00', lieu: 'Piste du club', description: 'Pour tous les enfants de l’école de cyclisme.', repetition: { freq: 'semaine', jours: [3], jusquau: '2027-06-30' } },
  hiver('e-hiver-cap', 'Course à pied', '2026-10-28', '18:15', '19:30', 'Stade du Tirage', 3, '2027-03-24'),
  hiver('e-hiver-renfo', 'Spinning ou renfo', '2026-10-29', '19:15', '20:30', 'Salle de gym', 4, '2027-03-25'),
  hiver('e-hiver-natation', 'Natation', '2026-10-30', '20:00', '21:00', 'Piscine couverte', 5, '2027-03-26'),
  hiver('e-hiver-vtt', 'Sortie VTT', '2026-10-31', '09:00', '11:30', 'Départ du local', 6, '2027-03-27'),
  manche(1, 'Contre-la-montre', '2027-04-10', 'Fahy'),
  manche(2, 'Montée de Montvoie', '2027-05-08', 'Montvoie'),
  manche(3, 'VTT cross-country', '2027-06-12', 'Les Rangiers'),
  manche(4, 'Critérium', '2027-08-21', 'Porrentruy'),
  manche(5, 'Finale', '2027-09-18', 'Porrentruy'),
];

const roles: Role[] = [
  { id: ADMIN_ROLE_ID, label: 'Admin (Président)', couleur: '#b45309', permissions: ALL_PERMISSIONS, sections: [], locked: true },
  { id: 'secretaire', label: 'Secrétaire', couleur: '#be185d', permissions: ALL_PERMISSIONS.filter((p) => p !== 'admin.access' && p !== 'settings.lists' && p !== 'tab.pv' && !p.startsWith('paiements.')), sections: [] }, // PV (tab.minutes) inclus
  { id: 'comite', label: 'Comité', couleur: '#1d4ed8', permissions: ['tasks.viewAll', 'tasks.editOwn', 'tab.meetings', 'tab.events', 'tab.people', 'polls.create'], sections: [] },
  // Exemples de rôles ajoutés : droits limités à une section, ou à ses propres tâches.
  { id: 'caissier', label: 'Caissier', couleur: '#047857', permissions: ['tasks.viewAll', 'tasks.createAny', 'tasks.editAny', 'tasks.editOwn', 'paiements.payer'], sections: [COMPTA_SECTION] },
  { id: 'responsable', label: 'Responsable d’activité', couleur: '#9333ea', permissions: ['tasks.editOwn', 'tab.events', 'tab.people'], sections: [] },
  { id: MEMBRE_ROLE_ID, label: 'Membre', couleur: '#0f766e', permissions: [...MEMBRE_PERMS], sections: [] },
  { id: 'externe', label: 'Externe', couleur: EXTERNE_COULEUR, permissions: [...EXTERNE_PERMS], sections: [] },
];

export function makeSeed(): AppData {
  return {
    people: structuredClone([...people, ...MEMBRES]),
    statuses: structuredClone(statuses),
    sections: structuredClone(sections),
    tasks: [],
    meetings: structuredClone(meetings),
    events: structuredClone([...events, ...EVENEMENTS]),
    roles: structuredClone(roles),
    polls: [],
    emails: [],
    etiquettes: structuredClone(ETIQUETTES),
    seriesEvenements: structuredClone(SERIES),
    schema: 12,
    log: [{ id: 'l0', at: new Date().toISOString(), userId: 'p1', action: 'Données de départ de la démo (sans points)' }],
    prefs: {},
  };
}
