import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { useStore } from '../data/store';
import type { Meeting, Person, Poll, Task, Voix } from '../data/types';
import { avantSeance, bilanVote, notesSeances, texteVote } from '../data/minutes';
import { childrenOf, fullName, nomPoste } from '../data/utils';
import { etiquettePassee, etiquettesDesLieux } from '../data/etiquettes';
import { pollSummary } from '../data/polls';
import { aPrendreOuverte } from '../data/aPrendre';
import { NoteField } from './NoteField';
import { PiecesJointesPoint, type ChoixPieces } from './PiecesJointesPoint';
import { DocsField, type DocTracking } from './DocsField';
import { IconeEtiquette } from './IconesEtiquette';
import { Rattachements } from './tache/Rattachements';
import { NotesSeances } from './tache/NotesSeances';
import { Deroulante } from './Deroulante';
import { ZoneTexte } from './ZoneTexte';
import { DelaiField, type SetT } from './tache/Quand';
import { Checklist } from './tache/Checklist';
import { Icone } from './icones';

// Fiche du PV (vue en fenêtres) : une option d'affichage de la prise de notes, ouverte et refermée par la pilule (retenue
// sur l'appareil), pour la mener point par point sans rouvrir chaque point. Par-dessus la prise de notes, comme sur
// plusieurs écrans : trois fenêtres à onglets, celle du haut et celle du bas à gauche, et à droite, en projection (sans
// projection : les deux au centre, les onglets de droite en haut). Chaque partie du point est un onglet (le point, son
// vote, sa checklist, ses rattachements, ses étiquettes, ses documents, les séances précédentes, ses notes de séance,
// ses pièces jointes) : on le fait glisser dans la fenêtre voulue (retenu sur l'appareil ; « Onglets d'origine »), et
// les barres entre les fenêtres se tirent. En haut, le bandeau de la séance (et où en est le point) et, dessous, les
// outils de la pilule en barre fixe (elle passe d'un point à l'autre ; le point quitté est enregistré : Minutes.tsx).
// Pas sur téléphone (le PV ne s'y tient pas).

/** Arrêt de la fiche : un point, un sondage, la note d'une section ou « Divers », dans l'ordre de la prise de notes. */
export interface ArretPv {
  /** Clé de sa note dans le PV (`task:…`, `poll:…`, `sec:…`, `divers`), et de sa ligne dans la prise de notes. */
  cle: string;
  nom: string;
  /** « 2. Finances » ; sous-section : « a. Bruntrutaine ». */
  section: string;
  sous?: string;
  sectionId?: string;
  /** Point : tel que le PV le montre (figé après la séance). */
  tache?: Task;
  poll?: Poll;
  /** Sondage rattaché à un point : ce point (ses pièces jointes en projection). */
  pointDuSondage?: Task;
}

/** Les parties d'un point, chacune un onglet, à mettre dans la fenêtre voulue. */
export type Panneau = 'point' | 'vote' | 'checklist' | 'rattachements' | 'etiquettes' | 'documents' | 'seances' | 'notes' | 'pieces';
type Fenetre = 'haut' | 'bas' | 'droite';
const FENETRES: { id: Fenetre; nom: string }[] = [
  { id: 'haut', nom: 'Fenêtre du haut' },
  { id: 'bas', nom: 'Fenêtre du bas' },
  { id: 'droite', nom: 'Fenêtre de droite' },
];
type Disposition = { fenetres: Record<Fenetre, Panneau[]>; actifs: Partial<Record<Fenetre, Panneau>> };
/** À l'origine : le point et ses parties en haut, ses notes en bas, ses pièces jointes à droite (projection). */
const ORIGINE: Disposition = {
  fenetres: { haut: ['point', 'vote', 'checklist', 'rattachements', 'etiquettes', 'documents', 'seances'], bas: ['notes'], droite: ['pieces'] },
  actifs: {},
};
const PANNEAUX = FENETRES.flatMap(({ id }) => ORIGINE.fenetres[id]);
const CLE_ONGLETS = 'taches-gsa-pv-onglets';

/** Disposition retenue sur l'appareil : chaque partie une fois, dans une fenêtre ; une partie absente, à sa place d'origine. */
function lireDisposition(): Disposition {
  try {
    const lue = JSON.parse(localStorage.getItem(CLE_ONGLETS) ?? 'null') as Partial<Disposition> | null;
    if (!lue?.fenetres) return ORIGINE;
    const placees = new Set<Panneau>();
    const fenetres = { haut: [], bas: [], droite: [] } as Record<Fenetre, Panneau[]>;
    for (const { id } of FENETRES)
      for (const p of lue.fenetres[id] ?? [])
        if (PANNEAUX.includes(p) && !placees.has(p)) {
          placees.add(p);
          fenetres[id].push(p);
        }
    for (const { id } of FENETRES) fenetres[id].push(...ORIGINE.fenetres[id].filter((p) => !placees.has(p)));
    return { fenetres, actifs: lue.actifs ?? {} };
  } catch {
    return ORIGINE;
  }
}

/** Quels onglets dans quelle fenêtre, et lequel s'y montre : réglé en les faisant glisser, retenu sur l'appareil. */
function useDisposition() {
  const [d, setD] = useState(lireDisposition);
  const changer = (n: Disposition | null) => {
    setD(n ?? ORIGINE);
    try {
      if (n) localStorage.setItem(CLE_ONGLETS, JSON.stringify(n));
      else localStorage.removeItem(CLE_ONGLETS);
    } catch {
      /* navigation privée : non retenue */
    }
  };
  // L'onglet `p` dans la fenêtre `vers` (avant l'onglet `avant`, sinon au bout), où il se montre.
  const deplacer = (p: Panneau, vers: Fenetre, avant?: Panneau) => {
    const fenetres = Object.fromEntries(FENETRES.map(({ id }) => [id, d.fenetres[id].filter((x) => x !== p)])) as Record<Fenetre, Panneau[]>;
    const i = avant && avant !== p ? fenetres[vers].indexOf(avant) : -1;
    fenetres[vers].splice(i < 0 ? fenetres[vers].length : i, 0, p);
    changer({ fenetres, actifs: { ...d.actifs, [vers]: p } });
  };
  return {
    d,
    deplacer,
    activer: (f: Fenetre, p: Panneau) => changer({ ...d, actifs: { ...d.actifs, [f]: p } }),
    remettre: () => changer(null),
    origine: JSON.stringify(d.fenetres) === JSON.stringify(ORIGINE.fenetres),
  };
}

export function FichePv({
  arret,
  position,
  point,
  setPoint,
  modifiable,
  editable,
  meta,
  changes,
  note,
  onNote,
  projection,
  projete,
  choixPieces,
  erreur,
  enregistre,
  ouvrir,
  rattacher,
  track,
  seance,
  entete,
  barre,
  vote,
}: {
  arret: ArretPv;
  position: { i: number; n: number };
  /** Point affiché (le brouillon s'il a été changé). */
  point?: Task;
  setPoint: SetT;
  /** On peut modifier le point (PV modifiable et droits sur le point). */
  modifiable: boolean;
  /** PV modifiable (notes). */
  editable: boolean;
  meta: string[];
  changes: string[];
  note: string;
  onNote: (v: string) => void;
  projection: boolean;
  /** Point dont les pièces jointes sont projetées (la tâche telle qu'elle est). */
  projete?: Task;
  choixPieces: ChoixPieces;
  erreur?: string;
  /** Le point tel qu'il est enregistré (ses points rattachés, ses liens). */
  enregistre?: Task;
  /** Ouvre un point par-dessus la fiche (rattaché, ou nouveau point rattaché). */
  ouvrir: (x: Task, nouvelle: boolean) => void;
  /** Rattache (ou détache : undefined) un point existant, inscrit au PV. */
  rattacher: (taskId: string, parentId: string | undefined) => void;
  /** Fichiers ajoutés ou retirés dans la fiche (retirés : effacés une fois le point enregistré). */
  track: DocTracking;
  /** Séance du PV : l'onglet « Séances précédentes » montre les notes des PV d'avant. */
  seance?: Meeting;
  /** Bandeau du haut : le comité, la séance, sa date, son heure et son lieu. */
  entete?: ReactNode;
  /** Sous le bandeau : les outils de la pilule, en barre fixe (la pilule flottante n'est pas là). */
  barre?: ReactNode;
  /** Onglet « Vote » : le vote des membres présents sur ce point. */
  vote: VotePv;
}) {
  const gauche = useRef<HTMLDivElement>(null);
  const ecran = useRef<HTMLDivElement>(null);
  // Fenêtres réglables, comme sur plusieurs écrans : la hauteur de celle du haut (le reste pour celle du bas) et, en
  // projection, la largeur de celles de gauche (le reste pour celle de droite). Retenues sur l'appareil.
  const [hautPoint, setHautPoint] = usePart(CLE_HAUT, 0.5);
  const [largeFiche, setLargeFiche] = usePart(CLE_LARGE, 0.48);
  const { d, deplacer, activer, remettre, origine } = useDisposition();
  const panneaux = usePanneaux({ arret, point, setPoint, modifiable, editable, meta, changes, note, onNote, projete, choixPieces, erreur, enregistre, ouvrir, rattacher, track, seance, vote });
  // Onglet que l'on fait glisser, et la fenêtre où il tomberait.
  const [glisse, setGlisse] = useState<Panneau | null>(null);
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
  }, [arret.cle, editable]);

  // Sans projection, pas de fenêtre de droite : ses onglets dans celle du haut.
  const vues: Record<Fenetre, Panneau[]> = projection ? d.fenetres : { haut: [...d.fenetres.haut, ...d.fenetres.droite], bas: d.fenetres.bas, droite: [] };
  const fenetre = (f: Fenetre) => {
    const nom = FENETRES.find((x) => x.id === f)!.nom;
    // Les onglets de ce point (un sondage, une note de section : ni vote, ni checklist…).
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
          const avant = e.target instanceof Element ? (e.target.closest<HTMLElement>('[data-onglet]')?.dataset.onglet as Panneau | undefined) : undefined;
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
              id={`pv-${f}-${p}`}
              data-onglet={p}
              aria-selected={p === actif}
              aria-controls={`pv-${f}-contenu`}
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
          <div className={`pv-fenetre-corps p-${actif}`} role="tabpanel" id={`pv-${f}-contenu`} aria-labelledby={`pv-${f}-${actif}`} data-panneau={actif}>
            <Fragment key={arret.cle}>{panneaux[actif].rendu()}</Fragment>
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
      aria-label={`Fiche du PV : ${arret.nom}`}
    >
      <div className="pv-fiche-haut">
        <header className="pv-fiche-entete" aria-label="Séance">
          {entete}
          {/* Le point : sa section, et où il en est dans la séance. */}
          <small className="muted pv-fiche-ou">
            {arret.section}
            {arret.sous ? ` › ${arret.sous}` : ''} · {position.i + 1} / {position.n}
          </small>
          {!origine && (
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

const CLE_HAUT = 'taches-gsa-pv-fiche-hauteur';
const CLE_LARGE = 'taches-gsa-pv-fiche-largeur';
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

export interface VotePv {
  presents: Person[];
  voix?: Record<string, Voix>;
  /** Voix d'un membre (null : retirée). */
  voter: (personId: string, v: Voix | null) => void;
  /** La même voix pour tous les présents (null : vote effacé). */
  tous: (v: Voix | null) => void;
  /** PV modifiable. */
  modifiable: boolean;
}

/** Un onglet : son nom, son nombre, s'il a lieu d'être pour ce point, et ce qu'il montre. */
type ContenuPanneau = { nom: string; nb?: string; dispo: boolean; rendu: () => ReactNode };

/**
 * Les parties du point, chacune un onglet : « Point » (intitulé, remarque, statut et responsables dessous, délai à côté ;
 * pour un sondage ou une note de section : ce qu'il est), « Vote » (des membres présents), « Checklist »,
 * « Rattachements » (événement, séance, point principal, points rattachés), « Étiquettes », « Documents », « Séances
 * précédentes » (ce qu'en disent les PV d'avant), « Notes de la séance » et « Pièces jointes » (en grand). Le reste
 * (répétition, pour info, à prendre, emails…) : depuis la fiche du point.
 */
function usePanneaux({
  arret,
  point: t,
  setPoint: setT,
  modifiable,
  editable,
  meta,
  changes,
  note,
  onNote,
  projete,
  choixPieces,
  erreur,
  enregistre: enregistreLu,
  ouvrir,
  rattacher,
  track,
  seance,
  vote,
}: {
  arret: ArretPv;
  point?: Task;
  setPoint: SetT;
  modifiable: boolean;
  editable: boolean;
  meta: string[];
  changes: string[];
  note: string;
  onNote: (v: string) => void;
  projete?: Task;
  choixPieces: ChoixPieces;
  erreur?: string;
  enregistre?: Task;
  ouvrir: (x: Task, nouvelle: boolean) => void;
  rattacher: (taskId: string, parentId: string | undefined) => void;
  track: DocTracking;
  seance?: Meeting;
  vote: VotePv;
}): Record<Panneau, ContenuPanneau> {
  const { data, user, can, canAssignOthers, peutEtiqueter } = useStore();
  const dis = !modifiable;
  const enregistre = enregistreLu ?? arret.tache;
  const titreNote = arret.tache ? 'Notes / décisions sur ce point…' : arret.poll ? 'Notes / décisions sur ce sondage…' : `${arret.nom}…`;
  const notes: ContenuPanneau = {
    nom: 'Notes de la séance',
    dispo: true,
    rendu: () => (
      <>
        <small className="muted pv-fiche-clavier" title="Au clavier : ↑ au début du texte, ↓ à la fin (ou hors d’un texte) : point précédent / suivant, le point quitté enregistré">
          ↑ ↓ point précédent / suivant
        </small>
        <NoteField value={note} onCommit={onNote} placeholder={titreNote} readOnly={!editable} />
      </>
    ),
  };
  const pieces: ContenuPanneau = {
    nom: 'Pièces jointes',
    nb: projete?.documents?.length ? String(projete.documents.length) : undefined,
    dispo: true,
    rendu: () => <PiecesJointesPoint point={{ nom: arret.tache ? t?.titre ?? arret.nom : arret.nom, tache: projete }} choix={choixPieces} fenetre />,
  };
  const erreurs = erreur ? <p className="full error">{erreur}</p> : null;
  // Un sondage, la note d'une section, Divers : l'onglet « Point » dit ce qu'il est ; pas les autres parties d'un point.
  if (!t || !enregistre || !user) {
    const rien: ContenuPanneau = { nom: '', dispo: false, rendu: () => null };
    return {
      point: {
        nom: arret.poll ? 'Sondage' : 'Point',
        dispo: true,
        rendu: () =>
          arret.poll ? (
            <>
              <h2 className="pv-fiche-nom">📊 Sondage : {arret.poll.question}</h2>
              <p className="muted pv-fiche-info">{pollSummary(arret.poll)}{arret.pointDuSondage ? ` · point « ${arret.pointDuSondage.titre} »` : ''}</p>
              {erreurs}
            </>
          ) : (
            <>
              <h2 className="pv-fiche-nom">{arret.nom}</h2>
              <p className="muted pv-fiche-info">{arret.cle === 'divers' ? 'Points divers, informations, prochaine séance…' : 'Notes de la section, après ses points.'}</p>
              {erreurs}
            </>
          ),
      },
      vote: rien,
      checklist: rien,
      rattachements: rien,
      etiquettes: rien,
      documents: rien,
      seances: rien,
      notes,
      pieces,
    };
  }
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));
  const assignable = data.people.filter((p) => p.actif && (canAssignOthers(t.sectionId) || p.id === user.id));
  const aAjouter = assignable.filter((p) => !t.responsables.includes(p.id)).sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));
  const statut = data.statuses.find((s) => s.id === t.statusId);
  // Points rattachés (enregistrés) : par délai, comme dans la fiche complète.
  const kids = childrenOf(data, enregistre.id).sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'));
  // Étiquettes : celles d'office (sa place), celles qu'il porte, celles qu'on peut mettre (dont on est membre ; pas celle
  // d'un événement passé), comme dans la fiche complète.
  const auto = dis ? [] : etiquettesDesLieux(data)(t.sectionId, t.sousSection, t.eventId);
  const etiquettes = (data.etiquettes ?? []).filter(
    (e) => auto.includes(e.id) || t.etiquettes?.includes(e.id) || (!dis && peutEtiqueter(e.id) && !etiquettePassee(e, data.events)),
  );
  const portees = etiquettes.filter((e) => auto.includes(e.id) || t.etiquettes?.includes(e.id)).length;
  const nbLiens = kids.length + (t.parentId ? 1 : 0) + (t.eventId ? 1 : 0) + (t.meetingId ? 1 : 0);
  const faites = t.checklist.filter((c) => c.done).length;
  // Notes des PV des séances d'avant (et des occurrences précédentes d'un point qui se répète).
  const precedentes = avantSeance(notesSeances(data, enregistre, can('tab.minutes')), seance).length;
  const bilan = bilanVote(vote.voix, vote.presents.map((p) => p.id));
  const champs = (contenu: ReactNode) => <div className="form pv-fiche-champs">{contenu}</div>;
  return {
    point: {
      nom: 'Point',
      dispo: true,
      rendu: () =>
        champs(
          <>
            <label className="full">
              Point
              <input className="pv-fiche-titre" value={t.titre} disabled={dis} onChange={(e) => set('titre', e.target.value)} placeholder="Que faut-il faire ou savoir ?" />
            </label>
            {erreurs}
            {(meta.length > 0 || changes.length > 0) && (
              <p className="full pv-fiche-info">
                {meta.length > 0 && <span className="odj-meta">{meta.join(' · ')}</span>}
                {changes.length > 0 && <span className="min-changes"> ↻ {changes.join(' · ')}</span>}
              </p>
            )}
            {/* La remarque, juste sous l'intitulé : les détails du point, à relire ou compléter en séance. */}
            {(!dis || !!t.remarque) && (
              <label className="full">
                Remarque
                <ZoneTexte rows={3} value={t.remarque ?? ''} disabled={dis} onChange={(e) => set('remarque', e.target.value)} placeholder="Détails utiles (facultatif)" />
              </label>
            )}
            {/* Statut, et dessous qui s'en occupe ; « Pour quand ? » à côté. */}
            <div className="tache-colonne">
              <label className="statut-choix" style={{ '--c': statut?.couleur } as CSSProperties}>
                Statut
                <Deroulante
                  aria-label="Statut"
                  value={t.statusId}
                  disabled={dis}
                  onChange={(v) => set('statusId', v)}
                  options={data.statuses.map((s) => ({ value: s.id, label: s.label, icone: <span className="statut-jeton" style={{ background: s.couleur }} /> }))}
                />
              </label>
              <div className="qui">
                <span className="field-label">Qui s’en occupe ?</span>
                <div className="chips">
                  {t.responsables.map((id) => {
                    const p = data.people.find((x) => x.id === id);
                    const retirable = !dis && assignable.some((x) => x.id === id);
                    return (
                      <span key={id} className={`chip on ${retirable ? '' : 'locked'}`}>
                        {fullName(p)}
                        {retirable && <button type="button" className="chip-x" aria-label={`Retirer ${fullName(p)}`} onClick={() => set('responsables', t.responsables.filter((x) => x !== id))}>✕</button>}
                      </span>
                    );
                  })}
                  {(t.respHors ?? []).map((p) => (
                    <span key={p.id} className="chip on locked" title="Pas de fiche dans l’appli">
                      <Icone n="compte" /> {p.prenom} {p.nom}
                    </span>
                  ))}
                  {!t.responsables.length && !t.respHors?.length && <span className="muted">Personne pour l’instant{aPrendreOuverte(t) ? ' : 🙋 à prendre' : ''}.</span>}
                  {!dis && aAjouter.length > 0 && (
                    <Deroulante
                      puce
                      value=""
                      libelle="＋ Ajouter…"
                      aria-label="Ajouter une personne"
                      onChange={(v) => v && set('responsables', [...t.responsables, v])}
                      options={aAjouter.map((p) => ({ value: p.id, label: nomPoste(p, user.id) }))}
                    />
                  )}
                </div>
              </div>
            </div>
            <DelaiField t={t} setT={setT} disabled={dis} />
          </>,
        ),
    },
    vote: {
      nom: 'Vote',
      nb: bilan ? `${bilan.pour + bilan.contre + bilan.abstention}/${vote.presents.length}` : undefined,
      dispo: true,
      rendu: () => champs(<VotePoint vote={vote} />),
    },
    checklist: {
      nom: 'Checklist',
      nb: t.checklist.length ? `${faites}/${t.checklist.length}` : undefined,
      dispo: true,
      rendu: () => champs(t.checklist.length || !dis ? <Checklist t={t} setT={setT} dis={dis} /> : <p className="full muted pv-fiche-info">Pas de checklist pour ce point.</p>),
    },
    rattachements: {
      nom: 'Rattachements',
      nb: nbLiens ? String(nbLiens) : undefined,
      dispo: true,
      rendu: () => champs(<Rattachements t={t} setT={setT} task={enregistre} isNew={false} dis={dis} editable={!dis} kids={kids} ouvrir={ouvrir} rattacher={rattacher} />),
    },
    etiquettes: {
      nom: 'Étiquettes',
      nb: portees ? String(portees) : undefined,
      dispo: true,
      rendu: () =>
        champs(
          <div className="full etiquettes-choix">
            <span className="field-label">
              <Icone n="etiquette" /> Étiquettes <small className="muted">(leurs membres voient le point ; celle de son groupe, de sa sous-section ou de son événement est mise d’office)</small>
            </span>
            {etiquettes.length ? (
              <div className="chips">
                {etiquettes.map((e) => {
                  const dOffice = auto.includes(e.id);
                  const on = dOffice || !!t.etiquettes?.includes(e.id);
                  const fige = dis || dOffice || !peutEtiqueter(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={`chip ${on ? 'on' : ''} ${dOffice ? 'd-office' : ''}`}
                      style={on ? { background: e.couleur, borderColor: e.couleur } : { borderColor: e.couleur }}
                      disabled={fige}
                      aria-pressed={on}
                      title={dOffice ? 'D’office : selon la place du point (ou son événement)' : !dis && fige ? 'Tu n’es pas membre de cette étiquette' : undefined}
                      onClick={() => setT((x) => ({ ...x, etiquettes: on ? (x.etiquettes ?? []).filter((y) => y !== e.id) : [...(x.etiquettes ?? []), e.id] }))}
                    >
                      <IconeEtiquette e={e} /> {e.nom}
                      {dOffice ? ' 🔒' : ''}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="muted pv-fiche-info">{dis ? 'Aucune étiquette.' : 'Aucune étiquette à mettre : tu n’es membre d’aucune, et le point n’en reçoit pas d’office.'}</p>
            )}
          </div>,
        ),
    },
    documents: {
      nom: 'Documents',
      nb: t.documents?.length ? String(t.documents.length) : undefined,
      dispo: true,
      rendu: () => champs(<DocsField docs={t.documents ?? []} setDocs={(fn) => setT((x) => ({ ...x, documents: fn(x.documents ?? []) }))} disabled={dis} track={track} liens />),
    },
    seances: {
      nom: 'Séances précédentes',
      nb: precedentes ? String(precedentes) : undefined,
      dispo: true,
      rendu: () => champs(<NotesSeances task={enregistre} avant={seance} toujours />),
    },
    notes,
    pieces,
  };
}

const majuscule = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

const VOIX: [Voix, string][] = [
  ['pour', 'Pour'],
  ['contre', 'Contre'],
  ['abstention', 'Abstention'],
];

/**
 * Vote du point en séance : chaque membre présent (présences de la prise de notes, retards compris) pour, contre ou
 * abstention (re-clic : retirée) ; « Tous pour » d'un coup, « Effacer ». Le bilan et le résultat (majorité des voix
 * exprimées) au-dessus des noms, toujours à l'écran ; enregistré tout de suite dans le PV, sous le point.
 */
function VotePoint({ vote }: { vote: VotePv }) {
  const { presents, voix = {}, voter, tous, modifiable } = vote;
  if (!presents.length)
    return <p className="full muted pv-fiche-info">Personne n’est noté présent : note d’abord les présences, en haut de la prise de notes.</p>;
  const bilan = bilanVote(voix, presents.map((p) => p.id));
  return (
    <div className="full pv-vote">
      <div className="pv-vote-tete">
        <span className="field-label">Membres présents ({presents.length})</span>
        {modifiable && (
          <span className="pv-vote-tous">
            <button type="button" className="btn small" onClick={() => tous('pour')}>Tous pour</button>
            <button type="button" className="btn small" disabled={!bilan} onClick={() => tous(null)}>Effacer</button>
          </span>
        )}
      </div>
      <p className={`pv-vote-bilan ${bilan?.resultat ?? ''}`} role="status">
        {bilan ? (
          <>
            Pour {bilan.pour} · Contre {bilan.contre} · Abstention {bilan.abstention}
            {bilan.sans > 0 && <span className="muted"> · pas encore votés : {bilan.sans}</span>}
            <br />
            <strong>{majuscule(texteVote(bilan).replace(/ – .*$/, ''))}</strong> <span className="muted">(majorité des voix exprimées ; dans le PV : « Vote : {texteVote(bilan)} »)</span>
          </>
        ) : (
          <span className="muted">Aucune voix pour l’instant.</span>
        )}
      </p>
      <ul className="pv-vote-liste">
        {presents.map((p) => (
          <li key={p.id}>
            <span className="pv-vote-nom">{fullName(p)}</span>
            <span className="seg small" role="group" aria-label={`Voix de ${fullName(p)}`}>
              {VOIX.map(([v, nom]) => (
                <button
                  key={v}
                  type="button"
                  disabled={!modifiable}
                  className={voix[p.id] === v ? `on ${v}` : ''}
                  aria-pressed={voix[p.id] === v}
                  onClick={() => voter(p.id, voix[p.id] === v ? null : v)}
                >
                  {nom}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
