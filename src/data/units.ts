import { ADMIN_ROLE_ID, ALL_PERMISSIONS } from './permissions';
import { statuses } from './seedData';
import type { AppData, CentralAccess, Guest, OrgMember, OrgUnit, Permission, Person, Role, Section, Unit, UnitType } from './types';
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

// ---------- Organigramme en arbre ----------

/**
 * Entité dont dépend `u` dans l'organigramme : celle choisie (« Dépend de ») si elle est dans la liste,
 * sinon le comité central. Une boucle (A dépend de B qui dépend de A) remonte au comité central.
 */
export function parentDans<T extends Unit>(units: T[], u: T): T | undefined {
  if (u.type === 'central') return undefined;
  const central = units.find((x) => x.type === 'central');
  const parId = new Map(units.map((x) => [x.id, x]));
  const choisi = u.dependDe ? parId.get(u.dependDe) : undefined;
  if (!choisi || choisi.type === 'central') return central;
  for (let p: T | undefined = choisi, n = 0; p && n <= units.length; p = p.dependDe ? parId.get(p.dependDe) : undefined, n++) {
    if (p.id === u.id) return central;
  }
  return choisi;
}

export type Branche<T> = { u: T; enfants: Branche<T>[] };

/** Arbre des entités : le comité central en haut, chaque entité sous celle dont elle dépend. */
export function arbreEntites<T extends Unit>(units: T[]): Branche<T>[] {
  const rang = (u: T) => (u.type === 'central' ? -1 : SUB_TYPES.indexOf(u.type));
  const ordre = (a: T, b: T) => rang(a) - rang(b) || a.nom.localeCompare(b.nom, 'fr');
  const fils = new Map<string, T[]>();
  const racines: T[] = [];
  for (const u of units) {
    const p = parentDans(units, u);
    if (p) fils.set(p.id, [...(fils.get(p.id) ?? []), u]);
    else racines.push(u);
  }
  const branche = (u: T): Branche<T> => ({ u, enfants: (fils.get(u.id) ?? []).sort(ordre).map(branche) });
  return racines.sort(ordre).map(branche);
}

/** Entités qui dépendent de `id`, directement ou non (on ne peut pas faire dépendre une entité de l'une d'elles). */
export function sousEntites<T extends Unit>(units: T[], id: string): string[] {
  const trouver = (b: Branche<T>[]): Branche<T> | undefined => b.reduce<Branche<T> | undefined>((r, x) => r ?? (x.u.id === id ? x : trouver(x.enfants)), undefined);
  const tous = (b: Branche<T>): string[] => b.enfants.flatMap((x) => [x.u.id, ...tous(x)]);
  const b = trouver(arbreEntites(units));
  return b ? tous(b) : [];
}

/** Réglage d'une entité : ce que le comité central peut faire de ses données. */
export const CENTRAL_ACCESS: Record<CentralAccess, { label: string; icon: string; aide: string }> = {
  aucun: { label: 'Rien voir', icon: '🔒', aide: 'Les données de l’entité restent réservées à ses membres.' },
  lecture: { label: 'Consulter', icon: '👁', aide: 'Les membres du comité central voient les tâches, séances, membres et fichiers, sans rien changer.' },
  ecriture: {
    label: 'Consulter et modifier / ajouter',
    icon: '✏️',
    aide: 'Ils peuvent aussi ajouter des tâches, les modifier et y joindre des fichiers. Ils ne suppriment rien et ne touchent ni aux membres, ni aux rôles, ni aux séances.',
  },
};

/** Niveau d'accès du comité central réglé par une entité (absent ou inconnu = aucun). */
export const centralAccess = (u: { type: UnitType; central?: string }): CentralAccess =>
  u.type !== 'central' && (u.central === 'lecture' || u.central === 'ecriture') ? u.central : 'aucun';

/**
 * Entité que l'utilisateur peut ouvrir comme membre du comité central sans en faire partie, et avec quel accès.
 * Null s'il en est membre, s'il n'est pas membre du comité central ou si l'entité ne l'a pas ouverte.
 */
export function visitLevel(u: OrgUnit, central: OrgUnit | null): Guest['niveau'] | null {
  const level = centralAccess(u);
  return !u.moi && !!central?.moi && u.parentId === central.id && level !== 'aucun' ? level : null;
}

/** Fiche du membre du comité central qui ouvre une entité en visiteur (absente des membres de l'entité). */
export function guestPerson(m: Pick<OrgMember, 'id' | 'prenom' | 'nom' | 'email' | 'couleur' | 'poste'>): Person {
  return { id: `central-${m.id}`, prenom: m.prenom, nom: m.nom, email: m.email, telephone: '', couleur: m.couleur, poste: m.poste, roles: [], actif: true };
}

const MEMBER_PERMS: Permission[] = ['tasks.viewAll', 'tasks.editOwn', 'tab.meetings', 'tab.events', 'tab.people', 'polls.create'];
const HELPER_PERMS: Permission[] = ['tasks.editOwn', 'tab.events', 'tab.people'];
/** Caisse de l'entité : membre du comité qui reçoit les tickets à rembourser et fait les virements. */
const CAISSE_PERMS: Permission[] = [...MEMBER_PERMS, 'paiements.payer'];
/** Membre d'un comité d'organisation (sous-comité) : gère aussi les événements, dont la date de la prochaine édition. */
const CO_PERMS: Permission[] = [...MEMBER_PERMS, 'events.manage'];

/** Rôles de départ d'une nouvelle entité (modifiables ensuite dans sa console admin). */
export function unitRoles(type: UnitType): Role[] {
  const admin = (label: string): Role => ({ id: ADMIN_ROLE_ID, label, couleur: '#b45309', permissions: ALL_PERMISSIONS, sections: [], locked: true });
  const role = (id: string, label: string, couleur: string, permissions: Permission[]): Role => ({ id, label, couleur, permissions, sections: [] });
  if (type === 'groupe')
    return [
      admin('Admin (Responsable du groupe)'),
      role('moniteur', 'Moniteur', '#1d4ed8', MEMBER_PERMS),
      role('caissier', 'Caissier', '#047857', CAISSE_PERMS),
      role('membre', 'Membre du groupe', '#9333ea', HELPER_PERMS),
    ];
  if (type === 'equipe') return [admin('Admin (Responsable)'), role('membre', 'Membre de l’équipe', '#1d4ed8', MEMBER_PERMS), role('caissier', 'Caissier', '#047857', CAISSE_PERMS)];
  return [
    admin('Admin (Président du comité)'),
    role('membre', 'Membre du comité', '#1d4ed8', CO_PERMS),
    role('caissier', 'Caissier', '#047857', [...CO_PERMS, 'paiements.payer']),
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
      caisse: d.roles.some((r) => p.roles.includes(r.id) && !r.locked && r.permissions.includes('paiements.payer')),
      membreId: p.membreId,
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
