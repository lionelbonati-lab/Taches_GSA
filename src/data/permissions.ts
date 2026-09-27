import type { Permission, RoleId, Task } from './types';

export const ROLES: { id: RoleId; label: string }[] = [
  { id: 'admin', label: 'Admin (Président)' },
  { id: 'secretaire', label: 'Secrétaire' },
  { id: 'comite', label: 'Comité' },
];

export const PERMISSIONS: { id: Permission; label: string }[] = [
  { id: 'tasks.viewAll', label: 'Voir toutes les tâches' },
  { id: 'tasks.createAny', label: 'Créer / assigner des tâches à tous' },
  { id: 'tasks.editAny', label: 'Modifier toutes les tâches' },
  { id: 'tasks.editOwn', label: 'Modifier ses propres tâches' },
  { id: 'meetings.manage', label: 'Gérer les séances de comité' },
  { id: 'events.manage', label: 'Gérer les événements' },
  { id: 'people.manage', label: 'Gérer les responsables' },
  { id: 'settings.lists', label: 'Gérer sections / statuts' },
  { id: 'admin.access', label: 'Accès console admin' },
];

const ALL = PERMISSIONS.map((p) => p.id);

export const DEFAULT_PERMISSIONS: Record<RoleId, Permission[]> = {
  admin: ALL,
  secretaire: ALL.filter((p) => p !== 'admin.access' && p !== 'settings.lists'),
  comite: ['tasks.viewAll', 'tasks.editOwn'],
};

export const roleLabel = (r: RoleId) => ROLES.find((x) => x.id === r)?.label ?? r;

export function canEditTask(perms: Permission[], userId: string, t: Task) {
  if (perms.includes('tasks.editAny')) return true;
  return perms.includes('tasks.editOwn') && (t.responsables.includes(userId) || t.createdBy === userId);
}
