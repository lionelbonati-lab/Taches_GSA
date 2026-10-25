import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// Liste déroulante qui montre des icônes dessinées (une liste native n'affiche que du texte) : celle des entités
// (bibliothèque d'icônes), des types… Se comporte comme une liste native : clic, flèches, Début / Fin, lettres tapées,
// Entrée pour choisir, Échap pour fermer ; sur téléphone, la liste s'ouvre sous le champ (ou au-dessus faute de place).
// Le champ garde le focus (combobox « select-only ») ; la liste est posée sur la page, au-dessus des fenêtres.

export interface ChoixDeroulante {
  value: string;
  label: string;
  icone?: ReactNode;
  disabled?: boolean;
}
export interface GroupeDeroulante {
  groupe: string;
  icone?: ReactNode;
  options: ChoixDeroulante[];
}
type Entree = ChoixDeroulante | GroupeDeroulante | false | null | undefined;

const norme = (s: string) => s.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '').replace(/^[^\p{L}\p{N}]+/u, '');

export function Deroulante({ value, onChange, options, libelle, disabled, puce, title, 'aria-label': ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  /** Choix, et groupes de choix (titre en tête) ; `false` / `null` ignorés (choix conditionnels). */
  options: Entree[];
  /** Texte fixe du champ (liste d'actions, ex. « ＋ Ajouter… ») : aucun choix n'y est retenu. */
  libelle?: string;
  disabled?: boolean;
  /** Petit champ arrondi (« ＋ Ajouter… » au bout d'une rangée de puces). */
  puce?: boolean;
  title?: string;
  'aria-label'?: string;
}) {
  const id = useId();
  const bouton = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const tape = useRef({ txt: '', t: 0 });
  const appui = useRef(false);

  const entrees = options.filter(Boolean) as (ChoixDeroulante | GroupeDeroulante)[];
  const plats = entrees.flatMap((e) => ('groupe' in e ? e.options : [e]));
  const choisi = plats.find((o) => o.value === value) ?? (libelle ? undefined : plats[0]);
  const permis = (i: number) => i >= 0 && i < plats.length && !plats[i].disabled;

  const placer = () => {
    const b = bouton.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const l = liste.current;
    const w = Math.min(Math.max(r.width, l?.offsetWidth ?? 0), vw - 16);
    const h = l?.scrollHeight ?? 0;
    const dessous = vh - r.bottom - 12;
    const dessus = r.top - 12;
    const enHaut = dessous < Math.min(h, 240) && dessus > dessous;
    const left = Math.round(Math.min(Math.max(8, r.left), vw - w - 8));
    setPos({
      left,
      minWidth: Math.min(r.width, vw - 16),
      maxWidth: vw - 16,
      maxHeight: Math.max(120, Math.min(360, enHaut ? dessus : dessous)),
      ...(enHaut ? { bottom: Math.round(vh - r.top + 4) } : { top: Math.round(r.bottom + 4) }),
    });
  };
  const ouvrir = (i?: number) => {
    if (disabled || ouvert) return;
    const sel = choisi ? plats.indexOf(choisi) : -1;
    setActif(i ?? (permis(sel) ? sel : plats.findIndex((o) => !o.disabled)));
    setPos(null);
    setOuvert(true);
    bouton.current?.focus();
  };
  const fermer = () => setOuvert(false);
  const prendre = (i: number) => {
    if (!permis(i)) return;
    fermer();
    bouton.current?.focus();
    if (plats[i].value !== value) onChange(plats[i].value);
  };

  // Première mesure (largeur, hauteur de la liste) avant l'affichage, puis à chaque défilement / redimensionnement.
  useLayoutEffect(() => {
    if (ouvert) placer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);
  useEffect(() => {
    if (!ouvert) return;
    const suivre = (e: Event) => {
      if (e.target instanceof Node && liste.current?.contains(e.target)) return;
      placer();
    };
    const dehors = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!bouton.current?.contains(t) && !liste.current?.contains(t)) fermer();
    };
    window.addEventListener('scroll', suivre, true);
    window.addEventListener('resize', suivre);
    document.addEventListener('pointerdown', dehors, true);
    return () => {
      window.removeEventListener('scroll', suivre, true);
      window.removeEventListener('resize', suivre);
      document.removeEventListener('pointerdown', dehors, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);
  useEffect(() => {
    if (ouvert && pos && actif >= 0) document.getElementById(`${id}-${actif}`)?.scrollIntoView({ block: 'nearest' });
  }, [ouvert, pos, actif, id]);

  const deplacer = (depart: number, pas: number) => {
    for (let i = depart + pas; i >= 0 && i < plats.length; i += pas) if (!plats[i].disabled) return i;
    return permis(depart) ? depart : -1;
  };
  const chercher = (car: string) => {
    const t = Date.now();
    const meme = t - tape.current.t < 700;
    tape.current = { txt: (meme ? tape.current.txt : '') + car, t };
    const q = norme(tape.current.txt);
    const debut = ouvert ? actif : choisi ? plats.indexOf(choisi) : -1;
    const ordre = [...plats.keys()].map((k) => (k + debut + (tape.current.txt.length > 1 ? 0 : 1)) % plats.length);
    return ordre.find((i) => !plats[i].disabled && norme(plats[i].label).startsWith(q));
  };
  const clavier = (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key;
    if (e.ctrlKey || e.metaKey) return;
    const dernier = deplacer(plats.length, -1);
    if (!ouvert) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(k)) {
        e.preventDefault();
        ouvrir(k === 'Home' ? deplacer(-1, 1) : k === 'End' ? dernier : undefined);
      } else if (k.length === 1 && !e.altKey) {
        const i = chercher(k);
        if (i !== undefined) ouvrir(i);
      }
      return;
    }
    const pas: Record<string, () => number> = {
      ArrowDown: () => deplacer(actif, 1),
      ArrowUp: () => deplacer(actif, -1),
      Home: () => deplacer(-1, 1),
      End: () => dernier,
      PageDown: () => { let i = actif; for (let n = 0; n < 8; n++) i = deplacer(i, 1); return i; },
      PageUp: () => { let i = actif; for (let n = 0; n < 8; n++) i = deplacer(i, -1); return i; },
    };
    if (pas[k]) {
      e.preventDefault();
      setActif(pas[k]());
    } else if (k === 'Enter' || (k === ' ' && Date.now() - tape.current.t > 700)) {
      e.preventDefault();
      prendre(actif);
    } else if (k === 'Escape') {
      // Ferme la liste seulement (pas la fenêtre autour).
      e.preventDefault();
      e.stopPropagation();
      fermer();
    } else if (k === 'Tab') {
      fermer();
    } else if (k.length === 1 && !e.altKey) {
      const i = chercher(k);
      if (i !== undefined) setActif(i);
    }
  };

  let n = -1;
  const option = (o: ChoixDeroulante) => {
    const i = ++n;
    const sel = o === choisi;
    return (
      <div
        key={`${i}:${o.value}`}
        id={`${id}-${i}`}
        role="option"
        aria-selected={sel}
        aria-disabled={o.disabled || undefined}
        className={`deroulante-option ${i === actif ? 'actif' : ''} ${sel ? 'choisi' : ''}`}
        onPointerMove={() => !o.disabled && i !== actif && setActif(i)}
        onClick={() => prendre(i)}
      >
        {o.icone}
        <span className="deroulante-texte">{o.label}</span>
        {sel && <Check className="deroulante-coche" size="1em" aria-hidden="true" />}
      </div>
    );
  };

  return (
    <span className={`deroulante ${puce ? 'puce' : ''}`}>
      <button
        ref={bouton}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-controls={ouvert ? `${id}-liste` : undefined}
        aria-activedescendant={ouvert && actif >= 0 ? `${id}-${actif}` : undefined}
        aria-label={ariaLabel}
        title={title}
        className="deroulante-bouton"
        disabled={disabled}
        // Un clic sur le libellé (<label>) autour ne l'ouvre pas, comme une liste native : seul un appui sur le champ.
        onPointerDown={() => { appui.current = true; }}
        onPointerCancel={() => { appui.current = false; }}
        onClick={() => {
          if (!appui.current) return;
          appui.current = false;
          if (ouvert) fermer();
          else ouvrir();
        }}
        onKeyDown={clavier}
        onBlur={() => ouvert && fermer()}
      >
        <span className="deroulante-valeur">
          {!libelle && choisi?.icone}
          <span className="deroulante-texte">{libelle ?? choisi?.label}</span>
        </span>
        <ChevronDown className="deroulante-fleche" size="1.1em" aria-hidden="true" />
      </button>
      {ouvert &&
        createPortal(
          <div
            ref={liste}
            id={`${id}-liste`}
            role="listbox"
            aria-label={ariaLabel}
            className="deroulante-liste"
            style={pos ?? { visibility: 'hidden', left: 0, top: 0 }}
            // Le champ garde le focus pendant qu'on choisit (sinon la liste se fermerait).
            onMouseDown={(e) => e.preventDefault()}
          >
            {entrees.map((e, g) =>
              'groupe' in e ? (
                e.options.length > 0 && (
                  <div key={`g${g}`} role="group" aria-labelledby={`${id}-g${g}`}>
                    <div id={`${id}-g${g}`} className="deroulante-groupe">{e.icone}{e.groupe}</div>
                    {e.options.map(option)}
                  </div>
                )
              ) : (
                option(e)
              ),
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
