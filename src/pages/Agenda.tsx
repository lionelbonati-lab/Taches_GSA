import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, Meeting } from '../data/types';
import { daysUntil, isDone, today, uid } from '../data/utils';
import { Empty, Modal } from '../components/ui';
import { Progress } from './Dashboard';

// Onglets « Comité » (séances) et « Événements » : même principe, champs différents.

export function Meetings() {
  const { data, can, update } = useStore();
  const [edit, setEdit] = useState<Meeting | null>(null);
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
        {manage && <button className="btn primary" onClick={() => setEdit({ id: uid('m'), titre: `Séance de comité n°${data.meetings.length + 1}`, date: today(), lieu: 'Club-house', ordreDuJour: '1. PV de la dernière séance\n2. \n3. Divers', notes: '' })}>+ Nouvelle séance</button>}
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
                <div className="muted">{m.lieu}{!past && ` · dans ${daysUntil(m.date)} j`}</div>
                <details>
                  <summary>Ordre du jour {m.notes && '& notes'}</summary>
                  <pre className="odj">{m.ordreDuJour}</pre>
                  {m.notes && <p><em>Notes / PV :</em> {m.notes}</p>}
                </details>
                <Link to={`/taches?meeting=${m.id}`}>{tasks.length} tâche(s) liée(s) →</Link>
              </div>
              {manage && <button className="btn small" onClick={() => setEdit(m)}>Modifier</button>}
            </article>
          );
        })}
        {!sorted.length && <Empty>Aucune séance.</Empty>}
      </div>
      {edit && (
        <ItemModal
          title="Séance de comité"
          item={edit}
          note={linkedNote(data.tasks.filter((t) => t.meetingId === edit.id && t.delaiRef?.type === 'meeting').length)}
          fields={[['titre', 'Titre', 'text'], ['date', 'Date', 'date'], ['lieu', 'Lieu', 'text'], ['ordreDuJour', 'Ordre du jour', 'area'], ['notes', 'Notes / PV', 'area']]}
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
          note={linkedNote(data.tasks.filter((t) => t.eventId === edit.id && t.delaiRef?.type === 'event').length)}
          fields={[['nom', 'Événement', 'text'], ['date', 'Date', 'date'], ['lieu', 'Lieu', 'text'], ['description', 'Description', 'area']]}
          onSave={save}
          onDelete={data.events.some((x) => x.id === edit.id) ? remove : undefined}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
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
  fields: [keyof T & string, string, 'text' | 'date' | 'area' | 'email' | 'tel'][];
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
