import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ScheduledEmail, Task } from '../data/types';
import { daysUntil, endOf, fmtDate, fmtRange, isDone, isLate, today } from '../data/utils';
import { TaskCard } from './Tasks';
import { TaskModal } from '../components/TaskModal';
import { Empty } from '../components/ui';
import { isOpen } from '../data/polls';
import { dueAt, emailState, fillTemplate, whenLabel } from '../data/emails';
import { EmailSend } from '../components/EmailsField';
import { IncomingRequests, OutgoingRequests } from '../components/Requests';
import { useClubOptional } from '../data/club';
import { EditionCard } from '../components/Edition';
import { AccueilModal, useAccueil } from '../components/Accueil';

export function Dashboard() {
  const { data, user, saveTask, guest } = useStore();
  const club = useClubOptional();
  const [edit, setEdit] = useState<Task | null>(null);
  const [send, setSend] = useState<{ task: Task; email: ScheduledEmail } | null>(null);
  const [reglage, setReglage] = useState(false);
  // Blocs et compteurs que la personne a choisi de voir sur cet appareil, dans son ordre (« ⚙ Personnaliser »).
  const { appareil, blocs, compteurs } = useAccueil();
  if (!user) return null;

  // Membre du comité central qui ouvre l'entité : il n'y a pas de tâches à lui, l'accueil montre celles de l'entité.
  const mine = guest ? data.tasks : data.tasks.filter((t) => t.responsables.includes(user.id));
  const my = guest ? '' : 'mes ';
  const open = mine.filter((t) => !isDone(data, t));
  const late = open.filter((t) => isLate(data, t)).sort((a, b) => a.delai.localeCompare(b.delai));
  const soon = open.filter((t) => { const n = t.delai ? daysUntil(t.delai) : -1; return n >= 0 && n <= 7; }).sort((a, b) => a.delai.localeCompare(b.delai));
  const nextMeeting = [...data.meetings].filter((m) => m.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextEvents = [...data.events].filter((e) => endOf(e) >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
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
  const toVote = (data.polls ?? []).filter((p) => isOpen(p) && p.cleMoi && !p.votes[p.cleMoi]);
  // Blocs vides ce jour-là : ils ne prennent pas de place.
  const vide = (id: string) => (id === 'emails' && !toSend.length && !upcoming.length) || (id === 'sondages' && !toVote.length) || (id === 'compteurs' && !compteurs.length);
  const ordre = blocs.filter((id) => !vide(id));

  const rendre = (id: string): ReactNode => {
    switch (id) {
      case 'edition':
        return <EditionCard />;
      case 'compteurs':
        return (
          <div className="stats">
            {/* Chaque case ouvre la liste de mes tâches filtrée sur ce statut. */}
            {compteurs.map((c) => (
              <Link key={c.id} to={`/taches?statut=${c.id}`} className="stat" style={{ borderTopColor: c.couleur }} title={`Voir ${my || 'les '}tâches ${c.id === 'retard' ? 'en retard' : `« ${c.label} »`}`}>
                <b>{c.id === 'retard' ? late.length : mine.filter((t) => t.statusId === c.id).length}</b>
                <span>{c.label}</span>
              </Link>
            ))}
          </div>
        );
      case 'retard':
        return (
          <>
            <h2>⚠ {guest ? 'Tâches en retard' : 'Mes tâches en retard'}</h2>
            {late.length ? <div className="cards">{late.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div> : <Empty>Rien en retard, bravo !</Empty>}
          </>
        );
      case 'semaine':
        return (
          <>
            <h2>📅 À faire dans les 7 jours</h2>
            {soon.length ? <div className="cards">{soon.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div> : <Empty>Aucune échéance cette semaine.</Empty>}
          </>
        );
      case 'demandes':
        return club?.current.type === 'central' ? <IncomingRequests onOpen={setEdit} /> : club && !guest ? <OutgoingRequests /> : null;
      case 'emails':
        return (
          <>
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
          </>
        );
      case 'sondages':
        return (
          <>
            <h2>📊 Sondages à voter</h2>
            {toVote.map((p) => (
              <Link key={p.id} to={`/sondages?id=${p.id}`} className="panel link-panel">
                <strong>{p.question}</strong>
                <span className="muted">{p.dateLimite ? `Réponds avant le ${fmtDate(p.dateLimite)}` : 'En attente de ta réponse'}</span>
              </Link>
            ))}
          </>
        );
      case 'seance':
        return (
          <>
            <h2>{club?.current.type === 'equipe' ? 'Prochaine réunion' : 'Prochaine séance'}</h2>
            {nextMeeting ? (
              <Link to="/comite" className="panel link-panel">
                <strong>{nextMeeting.titre}</strong>
                <span>{fmtDate(nextMeeting.date)} · {nextMeeting.lieu} <em className="muted">(dans {daysUntil(nextMeeting.date)} j)</em></span>
                <pre className="odj">{nextMeeting.ordreDuJour}</pre>
              </Link>
            ) : <Empty>Aucune séance planifiée.</Empty>}
          </>
        );
      case 'evenements':
        return (
          <>
            <h2>Prochains événements</h2>
            {nextEvents.map((e) => {
              const tasks = data.tasks.filter((t) => t.eventId === e.id);
              const done = tasks.filter((t) => isDone(data, t)).length;
              return (
                <Link key={e.id} to={`/taches?event=${e.id}`} className="panel link-panel">
                  <strong>{e.nom}</strong>
                  <span>{fmtRange(e.date, e.dateFin)} · {e.lieu}</span>
                  <Progress done={done} total={tasks.length} />
                </Link>
              );
            })}
          </>
        );
      default:
        return null;
    }
  };
  const bloc = (id: string) => <div key={id} className={`accueil-bloc bloc-${id}`}>{rendre(id)}</div>;

  // Téléphone : les blocs l'un sous l'autre, dans l'ordre. Ordinateur : la date de l'édition et les compteurs sur toute
  // la largeur ; entre eux, les tâches à gauche et les autres blocs à droite, chacun dans l'ordre choisi.
  const corps: ReactNode[] = [];
  if (appareil === 'telephone') corps.push(...ordre.map(bloc));
  else {
    let suite: string[] = [];
    const fin = () => {
      const gauche = suite.filter((id) => TACHES.includes(id));
      const droite = suite.filter((id) => !TACHES.includes(id));
      if (gauche.length && droite.length) corps.push(<div key={suite.join()} className="grid2"><section>{gauche.map(bloc)}</section><aside>{droite.map(bloc)}</aside></div>);
      else corps.push(...suite.map(bloc));
      suite = [];
    };
    ordre.forEach((id) => {
      if (LARGES.includes(id)) {
        fin();
        corps.push(bloc(id));
      } else suite.push(id);
    });
    fin();
  }

  return (
    <div>
      <div className="page-head">
        <h1>Bonjour {user.prenom} 👋</h1>
        <button className="btn small" onClick={() => setReglage(true)} aria-label="Personnaliser l’accueil" title="Choisir ce qui s’affiche sur ton accueil, et dans quel ordre">⚙<span className="hide-mobile"> Personnaliser</span></button>
      </div>
      <Bienvenue userId={user.id} />
      {corps}
      {!blocs.length && (
        <Empty>Ton accueil est vide sur {appareil === 'telephone' ? 'ce téléphone' : 'cet ordinateur'} : « ⚙ Personnaliser » pour choisir ce qui s’affiche.</Empty>
      )}
      {edit && <TaskModal task={edit} isNew={false} onClose={() => setEdit(null)} />}
      {send && <EmailSend task={send.task} email={send.email} onClose={() => setSend(null)} />}
      {reglage && <AccueilModal onClose={() => setReglage(false)} />}
    </div>
  );
}

/** Ordinateur : blocs sur toute la largeur, et blocs de tâches (colonne de gauche). */
const LARGES = ['edition', 'compteurs'];
const TACHES = ['retard', 'semaine'];

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <small className="muted">{done}/{total} tâches terminées</small>
    </div>
  );
}

/** Première visite : invitation à lire « Comment ça marche ? » (une fois par personne et par appareil). */
function Bienvenue({ userId }: { userId: string }) {
  const cle = `taches-gsa-bienvenue-${userId}`;
  const [vu, setVu] = useState(() => {
    try {
      return !!localStorage.getItem(cle);
    } catch {
      return true;
    }
  });
  if (vu) return null;
  const fermer = () => {
    try {
      localStorage.setItem(cle, '1');
    } catch {
      /* ignore */
    }
    setVu(true);
  };
  return (
    <div className="panel bienvenue" role="note">
      <span className="grow">👋 <b>Nouveau dans l’appli ?</b> En deux minutes : où trouver quoi, et les gestes courants.</span>
      <Link to="/aide" className="btn primary small" onClick={fermer}>Comment ça marche ?</Link>
      <button className="icon-btn" aria-label="Fermer" title="Fermer" onClick={fermer}>✕</button>
    </div>
  );
}
