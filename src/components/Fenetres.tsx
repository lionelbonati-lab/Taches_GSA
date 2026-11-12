import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';

// Vue en fenêtres (cadre commun au PV du comité, FichePv.tsx, et au PV de l'AG, FicheAg.tsx) : comme sur plusieurs
// écrans, trois fenêtres à onglets, celle du haut et celle du bas à gauche, et à droite, en projection (sans
// projection : les deux au centre, les onglets de droite en haut). Chaque partie du point est un onglet, que l'on fait
// glisser dans la fenêtre voulue (retenu sur l'appareil ; « Onglets d'origine »), et les barres entre les fenêtres se
// tirent. En haut, un bandeau (la séance, et où en est le point) et, dessous, une barre d'outils fixe.

export type Fenetre = 'haut' | 'bas' | 'droite';
const FENETRES: { id: Fenetre; nom: string }[] = [
  { id: 'haut', nom: 'Fenêtre du haut' },
  { id: 'bas', nom: 'Fenêtre du bas' },
  { id: 'droite', nom: 'Fenêtre de droite' },
];
export type Disposition<P extends string> = { fenetres: Record<Fenetre, P[]>; actifs: Partial<Record<Fenetre, P>> };

/** Un onglet : son nom, son nombre, s'il a lieu d'être pour ce point, et ce qu'il montre. */
export type ContenuPanneau = { nom: string; nb?: string; dispo: boolean; rendu: () => ReactNode };

/** Disposition retenue sur l'appareil : chaque partie une fois, dans une fenêtre ; une partie absente, à sa place d'origine. */
function lireDisposition<P extends string>(cle: string, origine: Disposition<P>): Disposition<P> {
  const panneaux = FENETRES.flatMap(({ id }) => origine.fenetres[id]);
  try {
    const lue = JSON.parse(localStorage.getItem(cle) ?? 'null') as Partial<Disposition<P>> | null;
    if (!lue?.fenetres) return origine;
    const placees = new Set<P>();
    const fenetres = { haut: [], bas: [], droite: [] } as Record<Fenetre, P[]>;
    for (const { id } of FENETRES)
      for (const p of lue.fenetres[id] ?? [])
        if (panneaux.includes(p) && !placees.has(p)) {
          placees.add(p);
          fenetres[id].push(p);
        }
    for (const { id } of FENETRES) fenetres[id].push(...origine.fenetres[id].filter((p) => !placees.has(p)));
    return { fenetres, actifs: lue.actifs ?? {} };
  } catch {
    return origine;
  }
}

/** Quels onglets dans quelle fenêtre, et lequel s'y montre : réglé en les faisant glisser, retenu sur l'appareil. */
function useDisposition<P extends string>(cle: string, origine: Disposition<P>) {
  const [d, setD] = useState(() => lireDisposition(cle, origine));
  const changer = (n: Disposition<P> | null) => {
    setD(n ?? origine);
    try {
      if (n) localStorage.setItem(cle, JSON.stringify(n));
      else localStorage.removeItem(cle);
    } catch {
      /* navigation privée : non retenue */
    }
  };
  // L'onglet `p` dans la fenêtre `vers` (avant l'onglet `avant`, sinon au bout), où il se montre.
  const deplacer = (p: P, vers: Fenetre, avant?: P) => {
    const fenetres = Object.fromEntries(FENETRES.map(({ id }) => [id, d.fenetres[id].filter((x) => x !== p)])) as Record<Fenetre, P[]>;
    const i = avant && avant !== p ? fenetres[vers].indexOf(avant) : -1;
    fenetres[vers].splice(i < 0 ? fenetres[vers].length : i, 0, p);
    changer({ fenetres, actifs: { ...d.actifs, [vers]: p } });
  };
  return {
    d,
    deplacer,
    activer: (f: Fenetre, p: P) => changer({ ...d, actifs: { ...d.actifs, [f]: p } }),
    remettre: () => changer(null),
    origine: JSON.stringify(d.fenetres) === JSON.stringify(origine.fenetres),
  };
}

/**
 * L'écran en fenêtres. `cle` : le point affiché (autre point : les fenêtres repartent du haut, et à la souris on écrit
 * tout de suite dans l'onglet « notes ») ; `cles` : où retenir la disposition et le partage des fenêtres ; `id` :
 * préfixe des identifiants des onglets ; `ou` : où en est le point (sous le bandeau).
 */
export function EcranFenetres<P extends string>({ cle, cles, id, origine, panneaux, projection, editable, entete, ou, barre, label }: {
  cle: string;
  cles: { onglets: string; hauteur: string; largeur: string };
  id: string;
  origine: Disposition<P>;
  panneaux: Record<P, ContenuPanneau>;
  projection: boolean;
  editable: boolean;
  entete?: ReactNode;
  ou?: ReactNode;
  barre?: ReactNode;
  label: string;
}) {
  const gauche = useRef<HTMLDivElement>(null);
  const ecran = useRef<HTMLDivElement>(null);
  // Fenêtres réglables, comme sur plusieurs écrans : la hauteur de celle du haut (le reste pour celle du bas) et, en
  // projection, la largeur de celles de gauche (le reste pour celle de droite). Retenues sur l'appareil.
  const [hautPoint, setHautPoint] = usePart(cles.hauteur, 0.5);
  const [largeFiche, setLargeFiche] = usePart(cles.largeur, 0.48);
  const { d, deplacer, activer, remettre, origine: dOrigine } = useDisposition(cles.onglets, origine);
  // Onglet que l'on fait glisser, et la fenêtre où il tomberait.
  const [glisse, setGlisse] = useState<P | null>(null);
  const [cible, setCible] = useState<Fenetre | null>(null);
  // Autre point : les fenêtres repartent du haut ; à la souris (ordinateur, beamer), on écrit tout de suite dans ses notes.
  useLayoutEffect(() => {
    ecran.current?.querySelectorAll('.pv-fenetre-corps').forEach((el) => el.scrollTo({ top: 0 }));
    if (!editable || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const n = ecran.current?.querySelector<HTMLElement>('[data-panneau="notes"] .note-riche[contenteditable="true"]');
    if (!n) return;
    n.focus({ preventScroll: true });
    const sel = document.getSelection();
    sel?.selectAllChildren(n);
    sel?.collapseToEnd();
  }, [cle, editable]);

  // Sans projection, pas de fenêtre de droite : ses onglets dans celle du haut.
  const vues: Record<Fenetre, P[]> = projection ? d.fenetres : { haut: [...d.fenetres.haut, ...d.fenetres.droite], bas: d.fenetres.bas, droite: [] };
  const fenetre = (f: Fenetre) => {
    const nom = FENETRES.find((x) => x.id === f)!.nom;
    // Les onglets de ce point (une note de section : ni vote, ni checklist…).
    const visibles = vues[f].filter((p) => panneaux[p].dispo);
    const choisi = d.actifs[f];
    const actif = choisi && visibles.includes(choisi) ? choisi : visibles[0];
    // Au clavier : ← → d'un onglet à l'autre.
    const parFleche = (e: KeyboardEvent<HTMLDivElement>) => {
      const sens = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!sens || !actif) return;
      e.preventDefault();
      const p = visibles[(visibles.indexOf(actif) + sens + visibles.length) % visibles.length];
      activer(f, p);
      e.currentTarget.querySelector<HTMLButtonElement>(`[data-onglet="${p}"]`)?.focus();
    };
    return (
      <section
        key={f}
        className={`panel pv-fenetre f-${f} ${cible === f ? 'cible' : ''}`}
        aria-label={nom}
        onDragOver={(e) => {
          if (!glisse) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (cible !== f) setCible(f);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCible((c) => (c === f ? null : c));
        }}
        onDrop={(e) => {
          if (!glisse) return;
          e.preventDefault();
          const avant = e.target instanceof Element ? (e.target.closest<HTMLElement>('[data-onglet]')?.dataset.onglet as P | undefined) : undefined;
          deplacer(glisse, f, avant);
          setGlisse(null);
          setCible(null);
        }}
      >
        <div className="pv-fiche-onglets" role="tablist" aria-label={`Onglets : ${nom.toLowerCase()}`} onKeyDown={parFleche}>
          {visibles.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              id={`${id}-${f}-${p}`}
              data-onglet={p}
              aria-selected={p === actif}
              aria-controls={`${id}-${f}-contenu`}
              tabIndex={p === actif ? 0 : -1}
              className={p === actif ? 'on' : ''}
              draggable
              title="Glisser vers une autre fenêtre pour l’y afficher"
              onClick={() => activer(f, p)}
              onDragStart={(e) => {
                setGlisse(p);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', panneaux[p].nom);
              }}
              onDragEnd={() => {
                setGlisse(null);
                setCible(null);
              }}
            >
              {panneaux[p].nom}
              {panneaux[p].nb && <span className="pv-fiche-nb">{panneaux[p].nb}</span>}
            </button>
          ))}
        </div>
        {actif ? (
          <div className={`pv-fenetre-corps p-${actif}`} role="tabpanel" id={`${id}-${f}-contenu`} aria-labelledby={`${id}-${f}-${actif}`} data-panneau={actif}>
            <Fragment key={cle}>{panneaux[actif].rendu()}</Fragment>
          </div>
        ) : (
          <p className="muted pv-fenetre-vide">{vues[f].length ? 'Rien à montrer ici pour ce point.' : 'Glisse ici un onglet d’une autre fenêtre.'}</p>
        )}
      </section>
    );
  };

  return (
    <div
      ref={ecran}
      className={`pv-fiche-ecran no-print ${projection ? 'avec-projection' : ''} ${glisse ? 'glisse' : ''}`}
      style={{ '--fr-point': `${hautPoint}fr`, '--fr-notes': `${1 - hautPoint}fr`, '--fr-fiche': `${largeFiche}fr`, '--fr-projection': `${1 - largeFiche}fr` } as CSSProperties}
      role="dialog"
      aria-label={label}
    >
      <div className="pv-fiche-haut">
        <header className="pv-fiche-entete" aria-label="Séance">
          {entete}
          {ou && <small className="muted pv-fiche-ou">{ou}</small>}
          {!dOrigine && (
            <button type="button" className="link-btn pv-fiche-origine" onClick={remettre} title="Remettre chaque onglet dans sa fenêtre d’origine">
              Onglets d’origine
            </button>
          )}
        </header>
        {barre}
      </div>
      <div className="pv-fiche-gauche" ref={gauche}>
        {fenetre('haut')}
        <Separateur sens="haut" part={hautPoint} setPart={setHautPoint} zone={gauche} nom="Hauteur des fenêtres du haut et du bas" />
        {fenetre('bas')}
      </div>
      {projection && (
        <>
          <Separateur sens="large" part={largeFiche} setPart={setLargeFiche} zone={ecran} nom="Largeur des fenêtres de gauche et de droite" />
          {fenetre('droite')}
        </>
      )}
    </div>
  );
}

const MIN = 0.15;
const MAX = 0.85;
const borne = (f: number) => Math.round(Math.min(MAX, Math.max(MIN, f)) * 1000) / 1000;

/** Part d'une fenêtre (0 à 1), retenue sur l'appareil ; `null` remet celle d'origine. */
function usePart(cle: string, defaut: number): [number, (f: number | null, retenir?: boolean) => void] {
  const [part, setPart] = useState(() => {
    try {
      const v = Number(localStorage.getItem(cle));
      return v >= MIN && v <= MAX ? v : defaut;
    } catch {
      return defaut;
    }
  });
  const regler = (f: number | null, retenir = true) => {
    const v = f === null ? defaut : borne(f);
    setPart(v);
    if (!retenir) return;
    try {
      if (f === null) localStorage.removeItem(cle);
      else localStorage.setItem(cle, String(v));
    } catch {
      /* navigation privée : non retenue */
    }
  };
  return [part, regler];
}

/**
 * Barre entre deux fenêtres, à tirer (souris ou doigt) ou au clavier (flèches) ; double-clic : partage d'origine.
 * `haut` : entre le point et ses notes (hauteur) ; `large` : entre la fiche et la projection (largeur).
 */
function Separateur({ sens, part, setPart, zone, nom }: { sens: 'haut' | 'large'; part: number; setPart: (f: number | null, retenir?: boolean) => void; zone: RefObject<HTMLElement>; nom: string }) {
  const tire = useRef(false);
  // Place de la barre dans sa zone (marges et barre comprises) → part de la première fenêtre.
  const partDe = (e: PointerEvent<HTMLDivElement>) => {
    const el = zone.current;
    if (!el) return part;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const barre = e.currentTarget.getBoundingClientRect();
    const [debut, taille, ici, epaisseur] =
      sens === 'haut'
        ? [r.top + parseFloat(cs.paddingTop), r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), e.clientY, barre.height]
        : [r.left + parseFloat(cs.paddingLeft), r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), e.clientX, barre.width];
    return taille > epaisseur ? (ici - debut - epaisseur / 2) / (taille - epaisseur) : part;
  };
  return (
    <div
      className={`pv-separateur ${sens}`}
      role="separator"
      aria-orientation={sens === 'haut' ? 'horizontal' : 'vertical'}
      aria-label={nom}
      aria-valuemin={MIN * 100}
      aria-valuemax={MAX * 100}
      aria-valuenow={Math.round(part * 100)}
      tabIndex={0}
      title={`${nom} : tirer pour régler · double-clic : comme à l’origine`}
      onPointerDown={(e) => {
        tire.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => tire.current && setPart(partDe(e), false)}
      onPointerUp={(e) => {
        if (!tire.current) return;
        tire.current = false;
        setPart(partDe(e));
      }}
      onPointerCancel={() => {
        tire.current = false;
        setPart(part);
      }}
      onDoubleClick={() => setPart(null)}
      onKeyDown={(e) => {
        const pas = { ArrowUp: -0.05, ArrowLeft: -0.05, ArrowDown: 0.05, ArrowRight: 0.05 }[e.key];
        if (pas === undefined) return;
        e.preventDefault();
        setPart(part + pas);
      }}
    >
      <span aria-hidden />
    </div>
  );
}
