import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
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
  const [pos, setPos] = useState<Pos | null>(() => lire<Pos | null>(cle, null));
  const [reduite, setReduite] = useState(() => lire(`${cle}-reduite`, false));
  const glisse = useRef<{ dx: number; dy: number; arrivee?: Pos } | null>(null);

  // Toujours entièrement à l'écran (fenêtre plus petite, pilule agrandie).
  const borner = (p: Pos): Pos => {
    const el = ref.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    return { x: Math.round(Math.min(Math.max(4, p.x), window.innerWidth - w - 4)), y: Math.round(Math.min(Math.max(4, p.y), window.innerHeight - h - 4)) };
  };
  useLayoutEffect(() => {
    setPos((p) => (p ? borner(p) : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduite, outils.length]);
  useEffect(() => {
    const f = () => setPos((p) => (p ? borner(p) : p));
    window.addEventListener('resize', f);
    // Pilule agrandie (palette de couleurs ouverte…) : toujours à l'écran.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(f);
    if (ref.current) ro?.observe(ref.current);
    return () => {
      window.removeEventListener('resize', f);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placer = (p: Pos | null) => {
    const b = p && borner(p);
    setPos(b);
    ecrire(cle, b);
  };
  const debut = (e: PointerEvent<HTMLElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    glisse.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const bouge = (e: PointerEvent<HTMLElement>) => {
    const g = glisse.current;
    if (!g) return;
    g.arrivee = borner({ x: e.clientX - g.dx, y: e.clientY - g.dy });
    setPos(g.arrivee);
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

  return (
    <div ref={ref} className={`pilule no-print ${pos ? '' : 'defaut'} ${titre || (ligne2 && !reduite) ? 'avec-titre' : ''}`} style={pos ? { left: pos.x, top: pos.y } : undefined} role="toolbar" aria-label={label}>
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
