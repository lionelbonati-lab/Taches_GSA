import type { Permission, Person, Role, Task } from './types';
import { pourMoi } from './pourInfo';
import { proposeeA } from './aPrendre';

export const PERMISSION_GROUPS = ['Tâches', 'Pages visibles', 'Gestion', 'Administration'] as const;

export const PERMISSIONS: { id: Permission; label: string; group: (typeof PERMISSION_GROUPS)[number]; sectionScoped?: boolean }[] = [
  { id: 'tasks.viewAll', label: 'Voir toutes les tâches', group: 'Tâches', sectionScoped: true },
  { id: 'tasks.createAny', label: 'Créer / assigner des tâches à d’autres', group: 'Tâches', sectionScoped: true },
  { id: 'tasks.editAny', label: 'Modifier toutes les tâches', group: 'Tâches', sectionScoped: true },
  { id: 'tasks.editOwn', label: 'Créer et modifier ses propres tâches', group: 'Tâches', sectionScoped: true },
  { id: 'tasks.delete', label: 'Supprimer des tâches', group: 'Tâches', sectionScoped: true },
  { id: 'tab.meetings', label: 'Comité › Séances (liste des séances, excuses)', group: 'Pages visibles' },
  { id: 'tab.events', label: 'Agenda › Événements', group: 'Pages visibles' },
  { id: 'tab.people', label: 'Coordonnées (email, téléphone) des personnes du club', group: 'Pages visibles' },
  { id: 'tab.pv', label: 'Comité › Ordre du jour', group: 'Pages visibles' },
  { id: 'tab.minutes', label: 'Comité › PV (prise de notes, PV)', group: 'Pages visibles' },
  { id: 'club.membres', label: 'Personnes du club : coordonnées, groupes, ajout et modification des personnes', group: 'Pages visibles' },
  { id: 'meetings.manage', label: 'Gérer les séances de comité', group: 'Gestion' },
  { id: 'events.manage', label: 'Gérer les événements', group: 'Gestion' },
  { id: 'people.manage', label: 'Gérer les personnes du club (ajouter, modifier, retirer du club)', group: 'Gestion' },
  { id: 'polls.create', label: 'Créer des sondages', group: 'Gestion' },
  { id: 'polls.manage', label: 'Gérer tous les sondages (clôturer, supprimer)', group: 'Gestion' },
  { id: 'paiements.valider', label: 'Paiements : peut viser (signer) les tickets, sur demande de la caisse', group: 'Gestion' },
  { id: 'paiements.payer', label: 'Caisse : reçoit les tickets, demande les visas, fait les virements', group: 'Gestion' },
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

/**
 * Personnes d'un rôle (« Tout un rôle » d'une tâche à prendre). Le rôle de base des séances (« Comité » : accès aux
 * séances, sans autre rôle des séances aux droits plus restreints) compte aussi les personnes dont les rôles donnent au
 * moins ses droits (président, secrétaire…) : tout le comité. Les autres rôles : leurs seules personnes.
 */
export function personnesDuRole<P extends Pick<Person, 'roles'>>(roles: Role[], people: P[], r: Role): P[] {
  const seances = (x: Role) => x.locked || x.permissions.includes('tab.meetings');
  const couvre = (a: Role, b: Role) => !!a.locked || b.permissions.every((p) => a.permissions.includes(p));
  const base = seances(r) && !r.locked && !roles.some((s) => s.id !== r.id && seances(s) && couvre(r, s) && !couvre(s, r));
  return people.filter((p) => {
    if (p.roles.includes(r.id)) return true;
    if (!base) return false;
    const siens = roles.filter((x) => p.roles.includes(x.id));
    return hasPermission(siens, 'tab.meetings') && r.permissions.every((x) => hasPermission(siens, x));
  });
}

/**
 * Tâche que la personne voit, comme le serveur (migrations 029, 037, 038) : ses tâches (responsable, créées par soi,
 * pour info, à prendre) et celles des sections « Voir toutes » ; les tickets (remboursements, factures) à part : la
 * caisse, le demandeur et la personne qui vise (ou a visé).
 */
export function voitTache(t: Task, userId: string | undefined, roles: Role[]) {
  if ((!!userId && (t.responsables.includes(userId) || t.createdBy === userId)) || pourMoi(t, userId) || proposeeA(t, userId)) return true;
  const p = t.paiement;
  if (!p) return hasPermission(roles, 'tasks.viewAll', t.sectionId);
  return (!!userId && [p.demandePar, p.visa?.a, p.validation?.par].includes(userId)) || hasPermission(roles, 'paiements.payer');
}
