import type { OrgMember, OrgUnit } from './types';
import { parentDans, UNIT_TYPES } from './units';
import { emailKey } from './membres';
import { fonctionsDe, nomDe, zonesFiche } from './organigramme';

// Organigramme par postes, en trois lignes, construit tout seul à partir des fiches des entités :
//  1. les comités (comité central, sous-comités), chacun dans un cadre relié aux autres : une carte par poste (le poste
//     en titre, le nom dessous) et une carte par groupe dont le responsable siège au comité (un poste du comité lié ⛓
//     au groupe) ; à droite, « Sans comité » : les groupes dont le responsable ne siège dans aucun comité ;
//  2. les groupes, chacun sous sa carte : ses postes et ses bénévoles (repliés) ;
//  3. les événements, sous le groupe qui les organise (un poste du groupe lié ⛓ à l'événement), sinon sous le cadre
//     du comité dont ils dépendent ; et la manifestation de chaque sous-comité qui a une date.
// Deux choses différentes : la liaison (un poste lié ⛓ : où est la carte du groupe, sous quel groupe est l'événement) et
// la dépendance (« Dépend de » de sa fiche, toujours un comité, le comité central sans choix : là où peuvent s'afficher
// ses tâches). Un groupe ou un événement affiché ailleurs que dans le comité dont il dépend le dit sur sa carte.

export const SANS = 'sans';
export const SANS_COMITE = '#64748b';

export type SorteCarte = 'titre' | 'poste' | 'groupe';

/** Une carte de la ligne 1 : un poste d'un comité (★ : le titre de sa fiche), ou un groupe qui dépend du comité. */
export interface CarteLigne1 {
  /** « t:entité:fiche » (★), « p:entité:poste » (poste), « g:groupe ». */
  cle: string;
  sorte: SorteCarte;
  /** Comité du cadre, ou « sans ». */
  cadre: string;
  /** Le comité (★, poste) ; le groupe (groupe). */
  uniteId: string;
  titre: string;
  /** Titulaire, ou les ★ du groupe ; vide : à pourvoir. */
  gens: OrgMember[];
  posteId?: string;
  /** Poste lié (⛓) au ★ d'une entité affichée ailleurs. */
  lien?: OrgUnit;
  /** Groupe : sa carte de la ligne 2. */
  groupe?: CarteEntite;
}

/** Une ligne de la carte d'un groupe ou d'un événement : un ★, ou un poste (titulaire ou à pourvoir). */
export interface LigneEntite {
  cle: string;
  titre: string;
  m?: OrgMember;
  etoile?: boolean;
  posteId?: string;
  lien?: string;
}

/** D'où part le trait vers une carte : une carte de la ligne 1 ou d'un groupe, ou le bas d'un cadre (« cadre:id »). */
export interface Ancre {
  cle: string;
  couleur: string;
}

/** Un groupe (ligne 2) ou un événement (ligne 3). */
export interface CarteEntite {
  /** « u:entité », « manif:comité ». */
  cle: string;
  u: OrgUnit;
  rang: 2 | 3;
  /** Manifestation d'un sous-comité (pas une entité à part : celle du cadre au-dessus). */
  manifestation?: boolean;
  lignes: LigneEntite[];
  benevoles: OrgMember[];
  ancre: Ancre;
  /** Événements qu'organise ce groupe. */
  enfants: CarteEntite[];
  /** Groupe ou événement affiché ailleurs que dans le cadre du comité dont il dépend : ce comité. */
  depend?: OrgUnit;
}

/** Une colonne d'un cadre : une carte et ce qu'elle porte en dessous, ou (sans carte) ce qui part du bas du cadre. */
export interface Colonne {
  cle: string;
  carte?: CarteLigne1;
  enfants: CarteEntite[];
}

export interface Cadre {
  /** Le comité, ou « sans ». */
  cle: string;
  u?: OrgUnit;
  titre: string;
  couleur: string;
  colonnes: Colonne[];
}

/** Où se place un groupe ou un événement : le cadre (comité, « sans »), le groupe qui organise un événement. */
export interface Place {
  /** Groupe : le comité où son responsable siège (poste lié ⛓), sinon « sans » ; événement : le cadre de ce qui l'organise. */
  cadre: string;
  groupe?: string;
  /** Le comité dont l'entité dépend (« Dépend de »). */
  depend?: string;
}

export interface PlanOrganigramme {
  cadres: Cadre[];
  /** Toutes les cartes de la ligne 1, par clé. */
  cartes: Map<string, CarteLigne1>;
  /** Cartes des groupes et des événements, par entité. */
  entites: Map<string, CarteEntite>;
  places: Map<string, Place>;
}

const estComite = (u: Pick<OrgUnit, 'type'>) => u.type === 'central' || u.type === 'sous-comite';
const cle = (s: string) => s.trim().toLowerCase();
const GENERIQUE = /^(b[ée]n[ée]vole|membre)s?\b/i;

/** Même personne d'une entité à l'autre : fiche du registre, sinon adresse, sinon nom (photos des années passées). */
export const quiDe = (m: OrgMember) => (m.membreId ? `m:${m.membreId}` : emailKey(m.email) ? `e:${emailKey(m.email)}` : `n:${cle(nomDe(m))}`);

/**
 * Les lignes d'une fiche : ses ★ (leur titre), puis ses postes dans l'ordre de la fiche (titulaire ou à pourvoir ; le
 * poste d'un ★ qui répète son titre n'est pas répété). Fiche sans postes (données d'avant) : les ★, puis les membres qui
 * ont une fonction autre que « Bénévole » ou « Membre ».
 */
export function lignesFiche(u: OrgUnit): LigneEntite[] {
  const chef = UNIT_TYPES[u.type].chef;
  const titreDe = (m: OrgMember) => m.poste?.trim() || chef;
  const l: LigneEntite[] = u.membres.filter((m) => m.admin).map((m) => ({ cle: `t:${u.id}:${m.id}`, titre: titreDe(m), m, etoile: true }));
  if (!u.postes) {
    for (const m of u.membres) {
      if (m.admin || m.viaEntite) continue;
      const f = fonctionsDe(m).filter((x) => !GENERIQUE.test(x));
      if (f.length) l.push({ cle: `p:${u.id}:${m.id}`, titre: f.join(' · '), m });
    }
    return l;
  }
  const parId = new Map(u.membres.map((m) => [m.id, m]));
  for (const p of u.postes) {
    const m = p.titulaire ? parId.get(p.titulaire) : undefined;
    if (m?.admin && cle(p.nom) === cle(titreDe(m))) continue;
    l.push({ cle: `p:${u.id}:${p.id}`, titre: p.nom, m, posteId: p.id, lien: p.lien });
  }
  return l;
}

/** Bénévoles d'une fiche : ni ★ ni titulaire d'un poste (sans postes : pas de fonction autre que « Bénévole »). */
export function benevolesFiche(u: OrgUnit): OrgMember[] {
  if (u.postes) return zonesFiche(u).benevoles;
  return u.membres.filter((m) => !m.admin && !m.viaEntite && !fonctionsDe(m).some((f) => !GENERIQUE.test(f)));
}

/** Les responsables d'une entité (★ et titulaires) et leurs postes, pour le profil d'une personne. */
export function responsablesDe(u: OrgUnit): { m?: OrgMember; fonctions: string[]; etoile: boolean }[] {
  const out: { m?: OrgMember; fonctions: string[]; etoile: boolean }[] = [];
  for (const l of lignesFiche(u)) {
    const r = l.m ? out.find((x) => x.m?.id === l.m!.id) : undefined;
    if (r) r.fonctions.push(l.titre);
    else out.push({ m: l.m, fonctions: [l.titre], etoile: !!l.etoile });
  }
  return out;
}

const trierComites = (units: OrgUnit[]) =>
  units.filter(estComite).sort((a, b) => (a.type === 'central' ? -1 : b.type === 'central' ? 1 : a.nom.localeCompare(b.nom, 'fr')));

/** Le comité dont dépend l'entité (« Dépend de ») ; sinon le comité central. */
export function comiteDe(units: OrgUnit[], u: OrgUnit): OrgUnit | undefined {
  return parentDans(units, u) ?? units.find((x) => x.type === 'central');
}

/** Comités (non archivés) qui ont un poste lié ⛓ à l'entité `id`, dans l'ordre de l'organigramme. */
const comitesLies = (units: OrgUnit[], id: string) => trierComites(units).filter((c) => !c.archive && c.postes?.some((p) => p.lien === id));
/** Groupes (non archivés) qui ont un poste lié ⛓ à l'événement `id` (ils l'organisent), par nom. */
const groupesLies = (units: OrgUnit[], id: string) =>
  units.filter((g) => g.type === 'groupe' && !g.archive && g.postes?.some((p) => p.lien === id)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

/**
 * Cadre de chaque groupe et événement (entités archivées exclues par l'appelant). Un groupe : le comité où l'un de ses
 * responsables a un poste lié (celui dont il dépend d'abord), sinon « Sans comité ». Un événement : sous le groupe qui
 * a un poste lié à lui (il l'organise), sinon sous le cadre du comité dont il dépend.
 */
export function placesEntites(units: OrgUnit[]): Map<string, Place> {
  const comites = trierComites(units);
  const places = new Map<string, Place>();
  for (const g of units.filter((u) => u.type === 'groupe')) {
    const depend = comiteDe(units, g)?.id;
    const lies = comitesLies(units, g.id);
    places.set(g.id, { cadre: (lies.find((c) => c.id === depend) ?? lies[0])?.id ?? SANS, depend });
  }
  for (const ev of units.filter((u) => u.type === 'equipe')) {
    const depend = comiteDe(units, ev)?.id;
    const g = groupesLies(units, ev.id).find((x) => places.has(x.id));
    places.set(ev.id, g ? { cadre: places.get(g.id)!.cadre, groupe: g.id, depend } : { cadre: depend ?? comites[0]?.id ?? SANS, depend });
  }
  return places;
}

/** Construit l'organigramme (entités archivées exclues par l'appelant). `sansVide` : le cadre « Sans comité » même vide. */
export function planOrganigramme(units: OrgUnit[], sansVide = false): PlanOrganigramme {
  const parId = new Map(units.map((u) => [u.id, u]));
  const comites = trierComites(units);
  const places = placesEntites(units);
  const couleurCadre = (k: string) => parId.get(k)?.couleur ?? SANS_COMITE;
  const entites = new Map<string, CarteEntite>();
  const carteEntite = (u: OrgUnit, rang: 2 | 3, ancre: Ancre): CarteEntite => {
    const e: CarteEntite = { cle: `u:${u.id}`, u, rang, lignes: lignesFiche(u), benevoles: benevolesFiche(u), ancre, enfants: [] };
    entites.set(u.id, e);
    return e;
  };

  // Ligne 1 : chaque groupe dans le cadre dont il dépend ; ligne 2 : sa carte.
  const cartes = new Map<string, CarteLigne1>();
  const parCadre = new Map<string, CarteLigne1[]>([...comites.map((c): [string, CarteLigne1[]] => [c.id, []]), [SANS, []]]);
  for (const g of units.filter((u) => u.type === 'groupe').sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
    const cadre = places.get(g.id)!.cadre;
    const k = `g:${g.id}`;
    const e = carteEntite(g, 2, { cle: k, couleur: couleurCadre(cadre) });
    const depend = places.get(g.id)!.depend;
    if (depend && depend !== cadre) e.depend = parId.get(depend);
    const c: CarteLigne1 = { cle: k, sorte: 'groupe', cadre, uniteId: g.id, titre: g.nom, gens: g.membres.filter((m) => m.admin), groupe: e };
    cartes.set(k, c);
    parCadre.get(cadre)!.push(c);
  }
  // Ligne 3 : les événements, sous leur groupe, sinon sous le cadre de leur comité.
  const sousCadre = new Map<string, CarteEntite[]>();
  for (const ev of units.filter((u) => u.type === 'equipe').sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || a.nom.localeCompare(b.nom, 'fr'))) {
    const p = places.get(ev.id)!;
    const g = p.groupe ? entites.get(p.groupe) : undefined;
    if (g) {
      const e = carteEntite(ev, 3, { cle: g.cle, couleur: g.u.couleur });
      if (p.depend && p.depend !== p.cadre) e.depend = parId.get(p.depend);
      g.enfants.push(e);
    } else sousCadre.set(p.cadre, [...(sousCadre.get(p.cadre) ?? []), carteEntite(ev, 3, { cle: `cadre:${p.cadre}`, couleur: couleurCadre(p.cadre) })]);
  }

  const cadres: Cadre[] = [];
  for (const c of comites) {
    // Ses postes ; un poste lié à un groupe affiché dans ce cadre : c'est la carte du groupe.
    const ici = (id?: string) => !!id && parId.get(id)?.type === 'groupe' && places.get(id)?.cadre === c.id;
    const postes = lignesFiche(c)
      .filter((l) => !ici(l.lien))
      .map((l): CarteLigne1 => ({ cle: l.cle, sorte: l.etoile ? 'titre' : 'poste', cadre: c.id, uniteId: c.id, titre: l.titre, gens: l.m ? [l.m] : [], posteId: l.posteId, lien: l.lien ? parId.get(l.lien) : undefined }));
    postes.forEach((p) => cartes.set(p.cle, p));
    const bas: CarteEntite[] = [];
    if (c.type === 'sous-comite' && c.date)
      bas.push({ cle: `manif:${c.id}`, u: c, rang: 3, manifestation: true, lignes: [], benevoles: [], ancre: { cle: `cadre:${c.id}`, couleur: c.couleur }, enfants: [] });
    bas.push(...(sousCadre.get(c.id) ?? []));
    cadres.push({ cle: c.id, u: c, titre: c.nom, couleur: c.couleur, colonnes: colonnes(ranger([...postes, ...parCadre.get(c.id)!], c.rangement), c.id, bas) });
  }
  const sans = parCadre.get(SANS)!;
  const basSans = sousCadre.get(SANS) ?? [];
  if (sans.length || basSans.length || sansVide) cadres.push({ cle: SANS, titre: 'Sans comité', couleur: SANS_COMITE, colonnes: colonnes(sans, SANS, basSans) });
  return { cadres, cartes, entites, places };
}

/** Cartes dans l'ordre choisi pour le cadre ; les autres (nouvelles) à la suite, dans leur ordre. */
function ranger(l: CarteLigne1[], ordre?: string[]): CarteLigne1[] {
  if (!ordre?.length) return l;
  const rang = new Map(ordre.map((k, i) => [k, i]));
  return l.map((c, i) => ({ c, i, r: rang.get(c.cle) ?? Infinity })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.c);
}

function colonnes(cartes: CarteLigne1[], cadre: string, bas: CarteEntite[]): Colonne[] {
  const l: Colonne[] = cartes.map((c) => ({ cle: `col:${c.cle}`, carte: c, enfants: c.groupe ? [c.groupe] : [] }));
  if (bas.length) l.push({ cle: `col:cadre:${cadre}`, enfants: bas });
  return l;
}

// ---------- Déplacer (glisser-déposer) ----------

/** Ce que fait une carte lâchée quelque part (ou choisie dans « Déplacer… »). */
export type ActionOrga =
  | { type: 'ranger'; comite: string; ordre: string[]; libelle: string }
  | {
      /**
       * Où siège le responsable d'un groupe : ses postes liés ⛓ changent de comité ; le groupe qui organise un
       * événement : un de ses postes lui est lié. La dépendance ne change pas.
       */
      type: 'liaison';
      u: OrgUnit;
      /** Le comité où il siégera (ou « sans »), le groupe qui organise l'événement. */
      vers: string;
      /** Postes liés à créer dans `vers` (leurs noms). */
      creer: string[];
      /** Postes liés retirés (ses responsables n'y siègent plus). */
      retirer: PosteLie[];
      libelle: string;
      ordre?: { comite: string; ordre: string[] };
    }
  /**
   * Un événement sous le cadre d'un comité : il en dépend (`vers` ; absent : il en dépend déjà) et quitte le groupe qui
   * l'organisait (ses postes liés ⛓ dans les groupes sont retirés).
   */
  | { type: 'dependance'; u: OrgUnit; vers?: string; retirer: PosteLie[]; libelle: string }
  | { type: 'poste'; de: OrgUnit; posteId: string; nom: string; titulaire?: OrgMember; vers: OrgUnit; libelle: string }
  | { type: 'etoile'; de: OrgUnit; m: OrgMember; vers: OrgUnit; libelle: string };

export interface PosteLie {
  /** L'entité du poste : un comité, ou le groupe qui organise un événement. */
  entite: string;
  posteId: string;
  nom: string;
}

/** Postes de ces entités liés ⛓ à l'entité `id`. */
const lies = (entites: OrgUnit[], id: string): PosteLie[] =>
  entites.flatMap((c) => (c.postes ?? []).filter((p) => p.lien === id).map((p) => ({ entite: c.id, posteId: p.id, nom: p.nom })));

/** Postes des comités (`dans` : de ce comité seulement) liés ⛓ à l'entité `id`. */
const postesLies = (units: OrgUnit[], id: string, dans?: string) => lies(comitesLies(units, id).filter((c) => !dans || c.id === dans), id);

// « les 2 postes ⛓ « Compétition » quittent « Comité central » » : un nom répété n'est écrit qu'une fois.
const noms = (l: PosteLie[]) => [...new Set(l.map((p) => `« ${p.nom} »`))].join(', ');
const postes = (l: PosteLie[], art = '') => (l.length > 1 ? `${art ? 'les ' : ''}${l.length} postes ⛓` : `${art}poste ⛓`);
function quittent(units: OrgUnit[], l: PosteLie[]): string {
  const ou = [...new Set(l.map((p) => `« ${units.find((x) => x.id === p.entite)?.nom ?? '?'} »`))].join(', ');
  return `${postes(l, 'le ')} ${noms(l)} ${l.length > 1 ? 'quittent' : 'quitte'} ${ou}`;
}

/**
 * Le groupe `u` (sa carte dans le cadre `de`) glissé dans le cadre `vers` : ses postes liés du comité `de` passent dans
 * `vers` (un nouveau poste lié à son nom s'il n'en avait pas) ; dans « Sans comité », tous ses postes liés s'en vont.
 */
function liaison(units: OrgUnit[], u: OrgUnit, de: string, vers: string, ordre?: { comite: string; ordre: string[] }): ActionOrga {
  const nomU = (id: string) => units.find((x) => x.id === id)?.nom ?? '?';
  if (vers === SANS) {
    const retirer = postesLies(units, u.id);
    return { type: 'liaison', u, vers, creer: [], retirer, libelle: `« ${u.nom} » : sans comité (${quittent(units, retirer)})` };
  }
  const retirer = de === SANS ? [] : postesLies(units, u.id, de);
  // Déjà lié dans `vers` (sa carte était ailleurs) : il n'y a qu'à retirer ceux de `de`.
  const creer = postesLies(units, u.id, vers).length ? [] : retirer.length ? retirer.map((p) => p.nom) : [u.nom];
  const libelle = !retirer.length
    ? `« ${u.nom} » : ${creer.length ? `nouveau poste ⛓ « ${creer[0]} » dans` : 'siège à'} « ${nomU(vers)} »`
    : `« ${u.nom} » : ${postes(retirer)} ${noms(retirer)} de « ${nomU(de)} » à « ${nomU(vers)} »`;
  return { type: 'liaison', u, vers, creer, retirer, libelle, ordre };
}

/**
 * L'événement `u` glissé sur le groupe `g` : un poste de `g` lui est lié ⛓ (créé à son nom s'il n'y en a pas), ceux
 * des autres groupes s'en vont. Sa dépendance ne change pas. null : il est déjà sous ce groupe.
 */
function organisePar(units: OrgUnit[], u: OrgUnit, g: OrgUnit): ActionOrga | null {
  const retirer = lies(groupesLies(units, u.id).filter((x) => x.id !== g.id), u.id);
  const deja = !!g.postes?.some((p) => p.lien === u.id);
  if (deja && !retirer.length) return null;
  const quoi = [...(deja ? [] : [`nouveau poste ⛓ « ${u.nom} » dans « ${g.nom} »`]), ...(retirer.length ? [quittent(units, retirer)] : [])];
  return { type: 'liaison', u, vers: g.id, creer: deja ? [] : [u.nom], retirer, libelle: `« ${u.nom} » organisé par « ${g.nom} » (${quoi.join(' ; ')})` };
}

/** Clés des cartes d'un cadre, dans l'ordre affiché. */
const clesCadre = (plan: PlanOrganigramme, cadre: string) => (plan.cadres.find((c) => c.cle === cadre)?.colonnes ?? []).flatMap((c) => (c.carte ? [c.carte.cle] : []));

/**
 * Ordre du cadre avec la carte `k` avant `avant` (à la fin sans `avant`) ; null : rien ne change. Sauf si elle y
 * arrive (`arrive`), une carte qui n'est pas affichée dans ce cadre ne s'y range pas.
 */
function ordreAvec(plan: PlanOrganigramme, cadre: string, k: string, avant?: string, arrive = false): string[] | null {
  const actuel = clesCadre(plan, cadre);
  if (!arrive && !actuel.includes(k)) return null;
  const l = actuel.filter((x) => x !== k);
  const i = avant ? l.indexOf(avant) : -1;
  l.splice(i < 0 ? l.length : i, 0, k);
  return l.join('\n') === actuel.join('\n') ? null : l;
}

/**
 * Carte `source` lâchée sur `cible` : ce qui se passera, ou null (rien à faire, ou pas possible).
 *  - source : « g:groupe » ou « u:entité » (groupe, événement), « p:entité:poste », « t:entité:fiche » (★) ;
 *  - cible : « carte:clé » (une carte de la ligne 1 : se placer avant elle), « cadre:comité » ou « cadre:sans »,
 *    « entite:id » (carte d'un groupe ou d'un événement ; manifestation d'un sous-comité : son cadre).
 * Un groupe change de comité où siège son responsable (ses postes liés ⛓ ; « Sans comité » : nulle part), sans changer
 * de dépendance ; un événement passe sous un groupe (un poste du groupe lui est lié ⛓, sans changer de dépendance) ou
 * sous un comité (il en dépend, et quitte son groupe) ; un poste change d'entité avec son
 * titulaire (un poste lié ⛓ reste où il est) ; un ★ devient ★ de l'autre entité ; dans son cadre, une carte se range.
 */
export function actionDepot(plan: PlanOrganigramme, units: OrgUnit[], source: string, cible: string): ActionOrga | null {
  const parId = new Map(units.map((u) => [u.id, u]));
  let cadre: string | undefined;
  let avant: string | undefined;
  let entite: OrgUnit | undefined;
  if (cible.startsWith('carte:')) {
    const c = plan.cartes.get(cible.slice(6));
    if (!c) return null;
    cadre = c.cadre;
    avant = c.cle;
  } else if (cible.startsWith('cadre:')) cadre = cible.slice(6);
  else if (cible.startsWith('entite:')) {
    const u = parId.get(cible.slice(7));
    if (!u) return null;
    if (estComite(u)) cadre = u.id;
    else entite = u;
  } else return null;
  if (cadre && cadre !== SANS && !parId.get(cadre)) return null;
  const comite = cadre && cadre !== SANS ? parId.get(cadre) : undefined;

  const [sorte, a, b] = source.split(':');
  if (sorte === 'g' || sorte === 'u') {
    const u = parId.get(a);
    if (!u || estComite(u)) return null;
    const ici = plan.places.get(u.id);
    if (!ici) return null;
    if (u.type === 'groupe') {
      if (!cadre) return null;
      const k = `g:${u.id}`;
      if (ici.cadre === cadre) {
        const ordre = cadre !== SANS && ordreAvec(plan, cadre, k, avant);
        return ordre ? { type: 'ranger', comite: cadre, ordre, libelle: 'Ranger ici' } : null;
      }
      const ordre = comite && avant ? ordreAvec(plan, cadre, k, avant, true) : null;
      return liaison(units, u, ici.cadre, cadre, ordre ? { comite: cadre, ordre } : undefined);
    }
    // Un événement : sous un groupe (un poste du groupe lui est lié), ou sous le cadre d'un comité (il en dépend).
    if (entite) return entite.type === 'groupe' ? organisePar(units, u, entite) : null;
    if (!comite) return null;
    const vers = ici.depend === comite.id ? undefined : comite.id;
    const retirer = ici.groupe ? lies(groupesLies(units, u.id), u.id) : [];
    if (!vers && !retirer.length) return null;
    const quitte = retirer.length ? ` (${quittent(units, retirer)})` : '';
    const libelle = vers ? `« ${u.nom} » dépend de « ${comite.nom} »${quitte}` : `« ${u.nom} » : plus organisé par un groupe${quitte}`;
    return { type: 'dependance', u, vers, retirer, libelle };
  }
  if (sorte !== 'p' && sorte !== 't') return null;
  const de = parId.get(a);
  if (!de) return null;
  const m = sorte === 't' ? de.membres.find((x) => x.id === b && x.admin) : undefined;
  const po = sorte === 'p' ? de.postes?.find((x) => x.id === b) : undefined;
  if (sorte === 't' ? !m : !po || po.lien) return null;
  // Vers : l'entité de la carte visée, ou le comité du cadre (« Sans comité » n'a pas de fiche où poser un poste).
  const vers = entite ?? comite;
  if (!vers) return null;
  if (vers.id === de.id) {
    if (!cadre || !estComite(de)) return null;
    const ordre = ordreAvec(plan, cadre, source, avant);
    return ordre ? { type: 'ranger', comite: cadre, ordre, libelle: 'Ranger ici' } : null;
  }
  if (m) return { type: 'etoile', de, m, vers, libelle: `★ ${nomDe(m)} : ${UNIT_TYPES[vers.type].chef.toLowerCase()} de « ${vers.nom} »` };
  if (!po) return null;
  const titulaire = po.titulaire ? de.membres.find((x) => x.id === po.titulaire) : undefined;
  return { type: 'poste', de, posteId: po.id, nom: po.nom, titulaire, vers, libelle: `Poste « ${po.nom} » dans « ${vers.nom} »` };
}

/** Les endroits où l'on peut déplacer une carte (« Déplacer… », sans glisser) : la cible et ce qui s'y fera. */
export function destinations(plan: PlanOrganigramme, units: OrgUnit[], source: string): { cible: string; action: ActionOrga }[] {
  const propre = plan.cartes.get(source.startsWith('u:') ? `g:${source.slice(2)}` : source);
  const cibles = [
    ...plan.cadres.map((c) => `cadre:${c.cle}`),
    ...[...plan.entites.keys()].map((id) => `entite:${id}`),
    // Dans son cadre : avant chacune des autres cartes.
    ...(propre ? clesCadre(plan, propre.cadre).filter((k) => k !== propre.cle).map((k) => `carte:${k}`) : []),
  ];
  const out: { cible: string; action: ActionOrga }[] = [];
  const vus = new Set<string>();
  for (const c of cibles) {
    const a = actionDepot(plan, units, source, c);
    if (!a) continue;
    const libelle = a.type === 'ranger' ? (c.startsWith('carte:') ? `Ranger avant « ${plan.cartes.get(c.slice(6))?.titre ?? '?'} »` : 'Ranger à la fin du cadre') : a.libelle;
    if (vus.has(libelle)) continue;
    vus.add(libelle);
    out.push({ cible: c, action: { ...a, libelle } });
  }
  return out;
}

// ---------- Disposition (de gauche à droite) ----------

export interface Mesures {
  /** Largeur d'une carte de la ligne 1, d'un groupe ou d'un événement. */
  carte: number;
  entite: number;
  /** Écart entre deux cartes côte à côte, entre deux colonnes d'un cadre, entre deux cadres ; marge intérieure d'un cadre. */
  ecart: number;
  ecartColonnes: number;
  ecartCadres: number;
  marge: number;
}

export const MESURES: Mesures = { carte: 164, entite: 210, ecart: 12, ecartColonnes: 16, ecartCadres: 48, marge: 12 };

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
  /** Bouton « replier » de chaque colonne ou groupe qui a des cartes en dessous : son milieu. */
  plis: Map<string, number>;
  largeur: number;
  /** Lignes utilisées (2 : aucun groupe, les événements montent d'une ligne). */
  rangs: (1 | 2 | 3)[];
}

/**
 * Cartes empilées au plus dans un cadre, selon le nombre de cartes qui n'ont rien en dessous : environ deux fois plus
 * de colonnes que de rangées (le cadre reste étroit ; 3 cartes ou moins : côte à côte).
 */
export const pileDe = (n: number) => (n <= 3 ? 1 : Math.ceil(Math.sqrt(n / 2)));

/**
 * Place les cartes de gauche à droite : chaque colonne prend la largeur de ce qu'elle porte en dessous (son groupe,
 * ses événements), la carte du dessus centrée. Les cartes qui n'ont rien en dessous s'empilent (voir pileDe), dans
 * l'ordre du cadre. `replies` : colonnes et groupes repliés. Un cadre vide garde la place d'une carte.
 */
export function disposer(plan: PlanOrganigramme, replies: Set<string>, me: Mesures = MESURES): Disposition {
  const positions = new Map<string, Position>();
  const cadres = new Map<string, { x: number; largeur: number }>();
  const plis = new Map<string, number>();
  const enfantsDe = (k: string, l: CarteEntite[]) => (replies.has(k) ? [] : l);
  const rangees = (l: CarteEntite[]) => l.reduce((n, e) => n + largeurEntite(e), 0) + Math.max(0, l.length - 1) * me.ecart;
  const largeurEntite = (e: CarteEntite): number => Math.max(me.entite, rangees(enfantsDe(e.cle, e.enfants)));
  const largeurColonne = (c: Colonne) => Math.max(c.carte ? me.carte : 0, rangees(enfantsDe(c.cle, c.enfants)));

  const placerEntites = (l: CarteEntite[], x: number, largeur: number) => {
    let cx = x + (largeur - rangees(l)) / 2;
    for (const e of l) {
      const w = largeurEntite(e);
      positions.set(e.cle, { cle: e.cle, rang: e.rang, x: cx + (w - me.entite) / 2, largeur: me.entite });
      if (e.enfants.length) plis.set(e.cle, cx + w / 2);
      placerEntites(enfantsDe(e.cle, e.enfants), cx, w);
      cx += w + me.ecart;
    }
  };

  // Une carte sans rien en dessous : empilable.
  const seule = (c: Colonne) => !!c.carte && !c.enfants.length;
  let x = 0;
  for (const c of plan.cadres) {
    const debut = x;
    x += me.marge;
    const pile = pileDe(c.colonnes.filter(seule).length);
    // Colonnes du cadre : une pile de cartes seules, ou une carte avec ce qu'elle porte.
    const piles: Colonne[][] = [];
    for (const col of c.colonnes) {
      const der = piles[piles.length - 1];
      if (seule(col) && der && seule(der[0]) && der.length < pile) der.push(col);
      else piles.push([col]);
    }
    piles.forEach((p, i) => {
      if (i) x += me.ecartColonnes;
      if (seule(p[0])) {
        p.forEach((col, j) => positions.set(col.carte!.cle, { cle: col.carte!.cle, rang: 1, x, largeur: me.carte, dessus: j ? p[j - 1].carte!.cle : undefined }));
        x += me.carte;
        return;
      }
      const col = p[0];
      const w = largeurColonne(col);
      if (col.carte) {
        positions.set(col.carte.cle, { cle: col.carte.cle, rang: 1, x: x + (w - me.carte) / 2, largeur: me.carte });
        if (col.enfants.length) plis.set(col.cle, x + w / 2);
      }
      placerEntites(enfantsDe(col.cle, col.enfants), x, w);
      x += w;
    });
    if (!piles.length) x += me.carte;
    x += me.marge;
    cadres.set(c.cle, { x: debut, largeur: x - debut });
    x += me.ecartCadres;
  }
  const rangsVus = new Set([...positions.values()].map((p) => p.rang));
  const rangs = ([1, 2, 3] as const).filter((r) => r === 1 || rangsVus.has(r));
  return { positions, cadres, plis, largeur: Math.max(0, x - me.ecartCadres), rangs };
}

/** Toutes les entités sous une colonne ou un groupe (repliées : leur nombre sur le bouton). */
export const descendants = (l: CarteEntite[]): number => l.reduce((n, e) => n + 1 + descendants(e.enfants), 0);
