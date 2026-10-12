import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { OrgMember, OrgUnit } from '../data/types';
import { UNIT_TYPES } from '../data/units';
import { fmtDate, fmtRange } from '../data/utils';
import { benevolesDe, fonctionsDe, nomDe } from '../data/organigramme';
import { descendants, disposer, planOrganigramme, quiDe, responsablesDe, SANS_COMITE, type CarteEntite, type CartePersonne, type PlanOrganigramme } from '../data/organigrammeLignes';
import { Initials, Modal, UnitMark } from './ui';

// Organigramme par personnes, en lignes (calcul dans data/organigrammeLignes.ts) : comités dans des cadres, groupes
// sous leurs responsables, événements en dessous, reliés par des traits (couleur du comité d'où part le trait).
// Zoom (−, +, ajuster), déplacement à la souris (tirer le fond), branches repliables (sur cet appareil), impression
// ou PDF sur une page A4 en paysage. Sur téléphone : une liste de haut en bas.
// Un clic sur une personne ouvre son profil (ses fonctions dans tout le club, ses coordonnées).

const REPLIES = 'taches-gsa-orgl-replies';
/** En-tête d'un cadre, marge intérieure, écart entre deux lignes (px). */
const TETE = 36;
const MARGE = 12;
const ECART_V = 60;
/** Entre deux cartes empilées. */
const ECART_PILE = 8;
/** En dessous de cette largeur : la liste de haut en bas. */
const ETROIT = 640;
/** Page A4 en paysage, marges de 8 mm (px à 96 ppp). */
const PAGE = { l: 1060, h: 700 };

type Ouvrir = (u: OrgUnit) => { label: string; aide: string; go: () => void } | undefined;

export interface OrgLignesProps {
  units: OrgUnit[];
  /** « Fiche complète » depuis le profil d'une personne (sa fiche dans l'entité de la carte). */
  onFiche?: (m: OrgMember, uniteId: string) => void;
  /** Sous le nom, dans le profil (ex. « Organigramme 2025, en lecture seule. »). */
  note?: string;
  /** Ouvrir l'entité d'une carte de groupe ou d'événement, si on peut. */
  ouvrir?: Ouvrir;
  /** Titre imprimé au-dessus (ex. « Organigramme 2025 »). */
  titre?: string;
}

const lireReplies = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(REPLIES) ?? '[]') as string[]);
  } catch {
    return new Set<string>();
  }
};

export function OrgLignes({ units, onFiche, note, ouvrir, titre = 'Organigramme' }: OrgLignesProps) {
  const plan = useMemo(() => planOrganigramme(units), [units]);
  const [replies, setReplies] = useState(lireReplies);
  const replier = (k: string) =>
    setReplies((s) => {
      const n = new Set(s);
      if (!n.delete(k)) n.add(k);
      try {
        localStorage.setItem(REPLIES, JSON.stringify([...n]));
      } catch {
        /* navigation privée : dépliées à la prochaine visite */
      }
      return n;
    });
  const vue = useRef<HTMLDivElement>(null);
  const [largeurVue, setLargeurVue] = useState(0);
  useLayoutEffect(() => {
    const el = vue.current;
    if (!el) return;
    setLargeurVue(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setLargeurVue(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const etroit = largeurVue > 0 && largeurVue < ETROIT;
  // Zoom : null = toute la largeur (sans grossir).
  const [zoom, setZoom] = useState<number | null>(null);
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const ajuste = taille.l && largeurVue ? Math.max(0.5, Math.min(1, (largeurVue - 26) / taille.l)) : 1;
  const z = zoom ?? ajuste;
  const zoomer = (f: number) => setZoom(Math.max(0.3, Math.min(2, Math.round(z * f * 100) / 100)));
  const [impression, setImpression] = useState(false);
  useEffect(() => {
    if (!impression) return;
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; margin: 8mm; }';
    document.head.appendChild(style);
    document.body.classList.add('printing-orga');
    const fin = () => setImpression(false);
    window.addEventListener('afterprint', fin);
    // Le plan imprimé se mesure d'abord (une image), puis la fenêtre d'impression s'ouvre.
    const t = setTimeout(() => {
      window.print();
      // Navigateurs sans « afterprint » : la fenêtre d'impression bloque jusqu'à sa fermeture.
      setTimeout(fin, 500);
    }, 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', fin);
      document.body.classList.remove('printing-orga');
      style.remove();
    };
  }, [impression]);
  // Déplacer : tirer le fond à la souris (au doigt, le défilement suffit).
  const tir = useRef<{ x: number; y: number; sl: number } | null>(null);
  const commencer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || (e.target as Element).closest('button, a, input, select')) return;
    tir.current = { x: e.clientX, y: e.clientY, sl: vue.current?.scrollLeft ?? 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add('tire');
  };
  const bouger = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = tir.current;
    if (!t || !vue.current) return;
    vue.current.scrollLeft = t.sl - (e.clientX - t.x);
    window.scrollBy(0, t.y - e.clientY);
    t.y = e.clientY;
  };
  const lacher = (e: ReactPointerEvent<HTMLDivElement>) => {
    tir.current = null;
    e.currentTarget.classList.remove('tire');
  };
  const [profil, setProfil] = useState<{ m: OrgMember; uniteId: string } | null>(null);
  const voir = (m: OrgMember, uniteId: string) => setProfil({ m, uniteId });

  if (!plan.cadres.length) return <p className="muted">Aucun comité.</p>;
  return (
    <div className="orgl">
      {!etroit && (
        <div className="orgl-outils no-print">
          <div className="orgl-zoom" role="group" aria-label="Zoom">
            <button type="button" className="btn small" aria-label="Réduire" title="Réduire" onClick={() => zoomer(1 / 1.2)}>−</button>
            <span className="orgl-pourcent" aria-live="polite">{Math.round(z * 100)} %</span>
            <button type="button" className="btn small" aria-label="Agrandir" title="Agrandir" onClick={() => zoomer(1.2)}>+</button>
            <button type="button" className={`btn small ${zoom === null ? 'on' : ''}`} title="Tout l’organigramme sur la largeur de l’écran" onClick={() => setZoom(null)}>Ajuster</button>
          </div>
          {replies.size > 0 && (
            <button type="button" className="btn small" title="Déplier toutes les branches" onClick={() => {
              setReplies(new Set());
              try {
                localStorage.removeItem(REPLIES);
              } catch {
                /* rien */
              }
            }}>Tout déplier</button>
          )}
          <button type="button" className="btn small" title="Imprimer, ou enregistrer en PDF (choisir « Enregistrer au format PDF »)" onClick={() => setImpression(true)}>🖨️ Imprimer / PDF</button>
        </div>
      )}
      <div ref={vue} className={`orgl-vue ${etroit ? 'etroite' : ''}`} onPointerDown={commencer} onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacher}>
        {etroit ? (
          <Liste plan={plan} replies={replies} replier={replier} onPersonne={voir} ouvrir={ouvrir} />
        ) : (
          <Plan plan={plan} replies={replies} replier={replier} onPersonne={voir} ouvrir={ouvrir} zoom={z} onTaille={setTaille} />
        )}
      </div>
      {impression &&
        createPortal(
          <div className="orgl-impression" aria-hidden="true">
            <p className="orgl-impression-titre">
              <b>{titre}</b> · {fmtDate(new Date().toISOString().slice(0, 10))}
            </p>
            <Plan plan={plan} replies={replies} onPersonne={() => {}} zoom="page" />
          </div>,
          document.body,
        )}
      {profil && (
        <ProfilOrga
          m={profil.m}
          units={units}
          note={note}
          onClose={() => setProfil(null)}
          onFiche={
            onFiche &&
            (() => {
              setProfil(null);
              onFiche(profil.m, profil.uniteId);
            })
          }
        />
      )}
    </div>
  );
}

// ---------- Cartes ----------

/** Cadre d'une carte de personne (« sans » : Sans comité). */
const cadreDe = (p: CartePersonne) => (p.cle.startsWith('orph:') ? 'sans' : p.uniteId);

function CartePers({ p, onPersonne, style, mesure }: { p: CartePersonne; onPersonne: (m: OrgMember, uniteId: string) => void; style?: CSSProperties; mesure?: (el: HTMLElement | null) => void }) {
  const m = p.m;
  if (!m)
    return (
      <div ref={mesure} className="orgl-carte orgl-personne vacant" style={style} data-cadre={cadreDe(p)}>
        <span className="orgl-avatar-vide" aria-hidden="true">?</span>
        <span className="orgl-texte">
          <b className="error">À pourvoir</b>
          <span className="orgl-fonctions">{p.fonctions.join(' · ')}</span>
        </span>
      </div>
    );
  return (
    <button ref={mesure} type="button" className={`orgl-carte orgl-personne ${p.etoile ? 'etoile' : ''}`} style={style} data-cadre={cadreDe(p)} title="Voir son profil" onClick={() => onPersonne(m, p.uniteId)}>
      <Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={40} />
      <span className="orgl-texte">
        <b>
          {p.etoile && <span className="org-star">★ </span>}
          {nomDe(m)}
        </b>
        {p.fonctions.length > 0 && <span className="orgl-fonctions">{p.fonctions.join(' · ')}</span>}
        {m.email && <small className="orgl-coord">✉ {m.email}</small>}
        {m.telephone && <small className="orgl-coord">☎ {m.telephone}</small>}
      </span>
    </button>
  );
}

function CarteEnt({ e, onPersonne, ouvrir, style, mesure }: { e: CarteEntite; onPersonne: (m: OrgMember, uniteId: string) => void; ouvrir?: Ouvrir; style?: CSSProperties; mesure?: (el: HTMLElement | null) => void }) {
  const t = UNIT_TYPES[e.u.type];
  const o = e.manifestation ? undefined : ouvrir?.(e.u);
  const quand = e.u.date ? fmtRange(e.u.date, e.u.dateFin) : '';
  return (
    <div ref={mesure} className={`orgl-carte orgl-entite ${e.manifestation ? 'manif' : ''}`} style={{ ...style, '--c': e.u.couleur } as CSSProperties}>
      <div className="orgl-entite-tete">
        <UnitMark className="org-icon" logo={e.manifestation ? undefined : e.u.logo} couleur={e.u.couleur} icon={e.manifestation ? '🏁' : t.icon} />
        <span className="orgl-texte">
          <b>{e.u.nom}</b>
          <small>{e.manifestation ? `Manifestation${quand ? ` · ${quand}` : ''}` : `${t.label}${quand ? ` · ${quand}` : ''}`}</small>
        </span>
      </div>
      {!e.manifestation && (
        <ul className="orgl-gens">
          {e.chefs.length ? (
            e.chefs.map((r) => (
              <li key={r.m.id}>
                <button type="button" onClick={() => onPersonne(r.m, e.u.id)} title="Voir son profil">
                  <span className="org-star">★</span> {nomDe(r.m)}
                  {r.fonctions.length > 0 && <small> · {r.fonctions.join(', ')}</small>}
                </button>
              </li>
            ))
          ) : (
            <li className="error">★ {t.chef} : à désigner</li>
          )}
          {e.adjoints.map((r) => (
            <li key={r.m.id}>
              <button type="button" onClick={() => onPersonne(r.m, e.u.id)} title="Voir son profil">
                {nomDe(r.m)}
                {r.fonctions.length > 0 && <small> · {r.fonctions.join(', ')}</small>}
              </button>
            </li>
          ))}
          {e.vacants.map((v, i) => (
            <li key={`v${i}`} className="error">
              {v} : à pourvoir
            </li>
          ))}
        </ul>
      )}
      {o && (
        <button type="button" className="orgl-ouvrir" title={o.aide} onClick={o.go}>
          {o.label} ›
        </button>
      )}
    </div>
  );
}

// ---------- Plan (écran large, impression) ----------

function Plan({
  plan,
  replies,
  replier,
  onPersonne,
  ouvrir,
  zoom,
  onTaille,
}: {
  plan: PlanOrganigramme;
  replies: Set<string>;
  replier?: (k: string) => void;
  onPersonne: (m: OrgMember, uniteId: string) => void;
  ouvrir?: Ouvrir;
  /** « page » : réduit pour tenir sur une page A4 en paysage. */
  zoom: number | 'page';
  onTaille?: (t: { l: number; h: number }) => void;
}) {
  const d = useMemo(() => disposer(plan, replies), [plan, replies]);
  // Hauteur de chaque carte, mesurée après l'affichage (les lignes suivent la plus haute de chaque ligne).
  const elements = useRef(new Map<string, HTMLElement>());
  const [hauteurs, setHauteurs] = useState<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const n = new Map<string, number>();
    for (const [k, el] of elements.current) if (d.positions.has(k)) n.set(k, el.offsetHeight);
    if (n.size !== hauteurs.size || [...n].some(([k, h]) => hauteurs.get(k) !== h)) setHauteurs(n);
  });
  const mesure = (k: string) => (el: HTMLElement | null) => {
    if (el) elements.current.set(k, el);
    else elements.current.delete(k);
  };
  const hauteur = (k: string) => hauteurs.get(k) ?? 90;
  const y1 = TETE + MARGE;
  // Ligne 1 : une carte empilée se pose sous celle du dessus.
  const yCarte = (k: string): number => {
    const p = d.positions.get(k);
    return p?.dessus ? yCarte(p.dessus) + hauteur(p.dessus) + ECART_PILE : y1;
  };
  const hRang = (r: number) =>
    Math.max(60, ...[...d.positions.values()].filter((p) => p.rang === r).map((p) => (r === 1 ? yCarte(p.cle) - y1 : 0) + hauteur(p.cle)));
  const basCadres = y1 + hRang(1) + MARGE;
  const yRang: Record<number, number> = { 1: y1 };
  let y = basCadres + ECART_V;
  for (const r of d.rangs.slice(1)) {
    yRang[r] = y;
    y += hRang(r) + ECART_V;
  }
  const H = (d.rangs.length > 1 ? y - ECART_V : basCadres) + 30;
  const W = d.largeur;
  useLayoutEffect(() => onTaille?.({ l: W, h: H }), [W, H, onTaille]);
  const z = zoom === 'page' ? Math.min(1, PAGE.l / Math.max(1, W), PAGE.h / Math.max(1, H)) : zoom;

  // Entités affichées (les branches repliées n'y sont pas).
  const entites = useMemo(() => {
    const l: CarteEntite[] = [];
    const parcourir = (e: CarteEntite) => {
      if (!d.positions.has(e.cle)) return;
      l.push(e);
      e.enfants.forEach(parcourir);
    };
    plan.cadres.forEach((c) => c.grappes.forEach((g) => g.enfants.forEach(parcourir)));
    return l;
  }, [plan, d]);
  const cadreDeCle = (k: string) => {
    const p = plan.personnes.get(k);
    return p ? cadreDe(p) : k;
  };
  const traits: { cle: string; d: string; couleur: string; autre: boolean }[] = [];
  for (const e of entites) {
    const pe = d.positions.get(e.cle)!;
    const tx = pe.x + pe.largeur / 2;
    const ty = yRang[pe.rang];
    e.ancres.forEach((a, i) => {
      if (a.cle.startsWith('cadre:')) {
        traits.push({ cle: `${e.cle}|${a.cle}`, d: `M ${tx} ${basCadres} V ${ty}`, couleur: a.couleur, autre: false });
        return;
      }
      const pa = d.positions.get(a.cle);
      if (!pa) return;
      const ax = pa.x + pa.largeur / 2;
      const ay = (pa.rang === 1 ? yCarte(a.cle) : yRang[pa.rang]) + hauteur(a.cle);
      const bas = pa.rang === 1 ? basCadres : yRang[pa.rang] + hRang(pa.rang);
      // Trait d'un autre cadre (co-responsable d'un autre comité) : décalé, pour qu'on le suive.
      const autre = i > 0 && cadreDeCle(a.cle) !== cadreDeCle(e.ancres[0].cle);
      const ym = bas + ECART_V / 2 + (autre ? 7 * i : 0);
      traits.push({ cle: `${e.cle}|${a.cle}`, d: `M ${ax} ${ay} V ${ym} H ${tx} V ${ty}`, couleur: a.couleur, autre });
    });
  }
  const sousDe = useMemo(() => {
    const m = new Map<string, CarteEntite[]>();
    for (const c of plan.cadres) for (const g of c.grappes) m.set(g.cle, g.enfants);
    for (const e of entites) m.set(e.cle, e.enfants);
    return m;
  }, [plan, entites]);

  return (
    <div className="orgl-zone" style={{ width: W * z, height: H * z }}>
      <div className="orgl-plan" style={{ width: W, height: H, transform: `scale(${z})` }}>
        <svg className="orgl-traits" width={W} height={H} aria-hidden="true">
          {traits.map((t) => (
            <path key={t.cle} d={t.d} stroke={t.couleur} className={t.autre ? 'autre' : undefined} />
          ))}
        </svg>
        {plan.cadres.map((c) => {
          const b = d.cadres.get(c.cle)!;
          const t = c.u ? UNIT_TYPES[c.u.type] : undefined;
          return (
            <section key={c.cle} className={`orgl-cadre ${c.u ? '' : 'sans'}`} style={{ left: b.x, width: b.largeur, height: basCadres, '--c': c.couleur } as CSSProperties} aria-label={c.titre}>
              <h3 className="orgl-cadre-tete">
                {c.u ? <UnitMark className="org-icon" logo={c.u.logo} couleur={c.couleur} icon={t!.icon} /> : <span className="org-icon" style={{ background: SANS_COMITE }} aria-hidden="true">👤</span>}
                <span className="orgl-cadre-nom">{c.titre}</span>
                {c.u?.type === 'sous-comite' && c.u.date && <small>{fmtRange(c.u.date, c.u.dateFin)}</small>}
              </h3>
            </section>
          );
        })}
        {[...plan.personnes.values()].map((p) => {
          const pos = d.positions.get(p.cle);
          return pos ? <CartePers key={p.cle} p={p} onPersonne={onPersonne} mesure={mesure(p.cle)} style={{ left: pos.x, top: yCarte(p.cle), width: pos.largeur }} /> : null;
        })}
        {entites.map((e) => {
          const pos = d.positions.get(e.cle)!;
          return <CarteEnt key={e.cle} e={e} onPersonne={onPersonne} ouvrir={ouvrir} mesure={mesure(e.cle)} style={{ left: pos.x, top: yRang[pos.rang], width: pos.largeur }} />;
        })}
        {replier &&
          [...d.plis].map(([k, cx]) => {
            const pos = d.positions.get(k);
            const top = pos ? yRang[pos.rang] + hauteur(k) + 4 : basCadres + 4;
            const ferme = replies.has(k);
            const n = descendants(sousDe.get(k) ?? []);
            return (
              <button
                key={k}
                type="button"
                className={`orgl-pli ${ferme ? 'ferme' : ''}`}
                style={{ left: cx - 12, top }}
                aria-expanded={!ferme}
                title={ferme ? `Déplier (${n})` : 'Replier cette branche'}
                onClick={() => replier(k)}
              >
                {ferme ? `+${n}` : '−'}
              </button>
            );
          })}
      </div>
    </div>
  );
}

// ---------- Liste (téléphone) ----------

function Liste({ plan, replies, replier, onPersonne, ouvrir }: { plan: PlanOrganigramme; replies: Set<string>; replier: (k: string) => void; onPersonne: (m: OrgMember, uniteId: string) => void; ouvrir?: Ouvrir }) {
  const pli = (k: string, l: CarteEntite[]) => (
    <button type="button" className={`orgl-pli liste ${replies.has(k) ? 'ferme' : ''}`} aria-expanded={!replies.has(k)} onClick={() => replier(k)} title={replies.has(k) ? 'Déplier' : 'Replier'}>
      {replies.has(k) ? `+${descendants(l)}` : '−'}
    </button>
  );
  const branche = (l: CarteEntite[]) => (
    <ul className="orgl-l-sous">
      {l.map((e) => (
        <li key={e.cle} style={{ '--c': e.ancres[0]?.couleur ?? e.u.couleur } as CSSProperties}>
          <CarteEnt e={e} onPersonne={onPersonne} ouvrir={ouvrir} />
          {e.enfants.length > 0 && pli(e.cle, e.enfants)}
          {e.enfants.length > 0 && !replies.has(e.cle) && branche(e.enfants)}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="orgl-liste">
      {plan.cadres.map((c) => (
        <section key={c.cle} className={`orgl-l-cadre ${c.u ? '' : 'sans'}`} style={{ '--c': c.couleur } as CSSProperties}>
          <h3 className="orgl-cadre-tete">
            {c.u ? <UnitMark className="org-icon" logo={c.u.logo} couleur={c.couleur} icon={UNIT_TYPES[c.u.type].icon} /> : <span className="org-icon" style={{ background: SANS_COMITE }} aria-hidden="true">👤</span>}
            <span className="orgl-cadre-nom">{c.titre}</span>
          </h3>
          {c.grappes.map((g) => (
            <div key={g.cle} className="orgl-l-grappe">
              {g.cartes.map((p) => (
                <CartePers key={p.cle} p={p} onPersonne={onPersonne} />
              ))}
              {g.enfants.length > 0 && g.cartes.length > 0 && pli(g.cle, g.enfants)}
              {g.enfants.length > 0 && !replies.has(g.cle) && branche(g.enfants)}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

// ---------- Profil ----------

/** Profil d'une personne : coordonnées, et ses fonctions dans chaque entité du club (même personne : voir quiDe). */
export function ProfilOrga({ m, units, onClose, onFiche, note }: { m: OrgMember; units: OrgUnit[]; onClose: () => void; onFiche?: () => void; note?: string }) {
  const q = quiDe(m);
  const lignes = units.flatMap((u) => u.membres.filter((x) => quiDe(x) === q).map((x) => ({ u, x })));
  const email = lignes.map((l) => l.x.email).find(Boolean) ?? m.email;
  const tel = lignes.map((l) => l.x.telephone).find(Boolean) ?? m.telephone;
  return (
    <Modal title={nomDe(m)} onClose={onClose}>
      <div className="person fiche-personne">
        <Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={56} />
        <div className="grow">
          {note && <small className="muted">{note}</small>}
          {email && <a href={`mailto:${email}`}>✉ {email}</a>}
          {tel && <a href={`tel:${tel.replace(/\s/g, '')}`}>📱 {tel}</a>}
          {!email && !tel && <small className="muted">Pas de coordonnées.</small>}
        </div>
      </div>
      <h4 className="orgl-profil-titre">Dans le club</h4>
      <ul className="annee-fonctions">
        {lignes.map(({ u, x }) => {
          const t = UNIT_TYPES[u.type];
          const r = responsablesDe(u).find((y) => y.m?.id === x.id);
          const role = r ? `${r.etoile ? '★ ' : ''}${r.fonctions.join(', ') || (r.etoile ? t.chef : '')}` : fonctionsDe(x).join(', ') || benevolesDe(u.type).un;
          return (
            <li key={`${u.id}|${x.id}`}>
              <UnitMark className="org-icon" logo={u.logo} couleur={u.couleur} icon={t.icon} />
              <span>
                <b>{u.nom}</b> <small className="muted">{t.label}</small>
                <br />
                {role}
                {u.archive && <small className="muted"> (archivée)</small>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Fermer</button>
        {onFiche && <button className="btn primary" onClick={onFiche}>Fiche complète</button>}
      </div>
    </Modal>
  );
}
