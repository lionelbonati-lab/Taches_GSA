import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, Etiquette, Meeting, PvArchive, SerieEvenements, Task } from '../data/types';
import { daysUntil, diffDays, endOf, fmtDate, fmtDateTime, fmtRange, fullName, isDone, today, uid } from '../data/utils';
import { aLaDate, horaire, libelleRepetition } from '../data/repetition';
import { EventModal, newEvent } from '../components/EventModal';
import { RepriseModal } from '../components/Reprise';
import { SerieModal } from '../components/SerieModal';
import { RepriseSerieModal } from '../components/RepriseSerie';
import {
  FILTRE_SERIE, dateAffichee, evenementsDeLaSerie, nouvelleSerie, periodeDeLaSerie, pointsDeLaSerie, prochainDeLaSerie, seriePassee,
} from '../data/seriesEvenements';
import { etiquetteDeLaSerie, evenementPasse } from '../data/etiquettes';
import { reprenable } from '../data/reprise';
import { Empty, Modal } from '../components/ui';
import { Icone } from '../components/icones';
import { BadgeEtiquette } from '../components/IconesEtiquette';
import { Chronologie, type CibleChrono } from '../components/Chronologie';
import { Progress } from './Dashboard';
import { hydrateArchive } from '../data/entete';
import { cleanHtml } from '../data/sanitize';
import { useUnitLogo } from '../components/Entete';
import { PageIntro } from '../components/Nav';
import { aPlanifier, aRenommer, annuelle, convoquesDe, duMois, finDeSerie, motSeance, nomSeance, serieDuMois, seuleDuMois, titreSelonDate } from '../data/seances';
import { etiquettesDatees, memeEvenement } from '../data/agendaIcs';
import { useAnnexesArchive, useOuvrirDocs } from '../components/Annexes';
import { margesArchive, policeArchive } from '../data/styleDocs';
import { BoutonPdf, usePiedImprime } from '../components/BoutonPdf';
import { LieuSeance, Lien } from '../components/Liens';
import { dernierPoint, lienCarte, lieuxConnus } from '../data/lieux';
import { annonceDe, annoncer, enHeures, type Annonce, type SorteAnnonce } from '../data/presences';

// Carte (Leaflet) chargée seulement quand on place un lieu.
const CarteLieu = lazy(() => import('../components/CarteLieu'));

// Onglets « Comité » (séances) et « Événements » : même principe, champs différents (fiche d'un événement : EventModal).

/** Enregistrement / suppression des séances (onglets Comité et Agenda). */
export function useAgendaActions() {
  const { data, update } = useStore();
  return {
    saveMeeting: (m: Meeting) => {
      const isNew = !data.meetings.some((x) => x.id === m.id);
      update((d) => { d.meetings = isNew ? [...d.meetings, m] : d.meetings.map((x) => (x.id === m.id ? m : x)); }, `${isNew ? 'Ajout' : 'Modification'} de la séance « ${m.titre} »`);
    },
    removeMeeting: (m: Meeting) => update((d) => {
      // Seule séance annuelle de son mois : ce mois ne sera plus proposé l'année suivante.
      const fin = finDeSerie(d.meetings, m);
      d.meetings = d.meetings.filter((x) => x.id !== m.id).map((x) => (fin.includes(x.id) ? { ...x, unique: true } : x));
      d.tasks.forEach((t) => { if (t.meetingId === m.id) t.meetingId = undefined; });
    }, `Suppression de la séance « ${m.titre} »`),
  };
}

/** Mot des séances : « Comité ». */
export const useMotSeance = () => motSeance();

/**
 * Arrivée depuis la recherche (« ?seance=… », « ?id=… ») : la carte visée, mise en évidence et amenée à l'écran.
 * `archive` : PV ou ordre du jour archivé à ouvrir directement (séances).
 */
function useCible(param: string) {
  const [params, setParams] = useSearchParams();
  const [cible, setCible] = useState<{ id: string; archive?: boolean } | null>(null);
  useEffect(() => {
    const id = params.get(param) ?? params.get('archive');
    if (!id) return;
    setCible({ id, archive: !params.get(param) });
    setParams({}, { replace: true });
  }, [params, param, setParams]);
  useEffect(() => {
    if (cible && !cible.archive) document.querySelector('.agenda-item.cible')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [cible]);
  return cible;
}

/** La carte visée. */
const estCible = (cible: { id: string } | null, id: string) => !!cible && cible.id === id;

/**
 * Nouvelle séance, nommée d'après son mois (« Comité de mars 2027 ») et qui revient chaque année.
 * Ce mois a déjà sa séance : « Séance extraordinaire de mars 2027 », sans retour l'année suivante.
 */
export function newMeeting(meetings: Meeting[], date = today(), mot = 'Comité'): Meeting {
  const extra = meetings.some((m) => annuelle(m) && m.date.slice(0, 7) === date.slice(0, 7));
  return {
    id: uid('m'), titre: nomSeance(date, extra ? 'Séance extraordinaire' : mot), date, heure: '19:30', lieu: 'À définir',
    ...(extra ? { unique: true } : {}),
  };
}

/** Avertissement : tâches dont le délai suit la date de la séance / de l'événement. */
export const linkedTasksNote = (tasks: Task[], id: string, type: 'meeting' | 'event') =>
  linkedNote(tasks.filter((t) => (type === 'meeting' ? t.meetingId : t.eventId) === id && t.delaiRef?.type === type).length);

/**
 * Excusés et retards d'une séance (avec leur motif) ; « Je serai absent(e) » et « Je serai en retard » pour les membres
 * convoqués.
 */
function Excuses({ m, past }: { m: Meeting; past: boolean }) {
  const { data, user, update } = useStore();
  const [ouvert, setOuvert] = useState<SorteAnnonce | null>(null);
  const [motif, setMotif] = useState('');
  const [vers, setVers] = useState('');
  const mine = user ? annonceDe(m, user.id) : undefined;
  // Convoqués : les personnes dont un rôle donne le droit « Séances ».
  const convoque = !!user && convoquesDe(data).some((p) => p.id === user.id);
  const fermer = () => {
    setOuvert(null);
    setMotif('');
    setVers('');
  };
  const set = (a: Annonce | null) => {
    if (!user) return;
    update(
      (d) => annoncer(d.meetings.find((y) => y.id === m.id)!, user.id, a),
      a?.sorte === 'excuse'
        ? `${fullName(user)} s’excuse pour ${m.titre}`
        : a
          ? `${fullName(user)} annonce un retard pour ${m.titre}`
          : `${fullName(user)} sera finalement ${mine?.sorte === 'retard' ? 'à l’heure' : 'présent(e)'} à ${m.titre}`,
    );
    fermer();
  };
  const nom = (id: string) => {
    const p = data.people.find((x) => x.id === id);
    return p ? fullName(p) : '';
  };
  const avec = (n: string, details: (string | undefined)[]) => {
    const d = details.filter(Boolean).join(' – ');
    return n && `${n}${d ? ` (${d})` : ''}`;
  };
  const excuses = (m.excuses ?? []).map((e) => avec(nom(e.personId), [e.motif])).filter(Boolean);
  const retards = (m.retards ?? []).map((r) => avec(nom(r.personId), [r.vers && `vers ${enHeures(r.vers)}`, r.motif])).filter(Boolean);
  if (!excuses.length && !retards.length && (past || !convoque)) return null;
  return (
    <div className="excuses">
      {excuses.length > 0 && <p className="muted"><Icone n="absent" /> Excusé{excuses.length > 1 ? 's' : ''} : {excuses.join(', ')}</p>}
      {retards.length > 0 && <p className="muted"><Icone n="horloge" /> En retard : {retards.join(', ')}</p>}
      {!past && convoque && (
        mine ? (
          <p>
            <span className="chip on">
              <Icone n={mine.sorte === 'excuse' ? 'ok' : 'horloge'} /> {mine.sorte === 'excuse' ? 'Tu es excusé(e)' : `Tu as annoncé un retard${mine.vers ? ` (vers ${enHeures(mine.vers)})` : ''}`}
            </span>{' '}
            <button className="btn small link" onClick={() => set(null)}>{mine.sorte === 'excuse' ? 'Je serai finalement présent(e)' : 'Je serai finalement à l’heure'}</button>
          </p>
        ) : ouvert ? (
          <div className="row wrap">
            {ouvert === 'retard' && (
              <label className="excuses-vers">
                Arrivée vers
                <input type="time" value={vers} onChange={(e) => setVers(e.target.value)} aria-label="Heure d’arrivée prévue" />
              </label>
            )}
            <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (facultatif)" aria-label="Motif" maxLength={120} />
            <button className="btn small primary" onClick={() => set({ sorte: ouvert, motif, vers })}>{ouvert === 'excuse' ? 'Confirmer mon absence' : 'Confirmer mon retard'}</button>
            <button className="btn small" onClick={fermer}>Annuler</button>
          </div>
        ) : (
          <div className="row wrap">
            <button className="btn small" onClick={() => setOuvert('excuse')}><Icone n="absent" /> Je serai absent(e)</button>
            <button className="btn small" onClick={() => setOuvert('retard')}><Icone n="horloge" /> Je serai en retard</button>
          </div>
        )
      )}
    </div>
  );
}

/** Archive ouverte (PV ou ordre du jour) d'une séance. */
type VuePv = { meeting: Meeting; pv: PvArchive; kind: 'odj' | 'pv' };

/** Séances du comité : chacune mène à ses tâches, son ordre du jour et son PV. */
export function Meetings() {
  const { data, can } = useStore();
  const [edit, setEdit] = useState<Meeting | null>(null);
  const [nouvelle, setNouvelle] = useState(false);
  const [viewPv, setViewPv] = useState<VuePv | null>(null);
  const gerer = can('meetings.manage');
  // Les séances passées sont repliées en bas (archives des PV et ordres du jour), les plus récentes d'abord.
  const jour = today();
  const toutes = [...data.meetings].sort((a, b) => a.date.localeCompare(b.date) || (a.heure ?? '').localeCompare(b.heure ?? ''));
  const aVenir = toutes.filter((m) => m.date >= jour);
  const passees = toutes.filter((m) => m.date < jour).reverse();
  const cible = useCible('seance');
  useEffect(() => {
    if (!cible?.archive) return;
    for (const m of toutes) {
      const pv = m.minutesArchives?.find((x) => x.id === cible.id);
      const odj = m.pvArchives?.find((x) => x.id === cible.id);
      if (pv || odj) return setViewPv({ meeting: m, pv: (pv ?? odj)!, kind: pv ? 'pv' : 'odj' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible]);

  const carte = (m: Meeting) => (
    <CarteSeance key={m.id} m={m} cible={estCible(cible, m.id)} onPv={(pv, kind) => setViewPv({ meeting: m, pv, kind })} onEdit={() => setEdit(m)} />
  );

  return (
    <div>
      <div className="page-head">
        <h1>Séances du comité</h1>
        {gerer && <button className="btn primary" onClick={() => setNouvelle(true)}>+ Nouvelle séance</button>}
      </div>
      <PageIntro />
      {gerer && (
        <>
          <Renommer />
          <AnneeProchaine />
        </>
      )}
      <div className="agenda">
        {aVenir.map(carte)}
        {!aVenir.length && <Empty>{passees.length ? 'Aucune séance à venir.' : 'Aucune séance.'}</Empty>}
      </div>
      {passees.length > 0 && (
        <details className="seances-passees" open={passees.some((m) => estCible(cible, m.id)) || undefined}>
          <summary><Icone n="archives" /> Séances passées ({passees.length})</summary>
          <div className="agenda">{passees.map(carte)}</div>
        </details>
      )}
      {viewPv && <ArchiveSeance vue={viewPv} onClose={() => setViewPv(null)} />}
      {edit && <MeetingModal meeting={edit} onClose={() => setEdit(null)} />}
      {nouvelle && <MeetingModal meeting={newMeeting(data.meetings, today(), motSeance())} onClose={() => setNouvelle(false)} />}
    </div>
  );
}

/** Carte d'une séance : ses tâches, ses excusés, ses archives. */
function CarteSeance({ m, cible, onPv, onEdit }: { m: Meeting; cible: boolean; onPv: (pv: PvArchive, kind: 'odj' | 'pv') => void; onEdit: () => void }) {
  const { data, can } = useStore();
  const tasks = data.tasks.filter((t) => t.meetingId === m.id);
  const past = m.date < today();
  return (
    <article id={`cible-${m.id}`} className={`panel agenda-item ${past ? 'past' : ''} ${cible ? 'cible' : ''}`}>
      <DateBlock date={m.date} />
      <div className="grow">
        <strong>{m.titre}</strong>
        <div className="muted">
          {m.heure && `${m.heure.replace(':', 'h')} · `}<LieuSeance m={m} vide="" />{!past && ` · dans ${daysUntil(m.date)} j`}
          {annuelle(m) ? <> · <Icone n="repetition" /> chaque année</> : ' · une seule fois'}
        </div>
        <Excuses m={m} past={past} />
        <Link to={`/taches?meeting=${encodeURIComponent(m.id)}`}>{tasks.length} point(s) rattaché(s) à la séance →</Link>
        {((m.pvArchives?.length ?? 0) > 0 || (m.minutesArchives?.length ?? 0) > 0 || can('tab.minutes')) && (
          <div className="pv-archives">
            {(m.minutesArchives ?? []).map((pv, i) => (
              <button key={pv.id} className="chip on" onClick={() => onPv(pv, 'pv')} title={`Validé le ${fmtDateTime(pv.at)}`}>
                <Icone n="pv" /> {pv.titre}{i > 0 ? ` (version du ${fmtDateTime(pv.at)})` : ''}
              </button>
            ))}
            {(m.pvArchives ?? []).map((pv) => (
              <button key={pv.id} className="chip" onClick={() => onPv(pv, 'odj')} title={`Archivé le ${fmtDateTime(pv.at)}`}>
                <Icone n="odj" /> Ordre du jour · {fmtDateTime(pv.at)}
              </button>
            ))}
            {can('tab.minutes') && (
              <Link className="chip" to={`/pv?seance=${m.id}`}>
                <Icone n="notes" /> {m.minutes ? 'Reprendre le PV' : 'Prendre les notes du PV'}
              </Link>
            )}
          </div>
        )}
      </div>
      {can('meetings.manage') && <button className="btn small" onClick={onEdit}>Modifier</button>}
    </article>
  );
}

/** PV ou ordre du jour archivé d'une séance (supprimable selon mes droits). */
function ArchiveSeance({ vue, onClose }: { vue: VuePv; onClose: () => void }) {
  const { can, update } = useStore();
  return (
    <PvViewer
      pv={vue.pv}
      kind={vue.kind}
      canDelete={vue.kind === 'pv' ? can('tab.minutes') : can('meetings.manage') || can('tab.pv')}
      onDelete={() => {
        update((d) => {
          const x = d.meetings.find((y) => y.id === vue.meeting.id)!;
          if (vue.kind === 'pv') x.minutesArchives = (x.minutesArchives ?? []).filter((p) => p.id !== vue.pv.id);
          else x.pvArchives = (x.pvArchives ?? []).filter((p) => p.id !== vue.pv.id);
        }, `Suppression ${vue.kind === 'pv' ? 'du PV' : 'de l’ordre du jour'} archivé « ${vue.pv.titre} »`);
        onClose();
      }}
      onClose={onClose}
    />
  );
}

/** « jeudi 8 avril 2027 » (sans la virgule que certains navigateurs ajoutent après le jour). */
const jourLong = (date: string) => {
  const d = new Date(date + 'T12:00:00');
  return `${d.toLocaleDateString('fr-CH', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('fr-CH', { month: 'long' })} ${d.getFullYear()}`;
};

/** Séances de l'année prochaine : chaque séance revient le même mois ; on coche celles à ajouter. */
function AnneeProchaine({ nom }: { nom?: string }) {
  const { data, can, update } = useStore();
  const [sauf, setSauf] = useState<string[]>([]);
  const liste = aPlanifier(data.meetings);
  if (!liste.length || !can('meetings.manage')) return null;
  const choisies = liste.filter((x) => !sauf.includes(x.source.id));
  const ajouter = () =>
    update((d) => { d.meetings = [...d.meetings, ...choisies.map((x) => x.meeting)]; }, `Ajout des séances de l’année prochaine : ${choisies.map((x) => x.meeting.titre).join(', ')}`);
  const plusJamais = (m: Meeting) => {
    const ids = serieDuMois(data.meetings, m);
    update((d) => { d.meetings.forEach((x) => { if (ids.includes(x.id)) x.unique = true; }); }, `La séance ${duMois(m.date)} ne revient plus chaque année`);
  };
  return (
    <section className="panel seances-suivantes">
      <h2><Icone n="repetition" /> Séances de l’année prochaine{nom && <> <span className="tsource">{nom}</span></>}</h2>
      <p className="muted">Chaque séance revient l’année suivante, le même mois et le même jour de la semaine. Coche celles à ajouter :</p>
      <ul>
        {liste.map(({ source, meeting }) => (
          <li key={source.id}>
            <label>
              <input type="checkbox" checked={!sauf.includes(source.id)} onChange={() => setSauf(sauf.includes(source.id) ? sauf.filter((x) => x !== source.id) : [...sauf, source.id])} />
              <span><strong>{meeting.titre}</strong> <span className="muted">· {jourLong(meeting.date)}{meeting.heure && `, ${meeting.heure.replace(':', 'h')}`}</span></span>
            </label>
            <button className="btn small link" onClick={() => plusJamais(source)} title={`Le mois de « ${source.titre} » ne sera plus proposé`}>Ne revient plus</button>
          </li>
        ))}
      </ul>
      <button className="btn primary" disabled={!choisies.length} onClick={ajouter}>
        <Icone n="ajouterSeance" /> Ajouter {choisies.length > 1 ? `les ${choisies.length} séances` : 'la séance'}
      </button>
    </section>
  );
}

const GARDER_NOMS = 'gsa-seances-noms-gardes';

/** Anciens noms numérotés (« Comité 4 ») : les remplacer par le mois (« Comité de septembre 2026 »). */
function Renommer({ nom }: { nom?: string }) {
  const { data, can, update } = useStore();
  const [garde, setGarde] = useState(() => {
    try { return localStorage.getItem(GARDER_NOMS) === '1'; } catch { return false; }
  });
  const liste = aRenommer(data.meetings);
  if (!liste.length || garde || !can('meetings.manage')) return null;
  const renommer = () =>
    update((d) => {
      d.meetings.forEach((m) => { const x = liste.find((y) => y.meeting.id === m.id); if (x) m.titre = x.titre; });
    }, `Séances nommées d’après leur mois (${liste.length})`);
  const garder = () => {
    try { localStorage.setItem(GARDER_NOMS, '1'); } catch { /* rien */ }
    setGarde(true);
  };
  return (
    <section className="panel seances-noms">
      <h2><Icone n="modifier" /> Nommer les séances d’après leur mois{nom && <> <span className="tsource">{nom}</span></>}</h2>
      <p className="muted">
        « {liste[0].meeting.titre} » deviendrait « {liste[0].titre} ». Le nom suit ensuite la date : une séance déplacée en avril s’appelle « … d’avril ».
      </p>
      {liste.length > 1 && (
        <details>
          <summary>Voir les {liste.length} séances</summary>
          <ul>{liste.map((x) => <li key={x.meeting.id}>{x.meeting.titre} → <strong>{x.titre}</strong></li>)}</ul>
        </details>
      )}
      <p className="row wrap">
        <button className="btn primary" onClick={renommer}><Icone n="modifier" /> Renommer {liste.length > 1 ? `les ${liste.length} séances` : 'la séance'}</button>
        <button className="btn" onClick={garder}>Garder les noms actuels</button>
      </p>
    </section>
  );
}

/** Fiche d'une séance : son nom suit le mois de la date ; elle revient chaque année, sauf si on décoche. */
export function MeetingModal({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const { data } = useStore();
  const { saveMeeting, removeMeeting } = useAgendaActions();
  const mot = useMotSeance();
  const isNew = !data.meetings.some((x) => x.id === meeting.id);
  const [v, setV] = useState<Meeting>(meeting);
  const [choixFait, setChoixFait] = useState(false);
  const [err, setErr] = useState('');
  const [carte, setCarte] = useState(false);
  const set = (p: Partial<Meeting>) => setV((x) => ({ ...x, ...p }));
  // Lieux des autres séances : proposés à la saisie ; un lieu déjà placé sur la carte reprend son épingle.
  const connus = useMemo(() => lieuxConnus(data.meetings.filter((x) => x.id !== meeting.id)), [data.meetings, meeting.id]);
  const setLieu = (lieu: string) => {
    const k = connus.find((x) => x.nom.toLocaleLowerCase('fr') === lieu.trim().toLocaleLowerCase('fr'));
    set({ lieu, ...(k?.geo ? { lieuGeo: k.geo } : {}) });
  };
  const proposition = (date: string) => {
    const n = newMeeting(data.meetings, date, mot);
    return { titre: n.titre, unique: n.unique };
  };
  const setDate = (date: string) =>
    setV((x) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ...x, date };
      // Nouvelle séance pas encore retouchée : nom et retour annuel selon le mois choisi.
      if (isNew && !choixFait && x.titre === proposition(x.date).titre) return { ...x, date, ...proposition(date) };
      return { ...x, date, titre: titreSelonDate(x.titre, date, true) ?? x.titre };
    });
  const autre = !v.unique && /^\d{4}-\d{2}/.test(v.date)
    ? data.meetings.find((x) => x.id !== v.id && annuelle(x) && x.date.slice(0, 7) === v.date.slice(0, 7))
    : undefined;
  const submit = () => {
    if (!v.titre.trim()) return setErr('« Titre » est obligatoire.');
    if (!v.date) return setErr('« Date » est obligatoire.');
    saveMeeting({ ...v, titre: v.titre.trim() });
    onClose();
  };
  const supprimer = () => {
    const fin = seuleDuMois(data.meetings, meeting);
    const msg = fin
      ? `Supprimer « ${meeting.titre} » ?\n\nLa séance ${duMois(meeting.date)} ne sera plus proposée les années suivantes. (Pour la déplacer, change plutôt sa date.)`
      : 'Supprimer définitivement ?';
    if (!confirm(msg)) return;
    removeMeeting(meeting);
    onClose();
  };
  const note = linkedTasksNote(data.tasks, v.id, 'meeting');
  const field = (k: 'heure', label: string, type: string) => (
    <label>
      {label}
      <input type={type} value={v[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} />
    </label>
  );
  return (
    <Modal title={isNew ? 'Nouvelle séance' : 'Séance'} onClose={onClose}>
      <div className="form">
        <label>
          Titre
          <input value={v.titre} onChange={(e) => set({ titre: e.target.value })} />
        </label>
        <label>
          Date
          <input type="date" value={v.date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {field('heure', 'Heure', 'time')}
        <label>
          Lieu
          <input value={v.lieu ?? ''} onChange={(e) => setLieu(e.target.value)} list="lieux-seances" />
          <datalist id="lieux-seances">
            {connus.map((k) => <option key={k.nom} value={k.nom}>{k.geo ? 'placé sur la carte' : ''}</option>)}
          </datalist>
        </label>
        <div className="full lieu-carte">
          {v.lieuGeo ? (
            <p className="row wrap">
              <span><Icone n="lieu" /> Placé sur la carte</span>
              <Lien href={lienCarte(v.lieuGeo)}>Voir</Lien>
              {!carte && <button type="button" className="btn small" onClick={() => setCarte(true)}>Déplacer l’épingle</button>}
              <button type="button" className="btn small" onClick={() => set({ lieuGeo: undefined })}>Retirer de la carte</button>
            </p>
          ) : (
            !carte && <button type="button" className="btn small" onClick={() => setCarte(true)}><Icone n="lieu" /> Placer sur la carte</button>
          )}
          {carte && (
            <Suspense fallback={<p className="muted small">Chargement de la carte…</p>}>
              <CarteLieu point={v.lieuGeo} centre={dernierPoint(data.meetings)} recherche={v.lieu} onChange={(p) => set({ lieuGeo: p })} />
            </Suspense>
          )}
        </div>
        <label className="inline full">
          <input type="checkbox" checked={!v.unique} onChange={(e) => { setChoixFait(true); set({ unique: e.target.checked ? undefined : true }); }} />
          <Icone n="repetition" /> Revient chaque année {/^\d{4}-\d{2}/.test(v.date) && `(séance ${duMois(v.date)})`}
        </label>
        <p className="muted full serie-note">
          {v.unique
            ? 'Séance unique : elle ne sera pas proposée l’année prochaine.'
            : 'Proposée de nouveau l’année prochaine, le même mois. Les points annuels rattachés à cette séance passeront à celle de l’année suivante.'}
          {autre && <> <Icone n="alerte" /> « {autre.titre} » revient déjà ce mois-là : décoche si celle-ci est exceptionnelle.</>}
        </p>
        <label className="inline full">
          <input type="checkbox" checked={!!v.ag} onChange={(e) => set({ ag: e.target.checked || undefined })} /> Assemblée générale
        </label>
        <p className="muted full serie-note">La chronologie du club se lit aussi d’une assemblée générale à l’autre.</p>
      </div>
      {note && <p className="muted">{note}</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && <button className="btn danger" onClick={supprimer} title="Supprimer la séance" aria-label="Supprimer la séance"><Icone n="supprimer" /></button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>Enregistrer</button>
      </div>
    </Modal>
  );
}

/**
 * Événements de l'agenda, et les étiquettes « événement » datées (Bruntrutaine, soirée…) avec l'avancement de leurs
 * tâches. Un événement de l'agenda et une étiquette du même jour, de même nom, vont ensemble. Les événements passés sont
 * repliés en bas (les plus récents d'abord) ; un clic sur un événement ouvre sa chronologie (Chronologie.tsx).
 */
export function Events() {
  const { data, can } = useStore();
  const [edit, setEdit] = useState<{ e: ClubEvent; jour?: string } | null>(null);
  // Nouvel événement ; `dansSerie` : « + Événement » d'une série.
  const [nouveau, setNouveau] = useState<{ dansSerie?: string } | null>(null);
  // Série d'événements ouverte (nouvelle ou existante) ; reprise pour la saison suivante.
  const [serieOuverte, setSerieOuverte] = useState<SerieEvenements | null>(null);
  const [serieReprise, setSerieReprise] = useState<SerieEvenements | null>(null);
  // Événement passé repris pour une nouvelle édition, avec ses tâches (Reprise.tsx).
  // Reprendre un événement passé (nouvelle édition) ou en copier un à venir (`copie`).
  const [reprise, setReprise] = useState<{ e: ClubEvent; copie: boolean } | null>(null);
  const [chrono, setChrono] = useState<CibleChrono | null>(null);
  const cible = useCible('id');
  // Événement qui se répète : une seule fois, à sa prochaine occurrence (série terminée : la dernière).
  const jour = today();
  const affiche = (e: ClubEvent) => dateAffichee(e, jour);
  const etiquettes = etiquettesDatees(data.etiquettes);
  const etiquetteDe = (e: ClubEvent) => (data.etiquettes ?? []).find((et) => et.eventId === e.id) ?? etiquettes.find((et) => !et.eventId && memeEvenement(et, e));
  const seules = etiquettes.filter((et) => !et.eventId && !data.events.some((e) => memeEvenement(et, e)));
  // Séries d'événements (seriesEvenements.ts) : une carte chacune, avec ses événements ; à la date de son prochain
  // événement (sans événement : aujourd'hui, en tête).
  const series = (data.seriesEvenements ?? []).map((s) => {
    const evs = evenementsDeLaSerie(data.events, s.id);
    return { s, evs, date: prochainDeLaSerie(evs, jour)?.date ?? jour };
  });
  const enSerie = new Set(series.flatMap((x) => x.evs.map((e) => e.id)));
  type Element = { date: string; e?: ClubEvent; et?: Etiquette; serie?: (typeof series)[number] };
  const liste: Element[] = [
    ...data.events.filter((e) => !enSerie.has(e.id)).map((e): Element => ({ date: affiche(e), e, et: etiquetteDe(e) })),
    ...seules.map((et): Element => ({ date: et.date!, et })),
    ...series.map((x): Element => ({ date: x.date, serie: x })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.e?.heure ?? '').localeCompare(b.e?.heure ?? ''));
  // Passé : son dernier jour est derrière nous (celui de l'occurrence affichée, pour un événement qui se répète) ; une
  // série : tous ses événements.
  const passe = (x: Element) =>
    x.serie ? seriePassee(x.serie.evs, jour) : (x.e ? endOf(aLaDate(x.e, x.date)) : endOf({ date: x.date, dateFin: x.et?.dateFin })) < jour;
  const aVenir = liste.filter((x) => !passe(x));
  const passes = liste.filter(passe).reverse();
  // Carte visée (recherche, lien « Reprise ») : un événement d'une série amène à la carte de sa série.
  const vise = (x: Element) => (x.serie ? estCible(cible, x.serie.s.id) || x.serie.evs.some((e) => estCible(cible, e.id)) : !!x.e && estCible(cible, x.e.id));

  const carte = (x: Element) => {
    const { e: serie, et, date } = x;
    if (x.serie)
      return (
        <CarteSerie
          key={`s:${x.serie.s.id}`}
          serie={x.serie.s}
          evs={x.serie.evs}
          cible={vise(x)}
          etiquetteDe={etiquetteDe}
          onEdit={() => setSerieOuverte(x.serie!.s)}
          onAjout={() => setNouveau({ dansSerie: x.serie!.s.id })}
          onRepriseSerie={() => setSerieReprise(x.serie!.s)}
          onEditEvent={(e) => setEdit({ e, jour: e.repetition ? affiche(e) : undefined })}
          onReprise={(e, copie) => setReprise({ e, copie })}
          onChrono={(e) => setChrono({ serie: e, date: affiche(e), etiquette: etiquetteDe(e) })}
        />
      );
    return serie ? (
      <CarteEvenement
        key={serie.id}
        serie={serie}
        date={date}
        etiquette={et}
        cible={estCible(cible, serie.id)}
        onEdit={() => setEdit({ e: serie, jour: serie.repetition ? date : undefined })}
        onReprise={(copie) => setReprise({ e: serie, copie })}
        onChrono={() => setChrono({ serie, date, etiquette: et })}
      />
    ) : (
      et && <CarteEtiquette key={`et:${et.id}`} et={et} onChrono={() => setChrono({ date: et.date!, etiquette: et })} />
    );
  };

  return (
    <div>
      <div className="page-head">
        <h1>Événements</h1>
        {can('events.manage') && (
          <div className="actions">
            <button className="btn" onClick={() => setSerieOuverte(nouvelleSerie())} title="Réunir des événements : programme hivernal, championnat en plusieurs manches…">
              <Icone n="serie" /> Nouvelle série
            </button>
            <button className="btn primary toujours" onClick={() => setNouveau({})}>+ Nouvel événement</button>
          </div>
        )}
      </div>
      <PageIntro />
      <div className="agenda">
        {aVenir.map(carte)}
        {!aVenir.length && <Empty>{passes.length ? 'Aucun événement à venir.' : 'Aucun événement.'}</Empty>}
      </div>
      {passes.length > 0 && (
        <details className="seances-passees evenements-passes" open={passes.some(vise) || undefined}>
          <summary><Icone n="archives" /> Événements passés ({passes.length})</summary>
          <div className="agenda">{passes.map(carte)}</div>
        </details>
      )}
      {edit && <EventModal event={edit.e} jour={edit.jour} onClose={() => setEdit(null)} />}
      {nouveau && <EventModal event={newEvent(undefined, nouveau.dansSerie)} onClose={() => setNouveau(null)} />}
      {serieOuverte && <SerieModal serie={serieOuverte} onClose={() => setSerieOuverte(null)} />}
      {serieReprise && <RepriseSerieModal serie={serieReprise} onClose={() => setSerieReprise(null)} />}
      {reprise && <RepriseModal event={reprise.e} copie={reprise.copie} onClose={() => setReprise(null)} />}
      {chrono && <Chronologie cible={chrono} onClose={() => setChrono(null)} />}
    </div>
  );
}

/** L'étiquette de l'événement : sa pastille et ses membres (qui voient ses points) ; sa discussion : dans « Messages ». */
function EtiquetteCarte({ et }: { et: Etiquette }) {
  const n = et.membres?.length ?? 0;
  return (
    <div className="etiquette-taches">
      <BadgeEtiquette e={et} /> <small className="muted">{n} membre{n > 1 ? 's' : ''}</small>
    </div>
  );
}

/**
 * « Points » : la liste de ses points. Avec son étiquette, tous ceux qui la portent (rangés chez elle, ou rattachés à
 * l'événement : ils la reçoivent d'office) ; sinon, ceux rattachés à l'événement.
 */
function BoutonPoints({ to }: { to: string }) {
  return (
    <Link className="btn small" to={to} title="Voir ses points dans la liste des points">
      <Icone n="taches" /> <span className="libelle">Points</span>
    </Link>
  );
}

/**
 * Étiquette « événement » datée, sans événement du même jour dans l'agenda : avancement de ses points ; un clic, sa
 * chronologie.
 */
function CarteEtiquette({ et, onChrono }: { et: Etiquette; onChrono: () => void }) {
  const { data } = useStore();
  const jour = today();
  const fin = endOf({ date: et.date!, dateFin: et.dateFin });
  const past = fin < jour;
  const jours = diffDays(et.date!, fin) + 1;
  const quand = past ? '' : et.date! <= jour ? 'en cours' : `dans ${daysUntil(et.date!)} j`;
  const taches = data.tasks.filter((t) => t.etiquettes?.includes(et.id));
  return (
    <article className={`panel agenda-item carte-evenement etiquette-evenement ${past ? 'past' : ''}`} style={{ '--c': et.couleur } as React.CSSProperties}>
      <DateBlock date={et.date!} fin={et.dateFin} onClick={onChrono} />
      <div className="grow">
        <TitreEvenement nom={et.nom} onClick={onChrono} />
        <div className="muted">{['Événement (étiquette)', jours > 1 && `${jours} jours`, quand].filter(Boolean).join(' · ')}</div>
        <EtiquetteCarte et={et} />
        <Progress done={taches.filter((t) => isDone(data, t)).length} total={taches.length} />
      </div>
      <div className="agenda-actions">
        <BoutonChrono onClick={onChrono} />
        <BoutonPoints to={`/taches?etiquette=${encodeURIComponent(et.id)}`} />
      </div>
    </article>
  );
}

/**
 * Carte d'un événement (à la date `date` s'il se répète) : avancement de ses points (rattachés à lui ou qui portent son
 * étiquette, comme à l'accueil et dans sa chronologie) ; `etiquette` : la sienne, ou celle du même jour. Un clic sur son
 * nom ou sa date ouvre sa chronologie ; ses boutons (à droite ; sur téléphone, sous la date et leur icône seule) :
 * chronologie, points, modifier, reprendre.
 */
function CarteEvenement({ serie, date, etiquette, cible, onEdit, onReprise, onChrono }: {
  serie: ClubEvent; date: string; etiquette?: Etiquette; cible: boolean; onEdit: () => void; onReprise: (copie: boolean) => void; onChrono: () => void;
}) {
  const { data, can } = useStore();
  const jour = today();
  const e = aLaDate(serie, date);
  const rattaches = data.tasks.filter((t) => t.eventId === e.id);
  const tasks = data.tasks.filter((t) => t.eventId === e.id || (!!etiquette && !!t.etiquettes?.includes(etiquette.id)));
  const fin = endOf(e);
  const past = fin < jour;
  const jours = diffDays(e.date, fin) + 1;
  const quand = past ? '' : e.date <= jour ? 'en cours' : `dans ${daysUntil(e.date)} j`;
  const suite = data.events.find((x) => x.repriseDe === serie.id);
  // Liste de ses points : ceux de son étiquette (ses points rattachés la reçoivent d'office) ; une étiquette du même jour
  // pas encore reliée ne les a pas : ceux rattachés à l'événement, s'il en a.
  const liste = etiquette && (etiquette.eventId === serie.id || !rattaches.length)
    ? `/taches?etiquette=${encodeURIComponent(etiquette.id)}`
    : `/taches?event=${encodeURIComponent(e.id)}`;
  return (
    <article id={`cible-${serie.id}`} className={`panel agenda-item carte-evenement ${past ? 'past' : ''} ${cible ? 'cible' : ''}`}>
      <DateBlock date={e.date} fin={e.dateFin} onClick={onChrono} />
      <div className="grow">
        <TitreEvenement nom={e.nom} onClick={onChrono} />
        <div className="muted">{[horaire(e), e.lieu, jours > 1 && `${jours} jours`, quand].filter(Boolean).join(' · ')}</div>
        {e.repetition && <div className="muted"><Icone n="repetition" /> {libelleRepetition(serie)}</div>}
        {e.description && <p>{e.description}</p>}
        {etiquette && <EtiquetteCarte et={etiquette} />}
        <Progress done={tasks.filter((t) => isDone(data, t)).length} total={tasks.length} />
        {suite && <p className="muted reprise"><Icone n="dupliquer" /> {past ? 'Reprise' : 'Copie'} : <Link to={`/evenements?id=${encodeURIComponent(suite.id)}`}>{suite.nom}</Link> ({fmtRange(suite.date, suite.dateFin)})</p>}
      </div>
      <div className="agenda-actions">
        <BoutonChrono onClick={onChrono} />
        <BoutonPoints to={liste} />
        {can('events.manage') && (
          <>
            <button className="btn small" onClick={onEdit} title="Modifier l’événement">
              <Icone n="modifier" /> <span className="libelle">Modifier</span>
            </button>
            {reprenable(serie) &&
              (past ? (
                <button className="btn small" onClick={() => onReprise(false)} title="Nouvelle édition de cet événement, avec ses points">
                  <Icone n="dupliquer" /> <span className="libelle">Reprendre</span>
                </button>
              ) : (
                <button className="btn small" onClick={() => onReprise(true)} title="Un autre événement à une autre date, avec les mêmes points (à faire)">
                  <Icone n="dupliquer" /> <span className="libelle">Copier</span>
                </button>
              ))}
          </>
        )}
      </div>
    </article>
  );
}

/** « mar. 17.11.2026 » (sur plusieurs jours : « sam. 27–28.02.2027 »). */
const jourEtDates = (e: Pick<ClubEvent, 'date' | 'dateFin'>) =>
  `${new Date(e.date + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short' })} ${fmtRange(e.date, e.dateFin)}`;

/**
 * Carte d'une série d'événements (seriesEvenements.ts) : son nom, sa période, son prochain événement, ses événements
 * (numérotés quand aucun ne se répète : les manches d'un championnat) et l'avancement de tous leurs points. Ses
 * boutons : ses points, « + Événement » (un nouvel événement dans la série), « Modifier » (nom, description, étiquette,
 * événements) et « Reprendre » (la saison suivante, repriseSerie.ts). Chaque événement garde les siens (chronologie,
 * modifier, copier ou reprendre).
 */
function CarteSerie({ serie, evs, cible, etiquetteDe, onEdit, onAjout, onRepriseSerie, onEditEvent, onReprise, onChrono }: {
  serie: SerieEvenements;
  evs: ClubEvent[];
  cible: boolean;
  etiquetteDe: (e: ClubEvent) => Etiquette | undefined;
  onEdit: () => void;
  onAjout: () => void;
  onRepriseSerie: () => void;
  onEditEvent: (e: ClubEvent) => void;
  onReprise: (e: ClubEvent, copie: boolean) => void;
  onChrono: (e: ClubEvent) => void;
}) {
  const { data, can } = useStore();
  const jour = today();
  const prochain = prochainDeLaSerie(evs, jour);
  const periode = periodeDeLaSerie(evs);
  const past = seriePassee(evs, jour);
  const tasks = pointsDeLaSerie(data, serie.id, evs);
  const quand = !prochain || past ? '' : prochain.date <= jour ? `en cours : ${prochain.nom}` : `prochain : ${prochain.nom}, dans ${daysUntil(prochain.date)} j`;
  const duree = periode && (periode.fin ? (periode.fin > periode.debut ? `du ${fmtDate(periode.debut)} au ${fmtDate(periode.fin)}` : fmtDate(periode.debut)) : `dès le ${fmtDate(periode.debut)}`);
  // Aucun ne se répète (les manches d'un championnat) : numérotés.
  const Liste = evs.length && evs.every((e) => !e.repetition) ? 'ol' : 'ul';
  // Saison suivante déjà préparée (« Reprendre »).
  const suite = data.seriesEvenements?.find((x) => x.repriseDe === serie.id);
  return (
    <article id={`cible-${serie.id}`} className={`panel agenda-item carte-evenement carte-serie ${past ? 'past' : ''} ${cible ? 'cible' : ''}`}>
      {prochain ? <DateBlock date={prochain.date} fin={prochain.dateFin} /> : <div className="dateblock vide" aria-hidden="true"><b><Icone n="serie" /></b></div>}
      <div className="grow">
        <h3 className="titre-serie"><Icone n="serie" /> {serie.nom}</h3>
        <div className="muted">{['Série', `${evs.length} événement${evs.length > 1 ? 's' : ''}`, duree, quand].filter(Boolean).join(' · ')}</div>
        {serie.description && <p>{serie.description}</p>}
        {etiquetteDeLaSerie(data, serie.id) && <EtiquetteCarte et={etiquetteDeLaSerie(data, serie.id)!} />}
        {evs.length > 0 ? (
          <Liste className="serie-ev-liste">
            {evs.map((e) => (
              <LigneSerie
                key={e.id}
                e={e}
                etiquette={etiquetteDe(e)}
                prochain={!past && prochain?.id === e.id}
                onChrono={() => onChrono(e)}
                onEdit={() => onEditEvent(e)}
                onReprise={(copie) => onReprise(e, copie)}
              />
            ))}
          </Liste>
        ) : (
          <p className="muted">Aucun événement dans la série pour l’instant{can('events.manage') ? ' : « Événement » en ajoute un, « Modifier » y range ceux de l’agenda.' : '.'}</p>
        )}
        <Progress done={tasks.filter((t) => isDone(data, t)).length} total={tasks.length} />
        {suite && <p className="muted reprise"><Icone n="dupliquer" /> Saison suivante : <Link to={`/evenements?id=${encodeURIComponent(suite.id)}`}>{suite.nom}</Link></p>}
      </div>
      <div className="agenda-actions">
        <BoutonPoints to={`/taches?event=${encodeURIComponent(FILTRE_SERIE + serie.id)}`} />
        {can('events.manage') && (
          <>
            <button className="btn small" onClick={onAjout} title="Ajouter un nouvel événement à la série">
              <Icone n="ajouterSeance" /> <span className="libelle">Événement</span>
            </button>
            <button className="btn small" onClick={onEdit} title="Modifier la série : son nom, sa description, son étiquette, ses événements">
              <Icone n="modifier" /> <span className="libelle">Modifier</span>
            </button>
            {evs.length > 0 && (
              <button className="btn small" onClick={onRepriseSerie} title="La saison suivante : ses événements décalés (52 semaines), avec leurs points, en une fois">
                <Icone n="dupliquer" /> <span className="libelle">Reprendre</span>
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

/**
 * Un événement dans la carte de sa série : son nom (un clic : sa chronologie), sa date ou sa répétition, son heure, son
 * lieu, son étiquette et ses points ; « Modifier », « Copier » (une autre manche) ou « Reprendre », leur icône seule.
 */
function LigneSerie({ e, etiquette, prochain, onChrono, onEdit, onReprise }: {
  e: ClubEvent; etiquette?: Etiquette; prochain: boolean; onChrono: () => void; onEdit: () => void; onReprise: (copie: boolean) => void;
}) {
  const { data, can } = useStore();
  const jour = today();
  const past = evenementPasse(e, jour);
  const x = aLaDate(e, dateAffichee(e, jour));
  const tasks = data.tasks.filter((t) => t.eventId === e.id || (!!etiquette && !!t.etiquettes?.includes(etiquette.id)));
  const faits = tasks.filter((t) => isDone(data, t)).length;
  const suite = data.events.find((y) => y.repriseDe === e.id);
  return (
    <li className={`serie-ev ${past ? 'past' : ''} ${prochain ? 'prochain' : ''}`}>
      <div className="grow">
        <TitreEvenement nom={e.nom} onClick={onChrono} />
        {prochain && <span className="badge serie-ev-prochain">{x.date <= jour ? 'en cours' : 'prochain'}</span>}
        <div className="muted">
          {[e.repetition ? null : jourEtDates(x), horaire(x), e.lieu, tasks.length ? `${faits}/${tasks.length} point${tasks.length > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}
          {e.repetition && <> {(horaire(x) || e.lieu) && '· '}<Icone n="repetition" /> {libelleRepetition(e)}</>}
        </div>
        {etiquette && <EtiquetteCarte et={etiquette} />}
        {suite && <small className="muted reprise"><Icone n="dupliquer" /> {past ? 'Reprise' : 'Copie'} : {suite.nom} ({fmtRange(suite.date, suite.dateFin)})</small>}
      </div>
      {can('events.manage') && (
        <span className="serie-ev-actions">
          <button className="btn small" onClick={onEdit} title="Modifier l’événement" aria-label={`Modifier « ${e.nom} »`}><Icone n="modifier" /></button>
          {reprenable(e) &&
            (past ? (
              <button className="btn small" onClick={() => onReprise(false)} title="Nouvelle édition de cet événement, avec ses points" aria-label={`Reprendre « ${e.nom} »`}><Icone n="dupliquer" /></button>
            ) : (
              <button className="btn small" onClick={() => onReprise(true)} title="Un autre événement à une autre date (une autre manche), avec les mêmes points (à faire)" aria-label={`Copier « ${e.nom} »`}><Icone n="dupliquer" /></button>
            ))}
        </span>
      )}
    </li>
  );
}

/** Consultation d'un ordre du jour archivé (copie figée), imprimable tel quel. */
function PvViewer({ pv, kind, canDelete, onDelete, onClose }: { pv: PvArchive; kind: 'pv' | 'odj'; canDelete: boolean; onDelete: () => void; onClose: () => void }) {
  const { data } = useStore();
  const logo = useUnitLogo();
  // PV avec fichiers joints en annexe : photos et pages de PDF relues (non copiées dans l'archive).
  const doc = useRef<HTMLDivElement>(null);
  const html = cleanHtml(hydrateArchive(pv.html, data, logo));
  useAnnexesArchive(doc, html);
  useOuvrirDocs();
  usePiedImprime(doc);
  useEffect(() => {
    // Échap : ferme d'abord la visionneuse d'un fichier joint ouverte par-dessus.
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.visionneuse') && onClose();
    window.addEventListener('keydown', k);
    document.body.classList.add('printing-archive');
    return () => {
      window.removeEventListener('keydown', k);
      document.body.classList.remove('printing-archive');
    };
  }, [onClose]);
  return createPortal(
    <div className="pv-overlay">
      <style>{`@page { size: A4 ${pv.orientation === 'paysage' ? 'landscape' : 'portrait'}; margin: ${margesArchive(pv.html)}mm; }`}</style>
      <div className="pv-overlay-bar no-print">
        <strong><Icone n="pdf" /> {pv.titre}</strong>
        <small>archivé le {fmtDateTime(pv.at)} par {fullName(data.people.find((p) => p.id === pv.by))}</small>
        <span className="grow" />
        <BoutonPdf className="btn primary" feuille={doc} titre={kind === 'odj' ? `Ordre du jour ${pv.titre}` : pv.titre} paysage={pv.orientation === 'paysage'} margesMm={margesArchive(pv.html)} police={policeArchive(pv.html)} />
        <button className="btn" onClick={() => window.print()}><Icone n="imprimer" /> Imprimer</button>
        {canDelete && <button className="btn danger" onClick={() => confirm(kind === 'pv' ? 'Supprimer ce PV archivé ?' : 'Supprimer cet ordre du jour archivé ?') && onDelete()}>Supprimer</button>}
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
      {/* Contenu généré par l'application elle-même (textes déjà échappés à la création) ; images de l'en-tête remises (data URL contrôlées). */}
      <div ref={doc} className="pv-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>,
    document.body,
  );
}

const linkedNote = (n: number) =>
  n ? <><Icone n="epingle" /> {n} point(s) ont un délai calé sur cette date : si tu la changes, leurs délais suivront automatiquement.</> : undefined;

/** Nom d'un événement : un clic ouvre sa chronologie. */
function TitreEvenement({ nom, onClick }: { nom: string; onClick: () => void }) {
  return (
    <button type="button" className="titre-evenement" onClick={onClick} title="Voir la chronologie de ses points">
      <strong>{nom}</strong>
    </button>
  );
}

/** « Chronologie » : les points de l'événement dans le temps, pour les planifier. */
function BoutonChrono({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn small" onClick={onClick} title="Les points de l’événement dans le temps, pour les planifier">
      <Icone n="horloge" /> <span className="libelle">Chronologie</span>
    </button>
  );
}

/** Date d'une carte ; `onClick` : elle ouvre la chronologie (le nom de l'événement aussi, pour le clavier). */
function DateBlock({ date, fin, onClick }: { date: string; fin?: string; onClick?: () => void }) {
  const d = new Date(date + 'T12:00:00');
  // Sur plusieurs jours : « 27–28 févr. », « 30 juin–2 juil. ».
  const f = fin && fin > date ? new Date(fin + 'T12:00:00') : null;
  const mois = (x: Date) => x.toLocaleDateString('fr-CH', { month: 'short' });
  return (
    <div className={`dateblock ${f ? 'multi' : ''} ${onClick ? 'cliquable' : ''}`} onClick={onClick} aria-hidden={onClick ? true : undefined}>
      <b>{d.getDate()}{f && `–${f.getDate()}`}</b>
      <span>{f && mois(f) !== mois(d) ? `${mois(d)}–${mois(f)}` : mois(d)}</span>
      <small>{f && f.getFullYear() !== d.getFullYear() ? `${d.getFullYear()}–${String(f.getFullYear()).slice(2)}` : d.getFullYear()}</small>
    </div>
  );
}
