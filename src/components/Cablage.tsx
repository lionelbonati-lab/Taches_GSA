import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useStore } from '../data/store';
import { useClub } from '../data/club';
import { emailKey } from '../data/membres';
import { norm } from '../data/csv';
import { directory, parentDans, personKey, UNIT_TYPES } from '../data/units';
import type { ClubMembre, OrgMember, OrgUnit } from '../data/types';
import { Initials, Modal } from './ui';

// Organigramme câblé : on tire un câble depuis une personne (d'une entité, ou de la liste « Personnes du club »)
// jusqu'à une entité pour en faire son responsable. Le câble suit la souris ou le doigt (poignée ● en mode « Câbler »).
// Ensuite, un câble reste dessiné de la ligne du responsable dans l'entité mère jusqu'à l'entité.
// Sans glisser : mode « Câbler », on touche la personne, puis « ★ Responsable » sous l'entité.
// Une personne peut ne faire partie d'aucune entité : registre, ou nouvelle (pas de câble, faute d'entité mère).

/** Une personne du club qu'on peut désigner : présente dans une entité, ou seulement au registre « Membres du club ». */
export interface Candidat {
  key: string;
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  couleur: string;
  membreId?: string;
  /** Où elle est déjà : « École de cyclisme (Moniteur), … » ; vide : dans aucune entité. */
  ou: string;
}

/** Ce qu'on a tiré ou choisi : une personne du club, ou une personne à ajouter. */
export type Source = Candidat | 'nouvelle';

export const nomCandidat = (c: Pick<Candidat, 'prenom' | 'nom' | 'email'>) => `${c.prenom} ${c.nom}`.trim() || c.email || '?';

/** Toutes les personnes du club : celles des entités (organigramme), puis celles du registre qui ne sont dans aucune. */
export function useCandidats(units: OrgUnit[], actif: boolean) {
  const club = useClub();
  const [registre, setRegistre] = useState<ClubMembre[]>([]);
  useEffect(() => {
    if (!actif || !club.membresAcces) return;
    let vivant = true;
    club
      .membres()
      .then((l) => vivant && setRegistre(l))
      .catch(() => {});
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, club.membresAcces]);
  return useMemo(() => {
    const dir = directory(units.filter((u) => !u.archive));
    const liste: Candidat[] = dir.map((e) => {
      const membreId = e.postes.find((x) => x.member.membreId)?.member.membreId ?? registre.find((m) => emailKey(m.email) && emailKey(m.email) === emailKey(e.email))?.id;
      return {
        key: e.key,
        prenom: e.prenom,
        nom: e.nom,
        email: e.email,
        telephone: e.telephone,
        couleur: e.couleur,
        membreId,
        ou: e.postes.map((x) => `${x.unit.nom}${x.member.poste ? ` (${x.member.poste})` : ''}`).join(', '),
      };
    });
    const pris = new Set(liste.flatMap((c) => [c.membreId, emailKey(c.email)].filter(Boolean)));
    for (const m of registre) {
      if (pris.has(m.id) || (emailKey(m.email) && pris.has(emailKey(m.email)))) continue;
      liste.push({ key: `m:${m.id}`, prenom: m.prenom, nom: m.nom, email: m.email, telephone: m.telephone, couleur: m.couleur, membreId: m.id, ou: '' });
    }
    return liste.sort((a, b) => nomCandidat(a).localeCompare(nomCandidat(b), 'fr'));
  }, [units, registre]);
}

/** La personne d'une ligne de l'organigramme, telle qu'on la désigne ailleurs. */
export const candidatDe = (candidats: Candidat[], u: OrgUnit, m: OrgMember): Candidat =>
  candidats.find((c) => c.key === personKey(m, u.id)) ?? {
    key: personKey(m, u.id),
    prenom: m.prenom,
    nom: m.nom,
    email: m.email,
    telephone: m.telephone,
    couleur: m.couleur,
    membreId: m.membreId,
    ou: u.nom,
  };

/** Entités où l'on peut désigner le responsable : pas le comité central (console admin), ni une entité archivée. */
export function useCablable() {
  const club = useClub();
  return (u: OrgUnit) => !u.archive && u.type !== 'central' && (club.canManage || u.moiAdmin);
}

/** Même personne dans deux entités : même fiche du registre, ou même adresse. */
export const memePersonne = (a: Pick<OrgMember, 'membreId' | 'email'>, b: Pick<OrgMember, 'membreId' | 'email'>) =>
  (!!a.membreId && a.membreId === b.membreId) || (!!emailKey(a.email) && emailKey(a.email) === emailKey(b.email));

/** Un câble : la ligne du responsable dans l'entité mère, et l'entité dont il est responsable. */
export interface LienResponsable {
  id: string;
  /** Entité mère, et la fiche du responsable dans celle-ci (ou le lien « 👥 » par lequel il en fait partie). */
  de: string;
  ligne: string;
  lien?: string;
  vers: string;
  couleur: string;
  titre: string;
}

/** Câbles de l'organigramme : chaque responsable (★) d'une entité qui fait aussi partie de son entité mère. */
export function liensResponsables(units: OrgUnit[]): LienResponsable[] {
  const out: LienResponsable[] = [];
  for (const u of units) {
    const mere = parentDans(units, u);
    if (!mere) continue;
    for (const m of u.membres) {
      if (!m.admin) continue;
      const pm = mere.membres.find((x) => memePersonne(x, m));
      if (!pm) continue;
      const nom = `${m.prenom} ${m.nom}`.trim() || m.poste;
      out.push({
        id: `${mere.id}|${pm.id}>${u.id}|${m.id}`,
        de: mere.id,
        ligne: pm.id,
        lien: pm.viaEntite,
        vers: u.id,
        couleur: u.couleur,
        titre: `${nom} : ${(m.poste || UNIT_TYPES[u.type].chef).toLowerCase()} de « ${u.nom} » (membre de « ${mere.nom} »)`,
      });
    }
  }
  return out;
}

/**
 * Organigramme à glisser-déposer (démo) : un câble par poste lié, de la ligne du poste jusqu'à l'entité liée
 * (dont le titulaire est le ★).
 */
export function liensPostes(units: OrgUnit[]): LienResponsable[] {
  const out: LienResponsable[] = [];
  for (const u of units) {
    for (const p of u.postes ?? []) {
      const c = p.lien ? units.find((x) => x.id === p.lien && x.id !== u.id) : undefined;
      if (!c) continue;
      const m = p.titulaire ? u.membres.find((x) => x.id === p.titulaire) : undefined;
      out.push({
        id: `${u.id}|poste:${p.id}>${c.id}`,
        de: u.id,
        ligne: `poste:${p.id}`,
        vers: c.id,
        couleur: c.couleur,
        titre: `⛓ ${p.nom} de « ${u.nom} » = ★ de « ${c.nom} » : ${m ? `${m.prenom} ${m.nom}`.trim() || m.poste : 'à pourvoir'}`,
      });
    }
  }
  return out;
}

export type Point = [number, number];
interface Trace { id: string; d: string; s: Point; t: Point; couleur: string; titre: string; de: string; ligne: string; vers: string }

/** Chemin à angles droits arrondis passant par `points`. */
export function chemin(points: Point[], rayon = 7) {
  const p = points.filter((q, i) => i === 0 || q[0] !== points[i - 1][0] || q[1] !== points[i - 1][1]);
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [ax, ay] = p[i - 1];
    const [bx, by] = p[i];
    const [cx, cy] = p[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay);
    const l2 = Math.hypot(cx - bx, cy - by);
    const r = Math.min(rayon, l1 / 2, l2 / 2);
    d += ` L${f(bx - ((bx - ax) / l1) * r)},${f(by - ((by - ay) / l1) * r)} Q${f(bx)},${f(by)} ${f(bx + ((cx - bx) / l2) * r)},${f(by + ((cy - by) / l2) * r)}`;
  }
  const z = p[p.length - 1];
  return `${d} L${f(z[0])},${f(z[1])}`;
}

/** Écart entre deux câbles parallèles (de haut en bas). */
const PAS = 9;
/** En liste (téléphone) : écart entre deux voies, à droite des cartes. */
const PAS_LISTE = 5;
/** Sous une entité mère d'où partent n câbles : de la carte à la barre de l'arbre (un niveau par câble, puis 18 px). */
export const bandeCables = (n: number) => 18 + n * PAS;
/** En liste : place à droite des cartes pour n câbles. */
export const margeCables = (n: number) => Math.min(44, 12 + n * PAS_LISTE);

type Boite = { l: number; r: number; t: number; b: number };
/** Un câble à tracer : ligne du responsable (hauteur y) dans l'entité mère a, vers l'entité c. */
interface Prevu { l: LienResponsable; y: number; a: Boite; c: Boite; gauche: boolean }
/** Segment d'un câble : horizontal à la hauteur v (de..a en x), ou vertical à l'abscisse v (de..a en y). */
type Segment = { h: boolean; v: number; de: number; a: number };

const segments = (p: Point[]): Segment[] =>
  p.slice(1).map((q, i) => {
    const o = p[i];
    return o[0] === q[0] && o[1] !== q[1]
      ? { h: false, v: o[0], de: Math.min(o[1], q[1]), a: Math.max(o[1], q[1]) }
      : { h: true, v: o[1], de: Math.min(o[0], q[0]), a: Math.max(o[0], q[0]) };
  });
const coupe = (s: Segment, t: Segment) => {
  if (s.h === t.h) return false;
  const [h, v] = s.h ? [s, t] : [t, s];
  return v.v > h.de + 0.5 && v.v < h.a - 0.5 && h.v > v.de + 0.5 && h.v < v.a - 0.5;
};
/** Nombre de croisements entre ces câbles. */
function croisements(chemins: Point[][]) {
  const segs = chemins.map(segments);
  let n = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) for (const s of segs[i]) for (const t of segs[j]) if (coupe(s, t)) n++;
  return n;
}
const permutations = <T,>(l: T[]): T[][] => (l.length <= 1 ? [l] : l.flatMap((x, i) => permutations([...l.slice(0, i), ...l.slice(i + 1)]).map((p) => [x, ...p])));
const factorielle = (n: number): number => (n <= 1 ? 1 : n * factorielle(n - 1));
const entre = (v: number, a: number, b: number) => v > Math.min(a, b) + 0.5 && v < Math.max(a, b) - 0.5;

/**
 * Câbles d'une même entité mère (de haut en bas) : chacun sort de la ligne du responsable par le côté de la carte,
 * descend dans sa voie le long de la carte, longe le dessous de la carte à son niveau (au-dessus de la barre de
 * l'arbre), puis entre par le haut de l'entité. Voies et niveaux sont espacés de PAS et choisis pour que les câbles
 * ne se croisent pas : la ligne la plus basse contre la carte, puis les niveaux dans l'ordre que demandent les
 * voies et les entrées traversées ; s'il reste des croisements, d'autres ordres sont essayés.
 */
function routerMere(cables: Prevu[], autres: Boite[]): Point[][] {
  const a = cables[0].a;
  const n = cables.length;
  const cotes = [true, false].map((g) => cables.flatMap((p, i) => (p.gauche === g ? [i] : [])));
  // Autres cartes à côté (même hauteur) : les voies se resserrent pour tenir dans l'espace libre.
  const pas = cotes.map((ids, j) => {
    if (!ids.length) return PAS;
    const [haut, bas] = [Math.min(...ids.map((i) => cables[i].y)) - 4, a.b + n * PAS + 4];
    const ecarts = autres.filter((o) => o.b > haut && o.t < bas && (j === 0 ? o.r <= a.l + 0.5 : o.l >= a.r - 0.5)).map((o) => (j === 0 ? a.l - o.r : o.l - a.r));
    return Math.max(3, Math.min(PAS, Math.floor((Math.min(Infinity, ...ecarts) - 6) / ids.length)));
  });
  const voies = (gauche: number[], droite: number[]) => {
    const x: number[] = [];
    gauche.forEach((i, r) => (x[i] = a.l - pas[0] * (r + 1)));
    droite.forEach((i, r) => (x[i] = a.r + pas[1] * (r + 1)));
    return x;
  };
  // Entrée dans l'entité, du côté d'où vient le câble ; le k-ième câble venant de ce côté entre k pas plus loin du milieu.
  const entree = (i: number, x: number, k: number) => {
    const { c } = cables[i];
    const milieu = (c.l + c.r) / 2;
    return milieu + (x > milieu ? 1 : -1) * (Math.min(32, (c.r - c.l) / 4) + PAS * k);
  };
  // ordres : de la voie contre la carte à la plus extérieure (gauche, droite), et du niveau le plus haut au plus bas.
  const tracer1 = (gauche: number[], droite: number[], niveaux: number[]) => {
    const x = voies(gauche, droite);
    const h: number[] = [];
    niveaux.forEach((i, r) => (h[i] = Math.min(cables[i].c.t - 6, a.b + PAS * (r + 1))));
    // Vers une même entité, d'un même côté : le câble le plus haut va le plus loin (plus près du milieu), sans croiser les autres.
    const k: number[] = [];
    const vus = new Map<string, number>();
    for (const i of niveaux) {
      const cle = `${cables[i].l.vers}|${x[i] > (cables[i].c.l + cables[i].c.r) / 2}`;
      k[i] = vus.get(cle) ?? 0;
      vus.set(cle, k[i] + 1);
    }
    return cables.map(({ y }, i): Point[] => {
      const tx = entree(i, x[i], k[i]);
      return [[cables[i].gauche ? a.l : a.r, y], [x[i], y], [x[i], h[i]], [tx, h[i]], [tx, cables[i].c.t]];
    });
  };
  // Voies : la ligne la plus basse contre la carte (sa sortie ne coupe aucune voie).
  let [g, d] = cotes.map((ids) => [...ids].sort((i, j) => cables[j].y - cables[i].y));
  // Niveaux : le câble qui passe sous la voie d'un autre est plus bas que lui ; celui qui passe au-dessus de l'entrée
  // d'un autre est plus haut. Dans le doute, le plus long trajet en haut.
  const x = voies(g, d);
  const t = cables.map((_, i) => entree(i, x[i], 0));
  const dessus = cables.map((_, j) => cables.map((_, i) => i !== j && (entre(x[j], x[i], t[i]) || (cables[i].l.vers !== cables[j].l.vers && entre(t[i], x[j], t[j])))));
  // dessus[j][i] : j doit être au-dessus de i.
  const reste = new Set(cables.map((_, i) => i));
  let lv: number[] = [];
  while (reste.size) {
    const attente = (i: number) => [...reste].filter((j) => dessus[j][i]).length;
    const i = [...reste].sort((p, q) => attente(p) - attente(q) || Math.abs(t[q] - x[q]) - Math.abs(t[p] - x[p]) || p - q)[0];
    lv.push(i);
    reste.delete(i);
  }
  let meilleur = tracer1(g, d, lv);
  let cout = croisements(meilleur);
  if (!cout) return meilleur;
  if (factorielle(g.length) * factorielle(d.length) * factorielle(n) <= 720) {
    for (const pg of permutations(g))
      for (const pd of permutations(d))
        for (const pl of permutations(lv)) {
          const e = tracer1(pg, pd, pl);
          const c = croisements(e);
          if (c < cout) [meilleur, cout] = [e, c];
          if (!cout) return meilleur;
        }
    return meilleur;
  }
  // Sinon : des échanges (deux voies d'un côté, ou deux niveaux) tant que ça diminue les croisements.
  for (let tour = 0; tour < 30 && cout; tour++) {
    const ordres = [g, d, lv];
    let suite = ordres;
    for (let q = 0; q < 3; q++)
      for (let i = 0; i < ordres[q].length; i++)
        for (let j = i + 1; j < ordres[q].length; j++) {
          const o = [...ordres[q]];
          [o[i], o[j]] = [o[j], o[i]];
          const essai = ordres.map((e, r) => (r === q ? o : e));
          const e = tracer1(essai[0], essai[1], essai[2]);
          const c = croisements(e);
          if (c < cout) [meilleur, cout, suite] = [e, c, essai];
        }
    if (suite === ordres) break;
    [g, d, lv] = suite;
  }
  return meilleur;
}

/**
 * En liste (téléphone) : les câbles longent les cartes à droite et entrent par le côté droit de l'entité.
 * Un câble dont le trajet en contient un autre prend une voie plus à l'extérieur : ils s'emboîtent sans se croiser.
 * Vers une même entité, le câble venu de plus haut entre plus bas.
 */
function routerListe(cables: Prevu[], droite: number): Point[][] {
  const k: number[] = [];
  const vus = new Map<string, number>();
  for (const i of cables.map((_, i) => i).sort((i, j) => cables[j].y - cables[i].y)) {
    k[i] = vus.get(cables[i].l.vers) ?? 0;
    vus.set(cables[i].l.vers, k[i] + 1);
  }
  const bas = cables.map((p, i) => p.c.t + 22 + PAS * k[i]);
  const ordre = cables.map((_, i) => i).sort((i, j) => bas[i] - cables[i].y - (bas[j] - cables[j].y));
  const voie: number[] = [];
  ordre.forEach((i, r) => {
    voie[i] = 0;
    for (const j of ordre.slice(0, r)) if (cables[j].y < bas[i] && cables[i].y < bas[j]) voie[i] = Math.max(voie[i], voie[j] + 1);
  });
  return cables.map((p, i) => {
    const x = droite + 7 + PAS_LISTE * voie[i];
    return [[p.a.r, p.y], [x, p.y], [x, bas[i]], [p.c.r, bas[i]]];
  });
}

/**
 * Vers une entité qui n'est pas en dessous (à côté, au-dessus) : par le côté de la carte, au-dessus des deux cartes,
 * puis dans l'entité par le haut. Le k-ième de ces câbles d'une même carte passe k pas plus loin.
 */
function routerAutre(p: Prevu, k: number): Point[] {
  const { a, c, y } = p;
  const gauche = (c.l + c.r) / 2 < (a.l + a.r) / 2;
  const x = gauche ? a.l - PAS * (k + 1) : a.r + PAS * (k + 1);
  const h = Math.min(c.t, a.t) - 12 - PAS * k;
  const tx = (c.l + c.r) / 2 + (gauche ? 1 : -1) * (Math.min(32, (c.r - c.l) / 4) + PAS * k);
  return [[gauche ? a.l : a.r, y], [x, y], [x, h], [tx, h], [tx, c.t]];
}

/** Un câble vu depuis l'entité mère : rang de la ligne du responsable ; côté (grande carte : sa colonne ; sinon null). */
export type Depart = { rang: number; gauche: boolean | null };

/**
 * Ordre des entités sous leur mère pour que leurs câbles se croisent le moins (routerMere, routerListe).
 * De haut en bas, d'un même côté, la ligne la plus haute va vers l'entité la plus à l'extérieur, et les câbles de
 * gauche vont plus à gauche que ceux de droite ; sans grande carte, la première moitié des entités est à gauche.
 * En liste, la ligne la plus haute va vers l'entité la plus éloignée. `depart` : les câbles de chaque entité reliée,
 * `ordre` : leur ordre de départ. Renvoie le meilleur ordre et la place des entités sans câble (`milieu`).
 */
export function ordreDesEntites(ordre: string[], depart: Map<string, Depart[]>, liste: boolean): { ordre: string[]; milieu: number } {
  const m = ordre.length;
  const s = Math.floor(m / 2);
  const cout = (o: string[]) => {
    const c = o.flatMap((id, p) => (depart.get(id) ?? []).map((d) => ({ id, p, rang: d.rang, g: d.gauche ?? p < s })));
    let n = 0;
    for (let i = 0; i < c.length; i++)
      for (let j = i + 1; j < c.length; j++) {
        const [a, b] = c[i].rang <= c[j].rang ? [c[i], c[j]] : [c[j], c[i]];
        if (a.id === b.id || a.rang === b.rang) continue;
        // a : la ligne la plus haute.
        if (liste) n += a.p < b.p ? 1 : 0;
        else if (a.g === b.g) n += a.g === a.p > b.p ? 1 : 0;
        else n += (a.g ? b.p < a.p : a.p < b.p) ? 1 : 0;
      }
    return n;
  };
  let meilleur = ordre;
  let min = cout(ordre);
  if (min && m <= 7) {
    for (const o of permutations(ordre)) {
      const c = cout(o);
      if (c < min) [meilleur, min] = [o, c];
      if (!min) break;
    }
  } else {
    // Beaucoup d'entités : déplacer une entité ailleurs tant que ça diminue les croisements.
    for (let tour = 0; tour < 20 && min; tour++) {
      let mieux = false;
      for (let i = 0; i < m; i++)
        for (let j = 0; j < m; j++) {
          if (i === j) continue;
          const o = [...meilleur];
          o.splice(j, 0, ...o.splice(i, 1));
          const c = cout(o);
          if (c < min) [meilleur, min, mieux] = [o, c, true];
        }
      if (!mieux) break;
    }
  }
  if (liste) return { ordre: meilleur, milieu: m };
  // Grande carte : les entités sans câble entre celles reliées surtout à gauche et celles reliées surtout à droite.
  if ([...depart.values()].flat().some((d) => d.gauche !== null)) {
    const g = meilleur.map((id) => (depart.get(id) ?? []).reduce((n, d) => n + (d.gauche ? 1 : -1), 0));
    let [milieu, pire] = [0, Infinity];
    for (let k = 0; k <= m; k++) {
      const mal = g.slice(0, k).filter((x) => x < 0).length + g.slice(k).filter((x) => x > 0).length;
      if (mal < pire) [milieu, pire] = [k, mal];
    }
    return { ordre: meilleur, milieu };
  }
  return { ordre: meilleur, milieu: s };
}

/** Tracé des câbles sur le plan de l'arbre : de haut en bas, par entité mère (routerMere) ; en liste, à droite (routerListe). */
function tracer(plan: HTMLElement, liens: LienResponsable[], vertical: boolean): Trace[] {
  const base = plan.getBoundingClientRect();
  const rel = (e: Element): Boite => {
    const r = e.getBoundingClientRect();
    return { l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top };
  };
  const trouver = (sel: string) => plan.querySelector(sel);
  const ligne = (de: string, id: string) => trouver(`[data-ligne="${CSS.escape(`${de}|${id}`)}"]`);
  const cartes = [...plan.querySelectorAll<HTMLElement>('[data-noeud]')].map((e) => ({ id: e.dataset.noeud ?? '', ...rel(e) }));
  const parLigne = new Map<Element, Prevu[]>();
  const prevus = liens.flatMap((l): Prevu[] => {
    const src = ligne(l.de, l.ligne) ?? (l.lien ? ligne(l.de, `lien:${l.lien}`) : null);
    const mere = trouver(`[data-noeud="${CSS.escape(l.de)}"]`);
    const cible = trouver(`[data-noeud="${CSS.escape(l.vers)}"]`);
    if (!src || !mere || !cible) return [];
    const s = rel(src);
    const a = rel(mere);
    const c = rel(cible);
    // Côté de sortie : celui de l'entité ; sur une grande carte (deux colonnes), celui de la colonne de la personne.
    const gauche = (mere.classList.contains('grande') ? (s.l + s.r) / 2 : (c.l + c.r) / 2) < (a.l + a.r) / 2;
    const p = { l, y: (s.t + s.b) / 2, a, c, gauche };
    parLigne.set(src, [...(parLigne.get(src) ?? []), p]);
    return [p];
  });
  // Une personne responsable de plusieurs entités : ses câbles sortent de sa ligne l'un au-dessus de l'autre.
  for (const g of parLigne.values()) g.forEach((p, i) => (p.y += (i - (g.length - 1) / 2) * 5));
  const chemins = new Map<Prevu, Point[]>();
  if (vertical) {
    const droite = cartes.length ? Math.max(...cartes.map((c) => c.r)) : 0;
    routerListe(prevus, droite).forEach((pts, i) => chemins.set(prevus[i], pts));
  } else {
    for (const de of new Set(prevus.map((p) => p.l.de))) {
      // Vers les entités dessous : routerMere ; vers les autres (poste lié à une entité à côté ou au-dessus) : routerAutre.
      const groupe = prevus.filter((p) => p.l.de === de && p.c.t > p.a.b + 4);
      if (groupe.length) routerMere(groupe, cartes.filter((c) => c.id !== de)).forEach((pts, i) => chemins.set(groupe[i], pts));
      prevus.filter((p) => p.l.de === de && !(p.c.t > p.a.b + 4)).forEach((p, k) => chemins.set(p, routerAutre(p, k)));
    }
  }
  return prevus.map((p) => {
    const points = chemins.get(p)!;
    const { l } = p;
    return { id: l.id, d: chemin(points), s: points[0], t: points[points.length - 1], couleur: l.couleur, titre: l.titre, de: l.de, ligne: l.ligne, vers: l.vers };
  });
}

/** Événement envoyé au plan de l'arbre quand une carte y change de place (disposition libre). */
export const BOUGE = 'organigramme:bouge';

/**
 * Dessin posé sur le plan de l'arbre : `poser` est relancé quand le plan ou une carte change de taille,
 * quand une carte change de place (BOUGE), et une fois les polices chargées.
 */
export function useSurPlan(plan: RefObject<HTMLElement | null>, poser: () => void, deps: unknown[]) {
  const dernier = useRef(poser);
  dernier.current = poser;
  useLayoutEffect(() => {
    const el = plan.current;
    if (!el) return;
    const maintenant = () => dernier.current();
    maintenant();
    let raf = 0;
    const plusTard = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(maintenant);
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(plusTard);
    ro?.observe(el);
    el.querySelectorAll('[data-noeud]').forEach((n) => ro?.observe(n));
    window.addEventListener('resize', plusTard);
    el.addEventListener(BOUGE, maintenant);
    document.fonts?.ready.then(plusTard).catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', plusTard);
      el.removeEventListener(BOUGE, maintenant);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, ...deps]);
}

/** Les câbles, dessinés par-dessus le plan de l'arbre ; recalculés quand une carte change de taille ou de place. */
export function CablesOrganigramme({ plan, liens, vertical, units }: { plan: RefObject<HTMLDivElement | null>; liens: LienResponsable[]; vertical: boolean; units: OrgUnit[] }) {
  const [traces, setTraces] = useState<Trace[]>([]);
  useSurPlan(
    plan,
    () => {
      if (!plan.current) return;
      const t = tracer(plan.current, liens, vertical);
      setTraces((old) => (JSON.stringify(old) === JSON.stringify(t) ? old : t));
    },
    [liens, vertical, units],
  );
  if (!traces.length) return null;
  return (
    <svg className="cables" aria-hidden="true">
      {traces.map((t) => (
        <g key={t.id} data-de={t.de} data-ligne={t.ligne} data-vers={t.vers} style={{ color: t.couleur }}>
          <path className="halo" d={t.d} />
          <path className="fil" d={t.d}>
            <title>{t.titre}</title>
          </path>
          <circle className="bout" cx={t.s[0]} cy={t.s[1]} r={4} />
          <circle className="bout" cx={t.t[0]} cy={t.t[1]} r={3.5} />
        </g>
      ))}
    </svg>
  );
}

/**
 * Tirer un câble : à la souris depuis la ligne d'une personne, au doigt depuis sa poignée ● (data-prise).
 * Le câble suit le pointeur (la page défile près des bords) ; lâché sur une entité où l'on peut le brancher,
 * `deposer` est appelé. Échap annule.
 */
export function useTirage<S = Source>(deposer: (uniteId: string, source: S) => void, peutDeposer: (uniteId: string) => boolean) {
  const [tir, setTir] = useState<HTMLElement | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const pointeur = useRef<Point>([0, 0]);
  const juste = useRef(false);
  const viser = useRef(() => {});
  const fns = useRef({ deposer, peutDeposer });
  fns.current = { deposer, peutDeposer };

  const commencer = (e: ReactPointerEvent<HTMLElement>, source: () => S) => {
    if (e.button !== 0 || (e.pointerType !== 'mouse' && !(e.target as Element).closest('[data-prise]'))) return;
    const el = e.currentTarget;
    const id = e.pointerId;
    const [x0, y0] = [e.clientX, e.clientY];
    let parti = false;
    let cible: string | null = null;
    let s: S | null = null;
    const vise = () => {
      const n = document.elementFromPoint(pointeur.current[0], pointeur.current[1])?.closest<HTMLElement>('[data-noeud]');
      const u = n?.dataset.noeud ?? null;
      cible = u && fns.current.peutDeposer(u) ? u : null;
      setSurvol(cible);
    };
    const arreter = () => {
      window.removeEventListener('pointermove', bouge);
      window.removeEventListener('pointerup', fin);
      window.removeEventListener('pointercancel', annule);
      window.removeEventListener('keydown', echap);
      document.body.classList.remove('cable-en-cours');
      setTir(null);
      setSurvol(null);
    };
    const bouge = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      pointeur.current = [ev.clientX, ev.clientY];
      if (!parti) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        parti = true;
        s = source();
        viser.current = vise;
        document.body.classList.add('cable-en-cours');
        setTir(el);
      }
      vise();
    };
    const fin = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const c = cible;
      arreter();
      if (!parti) return;
      // Le clic qui suit le relâchement n'ouvre pas la fiche.
      juste.current = true;
      setTimeout(() => (juste.current = false), 0);
      if (c && s !== null) fns.current.deposer(c, s);
    };
    const annule = (ev: PointerEvent) => ev.pointerId === id && arreter();
    const echap = (ev: KeyboardEvent) => ev.key === 'Escape' && arreter();
    window.addEventListener('pointermove', bouge);
    window.addEventListener('pointerup', fin);
    window.addEventListener('pointercancel', annule);
    window.addEventListener('keydown', echap);
  };

  return {
    tir: !!tir,
    survol,
    commencer,
    /** Vrai juste après un câble lâché : le clic qui suit est ignoré. */
    tireJuste: () => juste.current,
    volant: tir && <CableVolant el={tir} pointeur={pointeur} onDefile={() => viser.current()} />,
  };
}

/** Le câble en train d'être tiré : de la personne au pointeur, avec un peu de mou. */
function CableVolant({ el, pointeur, onDefile }: { el: HTMLElement; pointeur: RefObject<Point>; onDefile: () => void }) {
  const fil = useRef<SVGPathElement>(null);
  const halo = useRef<SVGPathElement>(null);
  const depart = useRef<SVGCircleElement>(null);
  const fiche = useRef<SVGCircleElement>(null);
  const defile = useRef(onDefile);
  defile.current = onDefile;
  useEffect(() => {
    let raf = 0;
    const tour = () => {
      const [x, y] = pointeur.current ?? [0, 0];
      // Près du haut ou du bas de l'écran, la page défile pour atteindre une entité plus loin.
      const bord = 64;
      const h = window.innerHeight;
      const v = y < bord ? -Math.ceil((bord - y) / 5) : y > h - bord ? Math.ceil((y - (h - bord)) / 5) : 0;
      if (v) {
        window.scrollBy(0, v);
        defile.current();
      }
      const r = el.getBoundingClientRect();
      const sx = x < (r.left + r.right) / 2 ? r.left : r.right;
      const sy = (r.top + r.bottom) / 2;
      const mou = Math.min(90, Math.hypot(x - sx, y - sy) * 0.25);
      const d = `M${sx},${sy} Q${(sx + x) / 2},${Math.max(sy, y) + mou} ${x},${y}`;
      fil.current?.setAttribute('d', d);
      halo.current?.setAttribute('d', d);
      depart.current?.setAttribute('cx', String(sx));
      depart.current?.setAttribute('cy', String(sy));
      fiche.current?.setAttribute('cx', String(x));
      fiche.current?.setAttribute('cy', String(y));
      raf = requestAnimationFrame(tour);
    };
    raf = requestAnimationFrame(tour);
    return () => cancelAnimationFrame(raf);
  }, [el, pointeur]);
  return (
    <svg className="cable-volant" aria-hidden="true">
      <path ref={halo} className="halo" />
      <path ref={fil} className="fil" />
      <circle ref={depart} className="bout" r={4} />
      <circle ref={fiche} className="fiche" r={7} />
    </svg>
  );
}

/** Mode câblage : explication, et les personnes du club à tirer (celles qui ne sont dans aucune entité d'abord). */
export function CablagePanel({ candidats, choisi, onChoisir, onTirer, tireJuste, onFin }: {
  candidats: Candidat[];
  choisi: Source | null;
  onChoisir: (s: Source | null) => void;
  onTirer: (e: ReactPointerEvent<HTMLElement>, s: Source) => void;
  tireJuste: () => boolean;
  onFin: () => void;
}) {
  const [q, setQ] = useState('');
  const hors = candidats.filter((c) => !c.ou);
  const liste = q.trim() ? candidats.filter((c) => norm(`${nomCandidat(c)} ${c.email} ${c.ou}`).includes(norm(q.trim()))).slice(0, 40) : hors;
  const puce = (s: Source, label: string, title: string, k: string) => {
    const on = choisi === s || (choisi !== 'nouvelle' && s !== 'nouvelle' && choisi?.key === s.key);
    return (
      <button
        key={k}
        type="button"
        className={`chip cablage-puce ${on ? 'on' : ''}`}
        data-prise
        title={title}
        aria-pressed={on}
        onPointerDown={(e) => onTirer(e, s)}
        onClick={() => !tireJuste() && onChoisir(on ? null : s)}
      >
        {label}
      </button>
    );
  };
  return (
    <section className="panel cablage-panel">
      <div className="cablage-tete">
        <p>
          🔌 <b>Câblage</b> : tire le câble <span className="prise-exemple" aria-hidden="true" /> d’une personne jusqu’à une entité pour en faire son <b>responsable</b> (★). Le câble reste affiché, de la personne dans l’entité mère jusqu’à l’entité. Sans glisser : touche la personne, puis « ★ Responsable » sous l’entité.
        </p>
        <button type="button" className="btn primary small" onClick={onFin}>Terminé</button>
      </div>
      <label className="cablage-cherche">
        <span>{q.trim() ? 'Personnes du club' : `Personnes du club dans aucune entité (${hors.length})`}</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher quelqu’un du club…" />
      </label>
      <div className="cablage-personnes">
        {liste.map((c) => puce(c, nomCandidat(c), c.ou ? `Déjà : ${c.ou}` : 'Dans aucune entité (registre « Membres du club »)', c.key))}
        {!liste.length && <span className="muted small-note">{q.trim() ? 'Personne de ce nom au club.' : 'Tout le monde a déjà sa place dans une entité.'}</span>}
        {puce('nouvelle', '＋ Nouvelle personne', 'Pas encore au club : son nom et son adresse dans la fenêtre suivante', 'nouvelle')}
      </div>
      {choisi && (
        <p className="cablage-choisi">
          Choisi : <b>{choisi === 'nouvelle' ? 'une nouvelle personne' : nomCandidat(choisi)}</b> — touche « ★ Responsable » sous l’entité.{' '}
          <button type="button" className="btn link small" onClick={() => onChoisir(null)}>Annuler</button>
        </p>
      )}
    </section>
  );
}

/** Confirmation : qui devient responsable, sa fonction, et ce que deviennent les responsables actuels. */
export function ResponsableModal({ u, source, candidats, onClose }: { u: OrgUnit; source: Source | null; candidats: Candidat[]; onClose: () => void }) {
  const club = useClub();
  const { setToast, user } = useStore();
  const chef = UNIT_TYPES[u.type].chef;
  const [key, setKey] = useState(source === 'nouvelle' ? 'nouvelle' : source?.key ?? '');
  const [neuf, setNeuf] = useState({ prenom: '', nom: '', email: '' });
  const [poste, setPoste] = useState(chef);
  const [garder, setGarder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Personne tirée depuis une ligne d'entité, mais absente de la liste (cas limite) : on la garde.
  const tous = source && source !== 'nouvelle' && !candidats.some((c) => c.key === source.key) ? [source, ...candidats] : candidats;
  const c = key === 'nouvelle' ? null : tous.find((x) => x.key === key) ?? null;
  const actuels = u.membres.filter((m) => m.admin);
  // Sa fiche dans l'entité, s'il en fait déjà partie (même règle que data/cablage.ts : fiche du registre, puis adresse).
  const cible = c ? { email: emailKey(c.email), membreId: c.membreId } : { email: emailKey(neuf.email), membreId: undefined };
  const fiche = u.membres.find((m) => (!!cible.membreId && m.membreId === cible.membreId) || (!!cible.email && emailKey(m.email) === cible.email));
  const deja = !!fiche && actuels.some((m) => m.id === fiche.id);
  const autres = actuels.filter((m) => m.id !== fiche?.id);
  const moiPerds = !garder && !club.canManage && autres.some((m) => user && emailKey(m.email) && emailKey(m.email) === emailKey(user.email));
  const nomChoisi = c ? nomCandidat(c) : nomCandidat(neuf);

  const go = async () => {
    setErr('');
    if (!c && key !== 'nouvelle') return setErr('Choisis la personne.');
    if (key === 'nouvelle' && !neuf.prenom.trim() && !neuf.nom.trim()) return setErr('Indique au moins son prénom ou son nom.');
    if (key === 'nouvelle' && neuf.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(neuf.email.trim())) return setErr('Adresse email invalide.');
    if (deja && poste.trim() === (fiche?.poste || chef) && (garder || !autres.length)) return setErr(`${nomChoisi} est déjà ${chef.toLowerCase()} de « ${u.nom} ».`);
    setBusy(true);
    try {
      const p = c ?? { ...neuf, couleur: '#0f766e', telephone: '' };
      const res = await club.definirResponsable(u.id, {
        prenom: p.prenom.trim(),
        nom: p.nom.trim(),
        email: p.email.trim(),
        telephone: p.telephone,
        couleur: p.couleur,
        membreId: c?.membreId,
        poste: poste.trim() || chef,
        garder,
      });
      setToast(`★ ${nomChoisi} : ${(poste.trim() || chef).toLowerCase()} de « ${u.nom} »${res.compte ? ' ; son compte lui ouvre l’entité' : ''}`);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`★ ${chef} de « ${u.nom} »`} onClose={onClose}>
      <div className="form">
        <label className="full">
          Personne
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="">Choisis…</option>
            {tous.map((x) => (
              <option key={x.key} value={x.key}>{nomCandidat(x)}{x.ou ? ` · ${x.ou}` : ' · dans aucune entité'}</option>
            ))}
            <option value="nouvelle">＋ Nouvelle personne (pas encore au club)</option>
          </select>
        </label>
        {key === 'nouvelle' && (
          <>
            <label>
              Prénom
              <input autoFocus value={neuf.prenom} onChange={(e) => setNeuf({ ...neuf, prenom: e.target.value })} />
            </label>
            <label>
              Nom
              <input value={neuf.nom} onChange={(e) => setNeuf({ ...neuf, nom: e.target.value })} />
            </label>
            <label className="full">
              Email <small className="muted">(pour lui ouvrir l’appli ensuite)</small>
              <input type="email" value={neuf.email} onChange={(e) => setNeuf({ ...neuf, email: e.target.value })} />
            </label>
          </>
        )}
        {c && (
          <p className="full cablage-qui">
            <Initials prenom={c.prenom} nom={c.nom} couleur={c.couleur} size={36} />
            <span>
              <b>{nomChoisi}</b>
              <small className="muted">{c.ou ? `Déjà : ${c.ou}` : 'Dans aucune entité du club (registre « Membres du club »)'}</small>
            </span>
          </p>
        )}
        <label className="full">
          Sa fonction dans « {u.nom} »
          <input value={poste} onChange={(e) => setPoste(e.target.value)} placeholder={chef} />
        </label>
        {autres.length > 0 && (
          <fieldset className="full cablage-actuels">
            <legend>{autres.length > 1 ? 'Responsables actuels' : 'Responsable actuel'} : {autres.map((m) => `${m.prenom} ${m.nom}`.trim() || m.poste).join(', ')}</legend>
            <label className="inline">
              <input type="radio" checked={!garder} onChange={() => setGarder(false)} /> Remplacer : {autres.length > 1 ? 'ils restent membres' : 'reste membre'}, sans ★
            </label>
            <label className="inline">
              <input type="radio" checked={garder} onChange={() => setGarder(true)} /> {autres.length > 1 ? 'Ils restent' : 'Reste'} aussi responsable{autres.length > 1 ? 's' : ''}
            </label>
          </fieldset>
        )}
      </div>
      {moiPerds && <p className="error">⚠ Tu ne seras plus admin de « {u.nom} ».</p>}
      <p className="muted small-note">
        {fiche ? 'Sa fiche dans l’entité est reprise' : 'Une fiche est créée dans l’entité'}, avec le rôle Admin. S’il a déjà un compte dans le club, il ouvre aussi « {u.nom} » ; sinon, crée son accès depuis sa fiche (clic sur son nom).
      </p>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={busy || (!c && key !== 'nouvelle')} onClick={go}>{busy ? 'Enregistrement…' : `★ Désigner ${chef.toLowerCase()}`}</button>
      </div>
    </Modal>
  );
}
