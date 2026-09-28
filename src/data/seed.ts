import { ADMIN_ROLE_ID, ALL_PERMISSIONS } from './permissions';
import type { AppData, Poll, Role } from './types';
import { applyDelaiRef } from './utils';
import { COMMITTEE_IDS, COMPTA_SECTION, events, meetings, people, sections, statuses, tasks } from './seedData';
import { OUINON } from './polls';

// Données du G.S. Ajoie (tableau « Suivi des tâches »), voir seedData.ts.

const roles: Role[] = [
  { id: ADMIN_ROLE_ID, label: 'Admin (Président)', couleur: '#b45309', permissions: ALL_PERMISSIONS, sections: [], locked: true },
  { id: 'secretaire', label: 'Secrétaire', couleur: '#be185d', permissions: ALL_PERMISSIONS.filter((p) => p !== 'admin.access' && p !== 'settings.lists' && p !== 'tab.pv'), sections: [] }, // PV (tab.minutes) inclus
  { id: 'comite', label: 'Comité', couleur: '#1d4ed8', permissions: ['tasks.viewAll', 'tasks.editOwn', 'tab.meetings', 'tab.events', 'tab.people', 'polls.create'], sections: [] },
  // Exemples de rôles ajoutés : droits limités à une section, ou à ses propres tâches.
  { id: 'caissier', label: 'Caissier', couleur: '#047857', permissions: ['tasks.viewAll', 'tasks.createAny', 'tasks.editAny', 'tasks.editOwn'], sections: [COMPTA_SECTION] },
  { id: 'responsable', label: 'Responsable d’activité', couleur: '#9333ea', permissions: ['tasks.editOwn', 'tab.events', 'tab.people'], sections: [] },
];

// Sondages d'exemple (sans réponses : on vote en changeant d'utilisateur).
function demoPolls(): Poll[] {
  const byTitle = (s: string) => tasks.find((t) => t.titre.startsWith(s));
  const sec = (nom: string) => sections.find((s) => s.nom === nom)?.id;
  const swiss = byTitle('Décider avec le comité si on enregistre');
  const lieu = tasks.find((t) => t.titre === 'Définir le lieu' && t.meetingId === 'm5');
  const base = { creePar: 'p1', creeLe: '2026-09-25T18:00:00.000Z', votes: {}, votants: [...COMMITTEE_IDS] };
  return [
    {
      ...base, id: 'poll1', type: 'ouinon', multiple: false, anonyme: false, options: OUINON, dateLimite: '2026-10-20', taskId: swiss?.id,
      question: 'Enregistrer tous les membres (139) à Swiss Cycling au lieu des 44 actuels ?',
      description: 'Avant de transmettre la liste exportée de ClubDesk.',
    },
    {
      ...base, id: 'poll2', type: 'dates', multiple: true, anonyme: false, dateLimite: '2026-10-15', sectionId: sec('Divers'),
      question: 'Date de la fête de l’Avent du club',
      options: [
        { id: 'o1', label: '', date: '2026-12-05', heure: '18:00' },
        { id: 'o2', label: '', date: '2026-12-12', heure: '18:00' },
        { id: 'o3', label: '', date: '2026-12-19', heure: '18:00' },
      ],
    },
    {
      ...base, id: 'poll3', type: 'choix', multiple: false, anonyme: false, taskId: lieu?.id,
      question: 'Lieu du Comité 5 (29.10.2026)',
      options: [
        { id: 'o1', label: 'Chez un membre du comité' },
        { id: 'o2', label: 'Au restaurant' },
        { id: 'o3', label: 'Salle du club' },
      ],
    },
    {
      ...base, id: 'poll4', type: 'choix', multiple: true, anonyme: true, sectionId: sec('Événements'),
      question: 'Programme hivernal : quelles activités ajouter ?',
      description: 'Plusieurs réponses possibles, réponses anonymes.',
      options: [
        { id: 'o1', label: 'Sortie ski de fond' },
        { id: 'o2', label: 'Sortie raquettes' },
        { id: 'o3', label: 'Home trainer en groupe' },
        { id: 'o4', label: 'Rien de plus' },
      ],
    },
  ];
}

export function makeSeed(): AppData {
  const base = { people, events, meetings } as AppData;
  return {
    people: structuredClone(people),
    statuses: structuredClone(statuses),
    sections: structuredClone(sections),
    tasks: tasks.map((t) => applyDelaiRef(base, structuredClone(t))),
    meetings: structuredClone(meetings),
    events: structuredClone(events),
    roles: structuredClone(roles),
    polls: demoPolls(),
    schema: 9,
    log: [{ id: 'l0', at: new Date().toISOString(), userId: 'p1', action: 'Import du tableau « Suivi des tâches » (G.S. Ajoie)' }],
    prefs: {},
  };
}
