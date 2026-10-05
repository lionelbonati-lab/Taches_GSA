import { makeSeed } from './seed';
import { people as centralPeople } from './seedData';
import { migrate } from './store';
import { unitData } from './units';
import { clearFiles } from './files';
import type { AppData, ClubEvent, Meeting, Person, Unit } from './types';

// Démo : le club et ses entités, chacune avec ses données gardées dans ce navigateur.
// Le site est public : aucun nom, chaque personne est désignée par son poste (adresses @gsajoie.example),
// et aucune tâche : chaque testeur part de zéro.

export const CENTRAL_ID = 'u-central';
const CLUB_KEY = 'taches-gsa-demo-club';
export const ME_KEY = 'taches-gsa-demo-moi';
export const UNIT_KEY = 'taches-gsa-demo-unite';
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
    ['Inscriptions et caisse', '#c2410c', 'Inscriptions et caisse', 'membre'],
    ['Bénévole 1', '#65a30d', 'Responsable des bénévoles', 'membre'],
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
 * (v2 : postes au lieu des noms, sans tâches).
 */
const DEMO_VERSION = '2';
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
  if (saved) return id === CENTRAL_ID ? migrate(saved) : saved;
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
    // Avec le dernier logo affiché (icône de l'appli).
    [CLUB_KEY, ME_KEY, UNIT_KEY, OLD_USER_KEY, 'taches-gsa-logo-demo'].forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

