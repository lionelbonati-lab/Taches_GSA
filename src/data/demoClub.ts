import { makeSeed } from './seed';
import { migrate } from './migrate';
import { clearFiles } from './files';
import { appliquerMembres, coordonnees, emailKey, memesCoordonnees, nomMembre, nouveauMembre } from './membres';
import { ajouterHistorique, changementsTache, nomsCites, type EntreeHistorique, type HistoriqueTache } from './historique';
import type { ErreurAppli, RapportErreur } from './rapportErreurs';
import { repriseEntites, type AncienneEntite } from './repriseEntites';
import type { Espace } from './club';
import type { AppData, ClubMembre, Prefs } from './types';

// Démo : l'espace du club, gardé dans ce navigateur, avec « Personnes du club », l'historique des tâches et le rapport
// d'erreurs. Le site est public : les personnes sont fictives (noms inventés, adresses @gsajoie.example, pas de
// téléphones), et aucune tâche : chaque testeur part de zéro.

/** L'espace du club (l'ancien comité central de la démo : ses identifiants restent). */
export const ESPACE_ID = 'u-central';
const ESPACE_KEY = 'taches-gsa-demo-v7';
/** Nom, logo, couleur et icône de l'espace. */
const INFO_KEY = 'taches-gsa-demo-espace';
/** Personne connectée : sa fiche dans l'espace. */
const MOI_KEY = 'taches-gsa-demo-connecte';
const MEMBRES_KEY = 'taches-gsa-demo-membres';
/** Historique des tâches (version réelle : gsa_historique, 050) : espace → tâche → entrées, de la plus récente à la plus ancienne. */
const HISTO_KEY = 'taches-gsa-demo-historique';
const ERREURS_KEY = 'taches-gsa-demo-erreurs';

/** Clés de la démo d'avant (une entité par clé, organigramme, session du club) : reprises une fois, puis oubliées. */
const ANCIENNES = {
  entites: 'taches-gsa-demo-club',
  entite: (id: string) => `taches-gsa-demo-u-${id}`,
  moi: 'taches-gsa-demo-moi',
  autres: ['taches-gsa-demo-unite', 'taches-gsa-demo-perso', 'taches-gsa-demo-organigrammes', 'taches-gsa-demo-statuts', 'taches-gsa-user'],
};

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
const retirer = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

// ---------- Version des données ----------

/**
 * Version des données de départ. Quand elle change, la démo enregistrée dans le navigateur repart de zéro (v2 à v8 :
 * organigramme, personnes fictives, événements…), sauf de la v8 à la v9 : un seul espace, les anciennes entités
 * reprises en étiquettes avec leurs tâches et leurs personnes (repriseEntites.ts).
 */
const DEMO_VERSION = '9';
const VERSION_KEY = 'taches-gsa-demo-version';

const toutEffacer = () => {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('taches-gsa-demo') || k === 'taches-gsa-user')
    .forEach((k) => localStorage.removeItem(k));
  void clearFiles();
};

/** À l'ouverture : la démo est à la version du jour (reprise de la v8, sinon remise à zéro). */
export function verifierVersion() {
  try {
    const v = localStorage.getItem(VERSION_KEY);
    if (v === DEMO_VERSION) return;
    if (v === '8' && read(ANCIENNES.entites)) {
      try {
        reprendreDemo();
      } catch {
        toutEffacer();
      }
    } else toutEffacer();
    localStorage.setItem(VERSION_KEY, DEMO_VERSION);
  } catch {
    /* stockage indisponible : rien à remettre à zéro */
  }
}

type AnciennePerso = { prefs?: Partial<Prefs>; notifLues?: string[]; discussionsLues?: Record<string, string> };

/**
 * Démo d'avant (v8, une entité par clé) : l'espace du club est le comité central, les autres entités y sont reprises en
 * étiquettes (leurs tâches, leurs personnes) ; réglages et lectures de chacun, connexion et historique suivent.
 */
function reprendreDemo() {
  const unites = read<AncienneEntite[]>(ANCIENNES.entites) ?? [];
  const central = unites.find((u) => u.type === 'central');
  const club = migrate(read<AppData>(ESPACE_KEY) ?? makeSeed());
  const autres = unites
    .filter((u) => u.id !== (central?.id ?? ESPACE_ID))
    .flatMap((u) => {
      const d = read<AppData>(ANCIENNES.entite(u.id));
      return d ? [{ u, d }] : [];
    });
  const r = repriseEntites(club, autres);
  const d = r.data;
  // Réglages et lectures de chacun (session du club) : sur sa fiche de l'espace.
  const fiche = (cle: string) => d.people.find((p) => p.membreId === cle)?.id ?? d.people.find((p) => emailKey(p.email) === cle.replace(/^moi:/, ''))?.id;
  const tache = (cle: string) => (cle.startsWith(`${ESPACE_ID}:`) ? cle.slice(ESPACE_ID.length + 1) : r.taches.get(cle));
  for (const [cle, perso] of Object.entries(read<Record<string, AnciennePerso>>('taches-gsa-demo-perso') ?? {})) {
    const id = fiche(cle);
    if (!id) continue;
    if (perso.prefs) d.prefs[id] = { ...d.prefs[id], ...perso.prefs } as Prefs;
    const lues = (perso.notifLues ?? []).filter((k) => k.startsWith(`${ESPACE_ID}|`)).map((k) => k.slice(ESPACE_ID.length + 1));
    if (lues.length) d.notifLues = { ...d.notifLues, [id]: [...new Set([...(d.notifLues?.[id] ?? []), ...lues])].slice(-800) };
    const discussions = Object.entries(perso.discussionsLues ?? {}).flatMap(([k, le]) => (tache(k) ? [[tache(k)!, le] as const] : []));
    if (discussions.length) d.discussionsLues = { ...d.discussionsLues, [id]: { ...d.discussionsLues?.[id], ...Object.fromEntries(discussions) } };
  }
  write(ESPACE_KEY, d);
  write(INFO_KEY, { id: ESPACE_ID, nom: 'Comité central', logo: (central as Partial<Espace> | undefined)?.logo, couleurAppli: (central as Partial<Espace> | undefined)?.couleurAppli, icone: (central as Partial<Espace> | undefined)?.icone });
  // Personne connectée : sa fiche, par son adresse.
  const moi = localStorage.getItem(ANCIENNES.moi);
  const id = moi ? d.people.find((p) => p.actif && emailKey(p.email) === emailKey(moi))?.id : undefined;
  if (id) write(MOI_KEY, id);
  // Historique des tâches : sous l'espace, les tâches des entités sous leur nouvel identifiant.
  const histo = read<Record<string, Record<string, EntreeHistorique[]>>>(HISTO_KEY) ?? {};
  const ici: Record<string, EntreeHistorique[]> = { ...histo[ESPACE_ID] };
  for (const [u, l] of Object.entries(histo)) if (u !== ESPACE_ID) for (const [t, e] of Object.entries(l)) if (r.taches.get(`${u}:${t}`)) ici[r.taches.get(`${u}:${t}`)!] = e;
  write(HISTO_KEY, { [ESPACE_ID]: ici });
  // Les anciennes clés sont oubliées (données de démonstration, reprises ci-dessus).
  unites.forEach((u) => u.id !== ESPACE_ID && retirer(ANCIENNES.entite(u.id)));
  [ANCIENNES.entites, ANCIENNES.moi, ...ANCIENNES.autres].forEach(retirer);
}

// ---------- Espace ----------

/** Données de l'espace (créées au premier passage). */
export function loadEspace(): AppData {
  const saved = read<AppData>(ESPACE_KEY);
  return saved ? migrate(saved) : makeSeed();
}

/** Enregistre les données de l'espace (l'historique des tâches suit). */
export function saveEspace(d: AppData) {
  noterHistorique(read<AppData>(ESPACE_KEY), d);
  write(ESPACE_KEY, d);
}

const ESPACE_DEPART: Espace = { id: ESPACE_ID, nom: 'Comité central' };
export const loadInfoEspace = (): Espace => ({ ...ESPACE_DEPART, ...read<Partial<Espace>>(INFO_KEY), id: ESPACE_ID });
export const saveInfoEspace = (e: Espace) => write(INFO_KEY, e);

/** Personne connectée à la démo (sa fiche). */
export const loadMoi = (): string | null => read<string>(MOI_KEY);
export function saveMoi(id: string | null) {
  if (id) write(MOI_KEY, id);
  else retirer(MOI_KEY);
}

/** Remet toute la démo à zéro. */
export function resetDemo() {
  [ESPACE_KEY, INFO_KEY, MOI_KEY, MEMBRES_KEY, HISTO_KEY, ERREURS_KEY, 'taches-gsa-logo-demo', 'taches-gsa-couleur-demo'].forEach(retirer);
  // Compteurs de temps de chacun (compteurEtat.ts).
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('taches-gsa-demo-compteur-')).forEach(retirer);
  } catch {
    /* stockage indisponible */
  }
}

// ---------- Historique des tâches (version réelle : 050) ----------

/**
 * Historique des tâches (comme le déclencheur gsa_historique_noter, 050) : ce qui change dans les tâches à chaque
 * enregistrement, au nom de la personne connectée. Rien avant le premier enregistrement.
 */
function noterHistorique(avant: AppData | null, apres: AppData) {
  if (!avant?.tasks) return;
  const moi = loadMoi();
  const fiche = moi ? apres.people.find((p) => p.id === moi) : undefined;
  const le = new Date().toISOString();
  const tout = read<Record<string, Record<string, EntreeHistorique[]>>>(HISTO_KEY) ?? {};
  const ici = { ...tout[ESPACE_ID] };
  let change = false;
  const anciennes = new Map(avant.tasks.map((t) => [t.id, t]));
  const ids = new Set([...anciennes.keys(), ...apres.tasks.map((t) => t.id)]);
  for (const t of ids) {
    const a = anciennes.get(t);
    const b = apres.tasks.find((x) => x.id === t);
    if (a === b) continue;
    const c = changementsTache(a, b);
    if (!c) continue;
    const liste = ici[t] ?? [];
    const quoi = c.quoi === 'creee' && liste.length ? 'retablie' : c.quoi;
    const nom = fiche ? `${fiche.prenom} ${fiche.nom}`.trim() : 'Quelqu’un';
    ici[t] = ajouterHistorique(liste, { le, par: moi ?? '?', nom, ...(quoi ? { quoi } : {}), champs: c.champs });
    change = true;
  }
  if (!change) return;
  tout[ESPACE_ID] = ici;
  write(HISTO_KEY, tout);
}

/** Historique d'une tâche de la démo, de la modification la plus récente à la plus ancienne. */
export function lireHistoriqueDemo(tache: string): HistoriqueTache {
  const entrees = read<Record<string, Record<string, EntreeHistorique[]>>>(HISTO_KEY)?.[ESPACE_ID]?.[tache] ?? [];
  return { entrees, noms: nomsCites(loadEspace(), entrees) };
}

// ---------- Rapport d'erreurs (version réelle : table gsa_erreurs, 051) ----------

type ErreurDemo = Omit<ErreurAppli, 'personnes'> & { empreinte: string; comptes: string[] };
const lireErreurs = () => read<ErreurDemo[]>(ERREURS_KEY) ?? [];

/** Erreur de l'appli notée pour les admins : une erreur déjà connue est comptée (et rouverte), 300 au plus. */
export function signalerErreurDemo(entite: string, qui: string, r: RapportErreur) {
  const liste = lireErreurs();
  const le = new Date().toISOString();
  const x = liste.find((e) => e.empreinte === r.empreinte);
  const champs = { message: r.message.slice(0, 500), origine: r.origine, page: r.page, version: r.version, navigateur: r.navigateur, entite };
  if (x) Object.assign(x, champs, { pile: r.pile ?? x.pile, derniere: le, nombre: x.nombre + 1, comptes: x.comptes.includes(qui) || x.comptes.length >= 50 ? x.comptes : [...x.comptes, qui], reglee: false });
  else liste.push({ id: String(Date.now()), empreinte: r.empreinte, ...champs, pile: r.pile, premiere: le, derniere: le, nombre: 1, comptes: [qui], reglee: false });
  write(ERREURS_KEY, liste.sort((a, b) => b.derniere.localeCompare(a.derniere)).slice(0, 300));
}

/** Erreurs à regarder d'abord, puis les plus récentes. */
export const erreursDemo = (): ErreurAppli[] =>
  lireErreurs()
    .map(({ empreinte: _e, comptes, ...e }) => ({ ...e, personnes: comptes.length }))
    .sort((a, b) => +a.reglee - +b.reglee || b.derniere.localeCompare(a.derniere));

export function reglerErreurDemo(id: string, reglee: boolean) {
  write(ERREURS_KEY, lireErreurs().map((e) => (e.id === id ? { ...e, reglee } : e)));
}

export function effacerErreursDemo() {
  const liste = lireErreurs();
  const reste = liste.filter((e) => !e.reglee);
  write(ERREURS_KEY, reste);
  return liste.length - reste.length;
}

// ---------- Personnes du club (registre ; version réelle : migration 016) ----------

/** Membres sans fiche dans l'appli (licenciés, parents, membres de soutien) : fictifs, sans téléphone ni IBAN. */
const EXTRAS: Partial<ClubMembre>[] = [
  { prenom: 'Léo', nom: 'Bertrand', couleur: '#16a34a' },
  { prenom: 'Zoé', nom: 'Bertrand', couleur: '#0d9488' },
  { prenom: 'Anne', nom: 'Bertrand', email: 'anne.bertrand@gsajoie.example', couleur: '#ca8a04' },
  { prenom: 'Maxime', nom: 'Renaud', email: 'maxime.renaud@gsajoie.example', couleur: '#ea580c' },
  { prenom: 'Françoise', nom: 'Colin', email: 'francoise.colin@gsajoie.example', couleur: '#475569' },
];

export const loadMembres = (): ClubMembre[] => read<ClubMembre[]>(MEMBRES_KEY) ?? [];
const writeMembres = (list: ClubMembre[]) => write(MEMBRES_KEY, list);

/**
 * Fiches de l'espace liées au registre, comme le serveur : lien gardé, sinon membre de même email, sinon nouveau membre.
 * Des coordonnées modifiées passent dans le registre. Renvoie les données (modifiées en place) et si elles ont changé.
 */
export function lierFiches(d: AppData): { d: AppData; change: boolean } {
  const list = loadMembres();
  const avant = read<AppData>(ESPACE_KEY)?.people ?? [];
  let modifie = false;
  let change = false;
  for (const p of d.people) {
    const lien = avant.find((x) => x.id === p.id)?.membreId;
    const mid = p.membreId || lien;
    let m = mid ? list.find((x) => x.id === mid) : undefined;
    if (!m && emailKey(p.email)) m = list.find((x) => emailKey(x.email) === emailKey(p.email));
    // Fiche nouvelle (ou liée pour la première fois) à une personne déjà au club : ses champs vides prennent les valeurs
    // du registre.
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
      modifie = true;
    }
    if (p.membreId !== m.id) {
      p.membreId = m.id;
      change = true;
    }
  }
  if (modifie) writeMembres(list);
  return { d, change };
}

/** Registre créé au premier passage : membres sans fiche, puis les fiches de l'espace. */
export function initMembres() {
  if (read(MEMBRES_KEY)) return;
  writeMembres(EXTRAS.map(nouveauMembre));
  const { d } = lierFiches(loadEspace());
  write(ESPACE_KEY, d);
}

/** Enregistre des membres (nouveaux ou modifiés) et recopie leurs coordonnées dans les fiches de l'espace. */
export function saveMembres(maj: ClubMembre[]) {
  const list = loadMembres();
  for (const m of maj) {
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) list[i] = m;
    else list.push(m);
  }
  writeMembres(list);
  const d = loadEspace();
  if (appliquerMembres(d, maj)) write(ESPACE_KEY, d);
}

/** Retire un membre du registre (sa fiche dans l'espace, s'il en a une, est désactivée). */
export function deleteMembre(id: string) {
  const d = loadEspace();
  const m = loadMembres().find((x) => x.id === id);
  const sienne = (p: AppData['people'][number]) => p.membreId === id || (!p.membreId && !!m && !!emailKey(m.email) && emailKey(p.email) === emailKey(m.email));
  if (d.people.some((p) => p.actif && sienne(p))) {
    d.people = d.people.map((p) => (sienne(p) ? { ...p, actif: false } : p));
    write(ESPACE_KEY, d);
  }
  writeMembres(loadMembres().filter((x) => x.id !== id));
}
