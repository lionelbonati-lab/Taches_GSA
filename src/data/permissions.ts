import type { Permission, Person, Role } from './types';

export const PERMISSION_GROUPS = ['Tâches', 'Onglets visibles', 'Gestion', 'Administration'] as const;

export const PERMISSIONS: { id: Permission; label: string; group: (typeof PERMISSION_GROUPS)[number]; sectionScoped?: boolean }[] = [
  { id: 'tasks.viewAll', label: 'Voir toutes les tâches', group: 'Tâches', sectionScoped: true },
  { id: 'tasks.createAny', label: 'Créer / assigner des tâches à d’autres', group: 'Tâches', sectionScoped: true },
  { id: 'tasks.editAny', label: 'Modifier toutes les tâches', group: 'Tâches', sectionScoped: true },
  { id: 'tasks.editOwn', label: 'Créer et modifier ses propres tâches', group: 'Tâches', sectionScoped: true },
  { id: 'tasks.delete', label: 'Supprimer des tâches', group: 'Tâches', sectionScoped: true },
  { id: 'tab.meetings', label: 'Onglet Comité', group: 'Onglets visibles' },
  { id: 'tab.events', label: 'Onglet Événements', group: 'Onglets visibles' },
  { id: 'tab.people', label: 'Onglet Responsables', group: 'Onglets visibles' },
  { id: 'tab.pv', label: 'Onglet Ordre du jour', group: 'Onglets visibles' },
  { id: 'tab.minutes', label: 'Onglet PV (prise de notes, PV)', group: 'Onglets visibles' },
  { id: 'meetings.manage', label: 'Gérer les séances de comité', group: 'Gestion' },
  { id: 'events.manage', label: 'Gérer les événements', group: 'Gestion' },
  { id: 'people.manage', label: 'Gérer les responsables', group: 'Gestion' },
  { id: 'polls.create', label: 'Créer des sondages', group: 'Gestion' },
  { id: 'polls.manage', label: 'Gérer tous les sondages (clôturer, supprimer)', group: 'Gestion' },
  { id: 'paiements.valider', label: 'Valider (signer) les tickets à rembourser', group: 'Gestion' },
  { id: 'paiements.payer', label: 'Caisse : faire les virements des tickets validés', group: 'Gestion' },
  { id: 'settings.lists', label: 'Gérer sections / statuts', group: 'Administration' },
  { id: 'admin.access', label: 'Accès console admin', group: 'Administration' },
];

export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.id);
export const ADMIN_ROLE_ID = 'admin';

export const userRoles = (roles: Role[], p?: Person | null) => (p ? roles.filter((r) => p.roles.includes(r.id)) : []);

export const rolesLabel = (roles: Role[], p?: Person | null) =>
  userRoles(roles, p).map((r) => r.label).join(' + ') || 'Aucun rôle';

/**
 * Un droit est accordé si au moins un des rôles de la personne le contient
 * et couvre la section demandée (rôle sans restriction = toutes les sections).
 */
export function hasPermission(roles: Role[], perm: Permission, sectionId?: string) {
  return roles.some(
    (r) => (r.locked || r.permissions.includes(perm)) && (!sectionId || r.sections.length === 0 || r.sections.includes(sectionId)),
  );
}
