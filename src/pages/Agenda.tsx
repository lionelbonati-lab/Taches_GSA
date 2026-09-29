import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, Meeting, PvArchive } from '../data/types';
import { daysUntil, fmtDateTime, fullName, isDone, today, uid } from '../data/utils';
import { Empty, Modal } from '../components/ui';
import { Progress } from './Dashboard';

// Onglets « Comité » (séances) et « Événements » : même principe, champs différents.

export function Meetings() {
  const { data, can, update } = useStore();
  const [edit, setEdit] = useState<Meeting | null>(null);
  const [viewPv, setViewPv] = useState<{ meeting: Meeting; pv: PvArchive; kind: 'odj' | 'pv' } | null>(null);
  const manage = can('meetings.manage');
  const sorted = [...data.meetings].sort((a, b) => a.date.localeCompare(b.date));
  const save = (m: Meeting) => {
    const isNew = !data.meetings.some((x) => x.id === m.id);
    update((d) => { d.meetings = isNew ? [...d.meetings, m] : d.meetings.map((x) => (x.id === m.id ? m : x)); }, `${isNew ? 'Ajout' : 'Modification'} de la séance « ${m.titre} »`);
  };
  const remove = (m: Meeting) => update((d) => {
    d.meetings = d.meetings.filter((x) => x.id !== m.id);
    d.tasks.forEach((t) => { if (t.meetingId === m.id) t.meetingId = undefined; });
  }, `Suppression de la séance « ${m.titre} »`);

  return (
    <div>
      <div className="page-head">
        <h1>Séances du comité</h1>
        {manage && <button className="btn primary" onClick={() => setEdit({ id: uid('m'), titre: `Comité ${data.meetings.length + 1}`, date: today(), heure: '19:30', lieu: 'À définir', ordreDuJour: '', notes: '' })}>+ Nouvelle séance</button>}
      </div>
      <div className="agenda">
        {sorted.map((m) => {
          const tasks = data.tasks.filter((t) => t.meetingId === m.id);
          const past = m.date < today();
          return (
            <article key={m.id} className={`panel agenda-item ${past ? 'past' : ''}`}>
              <DateBlock date={m.date} />
              <div className="grow">
                <strong>{m.titre}</strong>
                <div className="muted">{m.heure && `${m.heure.replace(':', 'h')} · `}{m.lieu}{!past && ` · dans ${daysUntil(m.date)} j`}</div>
                <details>
                  <summary>Ordre du jour {m.notes && '& notes'}</summary>
                  <pre className="odj">{m.ordreDuJour}</pre>
                  {m.notes && <p><em>Notes / PV :</em> {m.notes}</p>}
                </details>
                <Link to={`/taches?meeting=${m.id}`}>{tasks.length} tâche(s) liée(s) →</Link>
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
      {edit && (
        <ItemModal
          title="Séance de comité"
          item={edit}
          note={linkedNote(data.tasks.filter((t) => (t.meetingId === edit.id && t.delaiRef?.type === 'meeting') || t.checklist.some((c) => c.ref?.id === edit.id)).length)}
          fields={[['titre', 'Titre', 'text'], ['date', 'Date', 'date'], ['heure', 'Heure', 'time'], ['lieu', 'Lieu', 'text'], ['ordreDuJour', 'Points particuliers à l’ordre du jour', 'area'], ['notes', 'Notes / PV', 'area']]}
          onSave={save}
          onDelete={data.meetings.some((x) => x.id === edit.id) ? remove : undefined}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

export function Events() {
  const { data, can, update } = useStore();
  const [edit, setEdit] = useState<ClubEvent | null>(null);
  const manage = can('events.manage');
  const sorted = [...data.events].sort((a, b) => a.date.localeCompare(b.date));
  const save = (e: ClubEvent) => {
    const isNew = !data.events.some((x) => x.id === e.id);
    update((d) => { d.events = isNew ? [...d.events, e] : d.events.map((x) => (x.id === e.id ? e : x)); }, `${isNew ? 'Ajout' : 'Modification'} de l'événement « ${e.nom} »`);
  };
  const remove = (e: ClubEvent) => update((d) => {
    d.events = d.events.filter((x) => x.id !== e.id);
    d.tasks.forEach((t) => { if (t.eventId === e.id) t.eventId = undefined; });
  }, `Suppression de l'événement « ${e.nom} »`);

  return (
    <div>
      <div className="page-head">
        <h1>Événements</h1>
        {manage && <button className="btn primary" onClick={() => setEdit({ id: uid('e'), nom: '', date: today(), lieu: '', description: '' })}>+ Nouvel événement</button>}
      </div>
      <div className="agenda">
        {sorted.map((e) => {
          const tasks = data.tasks.filter((t) => t.eventId === e.id);
          const past = e.date < today();
          return (
            <article key={e.id} className={`panel agenda-item ${past ? 'past' : ''}`}>
              <DateBlock date={e.date} />
              <div className="grow">
                <strong>{e.nom}</strong>
                <div className="muted">{e.lieu}{!past && ` · dans ${daysUntil(e.date)} j`}</div>
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
          note={linkedNote(data.tasks.filter((t) => (t.eventId === edit.id && t.delaiRef?.type === 'event') || t.checklist.some((c) => c.ref?.id === edit.id)).length)}
          fields={[['nom', 'Événement', 'text'], ['date', 'Date', 'date'], ['lieu', 'Lieu', 'text'], ['description', 'Description', 'area']]}
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
      {/* Contenu généré par l'application elle-même (textes déjà échappés à la création). */}
      <div className="pv-preview" dangerouslySetInnerHTML={{ __html: pv.html }} />
    </div>,
    document.body,
  );
}

const linkedNote = (n: number) =>
  n ? `🔗 ${n} tâche(s) ont un délai lié à cette date : si tu la changes, leurs délais suivront automatiquement.` : undefined;

function DateBlock({ date }: { date: string }) {
  const d = new Date(date + 'T12:00:00');
  return (
    <div className="dateblock">
      <b>{d.getDate()}</b>
      <span>{d.toLocaleDateString('fr-CH', { month: 'short' })}</span>
      <small>{d.getFullYear()}</small>
    </div>
  );
}

export function ItemModal<T extends { id: string }>({ title, item, fields, onSave, onDelete, onClose, note }: {
  title: string;
  note?: string;
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
