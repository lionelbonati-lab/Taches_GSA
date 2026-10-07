import { useEffect, useRef, type ReactNode } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { partageDe } from '../data/partage';
import type { Task } from '../data/types';
import { delaiTarget, fmtDate, fullName, initials, isLate, offsetLabel, recurrenceLabel } from '../data/utils';
import { cachedLogo, isImage } from '../data/logo';
import { ETATS, chf, genre, peutOuvrirTicket } from '../data/paiements';

export function Avatar({ id, size = 28 }: { id: string; size?: number }) {
  const { data } = useStore();
  const p = data.people.find((x) => x.id === id);
  return (
    <span className="avatar" title={fullName(p)} style={{ background: p?.couleur ?? '#999', width: size, height: size, fontSize: size * (initials(p).length > 2 ? 0.31 : 0.4) }}>
      {initials(p)}
    </span>
  );
}

/** Pastille d'une personne qui n'est pas dans les données ouvertes (annuaire du club, organigramme). */
export function Initials({ prenom, nom, couleur, size = 28 }: { prenom: string; nom: string; couleur: string; size?: number }) {
  const p = { prenom, nom } as Parameters<typeof initials>[0];
  const txt = initials(p);
  return (
    <span className="avatar" title={`${prenom} ${nom}`.trim()} style={{ background: couleur || '#999', width: size, height: size, fontSize: size * (txt.length > 2 ? 0.31 : 0.4) }}>
      {txt}
    </span>
  );
}

/** Logo du club ou de l'entité, sinon l'icône de l'appli ; logo pas encore connu (`src` absent) : le dernier affiché sur cet appareil. */
export function AppLogo({ src, size }: { src?: string | null; size: number }) {
  const logo = isImage(src) ? src : src === undefined ? cachedLogo() : undefined;
  return logo ? (
    <img className="app-logo" src={logo} alt="" style={{ height: size, maxWidth: size * 2.5 }} />
  ) : (
    <img src="./icon.svg" alt="" width={size} height={size} />
  );
}

/** Pastille d'une entité : son logo, sinon l'icône de son type sur sa couleur. */
export function UnitMark({ logo, couleur, icon, className }: { logo?: string; couleur: string; icon: string; className: string }) {
  return isImage(logo) ? (
    <span className={`${className} has-logo`} style={{ borderColor: couleur }}><img src={logo} alt="" draggable={false} /></span>
  ) : (
    <span className={className} style={{ background: couleur }}>{icon}</span>
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const all = document.querySelectorAll('.modal-back');
      if (all[all.length - 1] === ref.current) onClose(); // seulement la fenêtre du dessus
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    // Un appui à côté de la fenêtre ne la ferme pas (on perdrait la saisie) : ✕, Annuler / Fermer ou Échap.
    <div ref={ref} className="modal-back">
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

/** Petits repères : 🔁 tâche récurrente, 🤝 tâche partagée entre entités, 🔗 délai lié à un événement / une séance. */
export function RecurIcon({ task }: { task: Task }) {
  const club = useClubOptional();
  const avec = partageDe(task, club?.central?.id).map((id) => club?.units.find((u) => u.id === id)?.nom).filter(Boolean);
  const partage = task.source
    ? `Tâche de ${task.source.unite}, partagée avec cette entité`
    : avec.length ? `Partagée avec ${avec.join(', ')}` : task.partage?.length || task.auCentral ? 'Partagée avec d’autres entités' : '';
  return (
    <>
      {task.recurrence && <span className="ticon" title={`Tâche récurrente : ${recurrenceLabel(task.recurrence).toLowerCase()}`}>🔁</span>}
      {partage && <span className="ticon" title={partage}>🤝</span>}
      {task.source && <span className="tsource">{task.source.unite}</span>}
    </>
  );
}

export function LinkIcon({ task }: { task: Task }) {
  const { data } = useStore();
  const target = delaiTarget(data, task);
  if (!target || !task.delaiRef) return null;
  return <span className="ticon" title={`${offsetLabel(task.delaiRef)} « ${target.nom} » (${fmtDate(target.date)})`}>🔗</span>;
}

export function DocPollIcons({ task }: { task: Task }) {
  const { data } = useStore();
  const n = task.documents?.length ?? 0;
  const polls = (data.polls ?? []).filter((p) => p.taskId === task.id).length;
  const emails = (data.emails ?? []).filter((e) => e.taskId === task.id && e.statut === 'programme').length;
  return (
    <>
      {task.paiement && <span className="ticon" title={genre(task.paiement).nom}>{genre(task.paiement).icon}</span>}
      {n > 0 && <span className="ticon" title={`${n} document(s)`}>📎{n > 1 ? n : ''}</span>}
      {polls > 0 && <span className="ticon" title="Sondage lié">📊</span>}
      {emails > 0 && <span className="ticon" title={`${emails} email(s) programmé(s)`}>📧</span>}
    </>
  );
}

/** Remboursement / paiement : montant et étape du circuit, dans les listes de tâches. */
export function TicketTag({ task }: { task: Task }) {
  const { data, user } = useStore();
  const p = task.paiement;
  if (!p) return null;
  const ferme = !peutOuvrirTicket(data, task, user?.id);
  return (
    <small className={`ticket-tag ticket-etat ${p.etat}`} title={`${genre(p).nom} · ${ETATS[p.etat].label}${ferme ? ' · réservé à la caisse, au demandeur et à la personne qui vise' : ''}`}>
      {ferme && '🔒 '}{chf(p.montant)} · {ETATS[p.etat].icon} {ETATS[p.etat].court}
    </small>
  );
}

/** Tâche proposée au comité central par une autre entité du club, ou ajoutée par le comité central dans une entité. */
export function ProposalTag({ task }: { task: Task }) {
  const p = task.proposee;
  if (task.parCentral && !p) return <span className="badge proposal" title={`Tâche ajoutée par ${task.parCentral} (comité central)`}>🏛️ Comité central</span>;
  if (!p) return null;
  return <span className="badge proposal" title={`Demande de « ${p.unite} », envoyée par ${p.par} le ${fmtDate(p.le.slice(0, 10))}`}>📨 {p.unite}</span>;
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
