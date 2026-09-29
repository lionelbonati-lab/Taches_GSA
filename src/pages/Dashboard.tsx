import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ScheduledEmail, Task } from '../data/types';
import { daysUntil, fmtDate, isDone, isLate, isSubLate, nextDue, subDelai, today } from '../data/utils';
import { TaskCard } from './Tasks';
import { TaskModal } from '../components/TaskModal';
import { Empty } from '../components/ui';
import { isOpen } from '../data/polls';
import { dueAt, emailState, fillTemplate, whenLabel } from '../data/emails';
import { EmailSend } from '../components/EmailsField';

export function Dashboard() {
  const { data, user, can, saveTask, toggleSubtask } = useStore();
  const [edit, setEdit] = useState<Task | null>(null);
  const [send, setSend] = useState<{ task: Task; email: ScheduledEmail } | null>(null);
  if (!user) return null;

  const mine = data.tasks.filter((t) => t.responsables.includes(user.id));
  const open = mine.filter((t) => !isDone(data, t));
  // Échéances : délai de la tâche ou de sa prochaine sous-tâche ouverte.
  const byDue = (a: Task, b: Task) => nextDue(a).localeCompare(nextDue(b));
  const late = open.filter((t) => isLate(data, t)).sort(byDue);
  const soon = open.filter((t) => { const n = nextDue(t) ? daysUntil(nextDue(t)) : -1; return n >= 0 && n <= 7; }).sort(byDue);
  const nextMeeting = [...data.meetings].filter((m) => m.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextEvents = [...data.events].filter((e) => e.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const onStatus = (t: Task, s: string) => saveTask({ ...t, statusId: s }, false);
  // Sous-tâches ouvertes qui me sont confiées (dans des tâches pas encore terminées).
  const mySubs = data.tasks
    .filter((t) => !isDone(data, t))
    .flatMap((t) => t.checklist.filter((c) => c.assigneeId === user.id && !c.done).map((c) => ({ t, c })))
    .sort((a, b) => (subDelai(a.t, a.c) || '9999').localeCompare(subDelai(b.t, b.c) || '9999'));
  // Emails que j'ai programmés : à envoyer maintenant, puis les prochains.
  const myEmails = (data.emails ?? [])
    .filter((e) => e.creePar === user.id)
    .map((e) => ({ e, t: data.tasks.find((t) => t.id === e.taskId)! }))
    .filter((x) => x.t)
    .map((x) => ({ ...x, st: emailState(data, x.t, x.e), at: dueAt(x.t, x.e.quand) ?? '9999' }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const toSend = myEmails.filter((x) => x.st === 'aEnvoyer');
  const upcoming = myEmails.filter((x) => x.st === 'programme').slice(0, 3);

  return (
    <div>
      <h1>Bonjour {user.prenom} 👋</h1>
      <div className="stats">
        {data.statuses.map((s) => (
          <Link key={s.id} to="/taches" className="stat" style={{ borderTopColor: s.couleur }}>
            <b>{mine.filter((t) => t.statusId === s.id).length}</b>
            <span>{s.label}</span>
          </Link>
        ))}
        <div className="stat" style={{ borderTopColor: 'var(--late)' }}>
          <b>{late.length}</b>
          <span>En retard</span>
        </div>
      </div>

      <div className="grid2">
        <section>
          <h2>⚠ Mes tâches en retard</h2>
          {late.length ? <div className="cards">{late.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div> : <Empty>Rien en retard, bravo !</Empty>}
          <h2>📅 À faire dans les 7 jours</h2>
          {soon.length ? <div className="cards">{soon.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div> : <Empty>Aucune échéance cette semaine.</Empty>}
          {mySubs.length > 0 && (
            <>
              <h2>☑ Mes sous-tâches</h2>
              <div className="panel sub-list">
                {mySubs.map(({ t, c }) => (
                  <div key={c.id} className="sub-item">
                    <input type="checkbox" checked={false} onChange={() => toggleSubtask(t.id, c.id)} aria-label={`Marquer « ${c.label} » comme faite`} />
                    <button className="sub-open" onClick={() => setEdit(t)}>
                      <strong>{c.label}</strong>
                      <small className={isSubLate(t, c) ? 'late-text' : 'muted'}>dans « {t.titre} »{subDelai(t, c) ? ` · délai ${fmtDate(subDelai(t, c))}` : ''}</small>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        <aside>
          {toSend.length > 0 && (
            <>
              <h2>📧 Emails à envoyer</h2>
              {toSend.map(({ e, t }) => (
                <div key={e.id} className="panel email-due">
                  <strong>{fillTemplate(data, t, e, e.objet)}</strong>
                  <span className="muted">{whenLabel(t, e.quand)}</span>
                  <button className="btn small primary" onClick={() => setSend({ task: t, email: e })}>✉ Envoyer</button>
                </div>
              ))}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <h2>🕓 Prochains emails programmés</h2>
              {upcoming.map(({ e, t }) => (
                <button key={e.id} className="panel link-panel email-next" onClick={() => setEdit(t)}>
                  <strong>{fillTemplate(data, t, e, e.objet)}</strong>
                  <span className="muted">{whenLabel(t, e.quand)}</span>
                </button>
              ))}
            </>
          )}
          {(() => {
            const toVote = (data.polls ?? []).filter((p) => isOpen(p) && p.votants.includes(user.id) && !p.votes[user.id]);
            return toVote.length > 0 ? (
              <>
                <h2>📊 Sondages à voter</h2>
                {toVote.map((p) => (
                  <Link key={p.id} to={`/sondages?id=${p.id}`} className="panel link-panel">
                    <strong>{p.question}</strong>
                    <span className="muted">{p.dateLimite ? `Réponds avant le ${fmtDate(p.dateLimite)}` : 'En attente de ta réponse'}</span>
                  </Link>
                ))}
              </>
            ) : null;
          })()}
          {can('tab.meetings') && <h2>Prochaine séance</h2>}
          {!can('tab.meetings') ? null : nextMeeting ? (
            <Link to="/comite" className="panel link-panel">
              <strong>{nextMeeting.titre}</strong>
              <span>{fmtDate(nextMeeting.date)} · {nextMeeting.lieu} <em className="muted">(dans {daysUntil(nextMeeting.date)} j)</em></span>
              <pre className="odj">{nextMeeting.ordreDuJour}</pre>
            </Link>
          ) : <Empty>Aucune séance planifiée.</Empty>}
          {can('tab.events') && <h2>Prochains événements</h2>}
          {can('tab.events') && nextEvents.map((e) => {
            const tasks = data.tasks.filter((t) => t.eventId === e.id);
            const done = tasks.filter((t) => isDone(data, t)).length;
            return (
              <Link key={e.id} to={`/taches?event=${e.id}`} className="panel link-panel">
                <strong>{e.nom}</strong>
                <span>{fmtDate(e.date)} · {e.lieu}</span>
                <Progress done={done} total={tasks.length} />
              </Link>
            );
          })}
        </aside>
      </div>
      {edit && <TaskModal task={edit} isNew={false} onClose={() => setEdit(null)} />}
      {send && <EmailSend task={send.task} email={send.email} onClose={() => setSend(null)} />}
    </div>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <small className="muted">{done}/{total} tâches terminées</small>
    </div>
  );
}
