import type { OrgMember, OrgUnit, Poste } from './types';
import { parentDans, UNIT_TYPES } from './units';
import { emailKey } from './membres';
import { fonctionsDe, nomDe, placesDu, zonesFiche } from './organigramme';

// Organigramme par postes, en trois lignes, construit tout seul à partir des fiches des entités :
//  1. les comités (comité central, sous-comités), chacun dans un cadre relié aux autres : une carte par poste (le poste
//     en titre, le nom dessous ; un poste à plusieurs : tous ses titulaires) et une carte par groupe dont le responsable siège au comité (un poste du comité lié ⛓
//     au groupe) ; à droite, « Sans comité » : les groupes dont le responsable ne siège dans aucun comité ;
//  2. les groupes, chacun sous sa carte : ses postes et ses bénévoles (repliés) ;
//  3. les événements, sous le groupe qui les organise (un poste du groupe lié ⛓ à l'événement), sinon sous le poste
//     d'un comité qui en est responsable (lié ⛓ à l'événement), sinon sous le cadre du comité dont ils dépendent (tout
//     le comité en est responsable) ; et la manifestation de chaque sous-comité qui a une date. Pour gagner de la
//     place, un événement indépendant (sous un poste, sous le cadre) se pose sous un groupe du cadre qui n'organise
//     aucun événement : son trait passe sous la carte du groupe (voir disposer).
// Deux choses différentes : la liaison (un poste lié ⛓ : où est la carte du groupe, sous quel groupe est l'événement) et
// la dépendance (« Dépend de » de sa fiche, toujours un comité, le comité central sans choix : là où peuvent s'afficher
// ses tâches). Un groupe ou un événement affiché ailleurs que dans le comité dont il dépend le dit sur sa carte.

export const SANS = 'sans';
export const SANS_COMITE = '#64748b';

export type SorteCarte = 'titre' | 'poste' | 'groupe';

/** Une personne d'une carte ou d'une ligne ; sur un poste : la place qu'elle y occupe (un poste à plusieurs : la sienne). */
export interface Titulaire {
  m: OrgMember;
  posteId?: string;
}

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
  /** Titulaires (un poste à plusieurs : tous), ou les ★ du groupe ; vide : à pourvoir. */
  gens: Titulaire[];
  /** Places du poste encore à pourvoir, à côté de ses titulaires. */
  vacants?: number;
  /** Le poste (à plusieurs : sa première place). */
  posteId?: string;
  /** Toutes les places du poste. */
  postes?: string[];
  /** Poste lié (⛓) au ★ d'une entité affichée ailleurs. */
  lien?: OrgUnit;
  /** Groupe : sa carte de la ligne 2. */
  groupe?: CarteEntite;
  /** Poste (★ : le poste de son titre) : les événements dont il est responsable (lié ⛓), en dessous. */
  evenements?: CarteEntite[];
}

/** Une ligne de la carte d'un groupe ou d'un événement : un ★, ou un poste (ses titulaires, ou à pourvoir). */
export interface LigneEntite {
  cle: string;
  titre: string;
  /** Le ★ ; les titulaires du poste (un poste à plusieurs : tous) ; vide : à pourvoir. */
  gens: Titulaire[];
  /** Places du poste encore à pourvoir, à côté de ses titulaires. */
  vacants?: number;
  etoile?: boolean;
  /** Le poste (à plusieurs : sa première place). */
  posteId?: string;
  /** Toutes les places du poste, dans l'ordre de la fiche. */
  postes?: string[];
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

/**
 * Où se place un groupe ou un événement : le cadre (comité, « sans ») ; le groupe qui organise un événement, sinon le
 * poste du comité qui en est responsable.
 */
export interface Place {
  /** Groupe : le comité où son responsable siège (poste lié ⛓), sinon « sans » ; événement : le cadre de ce qui l'organise. */
  cadre: string;
  groupe?: string;
  /** Événement : le poste du comité `cadre` qui lui est lié ⛓ (sa carte de la ligne 1 le porte). */
  poste?: string;
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
 * Les lignes d'une fiche : ses ★ (leur titre), puis ses postes dans l'ordre de la fiche (titulaires ou à pourvoir ; le
 * poste d'un ★ qui répète son titre n'est pas répété ; un poste à plusieurs, même nom et même lien : une ligne, à la
 * place de sa première place). Fiche sans postes (données d'avant) : les ★, puis les membres qui ont une fonction autre
 * que « Bénévole » ou « Membre ».
 */
export function lignesFiche(u: OrgUnit): LigneEntite[] {
  const chef = UNIT_TYPES[u.type].chef;
  const titreDe = (m: OrgMember) => m.poste?.trim() || chef;
  const l: LigneEntite[] = u.membres.filter((m) => m.admin).map((m) => ({ cle: `t:${u.id}:${m.id}`, titre: titreDe(m), gens: [{ m }], etoile: true }));
  if (!u.postes) {
    for (const m of u.membres) {
      if (m.admin || m.viaEntite) continue;
      const f = fonctionsDe(m).filter((x) => !GENERIQUE.test(x));
      if (f.length) l.push({ cle: `p:${u.id}:${m.id}`, titre: f.join(' · '), gens: [{ m }] });
    }
    return l;
  }
  const parId = new Map(u.membres.map((m) => [m.id, m]));
  const vus = new Set<string>();
  for (const p of u.postes) {
    if (vus.has(p.id)) continue;
    const toutes = placesDu(u.postes, p);
    toutes.forEach((x) => vus.add(x.id));
    const de = (x: typeof p) => (x.titulaire ? parId.get(x.titulaire) : undefined);
    const places = toutes.filter((x) => {
      const m = de(x);
      return !(m?.admin && cle(x.nom) === cle(titreDe(m)));
    });
    const gens = places.flatMap((x) => {
      const m = de(x);
      return m ? [{ m, posteId: x.id }] : [];
    });
    // Rien que des places à pourvoir à côté d'un ★ qui porte ce titre : il l'occupe déjà.
    if (!places.length || (!gens.length && places.length < toutes.length)) continue;
    const vacants = gens.length ? places.length - gens.length : 0;
    l.push({ cle: `p:${u.id}:${places[0].id}`, titre: places[0].nom, gens, ...(vacants ? { vacants } : {}), posteId: places[0].id, postes: places.map((x) => x.id), lien: places[0].lien });
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
    if (!l.gens.length) out.push({ fonctions: [l.titre], etoile: false });
    for (const { m } of l.gens) {
      const r = out.find((x) => x.m?.id === m.id);
      if (r) r.fonctions.push(l.titre);
      else out.push({ m, fonctions: [l.titre], etoile: !!l.etoile });
    }
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
 * a un poste lié à lui (il l'organise), sinon sous le poste d'un comité lié à lui (celui dont il dépend d'abord), sinon
 * sous le cadre du comité dont il dépend.
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
    const lies = comitesLies(units, ev.id);
    const c = lies.find((x) => x.id === depend) ?? lies[0];
    const po = c?.postes?.find((p) => p.lien === ev.id);
    places.set(
      ev.id,
      g ? { cadre: places.get(g.id)!.cadre, groupe: g.id, depend } : c && po ? { cadre: c.id, poste: po.id, depend } : { cadre: depend ?? comites[0]?.id ?? SANS, depend },
    );
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
    const c: CarteLigne1 = { cle: k, sorte: 'groupe', cadre, uniteId: g.id, titre: g.nom, gens: g.membres.filter((m) => m.admin).map((m) => ({ m })), groupe: e };
    cartes.set(k, c);
    parCadre.get(cadre)!.push(c);
  }
  // Ligne 3 : les événements, sous leur groupe, sinon sous le poste d'un comité (plus bas), sinon sous le cadre de leur comité.
  const sousCadre = new Map<string, CarteEntite[]>();
  const auPoste = new Map<string, OrgUnit[]>();
  const avecDepend = (e: CarteEntite, p: Place) => {
    if (p.depend && p.depend !== p.cadre) e.depend = parId.get(p.depend);
    return e;
  };
  for (const ev of units.filter((u) => u.type === 'equipe').sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || a.nom.localeCompare(b.nom, 'fr'))) {
    const p = places.get(ev.id)!;
    const g = p.groupe ? entites.get(p.groupe) : undefined;
    if (g) g.enfants.push(avecDepend(carteEntite(ev, 3, { cle: g.cle, couleur: g.u.couleur }), p));
    else if (p.poste) auPoste.set(p.cadre, [...(auPoste.get(p.cadre) ?? []), ev]);
    else sousCadre.set(p.cadre, [...(sousCadre.get(p.cadre) ?? []), carteEntite(ev, 3, { cle: `cadre:${p.cadre}`, couleur: couleurCadre(p.cadre) })]);
  }

  const cadres: Cadre[] = [];
  for (const c of comites) {
    // Ses postes ; un poste lié à un groupe affiché dans ce cadre : c'est la carte du groupe.
    const ici = (id?: string) => !!id && parId.get(id)?.type === 'groupe' && places.get(id)?.cadre === c.id;
    // Un poste lié à un événement : l'événement est sous sa carte (le lien n'est pas répété).
    const dessous = (l: LigneEntite) => !!l.lien && !!l.postes?.includes(places.get(l.lien)?.poste ?? '');
    const postes = lignesFiche(c)
      .filter((l) => !ici(l.lien))
      .map(
        (l): CarteLigne1 => ({
          cle: l.cle,
          sorte: l.etoile ? 'titre' : 'poste',
          cadre: c.id,
          uniteId: c.id,
          titre: l.titre,
          gens: l.gens,
          ...(l.vacants ? { vacants: l.vacants } : {}),
          posteId: l.posteId,
          postes: l.postes,
          lien: l.lien && !dessous(l) ? parId.get(l.lien) : undefined,
        }),
      );
    postes.forEach((p) => cartes.set(p.cle, p));
    const bas: CarteEntite[] = [];
    if (c.type === 'sous-comite' && c.date)
      bas.push({ cle: `manif:${c.id}`, u: c, rang: 3, manifestation: true, lignes: [], benevoles: [], ancre: { cle: `cadre:${c.id}`, couleur: c.couleur }, enfants: [] });
    // Événements dont un poste est responsable : sous sa carte (un poste qui répète le titre d'un ★ : sous la carte du ★).
    for (const ev of auPoste.get(c.id) ?? []) {
      const p = places.get(ev.id)!;
      const po = c.postes?.find((x) => x.id === p.poste);
      const carte = postes.find((x) => !!p.poste && !!x.postes?.includes(p.poste)) ?? postes.find((x) => x.sorte === 'titre' && !!po?.titulaire && x.gens[0]?.m.id === po.titulaire);
      const e = avecDepend(carteEntite(ev, 3, { cle: carte?.cle ?? `cadre:${c.id}`, couleur: c.couleur }), p);
      if (carte) (carte.evenements ??= []).push(e);
      else bas.push(e);
    }
    bas.push(...(sousCadre.get(c.id) ?? []));
    cadres.push({ cle: c.id, u: c, titre: c.nom, couleur: c.couleur, colonnes: colonnes(ranger([...postes, ...parCadre.get(c.id)!], c.rangement), c.id, bas) });
  }
  const sans = parCadre.get(SANS)!;
  const basSans = sousCadre.get(SANS) ?? [];
  if (sans.length || basSans.length || sansVide) cadres.push({ cle: SANS, titre: 'Sans comité', couleur: SANS_COMITE, colonnes: colonnes(sans, SANS, basSans) });
  return { cadres, cartes, entites, places };
}

/**
 * Cartes dans l'ordre choisi pour le cadre ; les autres (nouvelles) à la suite, dans leur ordre. Un poste à plusieurs :
 * le meilleur rang de ses places (rangées chacune à part avant d'être réunies sur une carte).
 */
function ranger(l: CarteLigne1[], ordre?: string[]): CarteLigne1[] {
  if (!ordre?.length) return l;
  const rang = new Map(ordre.map((k, i) => [k, i]));
  const rangDe = (c: CarteLigne1) => Math.min(rang.get(c.cle) ?? Infinity, ...(c.postes ?? []).map((id) => rang.get(`p:${c.uniteId}:${id}`) ?? Infinity));
  return l.map((c, i) => ({ c, i, r: rangDe(c) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.c);
}

function colonnes(cartes: CarteLigne1[], cadre: string, bas: CarteEntite[]): Colonne[] {
  const l: Colonne[] = cartes.map((c) => ({ cle: `col:${c.cle}`, carte: c, enfants: c.groupe ? [c.groupe] : (c.evenements ?? []) }));
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
       * événement, ou le poste d'un comité qui en est responsable : il lui est lié. La dépendance ne change pas.
       */
      type: 'liaison';
      u: OrgUnit;
      /** Le comité où il siégera (ou « sans »), le groupe qui organise l'événement, le comité du poste responsable. */
      vers: string;
      /** Postes liés à créer dans `vers` (leurs noms). */
      creer: string[];
      /** Poste de `vers` (déjà là ; à plusieurs : toutes ses places) à lier à l'événement. */
      lier?: PosteLie[];
      /** Postes liés retirés (ses responsables n'y siègent plus ; le groupe n'organise plus l'événement). */
      retirer: PosteLie[];
      /** Postes de comités qui ne sont plus liés à l'événement (ils restent, sans lien). */
      delier: PosteLie[];
      libelle: string;
      ordre?: { comite: string; ordre: string[] };
    }
  /**
   * Un événement sous le cadre d'un comité : il en dépend (`vers` ; absent : il en dépend déjà) et tout le comité en est
   * responsable : le groupe qui l'organisait le quitte (ses postes liés ⛓ sont retirés), les postes de comités qui en
   * étaient responsables n'y sont plus liés.
   */
  | { type: 'dependance'; u: OrgUnit; vers?: string; retirer: PosteLie[]; delier: PosteLie[]; libelle: string }
  /** Un poste (à plusieurs : toutes ses places, chacune avec son titulaire) change d'entité. */
  | { type: 'poste'; de: OrgUnit; nom: string; places: { posteId: string; titulaire?: OrgMember }[]; vers: OrgUnit; libelle: string }
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
const ouSont = (units: OrgUnit[], l: PosteLie[]) => [...new Set(l.map((p) => `« ${units.find((x) => x.id === p.entite)?.nom ?? '?'} »`))].join(', ');
function quittent(units: OrgUnit[], l: PosteLie[]): string {
  return `${postes(l, 'le ')} ${noms(l)} ${l.length > 1 ? 'quittent' : 'quitte'} ${ouSont(units, l)}`;
}
// « le poste ⛓ « Gruppetto » de « Comité central » n'est plus lié » : le poste reste.
const delies = (units: OrgUnit[], l: PosteLie[]) => `${postes(l, 'le ')} ${noms(l)} de ${ouSont(units, l)} ${l.length > 1 ? 'ne sont plus liés' : 'n’est plus lié'}`;
/** Ce que quittent les liens d'avant d'un événement : postes de groupes retirés, postes de comités déliés. */
const anciens = (units: OrgUnit[], retirer: PosteLie[], delier: PosteLie[]) => [
  ...(retirer.length ? [quittent(units, retirer)] : []),
  ...(delier.length ? [delies(units, delier)] : []),
];

/**
 * Le groupe `u` (sa carte dans le cadre `de`) glissé dans le cadre `vers` : ses postes liés du comité `de` passent dans
 * `vers` (un nouveau poste lié à son nom s'il n'en avait pas) ; dans « Sans comité », tous ses postes liés s'en vont.
 */
function liaison(units: OrgUnit[], u: OrgUnit, de: string, vers: string, ordre?: { comite: string; ordre: string[] }): ActionOrga {
  const nomU = (id: string) => units.find((x) => x.id === id)?.nom ?? '?';
  if (vers === SANS) {
    const retirer = postesLies(units, u.id);
    return { type: 'liaison', u, vers, creer: [], retirer, delier: [], libelle: `« ${u.nom} » : sans comité (${quittent(units, retirer)})` };
  }
  const retirer = de === SANS ? [] : postesLies(units, u.id, de);
  // Déjà lié dans `vers` (sa carte était ailleurs) : il n'y a qu'à retirer ceux de `de`.
  const creer = postesLies(units, u.id, vers).length ? [] : retirer.length ? retirer.map((p) => p.nom) : [u.nom];
  const libelle = !retirer.length
    ? `« ${u.nom} » : ${creer.length ? `nouveau poste ⛓ « ${creer[0]} » dans` : 'siège à'} « ${nomU(vers)} »`
    : `« ${u.nom} » : ${postes(retirer)} ${noms(retirer)} de « ${nomU(de)} » à « ${nomU(vers)} »`;
  return { type: 'liaison', u, vers, creer, retirer, delier: [], libelle, ordre };
}

/**
 * L'événement `u` glissé sur le groupe `g` : un poste de `g` lui est lié ⛓ (créé à son nom s'il n'y en a pas), ceux
 * des autres groupes s'en vont, ceux des comités n'y sont plus liés. Sa dépendance ne change pas. null : il est déjà
 * sous ce groupe.
 */
function organisePar(units: OrgUnit[], u: OrgUnit, g: OrgUnit): ActionOrga | null {
  const retirer = lies(groupesLies(units, u.id).filter((x) => x.id !== g.id), u.id);
  const delier = postesLies(units, u.id);
  const deja = !!g.postes?.some((p) => p.lien === u.id);
  if (deja && !retirer.length && !delier.length) return null;
  const quoi = [...(deja ? [] : [`nouveau poste ⛓ « ${u.nom} » dans « ${g.nom} »`]), ...anciens(units, retirer, delier)];
  return { type: 'liaison', u, vers: g.id, creer: deja ? [] : [u.nom], retirer, delier, libelle: `« ${u.nom} » organisé par « ${g.nom} » (${quoi.join(' ; ')})` };
}

/** Le poste d'une carte de la ligne 1 (★ : le poste de son titre, s'il y en a un). */
function posteDeCarte(units: OrgUnit[], c: CarteLigne1): Poste | undefined {
  const postes = units.find((x) => x.id === c.uniteId)?.postes;
  if (c.sorte === 'poste') return c.posteId ? postes?.find((p) => p.id === c.posteId) : undefined;
  const m = c.sorte === 'titre' ? c.gens[0]?.m : undefined;
  return m ? postes?.find((p) => p.titulaire === m.id && cle(p.nom) === cle(c.titre)) : undefined;
}

/**
 * L'événement `u` glissé sur le poste `po` du comité `c` : le poste en est responsable (il lui est lié ⛓) ; ceux des
 * groupes s'en vont, ceux des autres postes de comités n'y sont plus liés. Sa dépendance ne change pas. null : c'est
 * déjà le cas.
 */
function responsable(units: OrgUnit[], u: OrgUnit, c: OrgUnit, po: Poste): ActionOrga | null {
  // Un poste à plusieurs : toutes ses places (ses titulaires en seront ★, co-responsables).
  const places = placesDu(c.postes ?? [], po);
  const retirer = lies(groupesLies(units, u.id), u.id);
  const delier = postesLies(units, u.id).filter((p) => p.entite !== c.id || !places.some((x) => x.id === p.posteId));
  const deja = po.lien === u.id;
  if (deja && !retirer.length && !delier.length) return null;
  const quitte = anciens(units, retirer, delier);
  return {
    type: 'liaison',
    u,
    vers: c.id,
    creer: [],
    lier: deja ? undefined : places.map((x) => ({ entite: c.id, posteId: x.id, nom: x.nom })),
    retirer,
    delier,
    libelle: `« ${u.nom} » sous le poste « ${po.nom} » de « ${c.nom} »${quitte.length ? ` (${quitte.join(' ; ')})` : ''}`,
  };
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
 * de dépendance ; un événement passe sous un groupe (un poste du groupe lui est lié ⛓), sous un poste libre d'un comité
 * (lié ⛓ ; sans changer de dépendance l'un et l'autre) ou dans le cadre d'un comité (il en dépend, tout le comité en est
 * responsable) ; il quitte son responsable d'avant (postes de groupes retirés, de comités déliés) ; un poste change d'entité avec son
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
    // Un événement : sous un groupe (un poste du groupe lui est lié), sous le poste d'un comité (il lui est lié), ou
    // sous le cadre d'un comité (il en dépend, tout le comité en est responsable). Une autre carte : son cadre.
    const carte = cible.startsWith('carte:') ? plan.cartes.get(cible.slice(6)) : undefined;
    const groupe = carte?.sorte === 'groupe' ? parId.get(carte.uniteId) : entite;
    if (groupe) return groupe.type === 'groupe' ? organisePar(units, u, groupe) : null;
    const po = carte && comite && posteDeCarte(units, carte);
    if (po && comite && (!po.lien || po.lien === u.id)) return responsable(units, u, comite, po);
    if (!comite) return null;
    const vers = ici.depend === comite.id ? undefined : comite.id;
    const retirer = lies(groupesLies(units, u.id), u.id);
    const delier = postesLies(units, u.id);
    if (!vers && !retirer.length && !delier.length) return null;
    const quitte = anciens(units, retirer, delier);
    const libelle = `« ${u.nom} »${vers ? ` dépend de « ${comite.nom} » :` : ' :'} tout le comité${vers ? '' : ` « ${comite.nom} »`} en est responsable${quitte.length ? ` (${quitte.join(' ; ')})` : ''}`;
    return { type: 'dependance', u, vers, retirer, delier, libelle };
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
  // Un poste à plusieurs : toutes ses places, avec leurs titulaires.
  const places = placesDu(de.postes ?? [], po).map((x) => ({ posteId: x.id, titulaire: x.titulaire ? de.membres.find((y) => y.id === x.titulaire) : undefined }));
  return { type: 'poste', de, nom: po.nom, places, vers, libelle: `Poste « ${po.nom} » dans « ${vers.nom} »` };
}

/** Les endroits où l'on peut déplacer une carte (« Déplacer… », sans glisser) : la cible et ce qui s'y fera. */
export function destinations(plan: PlanOrganigramme, units: OrgUnit[], source: string): { cible: string; action: ActionOrga }[] {
  const propre = plan.cartes.get(source.startsWith('u:') ? `g:${source.slice(2)}` : source);
  const evenement = source.startsWith('u:') && plan.entites.get(source.slice(2))?.u.type === 'equipe';
  const cibles = [
    ...plan.cadres.map((c) => `cadre:${c.cle}`),
    // Un événement : aussi sous un poste d'un comité.
    ...(evenement ? [...plan.cartes.values()].filter((c) => c.sorte !== 'groupe').map((c) => `carte:${c.cle}`) : []),
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
  /**
   * Événements indépendants (sous un poste d'un comité, sous le cadre) posés sous un groupe du cadre pour gagner de la
   * place : l'événement → la carte du groupe (son trait passe sous elle).
   */
  heberges: Map<string, string>;
}

/**
 * Cartes empilées au plus dans un cadre, selon le nombre de cartes qui n'ont rien en dessous : environ deux fois plus
 * de colonnes que de rangées (le cadre reste étroit ; 3 cartes ou moins : côte à côte).
 */
export const pileDe = (n: number) => (n <= 3 ? 1 : Math.ceil(Math.sqrt(n / 2)));

/**
 * Place les cartes de gauche à droite : chaque colonne prend la largeur de ce qu'elle porte en dessous (son groupe,
 * ses événements), la carte du dessus centrée. Pour gagner de la place, un événement indépendant (sous un poste du
 * comité, sous le cadre) se pose sous le groupe le plus proche du cadre qui n'a pas d'événement à lui (la place est
 * libre) ; son trait passe sous la carte du groupe. Les cartes qui n'ont (plus) rien en dessous s'empilent (voir
 * pileDe ; `pileImposee` : autant de cartes empilées au plus, pour remplir un écran ou une page), dans l'ordre du cadre.
 * `replies` : colonnes et groupes repliés. Un cadre vide garde la place d'une carte.
 */
export function disposer(plan: PlanOrganigramme, replies: Set<string>, me: Mesures = MESURES, pileImposee?: number): Disposition {
  const positions = new Map<string, Position>();
  const cadres = new Map<string, { x: number; largeur: number }>();
  const plis = new Map<string, number>();
  const heberges = new Map<string, string>();
  const enfantsDe = (k: string, l: CarteEntite[]) => (replies.has(k) ? [] : l);
  const rangees = (l: CarteEntite[]) => l.reduce((n, e) => n + largeurEntite(e), 0) + Math.max(0, l.length - 1) * me.ecart;
  const largeurEntite = (e: CarteEntite): number => Math.max(me.entite, rangees(enfantsDe(e.cle, e.enfants)));

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

  let x = 0;
  for (const c of plan.cadres) {
    // Groupes du cadre (affichés) qui n'organisent aucun événement : la place sous eux est libre.
    const libres = c.colonnes.flatMap((col, j) => {
      const g = col.carte?.sorte === 'groupe' && !replies.has(col.cle) ? col.enfants[0] : undefined;
      return g && !g.enfants.length ? [{ col, j }] : [];
    });
    // Les événements indépendants, de gauche à droite, chacun sous le groupe libre le plus proche (repliés : à leur place).
    const hotes = new Map<string, CarteEntite[]>();
    const reste = new Map<string, CarteEntite[]>();
    c.colonnes.forEach((col, i) => {
      if (col.carte?.sorte === 'groupe' || replies.has(col.cle) || !libres.length) return;
      const garde = col.enfants.filter((e) => {
        if (!libres.length) return true;
        const n = libres.reduce((m, h, k) => (Math.abs(h.j - i) < Math.abs(libres[m].j - i) ? k : m), 0);
        const h = libres.splice(n, 1)[0];
        hotes.set(h.col.cle, [e]);
        heberges.set(e.cle, h.col.enfants[0].cle);
        return false;
      });
      if (garde.length < col.enfants.length) reste.set(col.cle, garde);
    });
    const sous = (col: Colonne) => reste.get(col.cle) ?? col.enfants;
    const largeurColonne = (col: Colonne) =>
      Math.max(col.carte ? me.carte : 0, rangees(enfantsDe(col.cle, sous(col))), rangees(hotes.get(col.cle) ?? []));
    // Une carte sans rien (plus rien) en dessous : empilable ; le bas du cadre sans plus rien : pas de colonne.
    const seule = (col: Colonne) => !!col.carte && !sous(col).length;
    const debut = x;
    x += me.marge;
    const pile = pileImposee ?? pileDe(c.colonnes.filter(seule).length);
    // Colonnes du cadre : une pile de cartes seules, ou une carte avec ce qu'elle porte.
    const piles: Colonne[][] = [];
    for (const col of c.colonnes) {
      if (!col.carte && !sous(col).length) continue;
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
        if (sous(col).length) plis.set(col.cle, x + w / 2);
      }
      placerEntites(enfantsDe(col.cle, sous(col)), x, w);
      placerEntites(hotes.get(col.cle) ?? [], x, w);
      x += w;
    });
    if (!piles.length) x += me.carte;
    x += me.marge;
    cadres.set(c.cle, { x: debut, largeur: x - debut });
    x += me.ecartCadres;
  }
  const rangsVus = new Set([...positions.values()].map((p) => p.rang));
  const rangs = ([1, 2, 3] as const).filter((r) => r === 1 || rangsVus.has(r));
  return { positions, cadres, plis, largeur: Math.max(0, x - me.ecartCadres), rangs, heberges };
}

/** Toutes les entités sous une colonne ou un groupe (repliées : leur nombre sur le bouton). */
export const descendants = (l: CarteEntite[]): number => l.reduce((n, e) => n + 1 + descendants(e.enfants), 0);
