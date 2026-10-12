import type { OrgMember, OrgUnit } from './types';
import { parentDans, UNIT_TYPES } from './units';
import { emailKey } from './membres';
import { fonctionsDe, nomDe, zonesFiche } from './organigramme';
import { posteBesideName } from './utils';

// Organigramme par personnes, en trois lignes, construit tout seul à partir des fiches des entités :
//  1. les comités (comité central, sous-comités), chacun dans un cadre, une carte par responsable avec ses postes dans
//     ce comité (une personne de deux comités a une carte dans chacun) ; à droite, « Sans comité » : les responsables
//     d'un groupe ou d'un événement qui ne sont dans aucun comité (cartes orphelines) ;
//  2. les groupes, chacun sous la carte de son responsable (★) ; deux responsables d'un même comité côte à côte
//     au-dessus de leur groupe ; d'un autre comité : un trait de la couleur de ce comité ;
//  3. les événements : les équipes d'événement, sous leur responsable, ou sous le groupe dont elles dépendent ; et la
//     manifestation de chaque sous-comité qui a une date, sous son président.
// Seuls les responsables y figurent : ★ et titulaires d'un poste (pas les bénévoles ni les simples membres).

/** Une personne de la ligne 1 : sa carte dans un comité (ou orpheline), ses fonctions dans ce comité. */
export interface CartePersonne {
  cle: string;
  /** Même personne d'une entité à l'autre (fiche du registre, adresse, sinon nom). */
  qui: string;
  /** Entité de la fiche (son comité ; carte orpheline : celle du premier groupe ou événement qu'elle dirige). */
  uniteId: string;
  m?: OrgMember;
  fonctions: string[];
  etoile: boolean;
  /** Poste à pourvoir (pas de titulaire) : son nom dans `fonctions`. */
  vacant?: boolean;
}

/** Une personne citée sur la carte d'un groupe ou d'un événement. */
export interface Responsable {
  m: OrgMember;
  fonctions: string[];
}

/** D'où part un trait vers une carte : une carte de personne, de groupe, ou le bas d'un cadre. */
export interface Ancre {
  cle: string;
  couleur: string;
}

/** Un groupe (ligne 2) ou un événement (ligne 3). */
export interface CarteEntite {
  cle: string;
  u: OrgUnit;
  rang: 2 | 3;
  /** Manifestation d'un sous-comité (pas une entité à part : celle du cadre au-dessus). */
  manifestation?: boolean;
  chefs: Responsable[];
  adjoints: Responsable[];
  /** Postes à pourvoir de l'entité. */
  vacants: string[];
  ancres: Ancre[];
  /** Événements qui dépendent de ce groupe. */
  enfants: CarteEntite[];
}

/** Des cartes côte à côte dans un cadre (responsables d'une même entité), et ce qu'elles dirigent en dessous. */
export interface Grappe {
  cle: string;
  cartes: CartePersonne[];
  enfants: CarteEntite[];
}

export interface Cadre {
  cle: string;
  /** Comité ; absent : « Sans comité ». */
  u?: OrgUnit;
  titre: string;
  couleur: string;
  grappes: Grappe[];
}

export interface PlanOrganigramme {
  cadres: Cadre[];
  /** Toutes les cartes de personnes, par clé. */
  personnes: Map<string, CartePersonne>;
}

export const SANS_COMITE = '#64748b';
const estComite = (u: OrgUnit) => u.type === 'central' || u.type === 'sous-comite';
const cle = (s: string) => s.trim().toLowerCase();

/** Même personne d'une entité à l'autre : fiche du registre, sinon adresse, sinon nom (photos des années passées). */
export const quiDe = (m: OrgMember) => (m.membreId ? `m:${m.membreId}` : emailKey(m.email) ? `e:${emailKey(m.email)}` : `n:${cle(nomDe(m))}`);

/** Fonctions sans doublon, sans celle qui répète le nom de la personne (fiches de la démo nommées d'après leur poste). */
function nettes(m: OrgMember | undefined, l: string[]): string[] {
  const nom = m ? `${m.prenom ?? ''} ${m.nom ?? ''}`.trim() : '';
  const vus = new Set<string>();
  return l.filter((x) => {
    const k = cle(x);
    if (!k || vus.has(k)) return false;
    vus.add(k);
    return !nom || !!posteBesideName(nom, x);
  });
}

const GENERIQUE = /^(b[ée]n[ée]vole|membre)s?\b/i;

/**
 * Les responsables d'une entité : ses ★ (avec leur titre et leurs postes), puis les titulaires de ses postes (tous leurs
 * postes sur une carte), et ses postes à pourvoir. Fiche sans postes (données d'avant) : les ★, puis les membres qui ont
 * une fonction autre que « Bénévole » ou « Membre ».
 */
export function responsablesDe(u: OrgUnit): { m?: OrgMember; fonctions: string[]; etoile: boolean }[] {
  const chef = UNIT_TYPES[u.type].chef;
  if (!u.postes) {
    const etoiles = u.membres.filter((m) => m.admin);
    const autres = u.membres.filter((m) => !m.admin && !m.viaEntite && fonctionsDe(m).some((f) => !GENERIQUE.test(f)));
    return [
      ...etoiles.map((m) => ({ m, etoile: true, fonctions: nettes(m, fonctionsDe(m).length ? fonctionsDe(m) : [chef]) })),
      ...autres.map((m) => ({ m, etoile: false, fonctions: nettes(m, fonctionsDe(m).filter((f) => !GENERIQUE.test(f))) })),
    ];
  }
  const z = zonesFiche(u);
  return [
    ...z.etoiles.map((l) => ({ m: l.m, etoile: true, fonctions: nettes(l.m, [l.m.poste?.trim() || chef, ...l.postes.map((p) => p.nom)]) })),
    ...z.lignes.map((l) => (l.m ? { m: l.m, etoile: false, fonctions: nettes(l.m, l.postes.map((p) => p.nom)) } : { etoile: false, fonctions: l.postes.map((p) => p.nom) })),
  ];
}

/** Construit l'organigramme par personnes (entités archivées exclues par l'appelant). */
export function planOrganigramme(units: OrgUnit[]): PlanOrganigramme {
  const parId = new Map(units.map((u) => [u.id, u]));
  const comites = units
    .filter(estComite)
    .sort((a, b) => (a.type === 'central' ? -1 : b.type === 'central' ? 1 : a.nom.localeCompare(b.nom, 'fr')));
  const personnes = new Map<string, CartePersonne>();
  // Cartes de chaque cadre, dans l'ordre de la fiche (★ d'abord).
  const cartesDe = new Map<string, CartePersonne[]>();
  for (const c of comites) {
    const l = responsablesDe(c).map((r, i): CartePersonne => {
      const k = r.m ? `${c.id}:${r.m.id}` : `${c.id}:vacant:${i}`;
      return { cle: k, qui: r.m ? quiDe(r.m) : k, uniteId: c.id, m: r.m, fonctions: r.fonctions, etoile: r.etoile, vacant: !r.m };
    });
    l.forEach((p) => personnes.set(p.cle, p));
    cartesDe.set(c.id, l);
  }
  const orphelines: CartePersonne[] = [];
  const cadreDe = (p: CartePersonne) => (p.cle.startsWith('orph:') ? 'sans' : p.uniteId);
  const couleurDe = (p: CartePersonne) => (p.cle.startsWith('orph:') ? SANS_COMITE : parId.get(p.uniteId)?.couleur ?? SANS_COMITE);
  /** Carte de la ligne 1 d'une personne : dans le comité dont dépend l'entité de préférence, sinon la première ; sinon orpheline. */
  const ancreDe = (m: OrgMember, depuis: OrgUnit, comite?: OrgUnit): CartePersonne => {
    const q = quiDe(m);
    const toutes = comites.flatMap((c) => cartesDe.get(c.id)!.filter((p) => p.qui === q));
    const choisie = toutes.find((p) => p.uniteId === comite?.id) ?? toutes[0];
    if (choisie) return choisie;
    let o = orphelines.find((p) => p.qui === q);
    if (!o) {
      o = { cle: `orph:${q}`, qui: q, uniteId: depuis.id, m, fonctions: [], etoile: false };
      orphelines.push(o);
      personnes.set(o.cle, o);
    }
    return o;
  };
  // Enfants de chaque ancre (carte de personne ou bas d'un cadre) : leur ancre principale.
  const sous = new Map<string, CarteEntite[]>();
  const accrocher = (k: string, e: CarteEntite) => sous.set(k, [...(sous.get(k) ?? []), e]);
  // Personnes d'un même cadre qui dirigent ensemble une entité : côte à côte (grappe).
  const ensemble: string[][] = [];

  const carteEntite = (u: OrgUnit, rang: 2 | 3): CarteEntite => {
    const r = responsablesDe(u);
    const chef = UNIT_TYPES[u.type].chef;
    return {
      cle: `u:${u.id}`,
      u,
      rang,
      chefs: r.filter((x) => x.etoile && x.m).map((x) => ({ m: x.m!, fonctions: x.fonctions.filter((f) => cle(f) !== cle(chef)) })),
      adjoints: r.filter((x) => !x.etoile && x.m).map((x) => ({ m: x.m!, fonctions: x.fonctions })),
      vacants: r.filter((x) => !x.m).flatMap((x) => x.fonctions),
      ancres: [],
      enfants: [],
    };
  };
  /** Traits depuis les cartes de ses ★ (ou le bas du cadre du comité dont elle dépend) ; la première porte l'entité. */
  const placerSousPersonnes = (e: CarteEntite, chefs: OrgMember[], comite: OrgUnit | undefined) => {
    const cartes: CartePersonne[] = [];
    for (const m of chefs) {
      const p = ancreDe(m, e.u, comite);
      if (!cartes.includes(p)) cartes.push(p);
    }
    if (!cartes.length) {
      const c = comite ?? comites[0];
      if (!c) return;
      e.ancres = [{ cle: `cadre:${c.id}`, couleur: c.couleur }];
      accrocher(`cadre:${c.id}`, e);
      return;
    }
    // Ancre principale : dans le comité dont dépend l'entité si l'un de ses ★ y est, sinon la première.
    const principale = cartes.find((p) => p.uniteId === comite?.id && cadreDe(p) !== 'sans') ?? cartes[0];
    const ordre = [principale, ...cartes.filter((p) => p !== principale)];
    e.ancres = ordre.map((p) => ({ cle: p.cle, couleur: couleurDe(p) }));
    const memeCadre = ordre.filter((p) => cadreDe(p) === cadreDe(principale)).map((p) => p.cle);
    if (memeCadre.length > 1) ensemble.push(memeCadre);
    accrocher(principale.cle, e);
  };
  /** Comité dont dépend une entité (en remontant les groupes et événements), sinon le comité central. */
  const comiteDe = (u: OrgUnit): OrgUnit | undefined => {
    for (let p = parentDans(units, u), n = 0; p && n <= units.length; p = parentDans(units, p), n++) if (estComite(p)) return p;
    return comites[0];
  };

  // Ligne 2 : les groupes.
  const groupes = new Map<string, CarteEntite>();
  for (const g of units.filter((u) => u.type === 'groupe').sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
    const e = carteEntite(g, 2);
    groupes.set(g.id, e);
    placerSousPersonnes(e, e.chefs.map((c) => c.m), comiteDe(g));
  }
  // Ligne 3 : les événements, sous le groupe dont ils dépendent, sinon sous leurs responsables.
  for (const ev of units.filter((u) => u.type === 'equipe').sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || a.nom.localeCompare(b.nom, 'fr'))) {
    const e = carteEntite(ev, 3);
    const p = parentDans(units, ev);
    const g = p?.type === 'groupe' ? groupes.get(p.id) : undefined;
    if (g) {
      e.ancres = [{ cle: g.cle, couleur: g.u.couleur }];
      g.enfants.push(e);
    } else placerSousPersonnes(e, e.chefs.map((c) => c.m), comiteDe(ev));
  }
  // Manifestation de chaque sous-comité daté : sous ses ★.
  for (const c of comites.filter((x) => x.type === 'sous-comite' && x.date)) {
    const etoiles = cartesDe.get(c.id)!.filter((p) => p.etoile);
    const e: CarteEntite = { cle: `manif:${c.id}`, u: c, rang: 3, manifestation: true, chefs: [], adjoints: [], vacants: [], ancres: [], enfants: [] };
    if (etoiles.length) {
      e.ancres = etoiles.map((p) => ({ cle: p.cle, couleur: c.couleur }));
      if (etoiles.length > 1) ensemble.push(etoiles.map((p) => p.cle));
      accrocher(etoiles[0].cle, e);
    } else {
      e.ancres = [{ cle: `cadre:${c.id}`, couleur: c.couleur }];
      accrocher(`cadre:${c.id}`, e);
    }
  }

  // Grappes : les cartes liées par une entité dirigée ensemble restent côte à côte, dans l'ordre de la fiche.
  const lien = new Map<string, string>();
  const racine = (k: string): string => {
    let r = k;
    while (lien.has(r)) r = lien.get(r)!;
    return r;
  };
  for (const l of ensemble) for (const k of l.slice(1)) if (racine(k) !== racine(l[0])) lien.set(racine(k), racine(l[0]));
  const grappes = (cartes: CartePersonne[], k: string): Grappe[] => {
    const out: Grappe[] = [];
    const faites = new Set<string>();
    for (const p of cartes) {
      if (faites.has(p.cle)) continue;
      const r = racine(p.cle);
      const g = cartes.filter((x) => !faites.has(x.cle) && racine(x.cle) === r);
      g.forEach((x) => faites.add(x.cle));
      out.push({ cle: `g:${g[0].cle}`, cartes: g, enfants: g.flatMap((x) => sous.get(x.cle) ?? []) });
    }
    // Entités sans responsable : sous le cadre de leur comité.
    const libres = sous.get(`cadre:${k}`);
    if (libres?.length) out.push({ cle: `g:cadre:${k}`, cartes: [], enfants: libres });
    return out;
  };
  const cadres: Cadre[] = comites.map((c) => ({ cle: c.id, u: c, titre: c.nom, couleur: c.couleur, grappes: grappes(cartesDe.get(c.id)!, c.id) }));
  if (orphelines.length) {
    for (const o of orphelines) o.fonctions = fonctionsOrpheline(o, units);
    cadres.push({ cle: 'sans', titre: 'Sans comité', couleur: SANS_COMITE, grappes: grappes(orphelines, 'sans') });
  }
  return { cadres, personnes };
}

/** Fonctions d'une carte orpheline : celles de ses fiches dans les entités qu'elle dirige (★). */
function fonctionsOrpheline(o: CartePersonne, units: OrgUnit[]): string[] {
  const l: string[] = [];
  for (const u of units) {
    const m = u.membres.find((x) => x.admin && quiDe(x) === o.qui);
    if (m) l.push(...(fonctionsDe(m).length ? fonctionsDe(m) : [UNIT_TYPES[u.type].chef]));
  }
  return nettes(o.m, l);
}

// ---------- Disposition (de gauche à droite) ----------

export interface Mesures {
  /** Largeur d'une carte de personne, d'un groupe ou d'un événement. */
  personne: number;
  entite: number;
  /** Écart entre deux cartes, entre deux grappes d'un cadre, entre deux cadres ; marge intérieure d'un cadre. */
  ecart: number;
  ecartGrappes: number;
  ecartCadres: number;
  marge: number;
  /** Cartes empilées au plus (personnes qui n'ont rien en dessous, côte à côte dans leur cadre). */
  pile: number;
}

export const MESURES: Mesures = { personne: 184, entite: 200, ecart: 12, ecartGrappes: 28, ecartCadres: 44, marge: 12, pile: 3 };

export interface Position {
  cle: string;
  rang: 1 | 2 | 3;
  /** Bord gauche. */
  x: number;
  largeur: number;
  /** Ligne 1, carte empilée : celle du dessus (la carte se pose juste en dessous). */
  dessus?: string;
}

export interface Disposition {
  positions: Map<string, Position>;
  /** Cadres : bord gauche et largeur. */
  cadres: Map<string, { x: number; largeur: number }>;
  /** Bouton « replier » de chaque grappe ou groupe qui a des cartes en dessous : son milieu. */
  plis: Map<string, number>;
  largeur: number;
  /** Lignes utilisées (2 : aucun groupe, les événements montent d'une ligne). */
  rangs: (1 | 2 | 3)[];
}

/**
 * Place les cartes de gauche à droite : chaque grappe prend la largeur de ce qu'elle porte en dessous (ses groupes,
 * leurs événements), les cartes au-dessus centrées sur leurs enfants. Les personnes qui n'ont rien en dessous
 * s'empilent (par `pile`, dans l'ordre de la fiche) pour que le cadre reste étroit. `replies` : grappes et groupes repliés.
 */
export function disposer(plan: PlanOrganigramme, replies: Set<string>, me: Mesures = MESURES): Disposition {
  const positions = new Map<string, Position>();
  const cadres = new Map<string, { x: number; largeur: number }>();
  const plis = new Map<string, number>();
  const enfantsDe = (k: string, l: CarteEntite[]) => (replies.has(k) ? [] : l);
  const rangees = (l: CarteEntite[]) => l.reduce((n, e) => n + largeurEntite(e), 0) + Math.max(0, l.length - 1) * me.ecart;
  const largeurEntite = (e: CarteEntite): number => Math.max(me.entite, rangees(enfantsDe(e.cle, e.enfants)));
  const largeurCartes = (g: Grappe) => g.cartes.length * me.personne + Math.max(0, g.cartes.length - 1) * me.ecart;
  const largeurGrappe = (g: Grappe) => Math.max(largeurCartes(g), rangees(enfantsDe(g.cle, g.enfants)), g.cartes.length ? 0 : me.entite);

  const placerEntites = (l: CarteEntite[], x: number, largeur: number) => {
    let cx = x + (largeur - rangees(l)) / 2;
    for (const e of l) {
      const w = largeurEntite(e);
      positions.set(e.cle, { cle: e.cle, rang: e.rang, x: cx + (w - me.entite) / 2, largeur: me.entite });
      const enfants = enfantsDe(e.cle, e.enfants);
      if (e.enfants.length) plis.set(e.cle, cx + w / 2);
      placerEntites(enfants, cx, w);
      cx += w + me.ecart;
    }
  };

  // Une carte seule, sans rien en dessous : empilable.
  const seule = (g: Grappe) => g.cartes.length === 1 && !g.enfants.length;
  let x = 0;
  for (const c of plan.cadres) {
    const debut = x;
    x += me.marge;
    // Colonnes du cadre : une pile de cartes seules, ou une grappe avec ce qu'elle porte.
    const colonnes: Grappe[][] = [];
    for (const g of c.grappes) {
      const der = colonnes[colonnes.length - 1];
      if (seule(g) && der && seule(der[0]) && der.length < me.pile) der.push(g);
      else colonnes.push([g]);
    }
    colonnes.forEach((col, i) => {
      if (i) x += me.ecartGrappes;
      if (col.length > 1 || seule(col[0])) {
        col.forEach((g, j) => positions.set(g.cartes[0].cle, { cle: g.cartes[0].cle, rang: 1, x, largeur: me.personne, dessus: j ? col[j - 1].cartes[0].cle : undefined }));
        x += me.personne;
        return;
      }
      const g = col[0];
      const w = largeurGrappe(g);
      let px = x + (w - largeurCartes(g)) / 2;
      for (const p of g.cartes) {
        positions.set(p.cle, { cle: p.cle, rang: 1, x: px, largeur: me.personne });
        px += me.personne + me.ecart;
      }
      if (g.enfants.length && g.cartes.length) plis.set(g.cle, x + w / 2);
      placerEntites(enfantsDe(g.cle, g.enfants), x, w);
      x += w;
    });
    x += me.marge;
    cadres.set(c.cle, { x: debut, largeur: x - debut });
    x += me.ecartCadres;
  }
  const rangsVus = new Set([...positions.values()].map((p) => p.rang));
  const rangs = ([1, 2, 3] as const).filter((r) => r === 1 || rangsVus.has(r));
  return { positions, cadres, plis, largeur: Math.max(0, x - me.ecartCadres), rangs };
}

/** Toutes les entités sous une grappe ou un groupe (repliées : leur nombre sur le bouton). */
export const descendants = (l: CarteEntite[]): number => l.reduce((n, e) => n + 1 + descendants(e.enfants), 0);
