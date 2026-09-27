import { useEffect, type ReactNode } from 'react';
import { useStore } from '../data/store';
import type { Task } from '../data/types';
import { delaiTarget, fmtDate, fullName, initials, isLate, offsetLabel, recurrenceLabel } from '../data/utils';

export function Avatar({ id, size = 28 }: { id: string; size?: number }) {
  const { data } = useStore();
  const p = data.people.find((x) => x.id === id);
  return (
    <span className="avatar" title={fullName(p)} style={{ background: p?.couleur ?? '#999', width: size, height: size, fontSize: size * 0.4 }}>
      {initials(p)}
    </span>
  );
}

export function StatusBadge({ task }: { task: Task }) {
  const { data } = useStore();
  const s = data.statuses.find((x) => x.id === task.statusId);
  return (
    <span className="badges">
      <span className="badge" style={{ background: s?.couleur ?? '#999' }}>{s?.label ?? '?'}</span>
      {isLate(data, task) && <span className="badge late">En retard</span>}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Petits repères : 🔁 tâche récurrente, 🔗 délai lié à un événement / une séance. */
export function RecurIcon({ task }: { task: Task }) {
  return task.recurrence ? <span className="ticon" title={`Tâche récurrente : ${recurrenceLabel(task.recurrence).toLowerCase()}`}>🔁</span> : null;
}

export function LinkIcon({ task }: { task: Task }) {
  const { data } = useStore();
  const target = delaiTarget(data, task);
  if (!target || !task.delaiRef) return null;
  return <span className="ticon" title={`${offsetLabel(task.delaiRef.joursAvant)} « ${target.nom} » (${fmtDate(target.date)})`}>🔗</span>;
}

export function Toast() {
  const { toast, setToast } = useStore();
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast, setToast]);
  return toast ? <div className="toast" role="status" onClick={() => setToast(null)}>{toast}</div> : null;
}
