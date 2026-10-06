import { makeSeed } from './seed';
import { people as centralPeople } from './seedData';
import { migrate } from './store';
import { unitData } from './units';
import { clearFiles } from './files';
import { appliquerMembres, coordonnees, emailKey, memesCoordonnees, nomMembre, nouveauMembre } from './membres';
import type { AppData, ClubEvent, ClubMembre, Meeting, Person, Unit } from './types';

// Démo : le club et ses entités, chacune avec ses données gardées dans ce navigateur.
// Le site est public : aucun nom, chaque personne est désignée par son poste (adresses @gsajoie.example),
// et aucune tâche : chaque testeur part de zéro.

export const CENTRAL_ID = 'u-central';
const CLUB_KEY = 'taches-gsa-demo-club';
export const ME_KEY = 'taches-gsa-demo-moi';
export const UNIT_KEY = 'taches-gsa-demo-unite';
const MEMBRES_KEY = 'taches-gsa-demo-membres';
/** Ancienne connexion de la démo (fiche du comité central). */
const OLD_USER_KEY = 'taches-gsa-user';

export const unitStorageKey = (id: string) => (id === CENTRAL_ID ? 'taches-gsa-demo-v7' : `taches-gsa-demo-u-${id}`);

const read = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* stockage plein ou indisponible */
  }
};

// ---------- Entités de départ ----------

const SEED_UNITS: Unit[] = [
  { id: CENTRAL_ID, nom: 'Comité central', type: 'central', couleur: '#1d4ed8', description: 'Direction du club.' },
  { id: 'u-ecole', nom: 'École de cyclisme', type: 'groupe', parentId: CENTRAL_ID, couleur: '#059669', description: 'Entraînements et camps des jeunes, avec les moniteurs.', central: 'lecture' },
  { id: 'u-competition', nom: 'Groupe compétition', type: 'groupe', parentId: CENTRAL_ID, couleur: '#ea580c', description: 'Coureurs licenciés, calendrier des courses et entraîneurs.' },
  { id: 'u-bruntrutaine', nom: 'CO Bruntrutaine', type: 'sous-comite', parentId: CENTRAL_ID, couleur: '#7c3aed', date: '2027-02-27', description: 'Comité d’organisation de la Bruntrutaine.', central: 'ecriture' },
  { id: 'u-soiree', nom: 'Soirée récréative', type: 'equipe', parentId: CENTRAL_ID, couleur: '#db2777', date: '2026-11-28', description: 'Équipe de la soirée du club (sans comité).' },
];

// Une personne = son poste principal (même nom et même adresse dans chaque entité où elle a un poste).
type P = [nom: string, couleur: string, poste: string, role: string];
const slug = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const person = (i: number, [nom, couleur, poste, role]: P): Person => ({
  id: `p${i + 1}`,
  prenom: nom,
  nom: '',
  email: `${slug(nom)}@gsajoie.example`,
  telephone: '',
  // Déjà au comité central : même couleur partout.
  couleur: centralPeople.find((p) => p.prenom === nom)?.couleur ?? couleur,
  poste,
  roles: [role],
  actif: true,
});

const MEMBERS: Record<string, P[]> = {
  'u-ecole': [
    ['École de cyclisme', '#ca8a04', 'Responsable', 'admin'],
    ['Coach JS', '#c026d3', 'Moniteur J+S', 'moniteur'],
    ['Moniteur 1', '#0d9488', 'Moniteur', 'moniteur'],
    ['Moniteur 2', '#2563eb', 'Moniteur', 'moniteur'],
    ['Aide-moniteur', '#a16207', 'Aide-moniteur', 'membre'],
  ],
  'u-competition': [
    ['Compétition 1', '#ea580c', 'Responsable', 'admin'],
    ['Compétition 2', '#0891b2', 'Entraîneur', 'moniteur'],
    ['Entraîneur route', '#4f46e5', 'Entraîneur route', 'moniteur'],
    ['Course préparation 1', '#b45309', 'Coureur', 'membre'],
    ['Coureur', '#be185d', 'Coureur', 'membre'],
  ],
  'u-bruntrutaine': [
    ['Bruntrutaine', '#9333ea', 'Président du CO', 'admin'],
    ['Vice-président', '#7c3aed', 'Délégué du comité central', 'membre'],
    ['Parcours et sécurité', '#15803d', 'Parcours et sécurité', 'membre'],
    ['Inscriptions et caisse', '#c2410c', 'Inscriptions et caisse', 'caissier'],
    ['Bénévole 1', '#65a30d', 'Responsable des bénévoles', 'membre'],
    ['Bénévole 4', '#0d9488', 'Ravitaillement', 'benevole'],
  ],
  'u-soiree': [
    ['Gruppetto', '#be123c', 'Responsable de la soirée', 'admin'],
    ['Président', '#1d4ed8', 'Animation', 'membre'],
    ['École de cyclisme', '#ca8a04', 'Jeux pour les enfants', 'membre'],
    ['Bénévole 2', '#e11d48', 'Décoration', 'membre'],
    ['Bénévole 3', '#0369a1', 'Bar', 'membre'],
  ],
};

const EVENTS: Record<string, ClubEvent[]> = {
  'u-ecole': [{ id: 'e1', nom: 'Camp de juillet', date: '2027-07-05', lieu: 'À définir', description: 'Camp d’été de l’école de cyclisme' }],
  'u-bruntrutaine': [{ id: 'e1', nom: 'Bruntrutaine 2027', date: '2027-02-27', lieu: 'Porrentruy', description: '' }],
  'u-soiree': [{ id: 'e1', nom: 'Soirée récréative', date: '2026-11-28', lieu: 'Salle des fêtes', description: '' }],
};

const MEETINGS: Record<string, Meeting[]> = {
  'u-bruntrutaine': [
    { id: 'm1', titre: 'Séance du CO 1', date: '2026-10-20', heure: '19:30', lieu: 'Buvette du club', ordreDuJour: '', notes: '' },
    { id: 'm2', titre: 'Séance du CO 2', date: '2026-12-08', heure: '19:30', lieu: 'Buvette du club', ordreDuJour: '', notes: '' },
  ],
  'u-ecole': [{ id: 'm1', titre: 'Réunion des moniteurs', date: '2026-11-04', heure: '19:00', lieu: 'Salle du club', ordreDuJour: '', notes: '' }],
};

function seedUnit(u: Unit): AppData {
  const people = MEMBERS[u.id].map((m, i) => person(i, m));
  const d = unitData(u.type, people, 'p1', u.nom);
  // Le groupe compétition appelle ses rôles « Entraîneur » et « Coureur ».
  if (u.id === 'u-competition')
    d.roles = d.roles.map((r) => (r.id === 'moniteur' ? { ...r, label: 'Entraîneur' } : r.id === 'membre' ? { ...r, label: 'Coureur' } : r));
  d.events = EVENTS[u.id] ?? [];
  d.meetings = MEETINGS[u.id] ?? [];
  d.log = [{ id: 'l0', at: new Date().toISOString(), userId: 'p1', action: `Création de « ${u.nom} » (données de démonstration, sans tâches)` }];
  return d;
}

// ---------- Lecture / écriture ----------

/**
 * Version des données de départ. Quand elle change, la démo enregistrée dans le navigateur repart de zéro
 * (v2 : postes au lieu des noms, sans tâches ; v3 : une caisse dans chaque entité).
 */
const DEMO_VERSION = '4';
const VERSION_KEY = 'taches-gsa-demo-version';
/** Démo v2 déjà enregistrée : accès du comité central des entités de départ ajouté une fois (sans remise à zéro). */
const ACCESS_KEY = 'taches-gsa-demo-acces-central';

function checkVersion() {
  try {
    if (localStorage.getItem(VERSION_KEY) === DEMO_VERSION) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith('taches-gsa-demo') || k === OLD_USER_KEY)
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(VERSION_KEY, DEMO_VERSION);
    void clearFiles();
  } catch {
    /* stockage indisponible : rien à remettre à zéro */
  }
}

/** Entités du club (créées au premier passage, avec leurs données de départ). */
export function loadUnits(): Unit[] {
  checkVersion();
  const saved = read<Unit[]>(CLUB_KEY);
  if (saved?.length) {
    if (!read(ACCESS_KEY)) {
      saved.forEach((u) => {
        const seed = SEED_UNITS.find((x) => x.id === u.id);
        if (seed?.central && !u.central) u.central = seed.central;
      });
      write(CLUB_KEY, saved);
      write(ACCESS_KEY, 1);
    }
    return saved;
  }
  write(ACCESS_KEY, 1);
  for (const u of SEED_UNITS) if (u.type !== 'central' && !read(unitStorageKey(u.id))) write(unitStorageKey(u.id), seedUnit(u));
  write(CLUB_KEY, SEED_UNITS);
  return structuredClone(SEED_UNITS);
}

export const saveUnits = (units: Unit[]) => write(CLUB_KEY, units);

export function loadUnitData(id: string): AppData {
  const saved = read<AppData>(unitStorageKey(id));
  // Entités : seules les mises à niveau suivant leur création (v12) s'appliquent.
  if (saved) return id === CENTRAL_ID || saved.schema ? migrate(saved) : saved;
  if (id === CENTRAL_ID) return makeSeed();
  const u = SEED_UNITS.find((x) => x.id === id);
  return u ? seedUnit(u) : unitData('groupe', [], 'p1', id);
}

export const saveUnitData = (id: string, d: AppData) => write(unitStorageKey(id), d);

/** Personne connectée à la démo (son adresse email) ; reprend l'ancienne connexion par fiche du comité central. */
export function loadMe(): string | null {
  try {
    const me = localStorage.getItem(ME_KEY);
    if (me) return me;
    const old = localStorage.getItem(OLD_USER_KEY);
    if (!old) return null;
    const p = loadUnitData(CENTRAL_ID).people.find((x) => x.id === old);
    return p?.email ? p.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function saveMe(key: string | null) {
  try {
    if (key) localStorage.setItem(ME_KEY, key);
    else localStorage.removeItem(ME_KEY);
    localStorage.removeItem(OLD_USER_KEY);
  } catch {
    /* ignore */
  }
}

/** Remet toute la démo à zéro (toutes les entités). */
export function resetDemo() {
  try {
    const units = read<Unit[]>(CLUB_KEY) ?? SEED_UNITS;
    units.forEach((u) => localStorage.removeItem(unitStorageKey(u.id)));
    // Avec le dernier logo et la dernière couleur affichés (écran de connexion).
    [CLUB_KEY, ME_KEY, UNIT_KEY, MEMBRES_KEY, OLD_USER_KEY, 'taches-gsa-logo-demo', 'taches-gsa-couleur-demo'].forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

// ---------- Membres du club (registre commun ; version réelle : migration 016) ----------

/** Membres sans poste dans une entité (licenciés, parents, membres de soutien) : fictifs, sans téléphone ni IBAN. */
const EXTRAS: Partial<ClubMembre>[] = [
  { prenom: 'Licencié École 1', couleur: '#16a34a', groupes: ['u-ecole'] },
  { prenom: 'Licencié École 2', couleur: '#0d9488', groupes: ['u-ecole'] },
  { prenom: 'Parent École 1', email: 'parent.ecole1@gsajoie.example', couleur: '#ca8a04', groupes: ['u-ecole'] },
  { prenom: 'Coureur Compétition 3', email: 'coureur3@gsajoie.example', couleur: '#ea580c', groupes: ['u-competition'] },
  { prenom: 'Membre Soutien 1', email: 'soutien1@gsajoie.example', couleur: '#475569' },
];

const unitIds = () => (read<Unit[]>(CLUB_KEY) ?? SEED_UNITS).map((u) => u.id);

export const loadMembres = (): ClubMembre[] => read<ClubMembre[]>(MEMBRES_KEY) ?? [];
const writeMembres = (list: ClubMembre[]) => write(MEMBRES_KEY, list);

/** Coordonnées du registre recopiées dans les fiches liées des entités (sauf `sauf`, l'entité ouverte). */
function propager(list: ClubMembre[], sauf?: string) {
  if (!list.length) return;
  for (const id of unitIds()) {
    if (id === sauf || !read(unitStorageKey(id))) continue;
    const d = loadUnitData(id);
    if (appliquerMembres(d, list)) saveUnitData(id, d);
  }
}

/**
 * Fiches d'une entité liées au registre, comme le serveur : lien gardé (même s'il manque dans `d`), sinon membre de même
 * email, sinon nouveau membre. Des coordonnées modifiées passent dans le registre puis dans les autres fiches liées.
 */
export function lierFiches(unitId: string, d: AppData): AppData {
  const list = loadMembres();
  const avant = read<AppData>(unitStorageKey(unitId))?.people ?? [];
  const changes: ClubMembre[] = [];
  let modifie = false;
  for (const p of d.people) {
    const mid = p.membreId || avant.find((x) => x.id === p.id)?.membreId;
    let m = mid ? list.find((x) => x.id === mid) : undefined;
    if (!m && emailKey(p.email)) m = list.find((x) => emailKey(x.email) === emailKey(p.email));
    if (!m) {
      if (!nomMembre(p)) continue;
      m = nouveauMembre({ ...coordonnees(p), id: mid, couleur: p.couleur });
      list.push(m);
      modifie = true;
    } else if (!memesCoordonnees(p, m)) {
      Object.assign(m, coordonnees(p));
      changes.push(m);
      modifie = true;
    }
    p.membreId = m.id;
  }
  if (modifie) {
    writeMembres(list);
    appliquerMembres(d, changes);
    propager(changes, unitId);
  }
  return d;
}

/** Registre créé au premier passage : membres sans poste, puis les fiches de toutes les entités (comité central d'abord). */
export function initMembres(units: Unit[]) {
  if (read(MEMBRES_KEY)) return;
  writeMembres(EXTRAS.map(nouveauMembre));
  for (const u of sortCentralFirst(units)) {
    const d = lierFiches(u.id, loadUnitData(u.id));
    saveUnitData(u.id, d);
    // Démo : les personnes qui ont un poste dans un groupe en font partie.
    if (u.type === 'groupe') {
      const list = loadMembres();
      d.people.filter((p) => p.actif).forEach((p) => {
        const m = list.find((x) => x.id === p.membreId);
        if (m && !m.groupes.includes(u.id)) m.groupes.push(u.id);
      });
      writeMembres(list);
    }
  }
}

const sortCentralFirst = (units: Unit[]) => [...units].sort((a, b) => +(a.type !== 'central') - +(b.type !== 'central'));

/**
 * Enregistre des membres (nouveaux ou modifiés) et recopie leurs coordonnées dans les fiches des entités,
 * sauf l'entité ouverte (`sauf`), mise à jour par la page elle-même.
 */
export function saveMembres(maj: ClubMembre[], sauf?: string) {
  const list = loadMembres();
  for (const m of maj) {
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) list[i] = m;
    else list.push(m);
  }
  writeMembres(list);
  propager(maj, sauf);
}

/** Supprime un membre du registre (refusé s'il a encore une fiche active dans une entité). */
export function deleteMembre(id: string) {
  for (const u of unitIds())
    if (read(unitStorageKey(u)) && loadUnitData(u).people.some((p) => p.actif && p.membreId === id))
      throw new Error('Ce membre a encore un poste dans une entité du club : retire-le d’abord de ses entités');
  writeMembres(loadMembres().filter((m) => m.id !== id));
}
