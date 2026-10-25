import { ADMIN_ROLE_ID, ALL_PERMISSIONS } from './permissions';
import { statuses } from './seedData';
import type { AppData, Carte, OrgMember, OrgUnit, PeriodeDependance, Permission, Person, Role, Section, TachesDependance, Unit, UnitType } from './types';
import { uid } from './utils';
import type { IconeNom } from '../components/icones';

// Entités du club : comité central, sous-comités, groupes, équipes d'événement.
// Chaque entité a ses propres données (responsables, rôles, sections, statuts, tâches, séances…).

// `icon` : émoji (listes déroulantes, organigramme) ; `trait` : la même chose en icône dessinée (accueil, agenda).
export const UNIT_TYPES: Record<UnitType, { label: string; plural: string; icon: string; trait: IconeNom; chef: string; seances: string; aide: string }> = {
  central: { label: 'Comité central', plural: 'Comité central', icon: '🏛️', trait: 'comite', chef: 'Président', seances: 'Comité', aide: 'Direction du club.' },
  'sous-comite': {
    label: 'Sous-comité',
    plural: 'Sous-comités',
    icon: '🎪',
    trait: 'sousComite',
    chef: 'Président',
    seances: 'Comité',
    aide: 'Organisation d’un événement, avec son président et ses membres.',
  },
  groupe: {
    label: 'Groupe',
    plural: 'Groupes',
    icon: '🚴',
    trait: 'groupe',
    chef: 'Responsable',
    seances: 'Séances',
    aide: 'Activité permanente du club (école de cyclisme, compétition…) avec ses propres membres (moniteurs…).',
  },
  equipe: {
    label: 'Équipe d’événement',
    plural: 'Équipes d’événement',
    icon: '🎉',
    trait: 'evenements',
    chef: 'Responsable',
    seances: 'Réunions',
    aide: 'Événement sans comité : quelques personnes, souvent déjà actives ailleurs dans le club.',
  },
};

export const SUB_TYPES: UnitType[] = ['sous-comite', 'groupe', 'equipe'];

// ---------- Organigramme en arbre ----------

/**
 * Comité dont dépend `u` (« Dépend de » : toujours un comité) : celui choisi s'il est dans la liste, sinon le comité
 * central. Une ancienne valeur qui désigne un groupe ou un événement : le comité dont celui-ci dépend. Une boucle
 * (A dépend de B qui dépend de A) remonte au comité central.
 */
export function parentDans<T extends Unit>(units: T[], u: T): T | undefined {
  if (u.type === 'central') return undefined;
  const central = units.find((x) => x.type === 'central');
  const parId = new Map(units.map((x) => [x.id, x]));
  let choisi: T | undefined;
  const vus = new Set<string>();
  for (let p = u.dependDe ? parId.get(u.dependDe) : undefined; p && p.type !== 'central'; p = p.dependDe ? parId.get(p.dependDe) : undefined) {
    if (p.id === u.id) return central;
    if (vus.has(p.id)) break;
    vus.add(p.id);
    if (!choisi && p.type === 'sous-comite') choisi = p;
  }
  return choisi ?? central;
}

/** Ordre des cartes d'un cadre de l'organigramme lu des données (clés courtes, en nombre raisonnable), sinon undefined. */
export function lireRangement(r: unknown): string[] | undefined {
  if (!Array.isArray(r)) return undefined;
  const l = r.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 200).slice(0, 300);
  return l.length ? l : undefined;
}

/** Ce que l'entité dont elle dépend affiche de ses tâches, lu des données ; sans valeur (ou inconnue) : les partagées. */
export function lireTachesDependance(x: unknown): TachesDependance | undefined {
  return x === 'toutes' || x === 'rien' ? x : undefined;
}

/** Historique des dépendances lu des données (tenu par le serveur, 030) ; sans période : undefined. */
export function lireHistorique(x: unknown): PeriodeDependance[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const l = x
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as Record<string, unknown>).comite === 'string')
    .map((e) => ({
      comite: e.comite as string,
      nom: typeof e.nom === 'string' ? e.nom : '',
      jusqua: typeof e.jusqua === 'string' ? e.jusqua : '',
      reglage: lireTachesDependance(e.reglage) ?? 'partagees',
      taches: Array.isArray(e.taches) ? e.taches.filter((t): t is string => typeof t === 'string') : [],
      copie: e.copie !== false,
    }));
  return l.length ? l : undefined;
}

/**
 * Caisse qui reçoit les tickets (remboursements, factures) envoyés depuis `u` : celle du comité dont elle dépend, s'il a
 * un caissier ; sinon la caisse centrale (serveur : gsa_caisse_de, 030).
 */
export function caisseDe<T extends Unit & { membres: Pick<OrgMember, 'caisse'>[] }>(units: T[], u: T): T | undefined {
  const central = units.find((x) => x.type === 'central');
  const dep = parentDans(units.filter((x) => !x.archive || x.id === u.id), u);
  return dep && dep.type !== 'central' && dep.membres.some((m) => m.caisse) ? dep : central;
}

/**
 * Historique des dépendances de l'entité `id` après une modification (`avant` → `apres` : toutes les entités), comme le
 * serveur le tient (gsa_committees_guard, 030) : une période de plus si le comité dont elle dépend change (`taches` : ses
 * tâches hors tickets à ce moment ; `reglage` : son réglage d'alors) ; retour au comité d'avant dans l'heure (« Annuler ») :
 * le changement est effacé. Seul le droit de copie de la dernière période vient de la modification elle-même.
 */
export function nouvelHistorique(avant: Unit[], apres: Unit[], id: string, ctx: { reglage: TachesDependance; taches: string[]; maintenant?: Date }): PeriodeDependance[] | undefined {
  const u0 = avant.find((x) => x.id === id);
  const u1 = apres.find((x) => x.id === id);
  if (!u0 || !u1) return u1?.historiqueDependance;
  let h = [...(u0.historiqueDependance ?? [])];
  const dernier = h[h.length - 1];
  const demande = u1.historiqueDependance;
  if (dernier && demande?.length === h.length && demande[h.length - 1].jusqua === dernier.jusqua)
    h[h.length - 1] = { ...dernier, copie: demande[h.length - 1].copie };
  if (u0.type !== 'central') {
    const actives = (l: Unit[]) => l.filter((x) => !x.archive || x.id === id);
    const de = parentDans(actives(avant), u0);
    const vers = parentDans(actives(apres), u1);
    const maintenant = ctx.maintenant ?? new Date();
    if (de && de.id !== vers?.id) {
      const fin = h[h.length - 1];
      if (fin && fin.comite === vers?.id && maintenant.getTime() - Date.parse(fin.jusqua) < 3600_000) h = h.slice(0, -1);
      else h = [...h, { comite: de.id, nom: de.nom, jusqua: maintenant.toISOString(), reglage: ctx.reglage, taches: ctx.taches, copie: true }].slice(-20);
    }
  }
  return h.length ? h : undefined;
}

type AvecPostes = Pick<Unit, 'id' | 'type' | 'archive'> & { postes?: { lien?: string }[] };
/**
 * Un événement auquel aucun poste n'est lié ⛓ (ni d'un comité, ni d'un groupe) : tout le comité dont il dépend en est
 * responsable (organigramme : sous son cadre).
 */
export const auComiteEntier = (units: AvecPostes[], u: Pick<Unit, 'id' | 'type'>) =>
  u.type === 'equipe' && !units.some((x) => !x.archive && x.type !== 'equipe' && x.postes?.some((p) => p.lien === u.id));

/**
 * Ce que le comité dont elle dépend affiche des tâches de l'entité : son réglage (tachesDependance) ; un événement dont
 * tout le comité est responsable : toutes (serveur : gsa_reglage_taches, 027).
 */
export const reglageTaches = (units: AvecPostes[], u: Pick<Unit, 'id' | 'type' | 'tachesDependance'>): TachesDependance =>
  auComiteEntier(units, u) ? 'toutes' : (u.tachesDependance ?? 'partagees');

/** Place d'une carte de l'organigramme lue des données (entiers, dans des limites raisonnables), sinon undefined. */
export function lireCarte(c: unknown): Carte | undefined {
  if (!c || typeof c !== 'object') return undefined;
  const { x, y } = c as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 20000;
  return ok(x) && ok(y) ? { x: Math.round(x), y: Math.round(y) } : undefined;
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

const MEMBER_PERMS: Permission[] = ['tasks.viewAll', 'tasks.editOwn', 'tab.meetings', 'tab.events', 'tab.people', 'polls.create'];
const HELPER_PERMS: Permission[] = ['tasks.editOwn', 'tab.events', 'tab.people'];
/** Caisse de l'entité : membre du comité qui reçoit les tickets à rembourser et fait les virements. */
const CAISSE_PERMS: Permission[] = [...MEMBER_PERMS, 'paiements.payer'];
/** Membre d'un comité d'organisation (sous-comité) : gère aussi les événements, dont la date de la prochaine édition. */
const CO_PERMS: Permission[] = [...MEMBER_PERMS, 'events.manage'];
/** Externe (prestataire, aide ponctuelle…) : seulement les tâches qui lui sont attribuées, sans les coordonnées des membres. */
export const EXTERNE_PERMS: Permission[] = ['tasks.editOwn'];
export const EXTERNE_COULEUR = '#64748b';

/** Rôles de départ d'une nouvelle entité (modifiables ensuite dans sa console admin). */
export function unitRoles(type: UnitType): Role[] {
  const admin = (label: string): Role => ({ id: ADMIN_ROLE_ID, label, couleur: '#b45309', permissions: ALL_PERMISSIONS, sections: [], locked: true });
  const role = (id: string, label: string, couleur: string, permissions: Permission[]): Role => ({ id, label, couleur, permissions, sections: [] });
  const externe = role('externe', 'Externe', EXTERNE_COULEUR, EXTERNE_PERMS);
  if (type === 'groupe')
    return [
      admin('Admin (Responsable du groupe)'),
      role('moniteur', 'Moniteur', '#1d4ed8', MEMBER_PERMS),
      role('caissier', 'Caissier', '#047857', CAISSE_PERMS),
      role('membre', 'Membre du groupe', '#9333ea', HELPER_PERMS),
      externe,
    ];
  if (type === 'equipe') return [admin('Admin (Responsable)'), role('membre', 'Membre de l’équipe', '#1d4ed8', MEMBER_PERMS), role('caissier', 'Caissier', '#047857', CAISSE_PERMS), externe];
  return [
    admin('Admin (Président du comité)'),
    role('membre', 'Membre du comité', '#1d4ed8', CO_PERMS),
    role('caissier', 'Caissier', '#047857', [...CO_PERMS, 'paiements.payer']),
    role('benevole', 'Bénévole', '#9333ea', HELPER_PERMS),
    externe,
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
      viaEntite: p.viaEntite,
      viaFiche: p.viaFiche,
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
