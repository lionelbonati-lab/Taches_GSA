import type { AppData, OrgMember, OrgUnit, Person, Poste, Role, Unit, UnitType } from './types';
import { ADMIN_ROLE_ID } from './permissions';
import { defaultRoleId, parentDans, UNIT_TYPES } from './units';
import { emailKey } from './membres';
import { ficheDe } from './cablage';
import { uid } from './utils';

// Organigramme « colonne vertébrale » (démo pour l'instant) : la fiche de chaque entité a trois zones.
//  - Titre : ses ★ (rôle Admin, plusieurs possibles), leur fonction en premier (« Président »…).
//  - Responsables : ses postes, dans l'ordre, chacun avec son titulaire, ou vacant (en rouge).
//  - Bénévoles (« Membres » d'un groupe) : les autres membres, dépliés à la demande.
// On place une personne en la glissant : sur le titre elle devient ★, sur un poste elle l'occupe (son titulaire
// d'avant devient bénévole), dans les bénévoles elle devient simple bénévole. Glissée depuis une autre fiche, elle
// la quitte (déplacer). Le rôle suit : Admin pour un ★, membre du comité pour un poste, bénévole sinon.
// Un poste peut être lié au ★ d'une autre entité (ex. « Compétition » au comité central ↔ ★ du groupe compétition) :
// son titulaire en est ★ ; changer l'un change l'autre (synchroniser). Plusieurs postes d'une entité liés à la même
// (ex. deux « Compétition » au comité central) : autant de co-responsables, un poste lié chacun.
// Les fonctions des fiches (poste, autres postes) restent à jour : le reste de l'appli les lit comme avant.

const cle = (s?: string) => (s ?? '').trim().toLowerCase();
const liste = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
/** Toutes les fonctions d'une fiche : poste, puis autres postes. */
export const fonctionsDe = (p: Pick<Person, 'poste' | 'autresPostes'>) => [p.poste?.trim() ?? '', ...liste(p.autresPostes)].filter(Boolean);
const ecrire = (p: Person, l: string[]) => {
  p.poste = l[0] ?? '';
  p.autresPostes = l.length > 1 ? l.slice(1).join(', ') : undefined;
};
const sansUne = (l: string[], nom: string) => {
  const i = l.findIndex((x) => cle(x) === cle(nom));
  return i < 0 ? l : [...l.slice(0, i), ...l.slice(i + 1)];
};

export const estEtoile = (p: Pick<Person, 'actif' | 'roles'>) => p.actif && p.roles.includes(ADMIN_ROLE_ID);
export const nomDe = (p: { prenom: string; nom: string; email?: string; poste?: string }) => `${p.prenom} ${p.nom}`.trim() || p.poste?.trim() || p.email || '?';
/** Même personne d'une entité à l'autre : même fiche du registre, ou même adresse. */
export const memeQui = (a: { membreId?: string; email?: string }, b: { membreId?: string; email?: string }) =>
  (!!a.membreId && a.membreId === b.membreId) || (!!emailKey(a.email) && emailKey(a.email) === emailKey(b.email));

/** Les membres sans poste : « bénévoles », ou « membres » d'un groupe. */
export const benevolesDe = (type: UnitType) =>
  type === 'groupe' ? { un: 'membre', plusieurs: 'membres', titre: 'Membres' } : { un: 'bénévole', plusieurs: 'bénévoles', titre: 'Bénévoles' };

// ---------- Rôles ----------

const nonAdmin = (roles: Role[]) => roles.filter((r) => r.id !== ADMIN_ROLE_ID);
const parDroits = (l: Role[]) => [...l].sort((a, b) => a.permissions.length - b.permissions.length);

/** Rôle d'un simple bénévole : « Bénévole » s'il existe, sinon le rôle qui donne le moins de droits. */
export function roleBenevole(roles: Role[]): string | undefined {
  return roles.find((r) => r.id === 'benevole')?.id ?? parDroits(nonAdmin(roles))[0]?.id;
}

/** Rôle de qui occupe un poste : le rôle par défaut (« Comité », « Membre »…), plus étendu que celui d'un bénévole si possible. */
export function roleResponsable(roles: Role[]): string | undefined {
  const ben = roleBenevole(roles);
  const def = defaultRoleId(roles);
  if (def !== ADMIN_ROLE_ID && def !== ben) return def;
  return parDroits(nonAdmin(roles).filter((r) => r.id !== ben && !r.permissions.includes('paiements.payer')))[0]?.id ?? ben;
}

// ---------- Les trois zones d'une fiche (affichage) ----------

export interface ZonesFiche {
  etoiles: OrgMember[];
  postes: { poste: Poste; m?: OrgMember }[];
  /** Ni ★ ni titulaire d'un poste ; les membres reçus d'une autre entité restent sur la ligne « 👥 » de celle-ci. */
  benevoles: OrgMember[];
}

export function zonesFiche(u: Pick<OrgUnit, 'membres' | 'postes'>): ZonesFiche {
  const parId = new Map(u.membres.map((m) => [m.id, m]));
  const postes = (u.postes ?? []).map((poste) => ({ poste, m: poste.titulaire ? parId.get(poste.titulaire) : undefined }));
  const tenus = new Set(postes.flatMap((x) => (x.m ? [x.m.id] : [])));
  return {
    etoiles: u.membres.filter((m) => m.admin),
    postes,
    benevoles: u.membres.filter((m) => !m.admin && !tenus.has(m.id) && !(m.viaEntite && !fonctionsDe(m).length)),
  };
}

/** Fonctions d'une personne qui ne sont pas des postes de la fiche (sauf le titre d'un ★) : affichées à côté de son nom. */
export function fonctionsLibres(m: OrgMember, postes: Poste[]): string[] {
  let l = m.admin ? liste(m.autresPostes) : fonctionsDe(m);
  for (const p of postes) if (p.titulaire === m.id) l = sansUne(l, p.nom);
  return l;
}

// ---------- Première ouverture : postes et liens déduits des données ----------

const GENERIQUE = /^(b[ée]n[ée]vole|membre)s?\b/i;

/**
 * Postes d'une fiche qui n'en a pas encore : chaque fonction d'un membre du comité devient un poste qu'il occupe.
 * Les bénévoles n'en ont pas (rôle « Bénévole », simples membres d'un groupe, fonctions « Bénévole » ou « Membre »).
 */
export function postesDeduits(d: AppData, type: UnitType): Poste[] {
  const ben = roleBenevole(d.roles);
  const out: Poste[] = [];
  for (const p of d.people) {
    if (!p.actif) continue;
    const etoile = p.roles.includes(ADMIN_ROLE_ID);
    const autres = p.roles.filter((r) => r !== ADMIN_ROLE_ID);
    const benevole = !etoile && autres.length > 0 && autres.every((r) => r === ben) && (ben === 'benevole' || type === 'groupe');
    if (benevole || (!etoile && p.viaEntite && !fonctionsDe(p).length)) continue;
    for (const nom of etoile ? liste(p.autresPostes) : fonctionsDe(p)) if (!GENERIQUE.test(nom)) out.push({ id: uid('po'), nom, titulaire: p.id });
  }
  return out;
}

const mots = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);

/** Le poste dont le nom ressemble le plus à celui de l'entité (à égalité, le premier). */
function proche(postes: Poste[], nom: string) {
  const m = new Set(mots(nom));
  let [meilleur, score] = [postes[0], -1];
  for (const p of postes) {
    const s = mots(p.nom).filter((w) => m.has(w)).length;
    if (s > score) [meilleur, score] = [p, s];
  }
  return meilleur;
}

/**
 * Fiches qui n'ont pas encore de postes : postes déduits des fonctions ; les câbles d'avant (le ★ d'une entité, membre
 * de son entité mère) deviennent des postes liés. Modifie `data` ; renvoie les entités modifiées.
 */
export function convertirPostes(units: Unit[], data: Map<string, AppData>): string[] {
  const neufs = units.filter((u) => {
    const d = data.get(u.id);
    return !!d && !d.postes;
  });
  for (const u of neufs) data.get(u.id)!.postes = postesDeduits(data.get(u.id)!, u.type);
  const actives = units.filter((u) => !u.archive);
  for (const u of actives) {
    const mere = parentDans(actives, u);
    const dm = mere && neufs.some((x) => x.id === mere.id) ? data.get(mere.id) : undefined;
    const du = data.get(u.id);
    if (!dm?.postes || !du) continue;
    for (const s of du.people.filter(estEtoile)) {
      const pm = dm.people.find((x) => x.actif && memeQui(x, s));
      if (!pm) continue;
      const libres = dm.postes.filter((x) => x.titulaire === pm.id && !x.lien);
      let po = libres.length ? proche(libres, u.nom) : undefined;
      if (!po) {
        po = { id: uid('po'), nom: `${UNIT_TYPES[u.type].chef} ${u.nom}`, titulaire: pm.id };
        dm.postes.push(po);
        ajouterFonction(pm, po.nom);
      }
      po.lien = u.id;
    }
  }
  return neufs.map((u) => u.id);
}

// ---------- Modifications ----------

/** Une personne du club, telle qu'on la retrouve d'une entité à l'autre. */
export interface Qui {
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  couleur: string;
  membreId?: string;
}
const quiDe = (p: Qui): Qui => ({ prenom: p.prenom, nom: p.nom, email: p.email, telephone: p.telephone, couleur: p.couleur, membreId: p.membreId });

export type Zone = 'titre' | 'poste' | 'benevoles';
/** La ligne d'où l'on a pris la personne (déplacer). */
export interface Depuis {
  uniteId: string;
  personId: string;
  zone: Zone;
  posteId?: string;
}
/** Où on la pose : titre (★ en plus), à la place d'un ★, sur un poste, dans un nouveau poste, dans les bénévoles, ou à la corbeille. */
export type Vers =
  | { zone: 'titre'; uniteId: string }
  | { zone: 'etoile'; uniteId: string; personId: string }
  | { zone: 'poste'; uniteId: string; posteId: string }
  | { zone: 'nouveau'; uniteId: string; nom: string }
  | { zone: 'benevoles'; uniteId: string }
  | { zone: 'corbeille' };

export type OpOrga =
  | { type: 'placer'; qui: Qui; depuis?: Depuis; vers: Vers }
  | { type: 'nouveauPoste'; uniteId: string; nom: string }
  | { type: 'renommer'; uniteId: string; posteId: string; nom: string }
  | { type: 'supprimerPoste'; uniteId: string; posteId: string }
  /** `garde` : le poste a un titulaire et l'entité un autre ★ : qui tient les deux. */
  | { type: 'lier'; uniteId: string; posteId: string; lien: string | null; garde?: 'titulaire' | 'etoile' };

/** Les entités du club et leurs données (modifiées sur place) ; `notes` : ce qui a suivi par les postes liés. */
export interface Monde {
  units: Unit[];
  data: Map<string, AppData>;
  notes: string[];
}

function entite(m: Monde, id: string) {
  const u = m.units.find((x) => x.id === id);
  const d = m.data.get(id);
  if (!u || !d) throw new Error('Cette entité n’existe plus.');
  if (u.archive) throw new Error(`« ${u.nom} » est archivée.`);
  if (!d.postes) d.postes = postesDeduits(d, u.type);
  return { u, d, postes: d.postes };
}

const tenus = (d: AppData, p: Person) => (d.postes ?? []).filter((x) => x.titulaire === p.id);
/** Elle a encore une place dans la fiche : ★ ou un poste. */
const reste = (d: AppData, p: Person) => p.actif && (p.roles.includes(ADMIN_ROLE_ID) || tenus(d, p).length > 0);

/**
 * Sa fiche dans l'entité (reprise, ou créée) ; une ancienne fiche reprend sans rôle ni fonction.
 * `parLien` : elle n'y arrive que par un poste lié (placée à la main, la marque s'en va).
 */
function fiche(d: AppData, q: Qui, parLien = false): Person {
  const p = ficheDe(d.people, q);
  if (p) {
    if (!p.actif) Object.assign(p, { actif: true, roles: [], poste: '', autresPostes: undefined, parLien: parLien || undefined });
    else if (!parLien) delete p.parLien;
    // Fiche reçue d'une autre entité (lien « Membres de ») : elle devient la sienne.
    if (p.viaEntite || p.exclu) Object.assign(p, { viaEntite: undefined, viaFiche: undefined, exclu: undefined });
    return p;
  }
  const n: Person = {
    id: uid('p'),
    prenom: q.prenom.trim(),
    nom: q.nom.trim(),
    email: q.email.trim(),
    telephone: q.telephone?.trim() ?? '',
    couleur: q.couleur,
    poste: '',
    roles: [],
    actif: true,
    ...(q.membreId ? { membreId: q.membreId } : {}),
    ...(parLien ? { parLien } : {}),
  };
  d.people.push(n);
  return n;
}

function ajouterFonction(p: Person, nom: string) {
  if (p.roles.includes(ADMIN_ROLE_ID)) p.autresPostes = [...liste(p.autresPostes), nom].join(', ');
  else ecrire(p, [...fonctionsDe(p), nom]);
}
function enleverFonction(p: Person, nom: string) {
  if (p.roles.includes(ADMIN_ROLE_ID)) {
    const l = sansUne(liste(p.autresPostes), nom);
    p.autresPostes = l.length ? l.join(', ') : undefined;
  } else ecrire(p, sansUne(fonctionsDe(p), nom));
}

/** ★ de l'entité : son titre (celui donné, sinon celui des autres ★, sinon « Président » / « Responsable ») passe en premier. */
function donnerEtoile(d: AppData, u: Unit, p: Person, titre?: string) {
  if (p.roles.includes(ADMIN_ROLE_ID)) return false;
  const fns = fonctionsDe(p);
  p.poste = titre?.trim() || d.people.find((x) => x.id !== p.id && estEtoile(x) && x.poste.trim())?.poste.trim() || UNIT_TYPES[u.type].chef;
  p.autresPostes = fns.length ? fns.join(', ') : undefined;
  p.roles = [ADMIN_ROLE_ID, ...p.roles];
  return true;
}

/** Plus ★ : son titre s'en va ; sans autre rôle, celui d'un membre du comité (s'il a un poste) ou d'un bénévole. */
function retirerEtoile(d: AppData, p: Person) {
  if (!p.roles.includes(ADMIN_ROLE_ID)) return false;
  p.roles = p.roles.filter((r) => r !== ADMIN_ROLE_ID);
  ecrire(p, liste(p.autresPostes));
  if (!p.roles.length) p.roles = [(tenus(d, p).length ? roleResponsable(d.roles) : roleBenevole(d.roles)) ?? defaultRoleId(d.roles)];
  return true;
}

/** Le poste se libère ; renvoie son titulaire d'avant (actif). */
function retirerPoste(d: AppData, poste: Poste) {
  const p = poste.titulaire ? d.people.find((x) => x.id === poste.titulaire) : undefined;
  poste.titulaire = undefined;
  if (p) enleverFonction(p, poste.nom);
  return p?.actif ? p : undefined;
}

/** `p` occupe le poste (un bénévole passe membre du comité) ; renvoie le titulaire qu'il remplace. */
function donnerPoste(d: AppData, poste: Poste, p: Person) {
  if (poste.titulaire === p.id && p.actif) return undefined;
  const ancien = retirerPoste(d, poste);
  poste.titulaire = p.id;
  ajouterFonction(p, poste.nom);
  if (!p.roles.includes(ADMIN_ROLE_ID)) {
    const ben = roleBenevole(d.roles);
    const resp = roleResponsable(d.roles);
    if (resp && (!p.roles.length || p.roles.every((r) => r === ben))) p.roles = [resp];
  }
  return ancien && ancien.id !== p.id ? ancien : undefined;
}

/** Simple bénévole : plus ★, ses postes se libèrent (ses autres fonctions restent écrites sur sa fiche). */
function rendreBenevole(d: AppData, p: Person) {
  retirerEtoile(d, p);
  for (const x of tenus(d, p)) retirerPoste(d, x);
  p.roles = [roleBenevole(d.roles) ?? defaultRoleId(d.roles)];
}

/** Quitte l'entité : fiche désactivée (gardée pour ses tâches), ses postes se libèrent. */
function quitter(d: AppData, p: Person) {
  for (const x of tenus(d, p)) x.titulaire = undefined;
  p.actif = false;
  delete p.parLien;
  if (p.viaEntite) p.exclu = true;
}

/** Sa dernière place lui a été prise (remplacée, ou par un poste lié) : bénévole, ou elle quitte l'entité si elle n'y était venue que par un lien. */
function liberer(d: AppData, p: Person) {
  if (reste(d, p)) return;
  if (p.parLien) quitter(d, p);
  else rendreBenevole(d, p);
}

// ---------- Postes liés ----------

interface EtatLien {
  a: string;
  poste: string;
  c: string;
  h?: Qui;
  etoiles: Qui[];
}

/** Chaque poste lié : son titulaire, et les ★ de l'entité liée. */
function etatLiens(m: Monde): Map<string, EtatLien> {
  const out = new Map<string, EtatLien>();
  for (const u of m.units) {
    const d = m.data.get(u.id);
    if (u.archive || !d?.postes) continue;
    for (const x of d.postes) {
      const c = x.lien ? m.units.find((v) => v.id === x.lien && !v.archive && v.id !== u.id) : undefined;
      const dc = c && m.data.get(c.id);
      if (!c || !dc) continue;
      const h = x.titulaire ? d.people.find((p) => p.id === x.titulaire && p.actif) : undefined;
      out.set(`${u.id}|${x.id}`, { a: u.id, poste: x.id, c: c.id, h: h && quiDe(h), etoiles: dc.people.filter(estEtoile).map(quiDe) });
    }
  }
  return out;
}

const dans = (l: Qui[], q?: Qui) => !!q && l.some((x) => memeQui(x, q));

/** Titulaires (actifs) des postes de `d` liés à l'entité `c`, sauf le poste `sauf`. */
const titulairesLies = (d: AppData, c: string, sauf?: string) =>
  (d.postes ?? []).flatMap((x) => {
    const p = x.id !== sauf && x.lien === c && x.titulaire ? d.people.find((y) => y.id === x.titulaire && y.actif) : undefined;
    return p ? [p] : [];
  });
/** Co-responsables : les ★ de `c` qui ne tiennent pas déjà un autre poste de `d` lié à `c` (un poste lié par ★). */
const etoilesLibres = (d: AppData, c: string, etoiles: Qui[], sauf?: string) => {
  const pris = titulairesLies(d, c, sauf);
  return etoiles.filter((e) => !pris.some((p) => memeQui(p, e)));
};

/**
 * Après une modification : les postes liés suivent. Le titulaire d'un poste lié a changé : il devient ★ de l'entité
 * liée, à la place de l'ancien (qui la quitte s'il n'y a plus rien). Un ★ lié n'est plus ★ : un nouveau ★ (pas déjà
 * lié par un autre poste) prend le poste (l'ancien titulaire quitte l'entité du poste s'il n'y a plus rien) ; sinon,
 * le poste est à pourvoir. Plusieurs postes d'une entité liés à la même : autant de co-responsables (★).
 */
function synchroniser(m: Monde, avant: Map<string, EtatLien>) {
  for (let tour = 0; tour < 8; tour++) {
    let change = false;
    for (const [k, l] of etatLiens(m)) {
      const b = avant.get(k);
      if (!b) continue;
      const A = entite(m, l.a);
      const C = entite(m, l.c);
      const poste = A.postes.find((x) => x.id === l.poste)!;
      const pChange = l.h ? !b.h || !memeQui(b.h, l.h) : !!b.h;
      if (pChange) {
        // L'ancien titulaire reste ★ s'il tient encore un autre poste lié à la même entité.
        if (b.h && dans(l.etoiles, b.h) && !titulairesLies(A.d, C.u.id, poste.id).some((p) => memeQui(p, b.h!))) {
          const x = ficheDe(C.d.people, b.h);
          if (x && estEtoile(x)) {
            retirerEtoile(C.d, x);
            liberer(C.d, x);
            if (!l.h) m.notes.push(`${nomDe(x)} n’est plus ★ de « ${C.u.nom} »`);
            change = true;
          }
        }
        if (l.h && !dans(l.etoiles, l.h)) {
          const p = fiche(C.d, l.h, true);
          donnerEtoile(C.d, C.u, p);
          m.notes.push(`★ de « ${C.u.nom} » : ${nomDe(p)}`);
          change = true;
        }
        continue;
      }
      let libre = !l.h;
      let libere = false;
      if (l.h && !dans(l.etoiles, l.h)) {
        const x = retirerPoste(A.d, poste);
        if (x) liberer(A.d, x);
        change = libre = libere = true;
      }
      const n = libre ? etoilesLibres(A.d, C.u.id, l.etoiles.filter((e) => !dans(b.etoiles, e)), poste.id)[0] : undefined;
      if (n) {
        const p = fiche(A.d, n, true);
        donnerPoste(A.d, poste, p);
        m.notes.push(`${poste.nom} de « ${A.u.nom} » : ${nomDe(p)}`);
        change = true;
      } else if (libere) m.notes.push(`${poste.nom} de « ${A.u.nom} » : à pourvoir`);
    }
    if (!change) return;
  }
}

// ---------- Les opérations ----------

function placer(m: Monde, qui: Qui, depuis: Depuis | undefined, vers: Vers): string {
  const ici = !!depuis && vers.zone !== 'corbeille' && vers.uniteId === depuis.uniteId;
  if (depuis && ici) {
    if (vers.zone === depuis.zone && (vers.zone !== 'poste' || vers.posteId === depuis.posteId)) return '';
    if (vers.zone === 'etoile' && depuis.zone === 'titre' && vers.personId === depuis.personId) return '';
    if (vers.zone === 'poste' && depuis.zone === 'titre' && entite(m, vers.uniteId).postes.find((x) => x.id === vers.posteId)?.titulaire === depuis.personId) return '';
  }
  let p: Person | undefined;
  let quitte = '';
  if (depuis) {
    const A = entite(m, depuis.uniteId);
    const avant = etatLiens(m);
    const x = A.d.people.find((y) => y.id === depuis.personId && y.actif);
    if (!x) throw new Error('Cette personne ne fait plus partie de l’entité.');
    const po = depuis.zone === 'poste' ? A.postes.find((y) => y.id === depuis.posteId && y.titulaire === x.id) : undefined;
    const quoi = depuis.zone === 'titre' ? `★ (${(x.poste || UNIT_TYPES[A.u.type].chef).toLowerCase()})` : po ? po.nom : benevolesDe(A.u.type).un;
    if (depuis.zone === 'titre') retirerEtoile(A.d, x);
    else if (po) retirerPoste(A.d, po);
    if (ici) p = x;
    else if (!reste(A.d, x)) {
      quitter(A.d, x);
      quitte = A.u.nom;
    }
    synchroniser(m, avant);
    if (vers.zone === 'corbeille') return quitte ? `${nomDe(x)} retiré de « ${A.u.nom} »` : `${nomDe(x)} n’est plus ${quoi} de « ${A.u.nom} »`;
  }
  if (vers.zone === 'corbeille') return '';
  const B = entite(m, vers.uniteId);
  const avant = etatLiens(m);
  p ??= fiche(B.d, qui);
  delete p.parLien;
  const nom = nomDe(p);
  const chef = UNIT_TYPES[B.u.type].chef;
  let msg: string;
  if (vers.zone === 'titre') {
    msg = donnerEtoile(B.d, B.u, p) ? `★ ${nom} : ${p.poste.toLowerCase()} de « ${B.u.nom} »` : `${nom} est déjà ★ de « ${B.u.nom} »`;
  } else if (vers.zone === 'etoile') {
    const x = B.d.people.find((y) => y.id === vers.personId && estEtoile(y) && y.id !== p!.id);
    const titre = x?.poste;
    if (x) {
      retirerEtoile(B.d, x);
      liberer(B.d, x);
    }
    donnerEtoile(B.d, B.u, p, titre);
    msg = `★ ${nom} : ${(p.poste || chef).toLowerCase()} de « ${B.u.nom} »${x ? ` à la place de ${nomDe(x)}` : ''}`;
  } else if (vers.zone === 'poste') {
    const po = B.postes.find((y) => y.id === vers.posteId);
    if (!po) throw new Error('Ce poste n’existe plus.');
    const ancien = donnerPoste(B.d, po, p);
    if (ancien) liberer(B.d, ancien);
    msg = `${nom} : ${po.nom} de « ${B.u.nom} »${ancien ? ` à la place de ${nomDe(ancien)}` : ''}`;
  } else if (vers.zone === 'nouveau') {
    const n = vers.nom.trim();
    if (!n) throw new Error('Donne un nom au poste.');
    const po: Poste = { id: uid('po'), nom: n };
    B.postes.push(po);
    donnerPoste(B.d, po, p);
    msg = `Nouveau poste « ${n} » dans « ${B.u.nom} » : ${nom}`;
  } else {
    rendreBenevole(B.d, p);
    msg = `${nom} : ${benevolesDe(B.u.type).un} de « ${B.u.nom} »`;
  }
  synchroniser(m, avant);
  return msg + (quitte ? ` (quitte « ${quitte} »)` : '');
}

function lier(m: Monde, uniteId: string, posteId: string, lien: string | null, garde?: 'titulaire' | 'etoile'): string {
  const A = entite(m, uniteId);
  const po = A.postes.find((x) => x.id === posteId);
  if (!po) throw new Error('Ce poste n’existe plus.');
  if (!lien) {
    const avant = m.units.find((u) => u.id === po.lien);
    po.lien = undefined;
    return `« ${po.nom} » n’est plus lié${avant ? ` à « ${avant.nom} »` : ''}`;
  }
  if (lien === uniteId) throw new Error('Un poste se lie au ★ d’une autre entité.');
  const C = entite(m, lien);
  const avant = etatLiens(m);
  const h = po.titulaire ? A.d.people.find((x) => x.id === po.titulaire && x.actif) : undefined;
  const etoiles = C.d.people.filter(estEtoile);
  // Les ★ déjà liés par un autre poste de l'entité restent à leur poste : celui-ci va à un ★ libre, sinon son titulaire devient co-responsable.
  const libre = etoilesLibres(A.d, C.u.id, etoiles.map(quiDe), po.id)[0];
  let suite = '';
  if (!h && libre) {
    donnerPoste(A.d, po, fiche(A.d, libre, true));
    suite = ` : ${nomDe(libre)}`;
  } else if (!h && etoiles.length) {
    suite = ' : à pourvoir (son titulaire sera co-responsable)';
  } else if (h && !etoiles.some((e) => memeQui(e, h))) {
    if (libre && garde === 'etoile') {
      const ancien = donnerPoste(A.d, po, fiche(A.d, libre, true));
      if (ancien) liberer(A.d, ancien);
      suite = ` : ${nomDe(libre)}${ancien ? ` à la place de ${nomDe(ancien)}` : ''}`;
    } else {
      donnerEtoile(C.d, C.u, fiche(C.d, quiDe(h), true));
      suite = ` : ${nomDe(h)} devient ${etoiles.length ? 'co-responsable (★)' : '★'} de « ${C.u.nom} »`;
    }
  }
  po.lien = lien;
  synchroniser(m, avant);
  return `« ${po.nom} » de « ${A.u.nom} » lié au ★ de « ${C.u.nom} »${suite}`;
}

/** Applique une modification de l'organigramme ; renvoie ce qui a été fait ('' : rien). */
export function appliquer(m: Monde, op: OpOrga): string {
  const msg = (() => {
    if (op.type === 'placer') return placer(m, op.qui, op.depuis, op.vers);
    if (op.type === 'lier') return lier(m, op.uniteId, op.posteId, op.lien, op.garde);
    const A = entite(m, op.uniteId);
    if (op.type === 'nouveauPoste') {
      const n = op.nom.trim();
      if (!n) throw new Error('Donne un nom au poste.');
      A.postes.push({ id: uid('po'), nom: n });
      return `Nouveau poste « ${n} » dans « ${A.u.nom} » : à pourvoir`;
    }
    const po = A.postes.find((x) => x.id === op.posteId);
    if (!po) throw new Error('Ce poste n’existe plus.');
    if (op.type === 'renommer') {
      const n = op.nom.trim();
      if (!n) throw new Error('Donne un nom au poste.');
      if (n === po.nom) return '';
      const t = po.titulaire ? A.d.people.find((x) => x.id === po.titulaire) : undefined;
      if (t) {
        enleverFonction(t, po.nom);
        ajouterFonction(t, n);
      }
      const ancien = po.nom;
      po.nom = n;
      return `Poste « ${ancien} » renommé « ${n} »`;
    }
    const t = retirerPoste(A.d, po);
    A.d.postes = A.postes.filter((x) => x.id !== po.id);
    const seul = t && !reste(A.d, t);
    if (t) liberer(A.d, t);
    return `Poste « ${po.nom} » supprimé de « ${A.u.nom} »${seul ? ` ; ${nomDe(t)} : ${t.actif ? benevolesDe(A.u.type).un : 'quitte l’entité'}` : ''}`;
  })();
  return msg && m.notes.length ? `${msg} · ⛓ ${m.notes.join(' · ')}` : msg;
}

/**
 * Personnes modifiées ailleurs que dans l'organigramme (leur fiche, la console admin…) dans l'entité `id` (`avant` :
 * ses données d'avant) : ses postes suivent, puis les postes liés, dans les deux sens. Modifie `m.data`.
 *  - Partie de l'entité : ses postes sont à pourvoir. Devenue simple bénévole (rôle) : aussi.
 *  - Fonction renommée sur sa fiche : son poste aussi ; fonction effacée : le poste est à pourvoir.
 *  - Nouvelle fonction (ou nouvelle personne) d'un membre du comité : son poste (celui du même nom s'il est à pourvoir).
 */
export function suivre(m: Monde, id: string, avant: AppData) {
  const u = m.units.find((x) => x.id === id);
  const d = m.data.get(id);
  if (!u || u.archive || !d?.postes) return;
  const postes = d.postes;
  const liens = etatLiens({ ...m, data: new Map(m.data).set(id, avant) });
  const ben = roleBenevole(d.roles);
  const benevole = (p: Person) => !p.roles.includes(ADMIN_ROLE_ID) && p.roles.length > 0 && p.roles.every((r) => r === ben) && ben !== roleResponsable(d.roles);
  const occuper = (p: Person, nom: string) => {
    if (GENERIQUE.test(nom) || postes.some((po) => po.titulaire === p.id && cle(po.nom) === cle(nom))) return;
    // Le titre d'un ★ (« Président ») n'est pas un poste.
    if (p.roles.includes(ADMIN_ROLE_ID) && cle(nom) === cle(p.poste)) return;
    const libre = postes.find((po) => !po.titulaire && cle(po.nom) === cle(nom));
    if (libre) libre.titulaire = p.id;
    else postes.push({ id: uid('po'), nom, titulaire: p.id });
  };
  for (const p of d.people) {
    const tient = postes.filter((po) => po.titulaire === p.id);
    const q = avant.people.find((x) => x.id === p.id && x.actif);
    if (!p.actif || (benevole(p) && !(q && benevole(q)))) {
      for (const po of tient) po.titulaire = undefined;
      continue;
    }
    if (benevole(p) || (p.viaEntite && !fonctionsDe(p).length)) continue;
    const apres = fonctionsDe(p);
    if (!q) {
      for (const nom of apres) occuper(p, nom);
      continue;
    }
    const avantF = fonctionsDe(q);
    const ajoutees = apres.filter((x) => !avantF.some((y) => cle(y) === cle(x)));
    for (const po of tient) {
      if (apres.some((x) => cle(x) === cle(po.nom))) continue;
      const nouveau = ajoutees.shift();
      if (nouveau) po.nom = nouveau;
      else po.titulaire = undefined;
    }
    for (const nom of ajoutees) occuper(p, nom);
  }
  synchroniser(m, liens);
}

/**
 * Lier ce poste au ★ de l'entité `lien` demande un choix : le poste a un titulaire, l'entité un autre ★ qui n'est pas
 * déjà lié par un autre poste (sinon le titulaire devient simplement co-responsable).
 */
export function conflitLien(units: OrgUnit[], uniteId: string, posteId: string, lien: string): { titulaire: string; etoile: string } | null {
  const a = units.find((u) => u.id === uniteId);
  const c = units.find((u) => u.id === lien);
  const po = a?.postes?.find((x) => x.id === posteId);
  const h = po?.titulaire ? a?.membres.find((x) => x.id === po.titulaire) : undefined;
  const etoiles = c?.membres.filter((x) => x.admin) ?? [];
  if (!a || !h || etoiles.some((e) => memeQui(e, h))) return null;
  const pris = (a.postes ?? []).flatMap((x) => (x.id !== posteId && x.lien === lien && x.titulaire ? a.membres.filter((y) => y.id === x.titulaire) : []));
  const libre = etoiles.find((e) => !pris.some((p) => memeQui(p, e)));
  return libre ? { titulaire: nomDe(h), etoile: nomDe(libre) } : null;
}
