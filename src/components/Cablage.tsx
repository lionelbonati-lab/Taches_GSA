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

type Point = [number, number];
interface Trace { id: string; d: string; s: Point; t: Point; couleur: string; titre: string; de: string; ligne: string; vers: string }

/** Chemin à angles arrondis passant par ces points (lignes droites, sans traverser les cartes). */
function chemin(points: Point[], rayon = 7) {
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

/**
 * Tracé des câbles sur le plan de l'arbre. De haut en bas : le câble sort de la ligne du responsable par le côté
 * de la carte, descend à côté, puis entre par le haut de la carte de l'entité. En liste (téléphone) : il longe
 * les cartes à droite et entre par le côté droit de l'entité.
 */
function tracer(plan: HTMLElement, liens: LienResponsable[], vertical: boolean): Trace[] {
  const base = plan.getBoundingClientRect();
  const rel = (e: Element) => {
    const r = e.getBoundingClientRect();
    return { l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top };
  };
  const trouver = (sel: string) => plan.querySelector(sel);
  const ligne = (de: string, id: string) => trouver(`[data-ligne="${CSS.escape(`${de}|${id}`)}"]`);
  const cartes = [...plan.querySelectorAll('[data-noeud]')];
  const droite = vertical && cartes.length ? Math.max(...cartes.map((c) => rel(c).r)) : 0;
  const parCible = new Map<string, number>();
  // Les câbles d'un même côté de l'entité mère s'emboîtent : le plus lointain prend la voie la plus à l'extérieur.
  const prevus = liens.flatMap((l) => {
    const src = ligne(l.de, l.ligne) ?? (l.lien ? ligne(l.de, `lien:${l.lien}`) : null);
    const mere = trouver(`[data-noeud="${CSS.escape(l.de)}"]`);
    const cible = trouver(`[data-noeud="${CSS.escape(l.vers)}"]`);
    if (!src || !mere || !cible) return [];
    const s = rel(src);
    const a = rel(mere);
    const c = rel(cible);
    const milieu = (c.l + c.r) / 2;
    const gauche = !vertical && milieu < (a.l + a.r) / 2;
    const k = parCible.get(l.vers) ?? 0;
    parCible.set(l.vers, k + 1);
    const loin = vertical ? c.t : Math.abs(milieu - (gauche ? a.l : a.r));
    return [{ l, y: (s.t + s.b) / 2, a, c, milieu, gauche, k, loin, groupe: `${l.de}|${gauche}` }];
  });
  const rangs = new Map<(typeof prevus)[number], { rang: number; n: number }>();
  for (const g of new Set(prevus.map((p) => p.groupe))) {
    const dans = prevus.filter((p) => p.groupe === g).sort((x, y) => x.loin - y.loin);
    dans.forEach((p, i) => rangs.set(p, { rang: i, n: dans.length }));
  }
  return prevus.map((p) => {
    const { l, y, a, c, milieu, gauche, k } = p;
    const { rang, n } = rangs.get(p)!;
    let points: Point[];
    if (vertical) {
      // Voies à droite des cartes, la plus lointaine à l'extérieur ; entrée par le côté droit de l'entité.
      const x = droite + 8 + rang * Math.min(4, 12 / Math.max(1, n - 1));
      const ty = c.t + 22 + 8 * k;
      points = [[a.r, y], [x, y], [x, ty], [c.r, ty]];
    } else {
      // Voie le long de la carte mère, puis au-dessus des cartes (la plus lointaine plus haut), entrée par le haut.
      const sens = gauche ? -1 : 1;
      const bord = gauche ? a.l : a.r;
      const x = bord + sens * (8 + rang * Math.min(3, 8 / Math.max(1, n - 1)));
      const vers = x > milieu ? 1 : -1;
      const tx = milieu + vers * (Math.min(32, (c.r - c.l) / 4) + 8 * k);
      const by = c.t - 6 - rang * Math.min(3, 10 / Math.max(1, n - 1)) - 2 * k;
      points = [[bord, y], [x, y], [x, by], [tx, by], [tx, c.t]];
    }
    return { id: l.id, d: chemin(points), s: points[0], t: points[points.length - 1], couleur: l.couleur, titre: l.titre, de: l.de, ligne: l.ligne, vers: l.vers };
  });
}

/** Les câbles, dessinés par-dessus le plan de l'arbre ; recalculés quand une carte change de taille ou de place. */
export function CablesOrganigramme({ plan, liens, vertical, units }: { plan: RefObject<HTMLDivElement | null>; liens: LienResponsable[]; vertical: boolean; units: OrgUnit[] }) {
  const [traces, setTraces] = useState<Trace[]>([]);
  useLayoutEffect(() => {
    const el = plan.current;
    if (!el) return;
    const poser = () => {
      const t = tracer(el, liens, vertical);
      setTraces((old) => (JSON.stringify(old) === JSON.stringify(t) ? old : t));
    };
    poser();
    let raf = 0;
    const plusTard = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(poser);
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(plusTard);
    ro?.observe(el);
    el.querySelectorAll('[data-noeud]').forEach((n) => ro?.observe(n));
    window.addEventListener('resize', plusTard);
    document.fonts?.ready.then(plusTard).catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', plusTard);
    };
  }, [plan, liens, vertical, units]);
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
export function useTirage(deposer: (uniteId: string, source: Source) => void, peutDeposer: (uniteId: string) => boolean) {
  const [tir, setTir] = useState<HTMLElement | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const pointeur = useRef<Point>([0, 0]);
  const juste = useRef(false);
  const viser = useRef(() => {});
  const fns = useRef({ deposer, peutDeposer });
  fns.current = { deposer, peutDeposer };

  const commencer = (e: ReactPointerEvent<HTMLElement>, source: () => Source) => {
    if (e.button !== 0 || (e.pointerType !== 'mouse' && !(e.target as Element).closest('[data-prise]'))) return;
    const el = e.currentTarget;
    const id = e.pointerId;
    const [x0, y0] = [e.clientX, e.clientY];
    let parti = false;
    let cible: string | null = null;
    let s: Source | null = null;
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
      if (c && s) fns.current.deposer(c, s);
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
