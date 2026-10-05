import { ADMIN_ROLE_ID, ALL_PERMISSIONS } from './permissions';
import type { AppData, Role } from './types';
import { COMPTA_SECTION, events, meetings, people, sections, statuses } from './seedData';

// Données de départ de la démo (voir seedData.ts) : postes, rôles, sections, séances et événements du club, sans tâches.

const roles: Role[] = [
  { id: ADMIN_ROLE_ID, label: 'Admin (Président)', couleur: '#b45309', permissions: ALL_PERMISSIONS, sections: [], locked: true },
  { id: 'secretaire', label: 'Secrétaire', couleur: '#be185d', permissions: ALL_PERMISSIONS.filter((p) => p !== 'admin.access' && p !== 'settings.lists' && p !== 'tab.pv'), sections: [] }, // PV (tab.minutes) inclus
  { id: 'comite', label: 'Comité', couleur: '#1d4ed8', permissions: ['tasks.viewAll', 'tasks.editOwn', 'tab.meetings', 'tab.events', 'tab.people', 'polls.create'], sections: [] },
  // Exemples de rôles ajoutés : droits limités à une section, ou à ses propres tâches.
  { id: 'caissier', label: 'Caissier', couleur: '#047857', permissions: ['tasks.viewAll', 'tasks.createAny', 'tasks.editAny', 'tasks.editOwn'], sections: [COMPTA_SECTION] },
  { id: 'responsable', label: 'Responsable d’activité', couleur: '#9333ea', permissions: ['tasks.editOwn', 'tab.events', 'tab.people'], sections: [] },
];

export function makeSeed(): AppData {
  return {
    people: structuredClone(people),
    statuses: structuredClone(statuses),
    sections: structuredClone(sections),
    tasks: [],
    meetings: structuredClone(meetings),
    events: structuredClone(events),
    roles: structuredClone(roles),
    polls: [],
    emails: [],
    schema: 12,
    log: [{ id: 'l0', at: new Date().toISOString(), userId: 'p1', action: 'Données de départ de la démo (sans tâches)' }],
    prefs: {},
  };
}
