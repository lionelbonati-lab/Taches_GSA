import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, Meeting, PvArchive, Task } from '../data/types';
import { daysUntil, diffDays, endOf, fmtDateTime, fullName, isDone, today, uid } from '../data/utils';
import { EditionCard } from '../components/Edition';
import { Empty, Modal } from '../components/ui';
import { Progress } from './Dashboard';
import { hydrateArchive } from '../data/entete';
import { cleanHtml } from '../data/sanitize';
import { useUnitLogo } from '../components/Entete';
import { hasPermission, userRoles } from '../data/permissions';
import { PageIntro } from '../components/Nav';
import { useClubOptional } from '../data/club';
import { aPlanifier, aRenommer, annuelle, duMois, finDeSerie, motSeance, nomSeance, serieDuMois, seuleDuMois, titreSelonDate } from '../data/seances';

// Onglets « Comité » (séances) et « Événements » : même principe, champs différents.

/** Enregistrement / suppression des séances et événements (onglets Comité, Événements et Agenda). */
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
    saveEvent: (x: ClubEvent) => {
      // Sur un seul jour : pas de date de fin.
      const e: ClubEvent = { ...x, dateFin: x.dateFin && x.dateFin > x.date ? x.dateFin : undefined };
      const isNew = !data.events.some((x) => x.id === e.id);
      update((d) => { d.events = isNew ? [...d.events, e] : d.events.map((x) => (x.id === e.id ? e : x)); }, `${isNew ? 'Ajout' : 'Modification'} de l'événement « ${e.nom} »`);
    },
    removeEvent: (e: ClubEvent) => update((d) => {
      d.events = d.events.filter((x) => x.id !== e.id);
      d.tasks.forEach((t) => { if (t.eventId === e.id) t.eventId = undefined; });
    }, `Suppression de l'événement « ${e.nom} »`),
  };
}

export const EVENT_FIELDS: [keyof ClubEvent & string, string, 'text' | 'date' | 'area'][] = [
  ['nom', 'Événement', 'text'], ['date', 'Date (premier jour)', 'date'], ['dateFin', 'Dernier jour (si plusieurs jours)', 'date'], ['lieu', 'Lieu', 'text'],
  ['description', 'Description', 'area'],
];
export const checkEvent = (e: ClubEvent) => (e.dateFin && e.date && e.dateFin < e.date ? 'Le dernier jour ne peut pas précéder le premier.' : undefined);

/** Mot des séances de l'entité ouverte : « Comité », « Séance », « Réunion ». */
export const useMotSeance = () => motSeance(useClubOptional()?.current.type);

/**
 * Nouvelle séance, nommée d'après son mois (« Comité de mars 2027 ») et qui revient chaque année.
 * Ce mois a déjà sa séance : « Séance extraordinaire de mars 2027 », sans retour l'année suivante.
 */
export function newMeeting(meetings: Meeting[], date = today(), mot = 'Comité'): Meeting {
  const extra = meetings.some((m) => annuelle(m) && m.date.slice(0, 7) === date.slice(0, 7));
  return {
    id: uid('m'), titre: nomSeance(date, extra ? 'Séance extraordinaire' : mot), date, heure: '19:30', lieu: 'À définir', ordreDuJour: '', notes: '',
    ...(extra ? { unique: true } : {}),
  };
}
export const newEvent = (date = today()): ClubEvent => ({ id: uid('e'), nom: '', date, lieu: '', description: '' });

/** Avertissement : tâches dont le délai suit la date de la séance / de l'événement. */
export const linkedTasksNote = (tasks: Task[], id: string, type: 'meeting' | 'event') =>
  linkedNote(tasks.filter((t) => (type === 'meeting' ? t.meetingId : t.eventId) === id && t.delaiRef?.type === type).length);

/** Excusés d'une séance, et « Je serai absent(e) » pour les membres convoqués. */
function Excuses({ m, past }: { m: Meeting; past: boolean }) {
  const { data, user, update } = useStore();
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState('');
  const list = m.excuses ?? [];
  const mine = user ? list.find((e) => e.personId === user.id) : undefined;
  const convoque = !!user && user.actif && hasPermission(userRoles(data.roles, user), 'tab.meetings') && data.people.some((p) => p.id === user.id);
  const set = (excuse: boolean) => {
    if (!user) return;
    update((d) => {
      const x = d.meetings.find((y) => y.id === m.id)!;
      const others = (x.excuses ?? []).filter((e) => e.personId !== user.id);
      x.excuses = excuse ? [...others, { personId: user.id, le: today(), ...(motif.trim() ? { motif: motif.trim() } : {}) }] : others;
    }, excuse ? `${fullName(user)} s’excuse pour ${m.titre}` : `${fullName(user)} sera finalement présent(e) à ${m.titre}`);
    setOpen(false);
    setMotif('');
  };
  const names = list.map((e) => {
    const p = data.people.find((x) => x.id === e.personId);
    return p ? `${fullName(p)}${e.motif ? ` (${e.motif})` : ''}` : '';
  }).filter(Boolean);
  if (!names.length && (past || !convoque)) return null;
  return (
    <div className="excuses">
      {names.length > 0 && <p className="muted">🙋 Excusé{names.length > 1 ? 's' : ''} : {names.join(', ')}</p>}
      {!past && convoque && (
        mine ? (
          <p><span className="chip on">✓ Tu es excusé(e)</span> <button className="btn small link" onClick={() => set(false)}>Je serai finalement présent(e)</button></p>
        ) : open ? (
          <div className="row wrap">
            <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (facultatif)" aria-label="Motif" maxLength={120} />
            <button className="btn small primary" onClick={() => set(true)}>Confirmer mon absence</button>
            <button className="btn small" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        ) : (
          <button className="btn small" onClick={() => setOpen(true)}>🙋 Je serai absent(e)</button>
        )
      )}
    </div>
  );
}

export function Meetings() {
  const { data, can, update } = useStore();
  const mot = useMotSeance();
  const [edit, setEdit] = useState<Meeting | null>(null);
  const [viewPv, setViewPv] = useState<{ meeting: Meeting; pv: PvArchive; kind: 'odj' | 'pv' } | null>(null);
  const manage = can('meetings.manage');
  const sorted = [...data.meetings].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <div className="page-head">
        <h1>Séances du comité</h1>
        {manage && <button className="btn primary" onClick={() => setEdit(newMeeting(data.meetings, today(), mot))}>+ Nouvelle séance</button>}
      </div>
      <PageIntro />
      {manage && <Renommer />}
      {manage && <AnneeProchaine />}
      <div className="agenda">
        {sorted.map((m) => {
          const tasks = data.tasks.filter((t) => t.meetingId === m.id);
          const past = m.date < today();
          return (
            <article key={m.id} className={`panel agenda-item ${past ? 'past' : ''}`}>
              <DateBlock date={m.date} />
              <div className="grow">
                <strong>{m.titre}</strong>
                <div className="muted">
                  {m.heure && `${m.heure.replace(':', 'h')} · `}{m.lieu}{!past && ` · dans ${daysUntil(m.date)} j`}
                  {annuelle(m) ? ' · 🔁 chaque année' : ' · une seule fois'}
                </div>
                <details>
                  <summary>Ordre du jour {m.notes && '& notes'}</summary>
                  <pre className="odj">{m.ordreDuJour}</pre>
                  {m.notes && <p><em>Notes / PV :</em> {m.notes}</p>}
                </details>
                <Excuses m={m} past={past} />
                <Link to={`/taches?meeting=${m.id}`}>{tasks.length} tâche(s) rattachée(s) à la séance →</Link>
                {((m.pvArchives?.length ?? 0) > 0 || (m.minutesArchives?.length ?? 0) > 0 || can('tab.minutes')) && (
                  <div className="pv-archives">
                    {(m.minutesArchives ?? []).map((pv, i) => (
                      <button key={pv.id} className="chip on" onClick={() => setViewPv({ meeting: m, pv, kind: 'pv' })} title={`Validé le ${fmtDateTime(pv.at)}`}>
                        📝 {pv.titre}{i > 0 ? ` (version du ${fmtDateTime(pv.at)})` : ''}
                      </button>
                    ))}
                    {(m.pvArchives ?? []).map((pv) => (
                      <button key={pv.id} className="chip" onClick={() => setViewPv({ meeting: m, pv, kind: 'odj' })} title={`Archivé le ${fmtDateTime(pv.at)}`}>
                        📄 Ordre du jour · {fmtDateTime(pv.at)}
                      </button>
                    ))}
                    {can('tab.minutes') && <Link className="chip" to={`/pv?seance=${m.id}`}>🖊️ {m.minutes ? 'Reprendre le PV' : 'Prendre les notes du PV'}</Link>}
                  </div>
                )}
              </div>
              {manage && <button className="btn small" onClick={() => setEdit(m)}>Modifier</button>}
            </article>
          );
        })}
        {!sorted.length && <Empty>Aucune séance.</Empty>}
      </div>
      {viewPv && (
        <PvViewer
          pv={viewPv.pv}
          canDelete={viewPv.kind === 'pv' ? can('tab.minutes') : manage || can('tab.pv')}
          onDelete={() => {
            update((d) => {
              const x = d.meetings.find((y) => y.id === viewPv.meeting.id)!;
              if (viewPv.kind === 'pv') x.minutesArchives = (x.minutesArchives ?? []).filter((p) => p.id !== viewPv.pv.id);
              else x.pvArchives = (x.pvArchives ?? []).filter((p) => p.id !== viewPv.pv.id);
            }, `Suppression ${viewPv.kind === 'pv' ? 'du PV' : 'de l’ordre du jour'} archivé « ${viewPv.pv.titre} »`);
            setViewPv(null);
          }}
          onClose={() => setViewPv(null)}
        />
      )}
      {edit && <MeetingModal meeting={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** « jeudi 8 avril 2027 » (sans la virgule que certains navigateurs ajoutent après le jour). */
const jourLong = (date: string) => {
  const d = new Date(date + 'T12:00:00');
  return `${d.toLocaleDateString('fr-CH', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('fr-CH', { month: 'long' })} ${d.getFullYear()}`;
};

/** Séances de l'année prochaine : chaque séance revient le même mois ; on coche celles à ajouter. */
function AnneeProchaine() {
  const { data, update } = useStore();
  const [sauf, setSauf] = useState<string[]>([]);
  const liste = aPlanifier(data.meetings);
  if (!liste.length) return null;
  const choisies = liste.filter((x) => !sauf.includes(x.source.id));
  const ajouter = () =>
    update((d) => { d.meetings = [...d.meetings, ...choisies.map((x) => x.meeting)]; }, `Ajout des séances de l’année prochaine : ${choisies.map((x) => x.meeting.titre).join(', ')}`);
  const plusJamais = (m: Meeting) => {
    const ids = serieDuMois(data.meetings, m);
    update((d) => { d.meetings.forEach((x) => { if (ids.includes(x.id)) x.unique = true; }); }, `La séance ${duMois(m.date)} ne revient plus chaque année`);
  };
  return (
    <section className="panel seances-suivantes">
      <h2>🔁 Séances de l’année prochaine</h2>
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
        📅 Ajouter {choisies.length > 1 ? `les ${choisies.length} séances` : 'la séance'}
      </button>
    </section>
  );
}

const GARDER_NOMS = 'gsa-seances-noms-gardes';

/** Anciens noms numérotés (« Comité 4 ») : les remplacer par le mois (« Comité de septembre 2026 »). */
function Renommer() {
  const { data, update } = useStore();
  const [garde, setGarde] = useState(() => {
    try { return localStorage.getItem(GARDER_NOMS) === '1'; } catch { return false; }
  });
  const liste = aRenommer(data.meetings);
  if (!liste.length || garde) return null;
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
      <h2>✏️ Nommer les séances d’après leur mois</h2>
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
        <button className="btn primary" onClick={renommer}>✏️ Renommer {liste.length > 1 ? `les ${liste.length} séances` : 'la séance'}</button>
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
  const set = (p: Partial<Meeting>) => setV((x) => ({ ...x, ...p }));
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
  const field = (k: 'heure' | 'lieu', label: string, type: string) => (
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
        {field('lieu', 'Lieu', 'text')}
        <label className="inline full">
          <input type="checkbox" checked={!v.unique} onChange={(e) => { setChoixFait(true); set({ unique: e.target.checked ? undefined : true }); }} />
          🔁 Revient chaque année {/^\d{4}-\d{2}/.test(v.date) && `(séance ${duMois(v.date)})`}
        </label>
        <p className="muted full serie-note">
          {v.unique
            ? 'Séance unique : elle ne sera pas proposée l’année prochaine.'
            : 'Proposée de nouveau l’année prochaine, le même mois. Les tâches annuelles liées à cette séance passeront à celle de l’année suivante.'}
          {autre && ` ⚠️ « ${autre.titre} » revient déjà ce mois-là : décoche si celle-ci est exceptionnelle.`}
        </p>
        <label className="full">
          Points particuliers à l’ordre du jour
          <textarea rows={4} value={v.ordreDuJour} onChange={(e) => set({ ordreDuJour: e.target.value })} />
        </label>
        <label className="full">
          Notes / PV
          <textarea rows={4} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </div>
      {note && <p className="muted">{note}</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && <button className="btn danger" onClick={supprimer}>Supprimer</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>Enregistrer</button>
      </div>
    </Modal>
  );
}

export function Events() {
  const { data, can } = useStore();
  const { saveEvent: save, removeEvent: remove } = useAgendaActions();
  const [edit, setEdit] = useState<ClubEvent | null>(null);
  const manage = can('events.manage');
  const sorted = [...data.events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <div className="page-head">
        <h1>Événements</h1>
        {manage && <button className="btn primary" onClick={() => setEdit(newEvent())}>+ Nouvel événement</button>}
      </div>
      <PageIntro />
      <EditionCard />
      <div className="agenda">
        {sorted.map((e) => {
          const tasks = data.tasks.filter((t) => t.eventId === e.id);
          const fin = endOf(e);
          const past = fin < today();
          const jours = diffDays(e.date, fin) + 1;
          const quand = past ? '' : e.date <= today() ? 'en cours' : `dans ${daysUntil(e.date)} j`;
          return (
            <article key={e.id} className={`panel agenda-item ${past ? 'past' : ''}`}>
              <DateBlock date={e.date} fin={e.dateFin} />
              <div className="grow">
                <strong>{e.nom}</strong>
                <div className="muted">{[e.lieu, jours > 1 && `${jours} jours`, quand].filter(Boolean).join(' · ')}</div>
                <p>{e.description}</p>
                <Progress done={tasks.filter((t) => isDone(data, t)).length} total={tasks.length} />
                <Link to={`/taches?event=${e.id}`}>Voir les tâches →</Link>
              </div>
              {manage && <button className="btn small" onClick={() => setEdit(e)}>Modifier</button>}
            </article>
          );
        })}
        {!sorted.length && <Empty>Aucun événement.</Empty>}
      </div>
      {edit && (
        <ItemModal
          title="Événement"
          item={edit}
          note={linkedTasksNote(data.tasks, edit.id, 'event')}
          fields={EVENT_FIELDS}
          validate={checkEvent}
          onSave={save}
          onDelete={data.events.some((x) => x.id === edit.id) ? remove : undefined}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

/** Consultation d'un ordre du jour archivé (copie figée), imprimable tel quel. */
function PvViewer({ pv, canDelete, onDelete, onClose }: { pv: PvArchive; canDelete: boolean; onDelete: () => void; onClose: () => void }) {
  const { data } = useStore();
  const logo = useUnitLogo();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.classList.add('printing-archive');
    return () => {
      window.removeEventListener('keydown', k);
      document.body.classList.remove('printing-archive');
    };
  }, [onClose]);
  return createPortal(
    <div className="pv-overlay">
      <style>{`@page { size: A4 ${pv.orientation === 'paysage' ? 'landscape' : 'portrait'}; margin: 12mm; }`}</style>
      <div className="pv-overlay-bar no-print">
        <strong>📄 {pv.titre}</strong>
        <small>archivé le {fmtDateTime(pv.at)} par {fullName(data.people.find((p) => p.id === pv.by))}</small>
        <span className="grow" />
        <button className="btn primary" onClick={() => window.print()}>🖨 Imprimer / PDF</button>
        {canDelete && <button className="btn danger" onClick={() => confirm('Supprimer cet ordre du jour archivé ?') && onDelete()}>Supprimer</button>}
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
      {/* Contenu généré par l'application elle-même (textes déjà échappés à la création) ; images de l'en-tête remises (data URL contrôlées). */}
      <div className="pv-preview" dangerouslySetInnerHTML={{ __html: cleanHtml(hydrateArchive(pv.html, data, logo)) }} />
    </div>,
    document.body,
  );
}

const linkedNote = (n: number) =>
  n ? `🔗 ${n} tâche(s) ont un délai lié à cette date : si tu la changes, leurs délais suivront automatiquement.` : undefined;

function DateBlock({ date, fin }: { date: string; fin?: string }) {
  const d = new Date(date + 'T12:00:00');
  // Sur plusieurs jours : « 27–28 févr. », « 30 juin–2 juil. ».
  const f = fin && fin > date ? new Date(fin + 'T12:00:00') : null;
  const mois = (x: Date) => x.toLocaleDateString('fr-CH', { month: 'short' });
  return (
    <div className={`dateblock ${f ? 'multi' : ''}`}>
      <b>{d.getDate()}{f && `–${f.getDate()}`}</b>
      <span>{f && mois(f) !== mois(d) ? `${mois(d)}–${mois(f)}` : mois(d)}</span>
      <small>{f && f.getFullYear() !== d.getFullYear() ? `${d.getFullYear()}–${String(f.getFullYear()).slice(2)}` : d.getFullYear()}</small>
    </div>
  );
}

export function ItemModal<T extends { id: string }>({ title, item, fields, onSave, onDelete, onClose, note, validate }: {
  title: string;
  note?: string;
  /** Contrôle avant enregistrement : message d'erreur, ou rien. */
  validate?: (t: T) => string | undefined;
  item: T;
  fields: [keyof T & string, string, 'text' | 'date' | 'time' | 'area' | 'email' | 'tel'][];
  onSave: (t: T) => void;
  onDelete?: (t: T) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<T>(item);
  const [err, setErr] = useState('');
  const submit = () => {
    if (!String(v[fields[0][0]] ?? '').trim()) return setErr(`« ${fields[0][1]} » est obligatoire.`);
    const bad = validate?.(v);
    if (bad) return setErr(bad);
    onSave(v);
    onClose();
  };
  return (
    <Modal title={title} onClose={onClose}>
      <div className="form">
        {fields.map(([k, label, type]) => (
          <label key={k} className={type === 'area' ? 'full' : ''}>
            {label}
            {type === 'area' ? (
              <textarea rows={4} value={String(v[k] ?? '')} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            ) : (
              <input type={type} value={String(v[k] ?? '')} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      {note && <p className="muted">{note}</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {onDelete && <button className="btn danger" onClick={() => { if (confirm('Supprimer définitivement ?')) { onDelete(item); onClose(); } }}>Supprimer</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>Enregistrer</button>
      </div>
    </Modal>
  );
}
