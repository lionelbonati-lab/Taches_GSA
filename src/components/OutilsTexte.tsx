import { useEffect, useState, type MouseEvent } from 'react';
import { hex } from '../data/noteRiche';
import { Icone, type IconeNom } from './icones';

// Mise en forme des notes du PV (2e ligne de la pilule) : couleur, gras, italique, souligné, barré. S'applique à la
// sélection de la dernière note où l'on écrivait : gardée quand on touche la pilule (au doigt, la note perd alors le
// focus), puis rendue à la note avant d'appliquer.

const COULEURS = [
  { c: '#b91c1c', nom: 'Rouge' },
  { c: '#1d4ed8', nom: 'Bleu' },
  { c: '#047857', nom: 'Vert' },
  { c: '#c2410c', nom: 'Orange' },
  { c: '#7c3aed', nom: 'Violet' },
  { c: '#475569', nom: 'Gris' },
];

const STYLES: { cmd: string; icone: IconeNom; titre: string; cle: 'gras' | 'italique' | 'souligne' | 'barre' }[] = [
  { cmd: 'bold', icone: 'gras', titre: 'Gras (Ctrl+B)', cle: 'gras' },
  { cmd: 'italic', icone: 'italique', titre: 'Italique (Ctrl+I)', cle: 'italique' },
  { cmd: 'underline', icone: 'souligne', titre: 'Souligné (Ctrl+U)', cle: 'souligne' },
  { cmd: 'strikeThrough', icone: 'barre', titre: 'Barré', cle: 'barre' },
];

type Cible = { el: HTMLElement; range: Range };
const ETATS_VIDES = { gras: false, italique: false, souligne: false, barre: false, couleur: null as string | null };

const etat = (cmd: string) => {
  try {
    return document.queryCommandState(cmd);
  } catch {
    return false;
  }
};
function lireEtats(el: HTMLElement) {
  let c: string | null = null;
  try {
    c = hex(document.queryCommandValue('foreColor'));
  } catch {
    /* navigateur sans cette commande */
  }
  return { gras: etat('bold'), italique: etat('italic'), souligne: etat('underline'), barre: etat('strikeThrough'), couleur: c === hex(getComputedStyle(el).color) ? null : c };
}
const noteDe = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>('.note-riche[contenteditable="true"]') ?? null;
// La note garde le focus (souris) : la sélection reste visible.
const garder = (e: MouseEvent) => e.preventDefault();

export function OutilsTexte() {
  const [cible, setCible] = useState<Cible | null>(null);
  const [etats, setEtats] = useState(ETATS_VIDES);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const suivre = () => {
      const sel = document.getSelection();
      if (!sel?.rangeCount) return;
      const r = sel.getRangeAt(0);
      const el = noteDe(r.commonAncestorContainer);
      if (!el) return;
      setCible({ el, range: r.cloneRange() });
      setEtats(lireEtats(el));
    };
    // Autre champ de saisie : la mise en forme ne s'y applique pas.
    const ailleurs = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && !t.closest('.note-riche, .pilule') && t.matches('input, textarea, select, [contenteditable="true"]')) {
        setCible(null);
        setEtats(ETATS_VIDES);
        setPalette(false);
      }
    };
    document.addEventListener('selectionchange', suivre);
    document.addEventListener('focusin', ailleurs);
    return () => {
      document.removeEventListener('selectionchange', suivre);
      document.removeEventListener('focusin', ailleurs);
    };
  }, []);

  const actif = !!cible?.el.isConnected;
  const appliquer = (cmd: string, valeur?: string) => {
    if (!cible?.el.isConnected) return;
    const { el, range } = cible;
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    const sel = document.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(cmd, false, valeur);
    setEtats(lireEtats(el));
  };
  const couleur = (c: string | null) => {
    // Automatique : la couleur du texte normal, que la note n'enregistre pas.
    if (cible) appliquer('foreColor', c ?? hex(getComputedStyle(cible.el).color) ?? '#000000');
    setPalette(false);
  };
  const aide = (titre: string) => (actif ? titre : `${titre} : clique d’abord dans une note`);

  return (
    <>
      <button
        type="button"
        className={`pilule-couleur ${palette ? 'on' : ''}`}
        title={aide('Couleur du texte')}
        aria-label="Couleur du texte"
        aria-expanded={palette}
        disabled={!actif}
        onMouseDown={garder}
        onClick={() => setPalette(!palette)}
      >
        <Icone n="couleur" />
        <span className="pilule-couleur-trait" style={etats.couleur ? { background: etats.couleur } : undefined} aria-hidden />
      </button>
      {STYLES.map((s) => (
        <button key={s.cmd} type="button" className={etats[s.cle] ? 'on' : ''} title={aide(s.titre)} aria-label={s.titre} aria-pressed={etats[s.cle]} disabled={!actif} onMouseDown={garder} onClick={() => appliquer(s.cmd)}>
          <Icone n={s.icone} />
        </button>
      ))}
      {palette && actif && (
        <span className="pilule-palette" role="group" aria-label="Couleurs" onKeyDown={(e) => e.key === 'Escape' && setPalette(false)}>
          <button type="button" className="pilule-auto" title="Automatique (couleur normale)" aria-label="Automatique (couleur normale)" onMouseDown={garder} onClick={() => couleur(null)}>
            A
          </button>
          {COULEURS.map((x) => (
            <button key={x.c} type="button" className={`pilule-pastille ${etats.couleur === x.c ? 'on' : ''}`} style={{ background: x.c }} title={x.nom} aria-label={x.nom} onMouseDown={garder} onClick={() => couleur(x.c)} />
          ))}
        </span>
      )}
    </>
  );
}
