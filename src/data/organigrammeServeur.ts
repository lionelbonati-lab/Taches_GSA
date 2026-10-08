import type { AppData, Person, Poste, Role, Unit, UnitType } from './types';
import { appliquer, convertirPostes, estEtoile, lierEntite, suivre, type Depuis, type Monde, type OpOrga, type Qui, type Vers, type Zone } from './organigramme';

// Organigramme à glisser-déposer, version réelle : le calcul fait par la fonction du serveur « gsa-acces » (actions
// « organiser », « postes », « suivre », « lierEntite »). Sans base de données : la fonction lit les lignes des entités
// du club, ce module applique les règles de l'organigramme (data/organigramme.ts, les mêmes que la démo) et dit quelles
// lignes écrire. Il est inclus dans la fonction par `npm run fonction` (supabase/functions/gsa-acces/organigramme.js).
// Droits : comme la démo. On modifie les fiches touchées directement si l'on est admin de l'entité ou du comité central ;
// celles qui suivent par un poste lié suivent (c'est le principe du lien, posé par qui avait les droits des deux côtés).

/** Ligne de gsa_items. */
export interface Ligne {
  committee_id: string;
  kind: string;
  id: string;
  pos: number;
  data: unknown;
  deleted?: boolean;
}
/** Ligne de committees. */
export interface Entite {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  info: Record<string, unknown> | null;
}

/** Le club tel que l'organigramme le voit : entités, et pour chacune ses fiches, ses rôles et ses postes. */
export interface ClubOrga {
  units: Unit[];
  data: Map<string, AppData>;
  /** Position de chaque ligne lue (`entité|kind|id`). */
  pos: Map<string, number>;
  centralId: string;
}

/** Ce que l'auteur peut modifier : tout (admin du comité central), ou les entités dont il est admin. */
export interface Droits {
  central: boolean;
  admin: string[];
}

/** Une ligne à écrire, et ce qu'elle était (null : nouvelle) pour pouvoir annuler. */
export interface Ecriture {
  ligne: Ligne;
  avant: Ligne | null;
}

const TYPES: UnitType[] = ['central', 'sous-comite', 'groupe', 'equipe'];
const cleLigne = (c: string, kind: string, id: string) => `${c}|${kind}|${id}`;

/** JSON à clés triées (jsonb ne garde pas l'ordre des clés). */
function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stable(x))).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}
const propre = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const texte = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const objet = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Une fiche lue sur le serveur, complétée comme l'appli l'attend (actif par défaut, rôles en liste). */
function fiche(d: unknown, id: string): Person {
  const p = objet(d);
  return {
    ...p,
    id,
    prenom: texte(p.prenom),
    nom: texte(p.nom),
    email: texte(p.email),
    telephone: texte(p.telephone),
    couleur: texte(p.couleur) || '#64748b',
    poste: texte(p.poste),
    roles: Array.isArray(p.roles) ? p.roles.filter((r): r is string => typeof r === 'string') : [],
    actif: p.actif !== false,
  } as Person;
}

function role(d: unknown, id: string): Role {
  const r = objet(d);
  return { ...r, id, label: texte(r.label), couleur: texte(r.couleur), permissions: Array.isArray(r.permissions) ? r.permissions : [], sections: [], locked: r.locked === true } as Role;
}

function postes(d: unknown): Poste[] | undefined {
  if (!Array.isArray(d)) return undefined;
  return d
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.nom === 'string')
    .map((x) => ({ id: x.id as string, nom: (x.nom as string).slice(0, 120), titulaire: typeof x.titulaire === 'string' ? x.titulaire : undefined, lien: typeof x.lien === 'string' ? x.lien : undefined }));
}

/** Le club à partir des lignes lues : entités (committees) et leurs fiches, rôles et postes (gsa_items). */
export function lireClub(entites: Entite[], lignes: Ligne[]): ClubOrga {
  const central = entites.find((e) => !e.parent_id);
  if (!central) throw new Error('Comité central introuvable.');
  const units: Unit[] = entites.map((e) => {
    const info = objet(e.info);
    return {
      id: e.id,
      nom: e.name,
      type: (TYPES as string[]).includes(e.type) ? (e.type as UnitType) : e.parent_id ? 'groupe' : 'central',
      parentId: e.parent_id ?? undefined,
      couleur: texte(info.couleur) || '#64748b',
      archive: info.archive === true || undefined,
      dependDe: typeof info.dependDe === 'string' ? info.dependDe : undefined,
    };
  });
  const data = new Map<string, AppData>(units.map((u) => [u.id, { people: [], roles: [] } as unknown as AppData]));
  const pos = new Map<string, number>();
  const tri = [...lignes].sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1));
  for (const l of tri) {
    const d = data.get(l.committee_id);
    if (!d || l.deleted) continue;
    pos.set(cleLigne(l.committee_id, l.kind, l.id), l.pos);
    if (l.kind === 'people') d.people.push(fiche(l.data, l.id));
    else if (l.kind === 'roles') d.roles.push(role(l.data, l.id));
    else if (l.kind === 'meta' && l.id === 'postes') d.postes = postes(l.data);
  }
  return { units, data, pos, centralId: central.id };
}

/** Ce que l'on compare d'une entité à l'autre : ses fiches et ses postes. */
function photo(c: ClubOrga): Map<string, string> {
  const out = new Map<string, string>();
  for (const [u, d] of c.data) {
    for (const p of d.people) out.set(cleLigne(u, 'people', p.id), stable(propre(p)));
    if (d.postes) out.set(cleLigne(u, 'meta', 'postes'), stable(propre(d.postes)));
  }
  return out;
}

/** Les lignes changées depuis la photo `avant` (nouvelles fiches : à la suite de celles de l'entité). */
function ecritures(c: ClubOrga, avant: Map<string, string>): Ecriture[] {
  const apres = photo(c);
  const out: Ecriture[] = [];
  for (const [u, d] of c.data) {
    let fin = Math.max(0, ...[...c.pos].filter(([k]) => k.startsWith(`${u}|people|`)).map(([, v]) => v));
    const lignes: [string, string, unknown][] = d.people.map((p) => ['people', p.id, p]);
    if (d.postes) lignes.push(['meta', 'postes', d.postes]);
    for (const [kind, id, v] of lignes) {
      const k = cleLigne(u, kind, id);
      const a = avant.get(k);
      if (a === apres.get(k)) continue;
      let pos = c.pos.get(k);
      if (pos === undefined) {
        pos = kind === 'people' ? ++fin : 0;
        c.pos.set(k, pos);
      }
      out.push({ ligne: { committee_id: u, kind, id, pos, data: propre(v) }, avant: a === undefined ? null : { committee_id: u, kind, id, pos, data: JSON.parse(a) } });
    }
  }
  return out;
}

/** La modification envoyée par l'appli, vérifiée champ par champ (textes bornés). */
export function lireOp(x: unknown): OpOrga {
  const o = objet(x);
  const s = (v: unknown, max = 120) => {
    if (typeof v !== 'string' || !v) throw new Error('Modification invalide.');
    return v.slice(0, max);
  };
  const zone = (v: unknown): Zone => {
    if (v !== 'titre' && v !== 'poste' && v !== 'benevoles') throw new Error('Modification invalide.');
    return v;
  };
  switch (o.type) {
    case 'nouveauPoste':
      return { type: 'nouveauPoste', uniteId: s(o.uniteId), nom: s(o.nom) };
    case 'renommer':
      return { type: 'renommer', uniteId: s(o.uniteId), posteId: s(o.posteId), nom: s(o.nom) };
    case 'supprimerPoste':
      return { type: 'supprimerPoste', uniteId: s(o.uniteId), posteId: s(o.posteId) };
    case 'lier':
      return { type: 'lier', uniteId: s(o.uniteId), posteId: s(o.posteId), lien: o.lien === null ? null : s(o.lien) };
    case 'placer': {
      const q = objet(o.qui);
      const couleur = texte(q.couleur, 7);
      const qui: Qui = {
        prenom: texte(q.prenom, 80),
        nom: texte(q.nom, 80),
        email: texte(q.email, 200).trim(),
        telephone: texte(q.telephone, 40) || undefined,
        couleur: /^#[0-9a-f]{6}$/i.test(couleur) ? couleur : '#64748b',
        membreId: texte(q.membreId, 100) || undefined,
      };
      const dep = o.depuis ? objet(o.depuis) : null;
      const depuis: Depuis | undefined = dep ? { uniteId: s(dep.uniteId), personId: s(dep.personId), zone: zone(dep.zone), posteId: dep.posteId ? s(dep.posteId) : undefined } : undefined;
      const v = objet(o.vers);
      let vers: Vers;
      if (v.zone === 'corbeille') vers = { zone: 'corbeille' };
      else if (v.zone === 'titre' || v.zone === 'benevoles') vers = { zone: v.zone, uniteId: s(v.uniteId) };
      else if (v.zone === 'etoile') vers = { zone: 'etoile', uniteId: s(v.uniteId), personId: s(v.personId) };
      else if (v.zone === 'poste') vers = { zone: 'poste', uniteId: s(v.uniteId), posteId: s(v.posteId) };
      else if (v.zone === 'nouveau') vers = { zone: 'nouveau', uniteId: s(v.uniteId), nom: s(v.nom) };
      else throw new Error('Modification invalide.');
      return { type: 'placer', qui, depuis, vers };
    }
  }
  throw new Error('Modification inconnue.');
}

const peutDe = (c: ClubOrga, d: Droits) => (id: string) => d.central || d.admin.includes(id) || false;
const nomDe = (c: ClubOrga, id: string) => c.units.find((u) => u.id === id)?.nom ?? '?';

/** Le comité central garde au moins un ★ (sinon plus personne n'administre le club). */
function gardeUnEtoile(c: ClubOrga, ecr: Ecriture[]) {
  if (ecr.some((e) => e.ligne.committee_id === c.centralId) && !c.data.get(c.centralId)?.people.some(estEtoile)) throw new Error('Le comité central garde au moins un ★.');
}

/** Les entités qui n'ont pas encore de postes : déduits de leurs fiches (prudemment : personne ne devient ★). */
export function convertir(c: ClubOrga): Ecriture[] {
  if (![...c.data.values()].some((d) => !d.postes)) return [];
  const avant = photo(c);
  convertirPostes(c.units, c.data, true);
  return ecritures(c, avant);
}

/** Une modification de l'organigramme (glisser-déposer, postes) ; refusée sans les droits sur les fiches touchées. */
export function organiser(c: ClubOrga, op: OpOrga, droits: Droits): { message: string; ecritures: Ecriture[] } {
  const avant = photo(c);
  const peut = peutDe(c, droits);
  const message = appliquer({ units: c.units, data: c.data, notes: [], peut }, op);
  const ecr = ecritures(c, avant);
  // Fiches touchées directement (lier un poste : aussi l'entité liée) ; celles qui suivent par un poste lié suivent.
  const directes = new Set(
    op.type === 'placer' ? [op.depuis?.uniteId, op.vers.zone === 'corbeille' ? undefined : op.vers.uniteId] : op.type === 'lier' ? [op.uniteId, op.lien] : [op.uniteId],
  );
  for (const u of new Set(ecr.map((e) => e.ligne.committee_id)))
    if (directes.has(u) && !peut(u)) throw new Error(u === c.centralId ? 'Réservé aux admins du comité central.' : `Réservé aux admins de « ${nomDe(c, u)} » ou du comité central.`);
  gardeUnEtoile(c, ecr);
  return { message, ecritures: ecr };
}

/** Fiche envoyée par l'appli (état d'avant une modification) : seuls les champs utiles à l'organigramme. */
function ficheAvant(x: unknown): Person | null {
  const p = objet(x);
  if (typeof p.id !== 'string' || !p.id) return null;
  return fiche({ prenom: p.prenom, nom: p.nom, email: p.email, poste: p.poste, autresPostes: typeof p.autresPostes === 'string' ? p.autresPostes : undefined, roles: p.roles, actif: p.actif, membreId: typeof p.membreId === 'string' ? p.membreId : undefined, viaEntite: typeof p.viaEntite === 'string' ? p.viaEntite : undefined }, p.id);
}

/**
 * Personnes de l'entité `id` modifiées ailleurs que dans l'organigramme (fiche, console admin) : ses postes et les postes
 * liés suivent (data/organigramme, suivre). `avantPeople` : ses fiches d'avant, envoyées par l'appli ; ses postes d'avant
 * sont ceux du serveur (l'appli ne les écrit pas elle-même).
 */
export function suivreFiches(c: ClubOrga, id: string, avantPeople: unknown, droits: Droits): Ecriture[] {
  const d = c.data.get(id);
  if (!d?.postes || !Array.isArray(avantPeople)) return [];
  const people = avantPeople.slice(0, 5000).map(ficheAvant).filter((p): p is Person => !!p);
  const avant = { ...d, people, postes: propre(d.postes) } as AppData;
  const photoAvant = photo(c);
  suivre({ units: c.units, data: c.data, notes: [], peut: peutDe(c, droits) } as Monde, id, avant);
  const ecr = ecritures(c, photoAvant);
  gardeUnEtoile(c, ecr);
  return ecr;
}

/** Entité créée ou renommée : les postes qui portent son nom (dans les entités que l'auteur peut modifier) lui sont liés. */
export function lierEntiteServeur(c: ClubOrga, id: string, droits: Droits): { message: string; ecritures: Ecriture[] } {
  if (!c.data.get(id)) return { message: '', ecritures: [] };
  const avant = photo(c);
  const m: Monde = { units: c.units, data: c.data, notes: [], peut: peutDe(c, droits) };
  const d = c.data.get(id)!;
  d.postes ??= [];
  lierEntite(m, id);
  const ecr = ecritures(c, avant);
  gardeUnEtoile(c, ecr);
  return { message: m.notes.join(' · '), ecritures: ecr };
}

/** Fiches créées ou revenues dans une entité : leur compte (s'il existe) doit leur ouvrir l'entité. */
export function fichesArrivees(ecr: Ecriture[]): { committee_id: string; id: string; email: string; membreId?: string }[] {
  return ecr
    .filter((e) => e.ligne.kind === 'people')
    .filter((e) => {
      const n = e.ligne.data as Person;
      const a = e.avant?.data as Person | undefined;
      return n.actif !== false && (!a || a.actif === false);
    })
    .map((e) => {
      const n = e.ligne.data as Person;
      return { committee_id: e.ligne.committee_id, id: e.ligne.id, email: (n.email ?? '').trim().toLowerCase(), membreId: n.membreId };
    });
}
