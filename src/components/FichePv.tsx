import { type CSSProperties, type ReactNode } from 'react';
import { EcranFenetres, type ContenuPanneau, type Disposition } from './Fenetres';
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
/** À l'origine : le point et ses parties en haut, ses notes en bas, ses pièces jointes à droite (projection). */
const ORIGINE: Disposition<Panneau> = {
  fenetres: { haut: ['point', 'vote', 'checklist', 'rattachements', 'etiquettes', 'documents', 'seances'], bas: ['notes'], droite: ['pieces'] },
  actifs: {},
};
/** Où l'appareil retient la disposition et le partage des fenêtres (clés d'avant le cadre commun, gardées). */
const CLES = { onglets: 'taches-gsa-pv-onglets', hauteur: 'taches-gsa-pv-fiche-hauteur', largeur: 'taches-gsa-pv-fiche-largeur' };

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
  const panneaux = usePanneaux({ arret, point, setPoint, modifiable, editable, meta, changes, note, onNote, projete, choixPieces, erreur, enregistre, ouvrir, rattacher, track, seance, vote });
  return (
    <EcranFenetres
      cle={arret.cle}
      cles={CLES}
      id="pv"
      origine={ORIGINE}
      panneaux={panneaux}
      projection={projection}
      editable={editable}
      entete={entete}
      // Le point : sa section, et où il en est dans la séance.
      ou={`${arret.section}${arret.sous ? ` › ${arret.sous}` : ''} · ${position.i + 1} / ${position.n}`}
      barre={barre}
      label={`Fiche du PV : ${arret.nom}`}
    />
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
