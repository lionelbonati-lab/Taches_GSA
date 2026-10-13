import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { OrgMember, OrgUnit } from '../data/types';
import { UNIT_TYPES } from '../data/units';
import { fmtDate, fmtRange } from '../data/utils';
import { benevolesDe, fonctionsDe, nomDe } from '../data/organigramme';
import {
  actionDepot,
  descendants,
  destinations,
  disposer,
  planOrganigramme,
  quiDe,
  responsablesDe,
  SANS,
  SANS_COMITE,
  type ActionOrga,
  type CarteEntite,
  type CarteLigne1,
  type Colonne,
  type Disposition,
  type PlanOrganigramme,
  MESURES,
} from '../data/organigrammeLignes';
import { Initials, Modal, UnitMark } from './ui';
import { quiDeMembre, type Glisser, type Prise as PrisePersonne } from './Organiser';
import type { Depuis } from '../data/organigramme';

// Organigramme par postes, en lignes (calcul dans data/organigrammeLignes.ts) : comités dans des cadres reliés, une
// carte par poste (le poste, le nom ; un poste à plusieurs : tous les noms), les groupes sous leur carte (dans le comité où siège leur responsable ; « Dépend
// de » s'ils dépendent d'un autre), les événements en dessous, reliés par des traits ; un événement indépendant peut se
// poser sous un groupe qui a la place (son trait passe sous la carte du groupe).
// Zoom (−, +, ajuster), plein écran (tout l'organigramme sur l'écran), déplacement à la souris (tirer le fond), branches
// repliables (sur cet appareil), impression ou PDF sur une page A4 en paysage. Sur téléphone : une liste de haut en bas.
// Un clic sur un nom ouvre le profil de la personne (ses fonctions dans tout le club, ses coordonnées).
// Modification (`edition`) : glisser une carte (un poste, un groupe, un événement) sur un comité, un groupe ou une autre
// carte, ou « ⠿ » › « Déplacer… » ; « ＋ Poste », « ＋ Comité ». Une personne (son nom, ou cherchée en haut) se pose
// sur un poste, un ★ ou des bénévoles (zones data-cible, voir Organiser.tsx) ; au doigt : « ✋ Déplacer » dans son profil.

const REPLIES = 'taches-gsa-orgl-replies';
/** En-tête d'un cadre, marge intérieure, écart entre deux lignes (px). */
const TETE = 36;
const MARGE = 12;
const ECART_V = 60;
/** Entre deux cartes empilées. */
const ECART_PILE = 8;
/** Trait d'un événement posé sous un groupe : à cette distance du bord gauche (celui du groupe est au milieu). */
const DECALE = 26;
/** En dessous de cette largeur : la liste de haut en bas. */
const ETROIT = 640;
/** Page A4 en paysage, marges de 8 mm (px à 96 ppp). */
const PAGE = { l: 1060, h: 700 };

type Ouvrir = (u: OrgUnit) => { label: string; aide: string; go: () => void } | undefined;

/** Ce qu'on peut modifier depuis l'organigramme (mode « Modifier »). */
export interface EditionLignes {
  /** La personne connectée peut-elle le faire ? Sinon, ce n'est pas un endroit où lâcher la carte. */
  peut: (a: ActionOrga) => boolean;
  executer: (a: ActionOrga) => void;
  /** Peut modifier la fiche de l'entité (ses postes). */
  peutFiche: (uniteId: string) => boolean;
  onPoste: (uniteId: string, posteId: string) => void;
  onNouveauPoste: (uniteId: string) => void;
  onNouveauComite?: () => void;
  /** ⚙️ La fiche de l'entité (nom, couleur, date, « Dépend de »…), si la personne connectée peut la modifier. */
  modifier?: (uniteId: string) => (() => void) | undefined;
  /** Glisser une personne (son nom, ou cherchée en haut) sur un poste, un ★, des bénévoles (zones data-cible). */
  glisser?: Glisser;
}

export interface OrgLignesProps {
  units: OrgUnit[];
  /** « Fiche complète » depuis le profil d'une personne (sa fiche dans l'entité de la carte). */
  onFiche?: (m: OrgMember, uniteId: string) => void;
  /** Sous le nom, dans le profil (ex. « Organigramme 2025, en lecture seule. »). */
  note?: string;
  /** Ouvrir l'entité d'une carte de groupe ou d'événement, si on peut. */
  ouvrir?: Ouvrir;
  /** Titre imprimé au-dessus (ex. « Organigramme 2025 »), et en plein écran. */
  titre?: string;
  edition?: EditionLignes;
  /** En plein écran, au-dessus de l'organigramme (en modification : chercher une personne, celle qu'on a en main). */
  barre?: ReactNode;
}

const lireReplies = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(REPLIES) ?? '[]') as string[]);
  } catch {
    return new Set<string>();
  }
};

/** Ce que les cartes savent faire, du plan à la liste. */
interface Ctx {
  /** Son profil ; `depuis` : sa place sur la carte (en modification, « ✋ Déplacer » la prend en main). */
  onPersonne: (m: OrgMember, uniteId: string, depuis?: Depuis, poste?: string) => void;
  ouvrir?: Ouvrir;
  edition?: EditionLignes;
  tirer?: Tirer;
  /** « Déplacer… » : où peut aller cette carte. */
  onDeplacer?: (source: string, titre: string) => void;
  benevoles: Set<string>;
  basculer: (id: string) => void;
  /** Cartes que la personne connectée peut déplacer quelque part (les autres n'ont pas de poignée). */
  mobiles?: Set<string>;
}

export function OrgLignes({ units, onFiche, note, ouvrir, titre = 'Organigramme', edition, barre }: OrgLignesProps) {
  const plan = useMemo(() => planOrganigramme(units, !!edition), [units, edition]);
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
  // Bénévoles d'un groupe ou d'un événement : repliés, sauf ceux qu'on ouvre.
  const [benevoles, setBenevoles] = useState<Set<string>>(new Set());
  const basculer = (id: string) =>
    setBenevoles((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const vue = useRef<HTMLDivElement>(null);
  const [vueT, setVueT] = useState({ l: 0, h: 0 });
  useLayoutEffect(() => {
    const el = vue.current;
    if (!el) return;
    const lire = () => setVueT((t) => (t.l === el.clientWidth && t.h === el.clientHeight ? t : { l: el.clientWidth, h: el.clientHeight }));
    lire();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(lire);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const largeurVue = vueT.l;
  const etroit = largeurVue > 0 && largeurVue < ETROIT;
  // Plein écran : l'organigramme couvre toute la fenêtre (tout l'écran si le navigateur le permet).
  const [plein, setPlein] = useState(false);
  // Zoom : null = ajusté, toute la largeur (sans grossir) ; en plein écran, tout l'organigramme sur l'écran.
  const [zoom, setZoom] = useState<number | null>(null);
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const ajuste = !taille.l || !largeurVue ? 1 : plein
    ? Math.max(0.2, Math.min(1.6, (largeurVue - 26) / taille.l, (vueT.h - 26) / Math.max(1, taille.h)))
    : Math.max(0.5, Math.min(1, (largeurVue - 26) / taille.l));
  const z = zoom ?? ajuste;
  const ecran = useMemo(() => ({ l: vueT.l - 26, h: vueT.h - 26 }), [vueT]);
  const zoomer = (f: number) => setZoom(Math.max(0.2, Math.min(2, Math.round(z * f * 100) / 100)));
  const basculerPlein = () => {
    setZoom(null);
    if (plein) return setPlein(false);
    setPlein(true);
    // L'écran entier (sans la barre du navigateur) ; sinon (téléphone, refus) : toute la fenêtre.
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    if (!plein) return;
    document.body.classList.add('orgl-plein-ecran');
    // Échap : le navigateur quitte l'écran entier, l'organigramme le suit ; sans écran entier, Échap le quitte (sauf
    // dans une fenêtre ouverte par-dessus, ou en glissant une carte ou une personne).
    const change = () => !document.fullscreenElement && setPlein(false);
    const echap = (e: KeyboardEvent) => {
      const b = document.body.classList;
      if (e.key === 'Escape' && !document.fullscreenElement && !document.querySelector('.modal-back') && !b.contains('orgl-tire-en-cours') && !b.contains('glisse-en-cours')) setPlein(false);
    };
    document.addEventListener('fullscreenchange', change);
    window.addEventListener('keydown', echap);
    return () => {
      document.body.classList.remove('orgl-plein-ecran');
      document.removeEventListener('fullscreenchange', change);
      window.removeEventListener('keydown', echap);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [plein]);
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
  // Déplacer la vue : tirer le fond à la souris (au doigt, le défilement suffit).
  const tir = useRef<{ x: number; y: number; sl: number } | null>(null);
  const commencer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || (e.target as Element).closest('button, a, input, select')) return;
    tir.current = { x: e.clientX, y: e.clientY, sl: vue.current?.scrollLeft ?? 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add('tire');
  };
  const bouger = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = tir.current;
    const v = vue.current;
    if (!t || !v) return;
    v.scrollLeft = t.sl - (e.clientX - t.x);
    // En hauteur : la vue (plein écran), sinon la page.
    if (v.scrollHeight > v.clientHeight) v.scrollTop += t.y - e.clientY;
    else window.scrollBy(0, t.y - e.clientY);
    t.y = e.clientY;
  };
  const lacher = (e: ReactPointerEvent<HTMLDivElement>) => {
    tir.current = null;
    e.currentTarget.classList.remove('tire');
  };
  const [profil, setProfil] = useState<{ m: OrgMember; uniteId: string; deplacer?: () => void } | null>(null);
  // Glisser une carte : ce qu'elle ferait lâchée sur cette zone (si la personne connectée le peut).
  const editionRef = useRef(edition);
  editionRef.current = edition;
  const tirer = useTirer(
    (source, cible) => {
      const a = actionDepot(plan, units, source, cible);
      return a && editionRef.current?.peut(a) ? a : null;
    },
    (a) => editionRef.current?.executer(a),
  );
  const [deplacer, setDeplacer] = useState<{ source: string; titre: string } | null>(null);
  const mobiles = useMemo(() => {
    if (!edition) return undefined;
    const sources = [...plan.cartes.keys(), ...[...plan.entites.keys()].map((id) => `u:${id}`), ...[...plan.entites.values()].flatMap((e) => e.lignes.map((l) => l.cle))];
    return new Set(sources.filter((k) => destinations(plan, units, k).some((d) => edition.peut(d.action))));
  }, [plan, units, edition]);
  const ctx: Ctx = {
    onPersonne: (m, uniteId, depuis, poste) => {
      const g = edition?.glisser;
      if (tirer.juste() || g?.justeGlisse()) return;
      setProfil({ m, uniteId, deplacer: g && depuis && edition.peutFiche(depuis.uniteId) ? () => g.prendre(prisePersonne(m, depuis, poste)) : undefined });
    },
    ouvrir,
    edition,
    tirer: edition ? tirer : undefined,
    onDeplacer: edition ? (source, t) => !tirer.juste() && setDeplacer({ source, titre: t }) : undefined,
    benevoles,
    basculer,
    mobiles,
  };

  if (!plan.cadres.length) return <p className="muted">Aucun comité.</p>;
  return (
    <div className={`orgl ${plein ? 'plein' : ''}`}>
      {!plein && barre}
      {(!etroit || edition?.onNouveauComite || plein) && (
        <div className="orgl-outils no-print">
          {plein && <b className="orgl-plein-titre">{titre}</b>}
          {!etroit && (
            <>
              <div className="orgl-zoom" role="group" aria-label="Zoom">
                <button type="button" className="btn small" aria-label="Réduire" title="Réduire" onClick={() => zoomer(1 / 1.2)}>−</button>
                <span className="orgl-pourcent" aria-live="polite">{Math.round(z * 100)} %</span>
                <button type="button" className="btn small" aria-label="Agrandir" title="Agrandir" onClick={() => zoomer(1.2)}>+</button>
                <button type="button" className={`btn small ${zoom === null ? 'on' : ''}`} title={plein ? 'Tout l’organigramme sur l’écran' : 'Tout l’organigramme sur la largeur de l’écran'} onClick={() => setZoom(null)}>Ajuster</button>
              </div>
              {replies.size > 0 && (
                <button
                  type="button"
                  className="btn small"
                  title="Déplier toutes les branches"
                  onClick={() => {
                    setReplies(new Set());
                    try {
                      localStorage.removeItem(REPLIES);
                    } catch {
                      /* rien */
                    }
                  }}
                >
                  Tout déplier
                </button>
              )}
              <button type="button" className="btn small" title="Imprimer, ou enregistrer en PDF (choisir « Enregistrer au format PDF »)" onClick={() => setImpression(true)}>🖨️ Imprimer / PDF</button>
            </>
          )}
          {edition?.onNouveauComite && (
            <button type="button" className="btn small" title="Nouveau comité : président, secrétaire et caissier" onClick={edition.onNouveauComite}>＋ Comité</button>
          )}
          {(plein || !etroit) && (
            <button
              type="button"
              className={`btn small orgl-bouton-plein ${plein ? 'primary' : ''}`}
              title={plein ? 'Revenir à la page (Échap)' : 'L’organigramme sur tout l’écran'}
              aria-pressed={plein}
              onClick={basculerPlein}
            >
              {plein ? '✕ Quitter le plein écran' : '⛶ Plein écran'}
            </button>
          )}
        </div>
      )}
      {plein && barre}
      <div ref={vue} className={`orgl-vue ${etroit ? 'etroite' : ''} ${edition ? 'edition' : ''}`} onPointerDown={commencer} onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacher}>
        {etroit ? (
          <Liste plan={plan} replies={replies} replier={replier} ctx={ctx} />
        ) : (
          <Plan plan={plan} replies={replies} replier={replier} ctx={ctx} zoom={z} onTaille={setTaille} ecran={plein ? ecran : undefined} />
        )}
      </div>
      {impression &&
        createPortal(
          <div className="orgl-impression" aria-hidden="true">
            <p className="orgl-impression-titre">
              <b>{titre}</b> · {fmtDate(new Date().toISOString().slice(0, 10))}
            </p>
            <Plan plan={plan} replies={replies} ctx={{ onPersonne: () => {}, benevoles, basculer: () => {} }} zoom="page" />
          </div>,
          document.body,
        )}
      {tirer.volant}
      {deplacer && edition && (
        <DeplacerModal
          titre={deplacer.titre}
          choix={destinations(plan, units, deplacer.source).filter((d) => edition.peut(d.action))}
          onChoisir={(a) => {
            setDeplacer(null);
            edition.executer(a);
          }}
          onClose={() => setDeplacer(null)}
        />
      )}
      {profil && (
        <ProfilOrga
          m={profil.m}
          units={units}
          note={note}
          onClose={() => setProfil(null)}
          onDeplacer={
            profil.deplacer &&
            (() => {
              setProfil(null);
              profil.deplacer!();
            })
          }
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

// ---------- Glisser une carte ----------

interface Tirer {
  /** Souris : n'importe où sur la carte ; doigt : par sa poignée (data-prise). */
  commencer: (e: ReactPointerEvent<HTMLElement>, source: string, titre: string) => void;
  /** Vrai juste après un glisser : le clic qui suit est ignoré. */
  juste: () => boolean;
  volant: ReactNode;
}

/** La carte suit le pointeur ; la zone (data-depot) où la lâcher s'allume, avec ce qui s'y fera. Échap annule. */
function useTirer(action: (source: string, cible: string) => ActionOrga | null, deposer: (a: ActionOrga) => void): Tirer {
  const [tire, setTire] = useState<{ titre: string; libelle: string; x: number; y: number } | null>(null);
  const juste = useRef(false);
  const fns = useRef({ action, deposer });
  fns.current = { action, deposer };
  const commencer: Tirer['commencer'] = (e, source, titre) => {
    if (e.button !== 0 || (e.pointerType !== 'mouse' && !(e.target as Element).closest('[data-prise]'))) return;
    e.stopPropagation();
    const id = e.pointerId;
    const [x0, y0] = [e.clientX, e.clientY];
    let parti = false;
    let a: ActionOrga | null = null;
    let allume: Element | null = null;
    const viser = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-depot]') ?? null;
      a = el ? fns.current.action(source, el.dataset.depot!) : null;
      const n = a ? el : null;
      if (n !== allume) {
        allume?.classList.remove('orgl-survol');
        n?.classList.add('orgl-survol');
        allume = n;
      }
      setTire({ titre, libelle: a?.libelle ?? '', x, y });
    };
    const arreter = () => {
      window.removeEventListener('pointermove', bouge);
      window.removeEventListener('pointerup', fin);
      window.removeEventListener('pointercancel', arreter);
      window.removeEventListener('keydown', echap);
      allume?.classList.remove('orgl-survol');
      document.body.classList.remove('orgl-tire-en-cours');
      setTire(null);
    };
    const bouge = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!parti) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        parti = true;
        document.body.classList.add('orgl-tire-en-cours');
      }
      viser(ev.clientX, ev.clientY);
    };
    const fin = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const q = a;
      arreter();
      if (!parti) return;
      juste.current = true;
      setTimeout(() => (juste.current = false), 0);
      if (q) fns.current.deposer(q);
    };
    const echap = (ev: KeyboardEvent) => ev.key === 'Escape' && ((a = null), arreter());
    window.addEventListener('pointermove', bouge);
    window.addEventListener('pointerup', fin);
    window.addEventListener('pointercancel', arreter);
    window.addEventListener('keydown', echap);
  };
  return {
    commencer,
    juste: () => juste.current,
    volant:
      tire &&
      createPortal(
        <div className="orgl-volant" style={{ left: tire.x + 14, top: tire.y + 14 }} aria-hidden="true">
          <b>{tire.titre}</b>
          <small className={tire.libelle ? '' : 'muted'}>{tire.libelle || 'Lâche-la sur un comité, un groupe, ou une autre carte de son cadre'}</small>
        </div>,
        document.body,
      ),
  };
}

/** « Déplacer… » : les endroits où la carte peut aller (sans glisser, au clavier ou au doigt). */
function DeplacerModal({ titre, choix, onChoisir, onClose }: { titre: string; choix: { cible: string; action: ActionOrga }[]; onChoisir: (a: ActionOrga) => void; onClose: () => void }) {
  return (
    <Modal title={`Déplacer « ${titre} »`} onClose={onClose}>
      {choix.length ? (
        <ul className="orgl-destinations">
          {choix.map((c) => (
            <li key={c.cible}>
              <button type="button" className="btn" onClick={() => onChoisir(c.action)}>
                {c.action.libelle}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nulle part où tu puisses la déplacer.</p>
      )}
      <p className="muted small-note">Ou glisse la carte sur un comité, un groupe, ou une autre carte de son cadre.</p>
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

// ---------- Cartes ----------

/** Zone où poser une personne cherchée en haut (data-cible), en modification seulement ; allumée si survolée. */
const zone = (ctx: Ctx, cible: string | undefined) =>
  ctx.edition && cible ? { 'data-cible': cible, className: ctx.edition.glisser?.survol === cible ? 'cible-survol' : '' } : { className: '' };

/** La personne qu'on prend (son nom) : d'où elle vient, le poste qu'elle occupait (nom proposé pour un nouveau poste). */
const prisePersonne = (m: OrgMember, depuis: Depuis, poste?: string): PrisePersonne => ({ qui: quiDeMembre(m), depuis, nom: nomDe(m), couleur: m.couleur, poste });

/**
 * Le nom d'une personne : un clic, son profil. En modification (fiche que la personne connectée peut changer) : à la
 * souris, le glisser sur un autre poste, un ★, des bénévoles (Ctrl / Alt : elle garde aussi sa place) ; au doigt :
 * « ✋ Déplacer » dans son profil, puis toucher la zone. Le reste de la carte déplace le poste.
 */
function Nom({ ctx, m, uniteId, depuis, poste, className }: { ctx: Ctx; m: OrgMember; uniteId: string; depuis?: Depuis; poste?: string; className?: string }) {
  const g = ctx.edition?.glisser;
  const mobile = !!g && !!depuis && ctx.edition!.peutFiche(depuis.uniteId);
  return (
    <button
      type="button"
      className={`${className ?? ''} ${mobile ? 'personne-mobile' : ''}`}
      title={mobile ? 'Glisser sur un autre poste (Ctrl : sans quitter celui-ci), ou voir son profil' : 'Voir son profil (coordonnées, fonctions)'}
      onPointerDown={mobile ? (e) => g!.commencer(e, () => prisePersonne(m, depuis!, poste)) : undefined}
      onClick={() => ctx.onPersonne(m, uniteId, depuis, poste)}
    >
      {nomDe(m)}
    </button>
  );
}

/** Poignée d'une carte qu'on peut déplacer : la tirer (aussi au doigt), ou un clic : « Déplacer… ». */
function Prise({ ctx, source, titre }: { ctx: Ctx; source: string; titre: string }) {
  if (!ctx.tirer || !ctx.onDeplacer) return null;
  return (
    <button type="button" className="orgl-prise" data-prise title="Déplacer… (ou tirer la carte)" aria-label={`Déplacer « ${titre} »`} onClick={() => ctx.onDeplacer!(source, titre)}>
      ⠿
    </button>
  );
}

/** Peut-on déplacer cette carte (quelque part où la personne connectée a le droit de la mettre) ? */
const deplacable = (ctx: Ctx, cle: string) => !!ctx.edition && !!ctx.mobiles?.has(cle);

function Carte1({
  c,
  ctx,
  ailleurs,
  style,
  mesure,
}: {
  c: CarteLigne1;
  ctx: Ctx;
  /** Ses événements, posés sous un groupe pour gagner de la place. */
  ailleurs?: OrgUnit[];
  style?: CSSProperties;
  mesure?: (el: HTMLElement | null) => void;
}) {
  const vacant = !c.gens.length;
  const tirable = deplacable(ctx, c.cle);
  const z = zone(ctx, c.sorte === 'titre' ? `${c.uniteId}|etoile|${c.gens[0]?.m.id}` : c.sorte === 'groupe' ? `${c.uniteId}|titre` : c.posteId ? `${c.uniteId}|poste|${c.posteId}` : undefined);
  const g = c.sorte === 'groupe' ? c.groupe?.u : undefined;
  const modifier = ctx.edition && c.sorte === 'poste' && c.posteId && ctx.edition.peutFiche(c.uniteId) ? () => !ctx.tirer?.juste() && ctx.edition!.onPoste(c.uniteId, c.posteId!) : undefined;
  return (
    <div
      ref={mesure}
      className={`orgl-carte orgl-c1 ${c.sorte} ${vacant ? 'vacant' : ''} ${tirable ? 'tirable' : ''} ${z.className}`}
      style={{ ...style, '--c': g?.couleur } as CSSProperties}
      data-depot={ctx.edition ? `carte:${c.cle}` : undefined}
      data-cible={'data-cible' in z ? z['data-cible'] : undefined}
      data-cadre={c.cadre}
      data-cle={c.cle}
      onPointerDown={tirable ? (e) => ctx.tirer!.commencer(e, c.cle, c.titre) : undefined}
    >
      <div className="orgl-c1-titre">
        {g && <UnitMark className="org-icon" logo={g.logo} couleur={g.couleur} icon={UNIT_TYPES[g.type].icon} />}
        {c.sorte === 'titre' && <span className="org-star" title="Titre de la fiche (★)">★</span>}
        {modifier ? (
          <button type="button" className="orgl-c1-nom-poste" title="Le poste : son nom, son lien, sa suppression" onClick={modifier}>
            {c.titre}
          </button>
        ) : (
          <span className="orgl-c1-nom-poste">{c.titre}</span>
        )}
        {tirable && <Prise ctx={ctx} source={c.cle} titre={c.titre} />}
      </div>
      {c.lien && <small className="orgl-lien" title={`Poste lié au ★ de « ${c.lien.nom} »`}>⛓ {c.lien.nom}</small>}
      {ailleurs?.map((u) => (
        <small key={u.id} className="orgl-lien" title={`Responsable de « ${u.nom} », placé plus bas sous un groupe pour gagner de la place : suivre le trait`}>
          ⛓ {u.nom} ↓
        </small>
      ))}
      <div className="orgl-c1-gens">
        {vacant ? (
          <span className="error">{c.sorte === 'groupe' ? `${UNIT_TYPES[g?.type ?? 'groupe'].chef} : à désigner` : 'À pourvoir'}</span>
        ) : (
          // Le nom seul (place) : ses coordonnées et ses fonctions dans le club, dans son profil. Un poste à plusieurs :
          // chacun sur sa place.
          c.gens.map(({ m, posteId }) => (
            <Nom
              key={m.id}
              ctx={ctx}
              m={m}
              uniteId={c.uniteId}
              className="orgl-nom"
              depuis={c.sorte === 'poste' ? (posteId ? { uniteId: c.uniteId, personId: m.id, zone: 'poste', posteId } : undefined) : { uniteId: c.uniteId, personId: m.id, zone: 'titre' }}
              poste={c.sorte === 'groupe' ? m.poste?.trim() || UNIT_TYPES[g?.type ?? 'groupe'].chef : c.titre}
            />
          ))
        )}
        {!vacant && !!c.vacants && <span className="error">+ à pourvoir{c.vacants > 1 ? ` (${c.vacants})` : ''}</span>}
      </div>
    </div>
  );
}

/** Un événement posé sous un groupe dont il est indépendant : d'où part son trait (un poste, ou tout le comité). */
interface Heberge {
  de: string;
  poste: boolean;
  comite: string;
  sous: string;
}

function CarteEnt({
  e,
  ctx,
  heberge,
  style,
  mesure,
}: {
  e: CarteEntite;
  ctx: Ctx;
  heberge?: Heberge;
  style?: CSSProperties;
  mesure?: (el: HTMLElement | null) => void;
}) {
  const t = UNIT_TYPES[e.u.type];
  const o = e.manifestation ? undefined : ctx.ouvrir?.(e.u);
  const quand = e.u.date ? fmtRange(e.u.date, e.u.dateFin) : '';
  const ed = ctx.edition;
  const regler = e.manifestation ? undefined : ed?.modifier?.(e.u.id);
  const tirable = !e.manifestation && deplacable(ctx, `u:${e.u.id}`);
  const fiche = !!ed && !e.manifestation && ed.peutFiche(e.u.id);
  const ouverts = ctx.benevoles.has(e.u.id);
  const z = e.manifestation ? zone(ctx, undefined) : zone(ctx, `${e.u.id}|titre`);
  return (
    <div
      ref={mesure}
      className={`orgl-carte orgl-entite ${e.manifestation ? 'manif' : ''} ${tirable ? 'tirable' : ''} ${z.className}`}
      style={{ ...style, '--c': e.u.couleur } as CSSProperties}
      data-depot={ed ? `entite:${e.u.id}` : undefined}
      data-cible={'data-cible' in z ? z['data-cible'] : undefined}
      data-cle={e.cle}
      onPointerDown={tirable ? (ev) => ctx.tirer!.commencer(ev, `u:${e.u.id}`, e.u.nom) : undefined}
    >
      <div className="orgl-entite-tete">
        <UnitMark className="org-icon" logo={e.manifestation ? undefined : e.u.logo} couleur={e.u.couleur} icon={e.manifestation ? '🏁' : t.icon} />
        <span className="orgl-texte">
          <b>{e.u.nom}</b>
          <small>{e.manifestation ? `Manifestation${quand ? ` · ${quand}` : ''}` : `${t.label}${quand ? ` · ${quand}` : ''}`}</small>
        </span>
        {tirable && <Prise ctx={ctx} source={`u:${e.u.id}`} titre={e.u.nom} />}
      </div>
      {heberge && (
        <small
          className="orgl-depend"
          title={`${heberge.poste ? `Le poste « ${heberge.de} » de « ${heberge.comite} » en est responsable` : `Tout le comité « ${heberge.comite} » en est responsable`}. Placé sous « ${heberge.sous} » pour gagner de la place, sans en dépendre : son trait passe sous sa carte.`}
        >
          ⛓ {heberge.poste ? heberge.de : e.manifestation ? `« ${heberge.comite} »` : `Tout « ${heberge.comite} »`}
        </small>
      )}
      {e.depend &&
        (regler ? (
          <button type="button" className="orgl-depend" title="Le comité dont il dépend (ses tâches, son ordre du jour) : le changer" onClick={regler}>
            Dépend de « {e.depend.nom} »
          </button>
        ) : (
          <small className="orgl-depend" title="Le comité dont il dépend (ses tâches, son ordre du jour)">Dépend de « {e.depend.nom} »</small>
        ))}
      {!e.manifestation && (
        <ul className="orgl-gens">
          {!e.lignes.some((l) => l.etoile) && <li className="error">★ {t.chef} : à désigner</li>}
          {e.lignes.map((l) => {
            const zl = zone(ctx, l.etoile && l.gens[0] ? `${e.u.id}|etoile|${l.gens[0].m.id}` : l.posteId ? `${e.u.id}|poste|${l.posteId}` : undefined);
            const source = deplacable(ctx, l.cle) ? l.cle : undefined;
            return (
              <li
                key={l.cle}
                className={`${l.gens.length ? '' : 'error'} ${source && ed ? 'tirable' : ''} ${zl.className}`}
                data-cible={'data-cible' in zl ? zl['data-cible'] : undefined}
                onPointerDown={source && ed ? (ev) => ctx.tirer!.commencer(ev, source, l.titre) : undefined}
              >
                {fiche && l.posteId ? (
                  <button type="button" className="orgl-poste" title="Le poste : son nom, son lien, sa suppression" onClick={() => !ctx.tirer?.juste() && ed!.onPoste(e.u.id, l.posteId!)}>
                    {l.etoile && <span className="org-star">★ </span>}
                    {l.titre}
                  </button>
                ) : (
                  <span className="orgl-poste">
                    {l.etoile && <span className="org-star">★ </span>}
                    {l.titre}
                  </span>
                )}
                {l.lien && <small title="Poste lié au ★ d’une autre entité"> ⛓</small>}
                {' : '}
                {l.gens.length
                  ? // Un poste à plusieurs : tous ses titulaires, chacun sur sa place.
                    l.gens.map(({ m, posteId }, i) => (
                      <Fragment key={m.id}>
                        {i > 0 && ', '}
                        <Nom
                          ctx={ctx}
                          m={m}
                          uniteId={e.u.id}
                          depuis={l.etoile ? { uniteId: e.u.id, personId: m.id, zone: 'titre' } : posteId ? { uniteId: e.u.id, personId: m.id, zone: 'poste', posteId } : undefined}
                          poste={l.titre}
                        />
                      </Fragment>
                    ))
                  : 'à pourvoir'}
                {l.gens.length > 0 && !!l.vacants && <span className="error"> + à pourvoir{l.vacants > 1 ? ` (${l.vacants})` : ''}</span>}
                {source && ed && <Prise ctx={ctx} source={source} titre={l.titre} />}
              </li>
            );
          })}
        </ul>
      )}
      {!e.manifestation && (e.benevoles.length > 0 || fiche) && (
        <div className={`orgl-benevoles ${zone(ctx, `${e.u.id}|benevoles`).className}`} data-cible={ed ? `${e.u.id}|benevoles` : undefined}>
          <button type="button" className="orgl-benevoles-bouton" aria-expanded={ouverts} onClick={() => ctx.basculer(e.u.id)}>
            {ouverts ? '▽' : '▷'} {benevolesDe(e.u.type).plusieurs} ({e.benevoles.length})
          </button>
          {ouverts && (
            <ul className="orgl-gens">
              {e.benevoles.map((m) => (
                <li key={m.id}>
                  <Nom ctx={ctx} m={m} uniteId={e.u.id} depuis={{ uniteId: e.u.id, personId: m.id, zone: 'benevoles' }} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {(fiche || o || regler) && (
        <div className="orgl-entite-pied">
          {regler && (
            <button type="button" className="orgl-plus" title={`Modifier « ${e.u.nom} » (nom, couleur, date, « Dépend de »…)`} aria-label={`Modifier « ${e.u.nom} »`} onClick={regler}>
              ⚙️
            </button>
          )}
          {fiche && (
            <button type="button" className="orgl-plus" onClick={() => ed!.onNouveauPoste(e.u.id)}>
              ＋ Poste
            </button>
          )}
          {o && (
            <button type="button" className="orgl-ouvrir" title={o.aide} onClick={o.go}>
              {o.label} ›
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** En-tête d'un cadre : le comité (ou « Sans comité »), sa date ; en modification : « ＋ Poste », ⚙️. */
function TeteCadre({ c, ctx }: { c: PlanOrganigramme['cadres'][number]; ctx: Ctx }) {
  const t = c.u ? UNIT_TYPES[c.u.type] : undefined;
  const regler = c.u ? ctx.edition?.modifier?.(c.u.id) : undefined;
  return (
    <h3 className="orgl-cadre-tete">
      {c.u ? <UnitMark className="org-icon" logo={c.u.logo} couleur={c.couleur} icon={t!.icon} /> : <span className="org-icon" style={{ background: SANS_COMITE }} aria-hidden="true">👤</span>}
      <span className="orgl-cadre-nom">{c.titre}</span>
      {c.u?.type === 'sous-comite' && c.u.date && <small>{fmtRange(c.u.date, c.u.dateFin)}</small>}
      {c.u && ctx.edition?.peutFiche(c.u.id) && (
        <button type="button" className="orgl-plus" title={`Nouveau poste dans « ${c.titre} »`} onClick={() => ctx.edition!.onNouveauPoste(c.u!.id)}>
          ＋ Poste
        </button>
      )}
      {regler && (
        <button type="button" className="orgl-plus" title={`Modifier « ${c.titre} » (nom, couleur, date…)`} aria-label={`Modifier « ${c.titre} »`} onClick={regler}>
          ⚙️
        </button>
      )}
    </h3>
  );
}

// ---------- Plan (écran large, impression) ----------

/** Hauteur d'une carte pas encore mesurée ; cartes empilées au plus (plein écran, page imprimée). */
const HAUTEUR = 70;
const PILE_MAX = 12;

/** Où tombent les lignes : chaque ligne suit la plus haute de ses cartes (mesurées) ; ligne 1 : les piles de cartes. */
function geometrie(d: Disposition, hauteurs: Map<string, number>) {
  const hauteur = (k: string) => hauteurs.get(k) ?? HAUTEUR;
  const y1 = TETE + MARGE;
  // Ligne 1 : une carte empilée se pose sous celle du dessus.
  const yCarte = (k: string): number => {
    const p = d.positions.get(k);
    return p?.dessus ? yCarte(p.dessus) + hauteur(p.dessus) + ECART_PILE : y1;
  };
  const hRang = (r: number) =>
    Math.max(56, ...[...d.positions.values()].filter((p) => p.rang === r).map((p) => (r === 1 ? yCarte(p.cle) - y1 : 0) + hauteur(p.cle)));
  const basCadres = y1 + hRang(1) + MARGE;
  const yRang: Record<number, number> = { 1: y1 };
  let y = basCadres + ECART_V;
  for (const r of d.rangs.slice(1)) {
    yRang[r] = y;
    y += hRang(r) + ECART_V;
  }
  return { yCarte, hRang, basCadres, yRang, W: d.largeur, H: (d.rangs.length > 1 ? y - ECART_V : basCadres) + 30 };
}

function Plan({
  plan,
  replies,
  replier,
  ctx,
  zoom,
  onTaille,
  ecran,
}: {
  plan: PlanOrganigramme;
  replies: Set<string>;
  replier?: (k: string) => void;
  ctx: Ctx;
  /** « page » : réduit pour tenir sur une page A4 en paysage. */
  zoom: number | 'page';
  onTaille?: (t: { l: number; h: number }) => void;
  /** Plein écran : la place disponible ; les cartes s'empilent pour que tout l'organigramme y tienne au mieux. */
  ecran?: { l: number; h: number };
}) {
  // Hauteur de chaque carte, mesurée après l'affichage (les lignes suivent la plus haute de chaque ligne).
  const elements = useRef(new Map<string, HTMLElement>());
  const [hauteurs, setHauteurs] = useState<Map<string, number>>(new Map());
  // Plein écran, page imprimée : la hauteur des piles qui fait le mieux tenir l'organigramme dans le cadre de l'écran
  // (de la page) ; sinon, voir pileDe.
  const cible = zoom === 'page' ? PAGE : ecran;
  const { d, g } = useMemo(() => {
    const essai = (pile?: number) => {
      const d = disposer(plan, replies, MESURES, pile);
      return { d, g: geometrie(d, hauteurs) };
    };
    if (!cible || cible.l <= 0 || cible.h <= 0) return essai();
    let mieux = essai(1);
    const ajuste = (x: ReturnType<typeof essai>) => Math.min(cible.l / Math.max(1, x.g.W), cible.h / Math.max(1, x.g.H));
    for (let pile = 2; pile <= PILE_MAX; pile++) {
      const x = essai(pile);
      if (ajuste(x) > ajuste(mieux) + 0.001) mieux = x;
    }
    return mieux;
  }, [plan, replies, hauteurs, cible?.l, cible?.h]);
  useLayoutEffect(() => {
    const n = new Map<string, number>();
    for (const [k, el] of elements.current) if (d.positions.has(k)) n.set(k, el.offsetHeight);
    if (n.size !== hauteurs.size || [...n].some(([k, h]) => hauteurs.get(k) !== h)) setHauteurs(n);
  });
  const mesure = (k: string) => (el: HTMLElement | null) => {
    if (el) elements.current.set(k, el);
    else elements.current.delete(k);
  };
  const hauteur = (k: string) => hauteurs.get(k) ?? HAUTEUR;
  const { yCarte, hRang, basCadres, yRang, W, H } = g;
  useLayoutEffect(() => onTaille?.({ l: W, h: H }), [W, H, onTaille]);
  const z = zoom === 'page' ? Math.min(1, PAGE.l / Math.max(1, W), PAGE.h / Math.max(1, H)) : zoom;

  // Cartes affichées (les branches repliées n'y sont pas).
  const cartes = useMemo(() => [...plan.cartes.values()].filter((c) => d.positions.has(c.cle)), [plan, d]);
  const entites = useMemo(() => {
    const l: CarteEntite[] = [];
    const parcourir = (e: CarteEntite) => {
      if (!d.positions.has(e.cle)) return;
      l.push(e);
      e.enfants.forEach(parcourir);
    };
    plan.cadres.forEach((c) => c.colonnes.forEach((col) => col.enfants.forEach(parcourir)));
    return l;
  }, [plan, d]);
  const traits: { cle: string; d: string; couleur: string }[] = [];
  for (const e of entites) {
    const pe = d.positions.get(e.cle)!;
    // Un événement posé sous un groupe (indépendant de lui) : son trait passe sous la carte du groupe, à gauche du sien.
    const tx = pe.x + (d.heberges.has(e.cle) ? DECALE : pe.largeur / 2);
    const ty = yRang[pe.rang];
    const a = e.ancre;
    if (a.cle.startsWith('cadre:')) {
      traits.push({ cle: e.cle, d: `M ${tx} ${basCadres} V ${ty}`, couleur: a.couleur });
      continue;
    }
    const pa = d.positions.get(a.cle);
    if (!pa) continue;
    const ax = pa.x + pa.largeur / 2;
    const ay = (pa.rang === 1 ? yCarte(a.cle) : yRang[pa.rang]) + hauteur(a.cle);
    const ym = (pa.rang === 1 ? basCadres : yRang[pa.rang] + hRang(pa.rang)) + ECART_V / 2;
    traits.push({ cle: e.cle, d: `M ${ax} ${ay} V ${ym} H ${tx} V ${ty}`, couleur: a.couleur });
  }
  // Les comités reliés entre eux, d'un cadre au suivant (« Sans comité » à part).
  const comites = plan.cadres.filter((c) => c.u);
  for (let i = 1; i < comites.length; i++) {
    const g = d.cadres.get(comites[i - 1].cle)!;
    const dr = d.cadres.get(comites[i].cle)!;
    traits.push({ cle: `lien:${comites[i].cle}`, d: `M ${g.x + g.largeur} ${basCadres / 2} H ${dr.x}`, couleur: comites[i].couleur });
  }
  const sousDe = useMemo(() => {
    const m = new Map<string, CarteEntite[]>();
    for (const c of plan.cadres) for (const col of c.colonnes) m.set(col.cle, col.enfants);
    for (const e of entites) m.set(e.cle, e.enfants);
    return m;
  }, [plan, entites]);
  // Événements posés sous un groupe : la carte d'où part leur trait le dit (⛓), eux disent d'où il part.
  const ailleurs = new Map<string, OrgUnit[]>();
  const heberge = new Map<string, Heberge>();
  for (const e of entites) {
    const g = d.heberges.get(e.cle);
    if (!g) continue;
    const carte = plan.cartes.get(e.ancre.cle);
    if (carte) ailleurs.set(carte.cle, [...(ailleurs.get(carte.cle) ?? []), e.u]);
    const cadre = plan.cadres.find((c) => c.cle === (carte?.cadre ?? e.ancre.cle.slice(6)));
    heberge.set(e.cle, { de: carte?.titre ?? cadre?.titre ?? '?', poste: !!carte, comite: cadre?.titre ?? '?', sous: plan.entites.get(g.slice(2))?.u.nom ?? '?' });
  }

  return (
    <div className="orgl-zone" style={{ width: W * z, height: H * z }}>
      <div className="orgl-plan" style={{ width: W, height: H, transform: `scale(${z})` }}>
        <svg className="orgl-traits" width={W} height={H} aria-hidden="true">
          {traits.map((t) => (
            <path key={t.cle} d={t.d} stroke={t.couleur} />
          ))}
        </svg>
        {plan.cadres.map((c) => {
          const b = d.cadres.get(c.cle)!;
          const zc = c.u ? zone(ctx, `${c.u.id}|nouveau`) : zone(ctx, undefined);
          return (
            <section
              key={c.cle}
              className={`orgl-cadre ${c.u ? '' : 'sans'} ${zc.className}`}
              style={{ left: b.x, width: b.largeur, height: basCadres, '--c': c.couleur } as CSSProperties}
              aria-label={c.titre}
              data-depot={ctx.edition ? `cadre:${c.cle}` : undefined}
              data-cible={'data-cible' in zc ? zc['data-cible'] : undefined}
            >
              <TeteCadre c={c} ctx={ctx} />
              {!c.colonnes.length && ctx.edition && <p className="orgl-cadre-vide muted">{c.cle === SANS ? 'Glisse ici un groupe dont le responsable ne siège dans aucun comité.' : 'Aucun poste.'}</p>}
            </section>
          );
        })}
        {cartes.map((c) => {
          const pos = d.positions.get(c.cle)!;
          return <Carte1 key={c.cle} c={c} ctx={ctx} ailleurs={ailleurs.get(c.cle)} mesure={mesure(c.cle)} style={{ left: pos.x, top: yCarte(c.cle), width: pos.largeur }} />;
        })}
        {entites.map((e) => {
          const pos = d.positions.get(e.cle)!;
          return <CarteEnt key={e.cle} e={e} ctx={ctx} heberge={heberge.get(e.cle)} mesure={mesure(e.cle)} style={{ left: pos.x, top: yRang[pos.rang], width: pos.largeur }} />;
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

function Liste({ plan, replies, replier, ctx }: { plan: PlanOrganigramme; replies: Set<string>; replier: (k: string) => void; ctx: Ctx }) {
  const pli = (k: string, l: CarteEntite[]) => (
    <button type="button" className={`orgl-pli liste ${replies.has(k) ? 'ferme' : ''}`} aria-expanded={!replies.has(k)} onClick={() => replier(k)} title={replies.has(k) ? 'Déplier' : 'Replier'}>
      {replies.has(k) ? `+${descendants(l)}` : '−'}
    </button>
  );
  const branche = (l: CarteEntite[]) => (
    <ul className="orgl-l-sous">
      {l.map((e) => (
        <li key={e.cle} style={{ '--c': e.ancre.couleur } as CSSProperties}>
          <CarteEnt e={e} ctx={ctx} />
          {e.enfants.length > 0 && pli(e.cle, e.enfants)}
          {e.enfants.length > 0 && !replies.has(e.cle) && branche(e.enfants)}
        </li>
      ))}
    </ul>
  );
  const colonne = (col: Colonne) => (
    // Un poste seul (rien en dessous) : deux par ligne ; une carte qui porte une branche : toute la largeur.
    <div key={col.cle} className={`orgl-l-colonne ${col.carte && !col.enfants.length ? 'seule' : ''}`}>
      {col.carte && <Carte1 c={col.carte} ctx={ctx} />}
      {col.enfants.length > 0 && col.carte && pli(col.cle, col.enfants)}
      {col.enfants.length > 0 && !replies.has(col.cle) && branche(col.enfants)}
    </div>
  );
  return (
    <div className="orgl-liste">
      {plan.cadres.map((c) => (
        <section
          key={c.cle}
          className={`orgl-l-cadre ${c.u ? '' : 'sans'}`}
          style={{ '--c': c.couleur } as CSSProperties}
          data-depot={ctx.edition ? `cadre:${c.cle}` : undefined}
        >
          <TeteCadre c={c} ctx={ctx} />
          {c.colonnes.map(colonne)}
          {!c.colonnes.length && ctx.edition && <p className="orgl-cadre-vide muted">{c.cle === SANS ? 'Aucun groupe dont le responsable ne siège dans aucun comité.' : 'Aucun poste.'}</p>}
        </section>
      ))}
    </div>
  );
}

// ---------- Profil ----------

/** Profil d'une personne : coordonnées, et ses fonctions dans chaque entité du club (même personne : voir quiDe). */
export function ProfilOrga({
  m,
  units,
  onClose,
  onFiche,
  onDeplacer,
  note,
}: {
  m: OrgMember;
  units: OrgUnit[];
  onClose: () => void;
  onFiche?: () => void;
  /** En modification : la prendre en main, puis toucher le poste, le ★ ou les bénévoles où la poser (au doigt). */
  onDeplacer?: () => void;
  note?: string;
}) {
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
        {onDeplacer && (
          <button className="btn" title="Puis touche le poste, le ★ ou les bénévoles où la poser" onClick={onDeplacer}>
            ✋ Déplacer
          </button>
        )}
        {onFiche && <button className="btn primary" onClick={onFiche}>Fiche complète</button>}
      </div>
    </Modal>
  );
}
