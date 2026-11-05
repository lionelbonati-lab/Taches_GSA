import { useLayoutEffect, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
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
// sur l'appareil), pour la mener point par point sans rouvrir chaque point. Par-dessus la prise de notes, à gauche le
// point, en onglets (le point : intitulé, remarque, statut, délai, responsables ; puis checklist, rattachements,
// étiquettes, documents, notes des séances précédentes) et dessous le rectangle de ses notes de séance ; à
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
  enregistre,
  ouvrir,
  rattacher,
  track,
  seance,
  entete,
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
  onFermer: () => void;
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
  /** Onglet « Vote » : le vote des membres présents sur ce point. */
  vote: VotePv;
}) {
  const gauche = useRef<HTMLDivElement>(null);
  const ecran = useRef<HTMLDivElement>(null);
  // Fenêtres réglables, comme sur plusieurs écrans : la hauteur du point (le reste pour ses notes) et, en projection, la
  // largeur de la fiche (le reste pour les pièces jointes). Retenues sur l'appareil.
  const [hautPoint, setHautPoint] = usePart(CLE_HAUT, 0.5);
  const [largeFiche, setLargeFiche] = usePart(CLE_LARGE, 0.48);
  // Onglet du point : le même d'un point à l'autre (cocher les checklists point après point…).
  const [onglet, setOnglet] = useState<Onglet>('point');
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
      {entete && (
        <header className="pv-fiche-entete" aria-label="Séance">
          {entete}
        </header>
      )}
      <div className="pv-fiche-gauche" ref={gauche}>
        <section className="panel pv-fiche-point" aria-label="Point">
          <div className="pv-fiche-tete">
            <small className="muted pv-fiche-ou">
              {arret.section}
              {arret.sous ? ` › ${arret.sous}` : ''} · {position.i + 1} / {position.n}
            </small>
            <span className="pv-fiche-boutons">
              <button type="button" className="icon-btn" onClick={onFermer} aria-label="Revenir à la prise de notes" title="Revenir à la prise de notes (Échap), le point enregistré">
                ✕
              </button>
            </span>
          </div>
          {arret.tache && point ? (
            <ChampsPoint
              key={arret.cle}
              t={point}
              setT={setPoint}
              dis={!modifiable}
              meta={meta}
              changes={changes}
              onglet={onglet}
              setOnglet={setOnglet}
              enregistre={enregistre ?? arret.tache}
              ouvrir={ouvrir}
              rattacher={rattacher}
              track={track}
              seance={seance}
              vote={vote}
            />
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
          <h3 className="min-h2">
            <Icone n="notes" /> Notes de la séance
            <small className="muted pv-fiche-clavier" title="Au clavier : ↑ au début du texte, ↓ à la fin (ou hors d’un texte) : point précédent / suivant, le point quitté enregistré">
              ↑ ↓ point précédent / suivant
            </small>
          </h3>
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

type Onglet = 'point' | 'vote' | 'checklist' | 'rattachements' | 'etiquettes' | 'documents' | 'seances';

/** Vote d'un point en séance (onglet « Vote ») : les membres présents, leurs voix, et de quoi les noter. */
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

/**
 * Le point dans la fiche du PV, en onglets : « Point » (intitulé, remarque, statut et responsables dessous, délai à
 * côté), « Vote » (des membres présents), « Checklist », « Rattachements » (événement, séance, point principal, points rattachés), « Étiquettes »,
 * « Documents », « Séances précédentes » (ce qu'en disent les PV d'avant). Le reste (répétition, pour info, à prendre,
 * emails…) : depuis la page Points.
 */
function ChampsPoint({
  t,
  setT,
  dis,
  meta,
  changes,
  onglet,
  setOnglet,
  enregistre,
  ouvrir,
  rattacher,
  track,
  seance,
  vote,
}: {
  t: Task;
  setT: SetT;
  dis: boolean;
  meta: string[];
  changes: string[];
  onglet: Onglet;
  setOnglet: (o: Onglet) => void;
  enregistre: Task;
  ouvrir: (x: Task, nouvelle: boolean) => void;
  rattacher: (taskId: string, parentId: string | undefined) => void;
  track: DocTracking;
  seance?: Meeting;
  vote: VotePv;
}) {
  const { data, user, can, canAssignOthers, peutEtiqueter } = useStore();
  if (!user) return null;
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
  const onglets: { id: Onglet; nom: string; nb?: string }[] = [
    { id: 'point', nom: 'Point' },
    { id: 'vote', nom: 'Vote', nb: bilan ? `${bilan.pour + bilan.contre + bilan.abstention}/${vote.presents.length}` : undefined },
    { id: 'checklist', nom: 'Checklist', nb: t.checklist.length ? `${faites}/${t.checklist.length}` : undefined },
    { id: 'rattachements', nom: 'Rattachements', nb: nbLiens ? String(nbLiens) : undefined },
    { id: 'etiquettes', nom: 'Étiquettes', nb: portees ? String(portees) : undefined },
    { id: 'documents', nom: 'Documents', nb: t.documents?.length ? String(t.documents.length) : undefined },
    { id: 'seances', nom: 'Séances précédentes', nb: precedentes ? String(precedentes) : undefined },
  ];
  // Au clavier : ← → d'un onglet à l'autre.
  const parFleche = (e: KeyboardEvent<HTMLDivElement>) => {
    const sens = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!sens) return;
    e.preventDefault();
    const i = (onglets.findIndex((o) => o.id === onglet) + sens + onglets.length) % onglets.length;
    setOnglet(onglets[i].id);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-onglet="${onglets[i].id}"]`)?.focus();
  };
  return (
    <>
      <div className="pv-fiche-onglets" role="tablist" aria-label="Parties du point" onKeyDown={parFleche}>
        {onglets.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            id={`pv-onglet-${o.id}`}
            data-onglet={o.id}
            aria-selected={onglet === o.id}
            aria-controls="pv-onglet-contenu"
            tabIndex={onglet === o.id ? 0 : -1}
            className={onglet === o.id ? 'on' : ''}
            onClick={() => setOnglet(o.id)}
          >
            {o.nom}
            {o.nb && <span className="pv-fiche-nb">{o.nb}</span>}
          </button>
        ))}
      </div>
      <div className="form pv-fiche-champs" role="tabpanel" id="pv-onglet-contenu" aria-labelledby={`pv-onglet-${onglet}`}>
        {onglet === 'point' && (
          <>
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
            {/* La remarque, juste sous l'intitulé : les détails du point, à relire ou compléter en séance. */}
            {(!dis || !!t.remarque) && (
              <label className="full">
                Remarque
                <ZoneTexte rows={3} value={t.remarque ?? ''} disabled={dis} onChange={(e) => set('remarque', e.target.value)} placeholder="Détails utiles (facultatif)" />
              </label>
            )}
            {/* Statut, et dessous qui s'en occupe ; « Pour quand ? » à côté (sur téléphone : après eux). */}
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
          </>
        )}
        {onglet === 'checklist' &&
          (t.checklist.length || !dis ? <Checklist t={t} setT={setT} dis={dis} /> : <p className="full muted pv-fiche-info">Pas de checklist pour ce point.</p>)}
        {onglet === 'rattachements' && (
          <Rattachements t={t} setT={setT} task={enregistre} isNew={false} dis={dis} editable={!dis} kids={kids} ouvrir={ouvrir} rattacher={rattacher} />
        )}
        {onglet === 'etiquettes' && (
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
          </div>
        )}
        {onglet === 'seances' && <NotesSeances task={enregistre} avant={seance} toujours />}
        {onglet === 'vote' && <VotePoint vote={vote} />}
        {onglet === 'documents' && (
          <DocsField docs={t.documents ?? []} setDocs={(fn) => setT((x) => ({ ...x, documents: fn(x.documents ?? []) }))} disabled={dis} track={track} liens />
        )}
      </div>
    </>
  );
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
