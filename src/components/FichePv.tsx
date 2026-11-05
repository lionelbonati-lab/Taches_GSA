import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';
import { useStore } from '../data/store';
import type { Poll, Task } from '../data/types';
import { fullName, nomPoste } from '../data/utils';
import { pollSummary } from '../data/polls';
import { aPrendreOuverte } from '../data/aPrendre';
import { NoteField } from './NoteField';
import { PiecesJointesPoint, type ChoixPieces } from './PiecesJointesPoint';
import { DocsTache } from './Annexes';
import { Deroulante } from './Deroulante';
import { ZoneTexte } from './ZoneTexte';
import { DelaiField, type SetT } from './tache/Quand';
import { Checklist } from './tache/Checklist';
import { Icone } from './icones';

// Fiche du PV : la prise de notes point par point, sans rouvrir chaque point. Par-dessus la prise de notes, à gauche le
// point (intitulé, statut, délai, responsables, remarque, checklist) et dessous le rectangle de ses notes de séance ; à
// droite, en projection, ses pièces jointes en grand (sans projection : au centre). Comme sur plusieurs écrans, les
// barres entre les fenêtres se tirent (hauteur du point, largeur de la projection). La pilule reste au-dessus et passe
// d'un point à l'autre ; le point quitté est enregistré (Minutes.tsx).

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
  onFermer,
  onFicheComplete,
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
  onFermer: () => void;
  onFicheComplete?: () => void;
}) {
  const gauche = useRef<HTMLDivElement>(null);
  const ecran = useRef<HTMLDivElement>(null);
  // Fenêtres réglables, comme sur plusieurs écrans : la hauteur du point (le reste pour ses notes) et, en projection, la
  // largeur de la fiche (le reste pour les pièces jointes). Retenues sur l'appareil.
  const [hautPoint, setHautPoint] = usePart(CLE_HAUT, 0.5);
  const [largeFiche, setLargeFiche] = usePart(CLE_LARGE, 0.48);
  // La pilule (à sa place d'origine) au milieu de la fiche, à côté de la projection.
  useEffect(() => {
    const r = document.documentElement.style;
    if (projection) r.setProperty('--centre-fiche', `${Math.round(largeFiche * 50)}%`);
    return () => void r.removeProperty('--centre-fiche');
  }, [projection, largeFiche]);
  // Autre point : la fiche repart du haut ; à la souris (ordinateur, beamer), on écrit tout de suite dans ses notes.
  useLayoutEffect(() => {
    gauche.current?.querySelector('.pv-fiche-point')?.scrollTo({ top: 0 });
    if (!editable || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const n = gauche.current?.querySelector<HTMLElement>('.pv-fiche-notes .note-riche[contenteditable="true"]');
    if (!n) return;
    n.focus({ preventScroll: true });
    const sel = document.getSelection();
    sel?.selectAllChildren(n);
    sel?.collapseToEnd();
  }, [arret.cle, editable]);

  const titreNote = arret.tache ? 'Notes / décisions sur ce point…' : arret.poll ? 'Notes / décisions sur ce sondage…' : `${arret.nom}…`;
  return (
    <div
      ref={ecran}
      className={`pv-fiche-ecran no-print ${projection ? 'avec-projection' : ''}`}
      style={{ '--fr-point': `${hautPoint}fr`, '--fr-notes': `${1 - hautPoint}fr`, '--fr-fiche': `${largeFiche}fr`, '--fr-projection': `${1 - largeFiche}fr` } as CSSProperties}
      role="dialog"
      aria-label={`Fiche du PV : ${arret.nom}`}
    >
      <div className="pv-fiche-gauche" ref={gauche}>
        <section className="panel pv-fiche-point" aria-label="Point">
          <div className="pv-fiche-tete">
            <small className="muted pv-fiche-ou">
              {arret.section}
              {arret.sous ? ` › ${arret.sous}` : ''} · {position.i + 1} / {position.n}
            </small>
            <span className="pv-fiche-boutons">
              {onFicheComplete && (
                <button type="button" className="btn small" onClick={onFicheComplete} title="Toute la fiche du point (étiquettes, documents, rattachements…), par-dessus">
                  <Icone n="modifier" /> Fiche complète
                </button>
              )}
              <button type="button" className="icon-btn" onClick={onFermer} aria-label="Fermer la fiche" title="Fermer (Échap) : retour à la prise de notes, le point enregistré">
                ✕
              </button>
            </span>
          </div>
          {arret.tache && point ? (
            <ChampsPoint key={arret.cle} t={point} setT={setPoint} dis={!modifiable} meta={meta} changes={changes} />
          ) : arret.poll ? (
            <>
              <h2 className="pv-fiche-nom">📊 Sondage : {arret.poll.question}</h2>
              <p className="muted pv-fiche-info">{pollSummary(arret.poll)}{arret.pointDuSondage ? ` · point « ${arret.pointDuSondage.titre} »` : ''}</p>
            </>
          ) : (
            <>
              <h2 className="pv-fiche-nom">{arret.nom}</h2>
              <p className="muted pv-fiche-info">{arret.cle === 'divers' ? 'Points divers, informations, prochaine séance…' : 'Notes de la section, après ses points.'}</p>
            </>
          )}
          {erreur && <p className="error">{erreur}</p>}
        </section>
        <Separateur sens="haut" part={hautPoint} setPart={setHautPoint} zone={gauche} nom="Hauteur du point et de ses notes" />
        <section className="panel pv-fiche-notes" aria-label="Notes de la séance">
          <h3 className="min-h2"><Icone n="notes" /> Notes de la séance</h3>
          <NoteField key={arret.cle} value={note} onCommit={onNote} placeholder={titreNote} readOnly={!editable} />
        </section>
      </div>
      {projection && (
        <>
          <Separateur sens="large" part={largeFiche} setPart={setLargeFiche} zone={ecran} nom="Largeur de la fiche et de la projection" />
          <PiecesJointesPoint point={{ nom: arret.tache ? point?.titre ?? arret.nom : arret.nom, tache: projete }} choix={choixPieces} />
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

/** Le point dans la fiche du PV : ses champs les plus utiles en séance (le reste : « Fiche complète »). */
function ChampsPoint({ t, setT, dis, meta, changes }: { t: Task; setT: SetT; dis: boolean; meta: string[]; changes: string[] }) {
  const { data, user, canAssignOthers } = useStore();
  const [checklist, setChecklist] = useState(t.checklist.length > 0);
  useEffect(() => {
    if (t.checklist.length) setChecklist(true);
  }, [t.checklist.length]);
  if (!user) return null;
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));
  const assignable = data.people.filter((p) => p.actif && (canAssignOthers(t.sectionId) || p.id === user.id));
  const aAjouter = assignable.filter((p) => !t.responsables.includes(p.id)).sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));
  const statut = data.statuses.find((s) => s.id === t.statusId);
  return (
    <div className="form pv-fiche-champs">
      <label className="full">
        Point
        <input className="pv-fiche-titre" value={t.titre} disabled={dis} onChange={(e) => set('titre', e.target.value)} placeholder="Que faut-il faire ou savoir ?" />
      </label>
      {(meta.length > 0 || changes.length > 0) && (
        <p className="full pv-fiche-info">
          {meta.length > 0 && <span className="odj-meta">{meta.join(' · ')}</span>}
          {changes.length > 0 && <span className="min-changes"> ↻ {changes.join(' · ')}</span>}
        </p>
      )}
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
      <DelaiField t={t} setT={setT} disabled={dis} />
      <div className="full qui">
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
      {(!dis || !!t.remarque) && (
        <label className="full">
          Remarque
          <ZoneTexte rows={2} value={t.remarque ?? ''} disabled={dis} onChange={(e) => set('remarque', e.target.value)} placeholder="Détails utiles (facultatif)" />
        </label>
      )}
      {checklist ? (
        <Checklist t={t} setT={setT} dis={dis} />
      ) : (
        !dis && (
          <div className="full task-plus">
            <span>Ajouter :</span>
            <button type="button" className="chip" title="Une liste de petites étapes à cocher" onClick={() => setChecklist(true)}><Icone n="checklist" /> Checklist</button>
          </div>
        )
      )}
      {!!t.documents?.length && <div className="full min-docs"><DocsTache t={t} annexes={[]} /></div>}
    </div>
  );
}
