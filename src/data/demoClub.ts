import { makeSeed } from './seed';
import { migrate } from './store';
import { unitData } from './units';
import { applyDelaiRef } from './utils';
import type { AppData, ClubEvent, Meeting, Person, Task, Unit } from './types';

// Démo : le club et ses entités, chacune avec ses données gardées dans ce navigateur.
// Les personnes sont fictives (prénoms + initiale, adresses @gsajoie.example) : le site est public.

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
  { id: 'u-ecole', nom: 'École de cyclisme', type: 'groupe', parentId: CENTRAL_ID, couleur: '#059669', description: 'Entraînements et camps des jeunes, avec les moniteurs.' },
  { id: 'u-competition', nom: 'Groupe compétition', type: 'groupe', parentId: CENTRAL_ID, couleur: '#ea580c', description: 'Coureurs licenciés, calendrier des courses et entraîneurs.' },
  { id: 'u-bruntrutaine', nom: 'CO Bruntrutaine', type: 'sous-comite', parentId: CENTRAL_ID, couleur: '#7c3aed', date: '2027-02-27', description: 'Comité d’organisation de la Bruntrutaine.' },
  { id: 'u-soiree', nom: 'Soirée récréative', type: 'equipe', parentId: CENTRAL_ID, couleur: '#db2777', date: '2026-11-28', description: 'Équipe de la soirée du club (sans comité).' },
];

type P = [prenom: string, nom: string, email: string, couleur: string, poste: string, role: string];
const person = (i: number, [prenom, nom, email, couleur, poste, role]: P): Person => ({
  id: `p${i + 1}`,
  prenom,
  nom,
  email: `${email}@gsajoie.example`,
  telephone: '',
  couleur,
  poste,
  roles: [role],
  actif: true,
});

const MEMBERS: Record<string, P[]> = {
  'u-ecole': [
    ['Noah', 'R.', 'noah', '#ca8a04', 'Responsable École de cyclisme', 'admin'],
    ['Sarah', '', 'sarah', '#c026d3', 'Monitrice J+S', 'moniteur'],
    ['Léa', 'M.', 'lea', '#0d9488', 'Monitrice', 'moniteur'],
    ['Yann', 'P.', 'yann', '#2563eb', 'Moniteur', 'moniteur'],
    ['Bastien', 'C.', 'bastien', '#a16207', 'Aide-moniteur', 'membre'],
  ],
  'u-competition': [
    ['Christophe', 'T.', 'christophe', '#ea580c', 'Responsable compétition', 'admin'],
    ['Ismaël', 'R.', 'ismael', '#0891b2', 'Entraîneur', 'moniteur'],
    ['Marc', 'D.', 'marc', '#4f46e5', 'Entraîneur route', 'moniteur'],
    ['Romain', '', 'romain', '#b45309', 'Coureur', 'membre'],
    ['Julie', 'V.', 'julie', '#be185d', 'Coureuse', 'membre'],
  ],
  'u-bruntrutaine': [
    ['Clément', '', 'clement', '#9333ea', 'Président du CO', 'admin'],
    ['Damien', 'H.', 'damien', '#7c3aed', 'Délégué du comité central', 'membre'],
    ['Pierre', 'G.', 'pierre', '#15803d', 'Parcours et sécurité', 'membre'],
    ['Nadia', 'F.', 'nadia', '#c2410c', 'Inscriptions et caisse', 'membre'],
    ['Aude', '', 'aude', '#65a30d', 'Responsable des bénévoles', 'membre'],
  ],
  'u-soiree': [
    ['Stéphanie', 'S.', 'stephanie', '#be123c', 'Responsable de la soirée', 'admin'],
    ['Lionel', 'B.', 'lionel', '#1d4ed8', 'Animation', 'membre'],
    ['Noah', 'R.', 'noah', '#ca8a04', 'Jeux pour les enfants', 'membre'],
    ['Mèg', '', 'meg', '#e11d48', 'Décoration', 'membre'],
    ['Alphonse', '', 'alphonse', '#0369a1', 'Bar', 'membre'],
  ],
};

type T = [titre: string, section: string, resp: number[], statut: string, delai: string, remarque?: string];
const NOW = '2026-10-01T18:00:00.000Z';
const task = (i: number, [titre, sectionId, resp, statusId, delai, remarque = '']: T): Task => ({
  id: `t${i + 1}`,
  sectionId,
  sousSection: '',
  titre,
  responsables: resp.map((n) => `p${n}`),
  statusId,
  delai,
  remarque,
  checklist: [],
  createdBy: `p${resp[0] ?? 1}`,
  updatedAt: NOW,
});

const TASKS: Record<string, T[]> = {
  'u-ecole': [
    ['Planning des entraînements d’hiver', 'sec1', [1], 's2', '2026-10-31', 'Samedi matin, salle de gym en cas de pluie'],
    ['Renouveler les reconnaissances J+S des moniteurs', 'sec2', [2], 's1', '2026-12-15'],
    ['Camp de juillet 2027 : réserver l’hébergement', 'sec1', [3], 's1', '2027-01-31'],
    ['Inventaire des vélos de prêt', 'sec3', [4], 's1', '2026-11-15'],
    ['Commander les maillots enfants', 'sec3', [5, 1], 's3', '2027-03-15', 'Attendre le devis du fournisseur'],
    ['Liste des enfants inscrits pour la saison 2027', 'sec4', [1], 's1', '2027-02-28'],
  ],
  'u-competition': [
    ['Calendrier des courses 2027', 'sec1', [1, 2], 's2', '2026-12-01'],
    ['Inscriptions au Trophée Jurassien 2027', 'sec4', [1], 's1', '2027-02-15'],
    ['Plans d’entraînement d’hiver des coureurs', 'sec2', [3], 's2', '2026-11-01'],
    ['Commande des maillots compétition', 'sec3', [1], 's1', '2027-01-15'],
    ['Stage de printemps : choisir la destination', 'sec1', [2, 3], 's1', '2026-12-20'],
  ],
  'u-bruntrutaine': [
    ['Réserver la halle et les vestiaires', 'sec2', [1], 's7', '2026-09-30'],
    ['Valider le parcours avec la commune', 'sec1', [3], 's2', '2026-11-30'],
    ['Ouvrir les inscriptions en ligne', 'sec4', [4], 's1', '2026-12-15'],
    ['Recruter 25 bénévoles', 'sec3', [5], 's1', '2027-01-31'],
    ['Commander les prix souvenirs', 'sec2', [1], 's1', '2027-01-15'],
    ['Affiches et annonces dans la presse', 'sec4', [2], 's1', '2027-01-20'],
    ['Budget et recherche de sponsors', 'sec5', [1, 2], 's2', '2026-12-01'],
  ],
  'u-soiree': [
    ['Réserver la salle', 'sec1', [1], 's7', '2026-09-15'],
    ['Menu et traiteur', 'sec1', [1], 's2', '2026-11-07'],
    ['Boissons et bar', 'sec2', [5], 's1', '2026-11-21'],
    ['Jeux pour les enfants', 'sec2', [3], 's1', '2026-11-21'],
    ['Décoration de la salle', 'sec2', [4], 's1', '2026-11-27'],
    ['Animation et tombola', 'sec2', [2], 's2', '2026-11-14'],
    ['Invitations aux membres', 'sec1', [2], 's1', '2026-10-31', 'Via la newsletter et WhatsApp'],
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
  // Sous-comité / équipe d'événement : toutes les tâches préparent l'événement.
  const eventId = u.type !== 'groupe' ? d.events[0]?.id : undefined;
  d.tasks = TASKS[u.id].map((t, i) => applyDelaiRef(d, { ...task(i, t), eventId }));
  d.log = [{ id: 'l0', at: NOW, userId: 'p1', action: `Création de « ${u.nom} » (données de démonstration)` }];
  return d;
}

/** Exemple de demande reçue par le comité central (proposée par l'école de cyclisme). */
const SAMPLE_REQUEST: Task = {
  id: 'd1',
  sectionId: 'sec6',
  sousSection: '',
  titre: 'Valider le budget 2027 de l’école de cyclisme',
  responsables: [],
  statusId: 's1',
  delai: '2026-11-30',
  remarque: 'Budget joint à la prochaine séance : vélos de prêt, camp de juillet, maillots enfants.',
  checklist: [],
  createdBy: '',
  updatedAt: NOW,
  proposee: { uniteId: 'u-ecole', unite: 'École de cyclisme', par: 'Noah R.', le: NOW },
};

// ---------- Lecture / écriture ----------

/** Entités du club (créées au premier passage, avec leurs données de départ). */
export function loadUnits(): Unit[] {
  const saved = read<Unit[]>(CLUB_KEY);
  if (saved?.length) return saved;
  for (const u of SEED_UNITS) if (u.type !== 'central' && !read(unitStorageKey(u.id))) write(unitStorageKey(u.id), seedUnit(u));
  const central = loadUnitData(CENTRAL_ID);
  if (!central.tasks.some((t) => t.id === SAMPLE_REQUEST.id)) {
    central.tasks.unshift(structuredClone(SAMPLE_REQUEST));
    write(unitStorageKey(CENTRAL_ID), central);
  }
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
    [CLUB_KEY, ME_KEY, UNIT_KEY, OLD_USER_KEY].forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

