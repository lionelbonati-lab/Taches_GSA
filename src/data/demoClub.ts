import { makeSeed } from './seed';
import { people as centralPeople } from './seedData';
import { migrate } from './store';
import { parentDans, unitData } from './units';
import { clearFiles } from './files';
import { appliquerMembres, coordonnees, emailKey, memesCoordonnees, nomMembre, nouveauMembre } from './membres';
import { membresPropres, synchroLiens } from './liens';
import { convertirPostes, lierEntite, suivre } from './organigramme';
import type { AppData, ClubEvent, ClubMembre, Meeting, OrganigrammeAnnuel, OrgUnit, Person, Unit } from './types';

// Démo : le club et ses entités, chacune avec ses données gardées dans ce navigateur.
// Le site est public : les personnes sont fictives (noms inventés, adresses @gsajoie.example, pas de téléphones),
// et aucune tâche : chaque testeur part de zéro.

export const CENTRAL_ID = 'u-central';
const CLUB_KEY = 'taches-gsa-demo-club';
export const ME_KEY = 'taches-gsa-demo-moi';
export const UNIT_KEY = 'taches-gsa-demo-unite';
const MEMBRES_KEY = 'taches-gsa-demo-membres';
const ORGAS_KEY = 'taches-gsa-demo-organigrammes';
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

// Une personne = son poste principal (même nom et même adresse dans chaque entité où elle a un poste).
type P = [prenom: string, nom: string, couleur: string, poste: string, role: string];
const slug = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Même personne dans plusieurs entités : même nom, donc même adresse. */
const person = (i: number, [prenom, nom, couleur, poste, role]: P): Person => {
  const email = `${slug(prenom)}.${slug(nom)}@gsajoie.example`;
  return {
    id: `p${i + 1}`,
    prenom,
    nom,
    email,
    telephone: '',
    // Déjà au comité central : même couleur partout.
    couleur: centralPeople.find((p) => p.email === email)?.couleur ?? couleur,
    poste,
    roles: [role],
    actif: true,
  };
};

const MEMBERS: Record<string, P[]> = {
  'u-ecole': [
    ['Céline', 'Robert', '#ca8a04', 'Responsable', 'admin'],
    ['Kevin', 'Roux', '#c026d3', 'Moniteur J+S', 'moniteur'],
    ['Antoine', 'Mercier', '#0d9488', 'Moniteur', 'moniteur'],
    ['Simon', 'Vincent', '#2563eb', 'Moniteur', 'moniteur'],
    ['Noah', 'Chevalier', '#a16207', 'Aide-moniteur', 'membre'],
  ],
  'u-competition': [
    ['Nicolas', 'Perret', '#ea580c', 'Responsable', 'admin'],
    // Co-responsables : chacun tient un poste « Compétition » du comité central, lié au ★ du groupe.
    ['Laura', 'Meyer', '#0891b2', 'Responsable', 'admin'],
    ['Olivier', 'Gauthier', '#4f46e5', 'Entraîneur route', 'moniteur'],
    ['Lucas', 'Fontaine', '#b45309', 'Coureur', 'membre'],
    ['Mathieu', 'Marchand', '#be185d', 'Coureur', 'membre'],
  ],
  'u-bruntrutaine': [
    ['David', 'Muller', '#9333ea', 'Président du CO', 'admin'],
    ['Marc', 'Lambert', '#7c3aed', 'Délégué du comité central', 'membre'],
    ['Patrick', 'Aubry', '#15803d', 'Parcours et sécurité', 'membre'],
    ['Valérie', 'Lefèvre', '#c2410c', 'Inscriptions et caisse', 'caissier'],
    ['Michel', 'Blanc', '#65a30d', 'Responsable des bénévoles', 'membre'],
    ['Hugo', 'Morel', '#0d9488', 'Ravitaillement', 'benevole'],
  ],
  'u-soiree': [
    ['Pierre', 'Favre', '#be123c', 'Responsable de la soirée', 'admin'],
    ['Julien', 'Moreau', '#1d4ed8', 'Animation', 'membre'],
    ['Céline', 'Robert', '#ca8a04', 'Jeux pour les enfants', 'membre'],
    ['Nathalie', 'Fournier', '#e11d48', 'Décoration', 'membre'],
    ['Yannick', 'Leroy', '#0369a1', 'Bar', 'membre'],
  ],
};

const EVENTS: Record<string, ClubEvent[]> = {
  'u-ecole': [
    { id: 'e1', nom: 'Camp de juillet', date: '2027-07-05', lieu: 'À définir', description: 'Camp d’été de l’école de cyclisme' },
    { id: 'e2', nom: 'Entraînement du mercredi', date: '2026-08-19', heure: '14:00', heureFin: '16:00', lieu: 'Piste du club', description: 'Pour tous les enfants de l’école.', repetition: { freq: 'semaine', jours: [3], jusquau: '2027-06-30' } },
  ],
  'u-bruntrutaine': [{ id: 'e1', nom: 'Bruntrutaine 2027', date: '2027-02-27', lieu: 'Porrentruy', description: '' }],
  'u-soiree': [{ id: 'e1', nom: 'Soirée récréative', date: '2026-11-28', lieu: 'Salle des fêtes', description: '' }],
};

const MEETINGS: Record<string, Meeting[]> = {
  'u-bruntrutaine': [
    { id: 'm1', titre: 'Séance du CO 1', date: '2026-10-20', heure: '19:30', lieu: 'Buvette du club' },
    { id: 'm2', titre: 'Séance du CO 2', date: '2026-12-08', heure: '19:30', lieu: 'Buvette du club' },
  ],
  'u-ecole': [{ id: 'm1', titre: 'Réunion des moniteurs', date: '2026-11-04', heure: '19:00', lieu: 'Salle du club' }],
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
 * (v2 : postes au lieu des noms, sans tâches ; v3 : une caisse dans chaque entité ; v5 : deux co-responsables du groupe
 * compétition ; v6 : postes liés par leur nom, une ligne par personne ; v7 : personnes fictives, avec prénom et nom ;
 * v8 : événements avec heures et répétitions).
 */
const DEMO_VERSION = '8';
const VERSION_KEY = 'taches-gsa-demo-version';

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
  if (saved?.length) return saved;
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

/** Données d'une entité telles qu'enregistrées (pour annuler une modification de l'organigramme). */
export const lireBrut = (id: string) => {
  try {
    return localStorage.getItem(unitStorageKey(id));
  } catch {
    return null;
  }
};
export const ecrireBrut = (id: string, s: string | null) => {
  try {
    if (s === null) localStorage.removeItem(unitStorageKey(id));
    else localStorage.setItem(unitStorageKey(id), s);
  } catch {
    /* stockage indisponible */
  }
};

/**
 * Anciennes liaisons « tous les membres d'une entité » remplacées par les dépendances (comme le serveur, 030) : l'entité qui
 * comptait tous les membres du comité dont elle dépend lui affiche toutes ses tâches ; le lien est retiré (fiches liées
 * désactivées, leurs tâches restent). Renvoie les entités, modifiées s'il le faut (déjà enregistrées).
 */
export function migrerLiens(units: Unit[]): Unit[] {
  let next = units;
  for (const u of units) {
    if (!read(unitStorageKey(u.id))) continue;
    const d = loadUnitData(u.id);
    if (!d.membresDe?.length) continue;
    const dep = parentDans(units.filter((x) => !x.archive || x.id === u.id), u);
    if (dep && d.membresDe.some((l) => l.uniteId === dep.id) && u.tachesDependance !== 'toutes')
      next = next.map((x) => (x.id === u.id ? { ...x, tachesDependance: 'toutes' as const } : x));
    d.membresDe = [];
    const n = synchroDemo(u.id, d);
    saveUnitData(u.id, lierFiches(u.id, n ?? d));
  }
  if (next !== units) saveUnits(next);
  return next;
}

/** Organigramme à glisser-déposer : postes des fiches qui n'en ont pas (déduits des fonctions, liens des câbles d'avant). */
export function initPostes(units: Unit[]) {
  const data = new Map(units.map((u) => [u.id, loadUnitData(u.id)]));
  if (![...data.values()].some((d) => !d.postes)) return;
  for (const id of convertirPostes(units, data)) saveUnitData(id, data.get(id)!);
}

/**
 * Personnes de l'entité `id` modifiées hors de l'organigramme (`avant` → `d`) : ses postes et les postes liés suivent
 * (data/organigramme, suivre). Renvoie ses données à enregistrer, et les autres entités modifiées (déjà enregistrées).
 */
export function suivrePostes(id: string, avant: AppData, d: AppData): { d: AppData; ici: boolean; autres: string[] } {
  if (!d.postes || JSON.stringify([avant.people, avant.postes]) === JSON.stringify([d.people, d.postes])) return { d, ici: false, autres: [] };
  const units = loadUnits();
  const data = new Map(units.map((u) => [u.id, u.id === id ? (JSON.parse(JSON.stringify(d)) as AppData) : loadUnitData(u.id)]));
  const brut = new Map([...data].map(([k, v]) => [k, JSON.stringify(v)]));
  suivre({ units, data, notes: [] }, id, avant);
  const autres = units.filter((u) => u.id !== id && JSON.stringify(data.get(u.id)) !== brut.get(u.id)).map((u) => u.id);
  for (const k of autres) {
    const x = data.get(k)!;
    const n = synchroDemo(k, x);
    saveUnitData(k, lierFiches(k, n ?? x));
  }
  const ici = JSON.stringify(data.get(id)) !== brut.get(id);
  return { d: ici ? data.get(id)! : d, ici, autres };
}

/**
 * Entité créée ou renommée : les postes qui portent son nom, dans les autres entités, lui sont liés, et leurs titulaires
 * en deviennent ★ (data/organigramme, lierEntite). Renvoie les entités modifiées (enregistrées).
 */
export function lierEntiteDemo(id: string): string[] {
  const units = loadUnits();
  const data = new Map(units.map((u) => [u.id, loadUnitData(u.id)]));
  if (!data.get(id)?.postes) return [];
  const brut = new Map([...data].map(([k, v]) => [k, JSON.stringify(v)]));
  lierEntite({ units, data, notes: [] }, id);
  const changees = units.filter((u) => JSON.stringify(data.get(u.id)) !== brut.get(u.id)).map((u) => u.id);
  for (const k of changees) {
    const x = data.get(k)!;
    const n = synchroDemo(k, x);
    saveUnitData(k, lierFiches(k, n ?? x));
  }
  for (const k of changees) propagerLiens(k);
  return changees;
}

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
    [CLUB_KEY, ME_KEY, UNIT_KEY, MEMBRES_KEY, ORGAS_KEY, OLD_USER_KEY, 'taches-gsa-logo-demo', 'taches-gsa-couleur-demo'].forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

// ---------- Organigramme : historique par année (version réelle : migration 026) ----------

/** Photo de l'organigramme, comme celle du serveur : sans adresses, téléphones, logos ni descriptions. */
export const photoOrganigramme = (units: OrgUnit[]): OrgUnit[] =>
  units.map(({ logo: _l, description: _d, central: _c, couleurAppli: _a, sections: _s, ...u }) => ({
    ...u,
    moi: false,
    moiAdmin: false,
    membres: u.membres.map(({ telephone: _t, ...m }) => ({ ...m, email: '' })),
  }));

export const loadOrganigrammes = () => read<OrganigrammeAnnuel[]>(ORGAS_KEY) ?? [];

/**
 * Reprend la photo de l'année en cours (rien si l'organigramme n'a pas changé) ; une année passée ne change plus.
 * Au premier passage : un exemple de l'année précédente (sans l'équipe de la soirée, créée cette année-là).
 */
export function photographierDemo(units: OrgUnit[], maintenant = new Date()) {
  const annee = maintenant.getFullYear();
  const photo = photoOrganigramme(units);
  const avant = read<OrganigrammeAnnuel[]>(ORGAS_KEY);
  const liste = avant ?? [{ annee: annee - 1, maj: new Date(annee - 1, 11, 31, 18).toISOString(), units: photo.filter((u) => u.id !== 'u-soiree') }];
  const deja = liste.find((x) => x.annee === annee);
  if (avant && deja && JSON.stringify(deja.units) === JSON.stringify(photo)) return;
  write(ORGAS_KEY, [{ annee, maj: maintenant.toISOString(), units: photo }, ...liste.filter((x) => x.annee !== annee)].sort((a, b) => b.annee - a.annee));
}

// ---------- Membres du club (registre commun ; version réelle : migration 016) ----------

/** Membres sans poste dans une entité (licenciés, parents, membres de soutien) : fictifs, sans téléphone ni IBAN. */
const EXTRAS: Partial<ClubMembre>[] = [
  { prenom: 'Léo', nom: 'Bertrand', couleur: '#16a34a', groupes: ['u-ecole'] },
  { prenom: 'Zoé', nom: 'Bertrand', couleur: '#0d9488', groupes: ['u-ecole'] },
  { prenom: 'Anne', nom: 'Bertrand', email: 'anne.bertrand@gsajoie.example', couleur: '#ca8a04', groupes: ['u-ecole'] },
  { prenom: 'Maxime', nom: 'Renaud', email: 'maxime.renaud@gsajoie.example', couleur: '#ea580c', groupes: ['u-competition'] },
  { prenom: 'Françoise', nom: 'Colin', email: 'francoise.colin@gsajoie.example', couleur: '#475569' },
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
    const lien = avant.find((x) => x.id === p.id)?.membreId;
    const mid = p.membreId || lien;
    let m = mid ? list.find((x) => x.id === mid) : undefined;
    if (!m && emailKey(p.email)) m = list.find((x) => emailKey(x.email) === emailKey(p.email));
    // Fiche nouvelle (ou liée pour la première fois) à une personne déjà au club : ses champs vides prennent les valeurs
    // du registre (ses données peuvent être masquées dans la liste des membres).
    if (m && lien !== m.id) {
      const c = coordonnees(m);
      if (!p.prenom.trim()) p.prenom = c.prenom;
      if (!p.nom.trim()) p.nom = c.nom;
      if (!p.email.trim()) p.email = c.email;
      if (!(p.telephone ?? '').trim()) p.telephone = c.telephone;
    }
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

// ---------- Entité entière parmi les membres d'une autre (version réelle : migration 020) ----------

/** Fiches liées de l'entité `id` remises à jour (comme le serveur) ; null si rien ne change. */
export const synchroDemo = (id: string, d: AppData) => synchroLiens(id, d, (u) => (unitIds().includes(u) ? loadUnitData(u).people : null));

/** Ce qui compte pour les entités liées : les membres propres de l'entité et leurs coordonnées. */
export const signatureMembres = (people: Person[]) =>
  JSON.stringify(membresPropres(people).map((p) => [p.id, p.prenom, p.nom, p.email, p.telephone, p.couleur, p.membreId]));

/** Membres propres de `id` changés : les entités qui la comptent parmi leurs membres suivent ; vrai si l'une a changé. */
export function propagerLiens(id: string): boolean {
  let change = false;
  for (const b of unitIds()) {
    if (b === id || !read(unitStorageKey(b))) continue;
    const d = loadUnitData(b);
    if (!d.membresDe?.some((l) => l.uniteId === id)) continue;
    const n = synchroDemo(b, d);
    if (n) {
      saveUnitData(b, lierFiches(b, n));
      change = true;
    }
  }
  return change;
}
