import { ADMIN_ROLE_ID, ALL_PERMISSIONS } from './permissions';
import { statuses } from './seedData';
import type { AppData, OrgMember, OrgUnit, Permission, Person, Role, Section, UnitType } from './types';
import { uid } from './utils';

// Entités du club : comité central, sous-comités, groupes, équipes d'événement.
// Chaque entité a ses propres données (responsables, rôles, sections, statuts, tâches, séances…).

export const UNIT_TYPES: Record<UnitType, { label: string; plural: string; icon: string; chef: string; seances: string; aide: string }> = {
  central: { label: 'Comité central', plural: 'Comité central', icon: '🏛️', chef: 'Président', seances: 'Comité', aide: 'Direction du club.' },
  'sous-comite': {
    label: 'Sous-comité',
    plural: 'Sous-comités',
    icon: '🎪',
    chef: 'Président',
    seances: 'Comité',
    aide: 'Organisation d’un événement, avec son président et ses membres.',
  },
  groupe: {
    label: 'Groupe',
    plural: 'Groupes',
    icon: '🚴',
    chef: 'Responsable',
    seances: 'Séances',
    aide: 'Activité permanente du club (école de cyclisme, compétition…) avec ses propres membres (moniteurs…).',
  },
  equipe: {
    label: 'Équipe d’événement',
    plural: 'Équipes d’événement',
    icon: '🎉',
    chef: 'Responsable',
    seances: 'Réunions',
    aide: 'Événement sans comité : quelques personnes, souvent déjà actives ailleurs dans le club.',
  },
};

export const SUB_TYPES: UnitType[] = ['sous-comite', 'groupe', 'equipe'];

const MEMBER_PERMS: Permission[] = ['tasks.viewAll', 'tasks.editOwn', 'tab.meetings', 'tab.events', 'tab.people', 'polls.create'];
const HELPER_PERMS: Permission[] = ['tasks.editOwn', 'tab.events', 'tab.people'];

/** Rôles de départ d'une nouvelle entité (modifiables ensuite dans sa console admin). */
export function unitRoles(type: UnitType): Role[] {
  const admin = (label: string): Role => ({ id: ADMIN_ROLE_ID, label, couleur: '#b45309', permissions: ALL_PERMISSIONS, sections: [], locked: true });
  const role = (id: string, label: string, couleur: string, permissions: Permission[]): Role => ({ id, label, couleur, permissions, sections: [] });
  if (type === 'groupe')
    return [
      admin('Admin (Responsable du groupe)'),
      role('moniteur', 'Moniteur', '#1d4ed8', MEMBER_PERMS),
      role('membre', 'Membre du groupe', '#9333ea', HELPER_PERMS),
    ];
  if (type === 'equipe') return [admin('Admin (Responsable)'), role('membre', 'Membre de l’équipe', '#1d4ed8', MEMBER_PERMS)];
  return [
    admin('Admin (Président du comité)'),
    role('membre', 'Membre du comité', '#1d4ed8', MEMBER_PERMS),
    role('benevole', 'Bénévole', '#9333ea', HELPER_PERMS),
  ];
}

const SECTIONS: Record<UnitType, string[]> = {
  central: ['Administration', 'Divers'],
  'sous-comite': ['Organisation générale', 'Logistique', 'Bénévoles', 'Communication', 'Finances et sponsors'],
  groupe: ['Activités', 'Encadrement', 'Matériel', 'Administration'],
  equipe: ['Préparation', 'Jour J', 'Après l’événement'],
};

export const unitSections = (type: UnitType): Section[] => SECTIONS[type].map((nom, i) => ({ id: `sec${i + 1}`, nom, sousSections: [] }));

/** Rôle donné par défaut à un nouveau membre : « Comité » / « Membre », sinon le rôle non admin le moins étendu. */
export function defaultRoleId(roles: Role[]) {
  const plain = roles.find((r) => r.id === 'comite' || r.id === 'membre');
  if (plain) return plain.id;
  const others = roles.filter((r) => r.id !== ADMIN_ROLE_ID).sort((a, b) => a.permissions.length - b.permissions.length);
  return others[0]?.id ?? ADMIN_ROLE_ID;
}

/** Données de départ d'une nouvelle entité : statuts du club, sections et rôles du type, membres. */
export function unitData(type: UnitType, people: Person[], byId: string, label: string): AppData {
  return {
    people,
    statuses: structuredClone(statuses),
    sections: unitSections(type),
    roles: unitRoles(type),
    tasks: [],
    meetings: [],
    events: [],
    polls: [],
    emails: [],
    notifications: [],
    notifLues: {},
    prefs: {},
    schema: 12,
    log: [{ id: uid('l'), at: new Date().toISOString(), userId: byId, action: `Création de « ${label} »` }],
  };
}

/** Clé qui identifie une même personne d'une entité à l'autre (son adresse email). */
export const personKey = (p: { email?: string; id: string }, unitId: string) => (p.email?.trim() ? p.email.trim().toLowerCase() : `id:${unitId}:${p.id}`);

/** Membres actifs d'une entité, pour l'organigramme. */
export function orgMembers(d: Pick<AppData, 'people' | 'roles'>): OrgMember[] {
  return d.people
    .filter((p) => p.actif)
    .map((p) => ({
      id: p.id,
      prenom: p.prenom,
      nom: p.nom,
      poste: p.poste,
      autresPostes: p.autresPostes,
      email: p.email,
      telephone: p.telephone,
      couleur: p.couleur,
      roles: d.roles.filter((r) => p.roles.includes(r.id)).map((r) => r.label),
      admin: p.roles.includes(ADMIN_ROLE_ID),
    }));
}

/** Annuaire du club : chaque personne une seule fois, avec ses postes dans les différentes entités. */
export interface DirectoryEntry {
  key: string;
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  couleur: string;
  postes: { unit: OrgUnit; member: OrgMember }[];
}

/** Annuaire du club : une entrée par personne (même adresse email), avec ses postes ; par ordre alphabétique, ou dans l'ordre de l'organigramme. */
export function directory(units: OrgUnit[], alphabetical = true): DirectoryEntry[] {
  const map = new Map<string, DirectoryEntry>();
  for (const unit of units)
    for (const m of unit.membres) {
      const key = personKey(m, unit.id);
      const e = map.get(key) ?? { key, prenom: m.prenom, nom: m.nom, email: m.email, telephone: m.telephone, couleur: m.couleur, postes: [] };
      e.postes.push({ unit, member: m });
      map.set(key, e);
    }
  const list = [...map.values()];
  return alphabetical ? list.sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr')) : list;
}

/** Ordre d'affichage : comité central, puis sous-comités, groupes, équipes (événements par date). */
export function sortUnits<T extends { type: UnitType; nom: string; date?: string }>(list: T[]): T[] {
  const rank: Record<UnitType, number> = { central: 0, 'sous-comite': 1, groupe: 2, equipe: 3 };
  return [...list].sort((a, b) => rank[a.type] - rank[b.type] || (a.date ?? '').localeCompare(b.date ?? '') || a.nom.localeCompare(b.nom, 'fr'));
}

export const UNIT_COLORS = ['#1d4ed8', '#059669', '#ea580c', '#db2777', '#7c3aed', '#0891b2', '#b45309', '#475569'];
