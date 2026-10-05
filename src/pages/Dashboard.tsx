import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ScheduledEmail, Task } from '../data/types';
import { daysUntil, fmtDate, isDone, isLate, today } from '../data/utils';
import { TaskCard } from './Tasks';
import { TaskModal } from '../components/TaskModal';
import { Empty } from '../components/ui';
import { isOpen } from '../data/polls';
import { dueAt, emailState, fillTemplate, whenLabel } from '../data/emails';
import { EmailSend } from '../components/EmailsField';
import { IncomingRequests, OutgoingRequests } from '../components/Requests';
import { useClubOptional } from '../data/club';

export function Dashboard() {
  const { data, user, can, saveTask, guest } = useStore();
  const club = useClubOptional();
  const [edit, setEdit] = useState<Task | null>(null);
  const [send, setSend] = useState<{ task: Task; email: ScheduledEmail } | null>(null);
  if (!user) return null;

  // Membre du comité central qui ouvre l'entité : il n'y a pas de tâches à lui, l'accueil montre celles de l'entité.
  const mine = guest ? data.tasks : data.tasks.filter((t) => t.responsables.includes(user.id));
  const my = guest ? '' : 'mes ';
  const open = mine.filter((t) => !isDone(data, t));
  const late = open.filter((t) => isLate(data, t)).sort((a, b) => a.delai.localeCompare(b.delai));
  const soon = open.filter((t) => { const n = t.delai ? daysUntil(t.delai) : -1; return n >= 0 && n <= 7; }).sort((a, b) => a.delai.localeCompare(b.delai));
  const nextMeeting = [...data.meetings].filter((m) => m.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextEvents = [...data.events].filter((e) => e.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const onStatus = (t: Task, s: string) => saveTask({ ...t, statusId: s }, false);
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
        {/* Chaque case ouvre la liste de mes tâches filtrée sur ce statut. */}
        {data.statuses.map((s) => (
          <Link key={s.id} to={`/taches?statut=${s.id}`} className="stat" style={{ borderTopColor: s.couleur }} title={`Voir ${my || 'les '}tâches « ${s.label} »`}>
            <b>{mine.filter((t) => t.statusId === s.id).length}</b>
            <span>{s.label}</span>
          </Link>
        ))}
        <Link to="/taches?statut=retard" className="stat" style={{ borderTopColor: 'var(--late)' }} title={`Voir ${my || 'les '}tâches en retard`}>
          <b>{late.length}</b>
          <span>En retard</span>
        </Link>
      </div>

      <div className="grid2">
        <section>
          <h2>⚠ {guest ? 'Tâches en retard' : 'Mes tâches en retard'}</h2>
          {late.length ? <div className="cards">{late.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div> : <Empty>Rien en retard, bravo !</Empty>}
          <h2>📅 À faire dans les 7 jours</h2>
          {soon.length ? <div className="cards">{soon.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div> : <Empty>Aucune échéance cette semaine.</Empty>}
        </section>
        <aside>
          {club && club.current.type !== 'central' && !guest && <OutgoingRequests />}
          {club?.current.type === 'central' && <IncomingRequests onOpen={setEdit} />}
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
          {can('tab.meetings') && <h2>{club?.current.type === 'equipe' ? 'Prochaine réunion' : 'Prochaine séance'}</h2>}
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
