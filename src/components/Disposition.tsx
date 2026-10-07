import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { parentDans } from '../data/units';
import type { Carte, OrgUnit } from '../data/types';
import { BOUGE, chemin, useSurPlan, type Point } from './Cablage';

// Disposition libre de l'organigramme : une carte d'entité se pose où l'on veut (admins du comité central,
// et de l'entité pour la sienne), à la souris par son en-tête, au doigt par sa poignée. La place est enregistrée
// avec l'entité : la même pour tous. Une carte sans place garde la sienne dans l'arbre ; une carte posée est
// décalée (transform) depuis sa place dans l'arbre, qui reste réservée. Dès qu'une carte est posée, les traits
// sont dessinés d'une carte à l'autre (TraitsOrganigramme) au lieu d'être tracés par les listes de l'arbre.
// Sur un écran étroit (arbre en liste), les places sont ignorées.

/** Ce qu'une carte déplaçable reçoit. */
export interface Deplacer {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Vrai juste après un déplacement : le clic qui suit est ignoré. */
  bougeJuste: () => boolean;
  /** Carte posée à la main : la remettre à sa place dans l'arbre. */
  remettre?: () => void;
}

/** Marge du plan autour des cartes posées hors de l'arbre (place des câbles). */
const MARGE = 28;
/** Distance avant qu'un appui devienne un déplacement. */
const SEUIL = 6;
/** Une carte lâchée tout près du bord gauche ou du haut d'une autre s'y aligne. */
const AIMANT = 8;

const memePlace = (a?: Carte | null, b?: Carte | null) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y);

/** Place d'une carte dans l'arbre, sans son décalage : positions cumulées jusqu'au plan, depuis le coin de l'arbre. */
function placeDans(el: HTMLElement, plan: HTMLElement, arbre: HTMLElement): Carte {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n && n !== plan; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x: x - arbre.offsetLeft, y: y - arbre.offsetTop };
}

interface Geste {
  id: string;
  el: HTMLElement;
  pid: number;
  depart: Point;
  /** Point de la carte tenu par le pointeur. */
  prise: Point;
  pointeur: Point;
  avant?: Carte;
  bouge: boolean;
  /** Bords gauches et hauts des autres cartes (aimant). */
  xs: number[];
  ys: number[];
  raf: number;
  arreter: () => void;
}

export function useDisposition({ plan, arbre, cadre, units, actif, peut, placer }: {
  plan: RefObject<HTMLDivElement | null>;
  arbre: RefObject<HTMLUListElement | null>;
  cadre: RefObject<HTMLDivElement | null>;
  units: OrgUnit[];
  /** Arbre de haut en bas (pas en liste) : places appliquées et cartes déplaçables. */
  actif: boolean;
  peut: (u: OrgUnit) => boolean;
  placer: (places: Record<string, Carte | null>) => Promise<void>;
}) {
  // Places posées pas encore relues (null : remise dans l'arbre), carte en cours de déplacement.
  const [attente, setAttente] = useState<Record<string, Carte | null>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const sauvees = useMemo(() => Object.fromEntries(units.flatMap((u) => (u.carte ? [[u.id, u.carte]] : []))) as Record<string, Carte>, [units]);
  const effectives = useMemo(() => {
    const r = { ...sauvees };
    for (const [id, c] of Object.entries(attente)) {
      if (c) r[id] = c;
      else delete r[id];
    }
    return r;
  }, [sauvees, attente]);
  useEffect(() => {
    setAttente((old) => {
      const reste = Object.entries(old).filter(([id, c]) => !memePlace(c, sauvees[id]));
      return reste.length === Object.keys(old).length ? old : Object.fromEntries(reste);
    });
  }, [sauvees]);

  const places = useRef<Record<string, Carte>>({});
  const geste = useRef<Geste | null>(null);
  const juste = useRef(false);
  const marges = useRef({ t: 0, r: 0, b: 0, l: 0 });
  const dernier = useRef('');
  const etat = useRef({ actif, placer });
  etat.current = { actif, placer };

  /** Décale les cartes posées depuis leur place dans l'arbre et agrandit le plan pour qu'elles y tiennent. */
  const appliquer = useCallback(() => {
    const p = plan.current;
    const a = arbre.current;
    if (!p || !a) return;
    const [aw, ah] = [a.offsetWidth, a.offsetHeight];
    let [minX, minY, maxX, maxY, n] = [0, 0, aw, ah, 0];
    let trace = '';
    a.querySelectorAll<HTMLElement>('[data-noeud]').forEach((el) => {
      const pos = etat.current.actif ? places.current[el.dataset.noeud ?? ''] : undefined;
      if (!pos) {
        el.style.transform = '';
        el.classList.remove('posee');
        return;
      }
      const auto = placeDans(el, p, a);
      el.style.transform = `translate(${pos.x - auto.x}px, ${pos.y - auto.y}px)`;
      el.classList.add('posee');
      trace += `${el.dataset.noeud}:${el.style.transform};`;
      n++;
      minX = Math.min(minX, pos.x - MARGE);
      minY = Math.min(minY, pos.y - MARGE);
      maxX = Math.max(maxX, pos.x + el.offsetWidth + MARGE);
      maxY = Math.max(maxY, pos.y + el.offsetHeight + MARGE);
    });
    let m = { t: -minY, r: maxX - aw, b: maxY - ah, l: -minX };
    // Pendant un déplacement, le plan ne fait que s'agrandir à droite et en bas : l'arbre ne bouge pas sous le pointeur.
    const g = geste.current;
    if (g?.bouge) m = { t: marges.current.t, l: marges.current.l, r: Math.max(m.r, marges.current.r), b: Math.max(m.b, marges.current.b) };
    else if (!n) m = { t: 0, r: 0, b: 0, l: 0 };
    const o = marges.current;
    if (m.t !== o.t || m.r !== o.r || m.b !== o.b || m.l !== o.l) {
      marges.current = m;
      p.style.padding = m.t || m.r || m.b || m.l ? `${m.t}px ${m.r}px ${m.b}px ${m.l}px` : '';
    }
    // Le plan est centré dans le cadre : agrandi, il décalerait l'arbre de la moitié de la place ajoutée. L'arbre reste
    // donc à sa place (centrée), la marge de gauche compense ce qui est ajouté à gauche.
    const c = cadre.current;
    if (c) {
      const st = getComputedStyle(c);
      const large = c.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
      const gauche = m.t || m.r || m.b || m.l ? `${Math.max(0, Math.floor((large - aw) / 2) - m.l)}px` : '';
      if (p.style.marginLeft !== gauche) p.style.marginLeft = gauche;
    }
    // Câbles et traits redessinés quand une carte a changé de place (le reste : leurs propres observateurs).
    trace += p.style.padding;
    if (trace !== dernier.current) {
      dernier.current = trace;
      p.dispatchEvent(new Event(BOUGE));
    }
  }, [plan, arbre, cadre]);

  useLayoutEffect(() => {
    const g = geste.current;
    places.current = g?.bouge && places.current[g.id] ? { ...effectives, [g.id]: places.current[g.id] } : { ...effectives };
    appliquer();
  });
  // La place d'une carte dans l'arbre change quand une carte change de taille.
  useLayoutEffect(() => {
    const a = arbre.current;
    if (!a || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(appliquer);
    });
    ro.observe(a);
    if (cadre.current) ro.observe(cadre.current);
    a.querySelectorAll('[data-noeud]').forEach((n) => ro.observe(n));
    document.fonts?.ready.then(appliquer).catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [arbre, cadre, appliquer, units, actif]);

  const enregistrer = (choix: Record<string, Carte | null>) => {
    setErreur('');
    setAttente((old) => ({ ...old, ...choix }));
    etat.current.placer(choix).catch((e: unknown) => {
      setAttente((old) => Object.fromEntries(Object.entries(old).filter(([id, c]) => !(id in choix) || !memePlace(c, choix[id]))));
      setErreur(`Place non enregistrée : ${e instanceof Error ? e.message : String(e)}`);
    });
  };

  /** Suit le pointeur : la carte se pose sous lui, sans sortir du cadre à gauche ni en haut, aimantée aux autres. */
  const suivre = (g: Geste) => {
    const a = arbre.current;
    const c = cadre.current;
    if (!a || !c) return;
    const o = a.getBoundingClientRect();
    const r = c.getBoundingClientRect();
    let x = Math.max(r.left + c.clientLeft - c.scrollLeft - o.left + 2, g.pointeur[0] - g.prise[0] - o.left);
    let y = Math.max(r.top + c.clientTop - c.scrollTop - o.top + 2, g.pointeur[1] - g.prise[1] - o.top);
    const proche = (v: number, l: number[]) => l.reduce((b, w) => (Math.abs(w - v) < Math.abs(b - v) ? w : b), Infinity);
    const px = proche(x, g.xs);
    const py = proche(y, g.ys);
    if (Math.abs(px - x) <= AIMANT) x = px;
    if (Math.abs(py - y) <= AIMANT) y = py;
    places.current[g.id] = { x: Math.round(x), y: Math.round(y) };
    appliquer();
  };

  /** Près du bord de l'écran (ou du cadre, s'il défile de côté), la page défile pour poser la carte plus loin. */
  const defiler = () => {
    const g = geste.current;
    if (!g?.bouge) return;
    const [x, y] = g.pointeur;
    const bord = 56;
    const vitesse = (d: number) => Math.ceil(d / 5);
    let change = false;
    const h = window.innerHeight;
    const v = y < bord ? -vitesse(bord - y) : y > h - bord ? vitesse(y - (h - bord)) : 0;
    if (v) {
      const avant = window.scrollY;
      window.scrollBy(0, v);
      change = window.scrollY !== avant;
    }
    const c = cadre.current;
    if (c && c.scrollWidth > c.clientWidth) {
      const r = c.getBoundingClientRect();
      const dx = x < r.left + bord ? -vitesse(r.left + bord - x) : x > r.right - bord ? vitesse(x - (r.right - bord)) : 0;
      if (dx) {
        const avant = c.scrollLeft;
        c.scrollLeft += dx;
        change = change || c.scrollLeft !== avant;
      }
    }
    if (change) suivre(g);
    g.raf = requestAnimationFrame(defiler);
  };

  const commencer = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    const cible = e.target as HTMLElement;
    const poignee = !!cible.closest('[data-poignee]');
    // Souris : par l'en-tête ou le fond de la carte ; doigt : par la poignée (ailleurs, la page défile).
    if (e.button !== 0 || geste.current || (e.pointerType !== 'mouse' && !poignee)) return;
    if (!poignee && cible.closest('[data-ligne], .arbre-pied, .cablage-depose, .fiche-zone')) return;
    const p = plan.current;
    const a = arbre.current;
    if (!p || !a) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const o = a.getBoundingClientRect();
    const autres = [...a.querySelectorAll<HTMLElement>('[data-noeud]')].filter((n) => n !== el).map((n) => n.getBoundingClientRect());
    const bouger = (ev: PointerEvent) => {
      if (ev.pointerId !== g.pid) return;
      g.pointeur = [ev.clientX, ev.clientY];
      if (!g.bouge) {
        if (Math.hypot(ev.clientX - g.depart[0], ev.clientY - g.depart[1]) < SEUIL) return;
        g.bouge = true;
        // Le plan reste où il est pendant le déplacement (il se recentre ensuite).
        p.style.marginLeft = getComputedStyle(p).marginLeft;
        document.body.classList.add('carte-en-cours');
        el.classList.add('en-mouvement');
        setEnCours(id);
        g.raf = requestAnimationFrame(defiler);
      }
      suivre(g);
    };
    const finir = (ev: PointerEvent) => {
      if (ev.pointerId !== g.pid) return;
      g.arreter();
      if (!g.bouge) return;
      juste.current = true;
      setTimeout(() => (juste.current = false), 0);
      const pos = places.current[id];
      if (pos && !memePlace(pos, g.avant)) enregistrer({ [id]: pos });
    };
    const annuler = () => {
      const bougeait = g.bouge;
      g.arreter();
      if (!bougeait) return;
      if (g.avant) places.current[id] = g.avant;
      else delete places.current[id];
      appliquer();
    };
    const annule = (ev: PointerEvent) => ev.pointerId === g.pid && annuler();
    const echap = (ev: KeyboardEvent) => ev.key === 'Escape' && annuler();
    const g: Geste = {
      id,
      el,
      pid: e.pointerId,
      depart: [e.clientX, e.clientY],
      prise: [e.clientX - r.left, e.clientY - r.top],
      pointeur: [e.clientX, e.clientY],
      avant: places.current[id],
      bouge: false,
      xs: autres.map((n) => Math.round(n.left - o.left)),
      ys: autres.map((n) => Math.round(n.top - o.top)),
      raf: 0,
      arreter: () => {
        window.removeEventListener('pointermove', bouger);
        window.removeEventListener('pointerup', finir);
        window.removeEventListener('pointercancel', annule);
        window.removeEventListener('keydown', echap);
        cancelAnimationFrame(g.raf);
        geste.current = null;
        if (!g.bouge) return;
        document.body.classList.remove('carte-en-cours');
        el.classList.remove('en-mouvement');
        p.style.marginLeft = '';
        setEnCours(null);
      },
    };
    geste.current = g;
    if (poignee) e.preventDefault();
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', finir);
    window.addEventListener('pointercancel', annule);
    window.addEventListener('keydown', echap);
  };
  // Un déplacement interrompu (page quittée) ne laisse rien derrière lui.
  useEffect(() => () => geste.current?.arreter(), []);

  const remettables = actif ? units.filter((u) => effectives[u.id] && peut(u)).map((u) => u.id) : [];
  return {
    /** Au moins une carte posée à la main (ou en train de l'être) : traits dessinés d'une carte à l'autre. */
    libre: actif && (Object.keys(effectives).some((id) => units.some((u) => u.id === id)) || enCours !== null),
    /** Des cartes posées, ignorées parce que l'arbre est en liste (écran étroit). */
    ignorees: !actif && units.some((u) => effectives[u.id]),
    remettables,
    erreur,
    toutRemettre: () => enregistrer(Object.fromEntries(remettables.map((id) => [id, null]))),
    deplacer: (u: OrgUnit): Deplacer | undefined =>
      actif && peut(u)
        ? {
            onPointerDown: (e) => commencer(e, u.id),
            bougeJuste: () => juste.current,
            remettre: effectives[u.id] ? () => enregistrer({ [u.id]: null }) : undefined,
          }
        : undefined,
  };
}

type Boite = { l: number; r: number; t: number; b: number };

/** Trait d'une entité mère à une entité : par le bas et le haut des cartes, sinon d'un côté à l'autre. */
function trait(a: Boite, c: Boite, bande = 18): string | null {
  const ax = (a.l + a.r) / 2;
  const cx = (c.l + c.r) / 2;
  if (c.t >= a.b + 16) {
    // En dessous : comme dans l'arbre, une barre sous la carte mère (sous les câbles qui en partent).
    const y = Math.min(a.b + bande, (a.b + c.t) / 2);
    return chemin([[ax, a.b], [ax, y], [cx, y], [cx, c.t]]);
  }
  if (c.l >= a.r + 16 || c.r <= a.l - 16) {
    // À côté : d'un bord à l'autre, à hauteur des en-têtes.
    const droite = c.l >= a.r + 16;
    const [x1, x2] = droite ? [a.r, c.l] : [a.l, c.r];
    const mx = (x1 + x2) / 2;
    return chemin([[x1, a.t + 24], [mx, a.t + 24], [mx, c.t + 24], [x2, c.t + 24]]);
  }
  if (c.b <= a.t - 16) {
    // Au-dessus.
    const y = Math.max(a.t - 18, (c.b + a.t) / 2);
    return chemin([[ax, a.t], [ax, y], [cx, y], [cx, c.b]]);
  }
  return null;
}

/**
 * Les traits de l'arbre quand des cartes sont posées à la main : de chaque entité mère à ses entités, sous les cartes.
 * `bandes` : hauteur réservée sous une entité mère (câbles qui en partent) avant la barre du trait.
 */
export function TraitsOrganigramme({ plan, units, bandes }: { plan: RefObject<HTMLDivElement | null>; units: OrgUnit[]; bandes: Map<string, number> }) {
  const [traits, setTraits] = useState<{ id: string; d: string }[]>([]);
  const paires = useMemo(() => units.flatMap((u) => {
    const p = parentDans(units, u);
    return p ? [[p.id, u.id] as const] : [];
  }), [units]);
  useSurPlan(
    plan,
    () => {
      const el = plan.current;
      if (!el) return;
      const base = el.getBoundingClientRect();
      const boite = (id: string): Boite | null => {
        const r = el.querySelector(`[data-noeud="${CSS.escape(id)}"]`)?.getBoundingClientRect();
        return r ? { l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top } : null;
      };
      const t = paires.flatMap(([de, vers]) => {
        const a = boite(de);
        const c = boite(vers);
        const d = a && c && trait(a, c, bandes.get(de));
        return d ? [{ id: `${de}>${vers}`, d }] : [];
      });
      setTraits((old) => (JSON.stringify(old) === JSON.stringify(t) ? old : t));
    },
    [paires, bandes],
  );
  return (
    <svg className="traits" aria-hidden="true">
      {traits.map((t) => <path key={t.id} data-trait={t.id} d={t.d} />)}
    </svg>
  );
}
