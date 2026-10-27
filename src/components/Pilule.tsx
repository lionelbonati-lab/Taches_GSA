import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Icone, type IconeNom } from './icones';

// Barre d'outils flottante (« pilule »), en icônes seulement : on la déplace en la tenant par sa poignée (souris ou
// doigt, flèches du clavier) ; un double-clic sur la poignée la remet à sa place. Place et état (réduite ou non)
// retenus sur l'appareil. Un affichage (chrono…) reste visible quand elle est réduite. `titre` : une ligne au-dessus des
// outils (coupée à leur largeur) ; `ligne2` : une 2e ligne d'outils (mise en forme du texte), cachée quand elle est réduite.

export interface OutilPilule {
  /** Bouton : son icône. Sans icône : un affichage (`texte`). */
  icone?: IconeNom;
  texte?: ReactNode;
  /** Bulle d'aide et nom lu par les lecteurs d'écran. */
  titre: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Pastille d'état sur l'icône (enregistrement : à jour, envoi, hors ligne). */
  etat?: 'ok' | 'envoi' | 'off';
  /** Trait de séparation avant cet outil. */
  separe?: boolean;
}

type Pos = { x: number; y: number };
/** Place choisie, en proportion de l'écran (0 : bord gauche / haut, 1 : bord droit / bas) : la pilule la garde quand
 *  l'écran tourne ou que le clavier s'ouvre, toujours entièrement à l'écran. */
type Place = { fx: number; fy: number };
const MARGE = 4;
const lire = <T,>(cle: string, defaut: T): T => {
  try {
    const v = localStorage.getItem(cle);
    return v ? (JSON.parse(v) as T) : defaut;
  } catch {
    return defaut;
  }
};
const ecrire = (cle: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, JSON.stringify(v));
  } catch {
    /* navigation privée : place non retenue */
  }
};

export function Pilule({ id, label, titre, outils, ligne2 }: { id: string; label: string; titre?: ReactNode; outils: OutilPilule[]; ligne2?: ReactNode }) {
  const cle = `taches-gsa-pilule-${id}`;
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(() => {
    const p = lire<Partial<Place> | null>(cle, null);
    return typeof p?.fx === 'number' && typeof p.fy === 'number' ? { fx: p.fx, fy: p.fy } : null;
  });
  const [reduite, setReduite] = useState(() => lire(`${cle}-reduite`, false));
  const glisse = useRef<{ dx: number; dy: number; arrivee?: Place } | null>(null);

  // Coin en haut à gauche voulu (pixels) → place en proportion de l'espace libre autour de la pilule.
  const versPlace = ({ x, y }: Pos): Place => {
    const el = ref.current;
    const f = (v: number, libre: number) => (libre > 0 ? Math.round(Math.min(1, Math.max(0, (v - MARGE) / libre)) * 1e4) / 1e4 : 0);
    return {
      fx: f(x, document.documentElement.clientWidth - (el?.offsetWidth ?? 0) - 2 * MARGE),
      fy: f(y, window.innerHeight - (el?.offsetHeight ?? 0) - 2 * MARGE),
    };
  };
  const placer = (p: Pos | null) => {
    const pl = p && versPlace(p);
    setPlace(pl);
    ecrire(cle, pl);
  };
  // Place retenue par une version précédente (en pixels) : reprise en proportion de l'écran.
  useLayoutEffect(() => {
    const p = lire<Partial<Pos> | null>(cle, null);
    if (typeof p?.x === 'number' && typeof p.y === 'number') placer({ x: p.x, y: p.y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const debut = (e: PointerEvent<HTMLElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    glisse.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const bouge = (e: PointerEvent<HTMLElement>) => {
    const g = glisse.current;
    if (!g) return;
    g.arrivee = versPlace({ x: e.clientX - g.dx, y: e.clientY - g.dy });
    setPlace(g.arrivee);
  };
  const fin = () => {
    if (glisse.current?.arrivee) ecrire(cle, glisse.current.arrivee);
    glisse.current = null;
  };
  const clavier = (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[e.key];
    if (!d) return;
    e.preventDefault();
    const r = ref.current!.getBoundingClientRect();
    placer({ x: r.left + d[0], y: r.top + d[1] });
  };
  const basculer = () => {
    ecrire(`${cle}-reduite`, !reduite);
    setReduite(!reduite);
  };

  // Calculée par le navigateur à chaque changement de taille de l'écran ou de la pilule : 4 px + fx × (largeur libre).
  const style = place && {
    left: `calc(${MARGE}px + ${place.fx} * (100% - ${2 * MARGE}px))`,
    top: `calc(${MARGE}px + ${place.fy} * (100% - ${2 * MARGE}px))`,
    transform: `translate(${-100 * place.fx}%, ${-100 * place.fy}%)`,
  };

  return (
    <div ref={ref} className={`pilule no-print ${place ? 'placee' : 'defaut'} ${titre || (ligne2 && !reduite) ? 'avec-titre' : ''}`} style={style ?? undefined} role="toolbar" aria-label={label}>
      {/* Le titre sert aussi de poignée (plus grand à saisir au doigt). */}
      {titre && (
        <div className="pilule-titre" onPointerDown={debut} onPointerMove={bouge} onPointerUp={fin} onPointerCancel={fin} onDoubleClick={() => placer(null)}>
          {titre}
        </div>
      )}
      <div className="pilule-barre">
        <button
          type="button"
          className="poignee"
          title="Déplacer (glisser) · double-clic : remettre en place"
          aria-label="Déplacer la barre d’outils (flèches du clavier)"
          onPointerDown={debut}
          onPointerMove={bouge}
          onPointerUp={fin}
          onPointerCancel={fin}
          onDoubleClick={() => placer(null)}
          onKeyDown={clavier}
        >
          <Icone n="poignee" />
        </button>
        {(reduite ? outils.filter((o) => !o.icone) : outils).map((o) => (
          <span key={o.icone ?? o.titre} className="pilule-outil">
            {o.separe && !reduite && <span className="pilule-sep" aria-hidden />}
            {o.icone ? (
              <button type="button" title={o.titre} aria-label={o.titre} disabled={o.disabled} onClick={o.onClick}>
                <Icone n={o.icone} />
                {o.etat && <span className={`pilule-etat ${o.etat}`} aria-hidden />}
              </button>
            ) : (
              <span className="pilule-texte" title={o.titre}>
                {o.texte}
              </span>
            )}
          </span>
        ))}
        <button type="button" className="pilule-plier" title={reduite ? 'Afficher les outils' : 'Réduire'} aria-label={reduite ? 'Afficher les outils' : 'Réduire la barre d’outils'} aria-expanded={!reduite} onClick={basculer}>
          <Icone n={reduite ? 'pleinEcran' : 'quitterPleinEcran'} />
        </button>
      </div>
      {ligne2 && !reduite && <div className="pilule-barre pilule-ligne2">{ligne2}</div>}
    </div>
  );
}
