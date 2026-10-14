import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ScheduledEmail, Task } from '../data/types';
import { daysUntil, derniereSeancePassee, endOf, estArchivee, fmtDate, fmtRange, isDone, isLate, today } from '../data/utils';
import { TaskCard } from './Tasks';
import { TaskModal } from '../components/TaskModal';
import { Empty } from '../components/ui';
import { PourInfoRecues, clePourInfo, delaiRecu } from '../components/PourInfo';
import { pourMoi, termineeChezElle } from '../data/pourInfo';
import { isOpen } from '../data/polls';
import { dueAt, emailState, fillTemplate, whenLabel } from '../data/emails';
import { EmailSend } from '../components/EmailsField';
import { IncomingRequests, OutgoingRequests } from '../components/Requests';
import { useClubOptional } from '../data/club';
import { EditionCard } from '../components/Edition';
import { AccueilModal, JOURS_A_FAIRE, joursAFaire, useAccueil } from '../components/Accueil';
import { evenementsDependants, tacheDeLEvenement } from '../data/externes';
import { UNIT_TYPES } from '../data/units';

export function Dashboard() {
  const { data, user, saveTask, prefs, setPrefs, can, canSeeTask, pourInfo } = useStore();
  const club = useClubOptional();
  const [edit, setEdit] = useState<Task | null>(null);
  const [send, setSend] = useState<{ task: Task; email: ScheduledEmail } | null>(null);
  const [reglage, setReglage] = useState(false);
  // Tâche d'une autre entité pour info, ouverte en lecture seule.
  const [recue, setRecue] = useState<string | null>(null);
  // Blocs et compteurs que la personne a choisi de voir sur cet appareil, dans son ordre (« ⚙ Personnaliser »).
  const { appareil, blocs, compteurs } = useAccueil();
  if (!user) return null;

  const mine = data.tasks.filter((t) => t.responsables.includes(user.id));
  // Compteurs : sans les tâches archivées (terminées avant le dernier comité passé), comme la liste des tâches.
  const seancePassee = derniereSeancePassee(data);
  const actives = mine.filter((t) => !estArchivee(data, t, seancePassee));
  const open = mine.filter((t) => !isDone(data, t));
  const late = open.filter((t) => isLate(data, t)).sort((a, b) => a.delai.localeCompare(b.delai));
  // Bloc « À faire » : nombre de jours et tâches (les miennes, ou toutes celles que je vois) au choix de chacun.
  const jours = joursAFaire(prefs.aFaireJours);
  const toutes = !!prefs.aFaireToutes && can('tasks.viewAll');
  const soon = (toutes ? data.tasks.filter((t) => canSeeTask(t) && !isDone(data, t)) : open)
    .filter((t) => { const n = t.delai ? daysUntil(t.delai) : -1; return n >= 0 && n <= jours; })
    .sort((a, b) => a.delai.localeCompare(b.delai));
  const nextMeeting = [...data.meetings].filter((m) => m.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  // Prochains événements : ceux de l'agenda de l'entité et ceux du club qui dépendent d'elle (leur prochaine édition,
  // comme dans Agenda › Événements) ; le même dans l'agenda (même date, nom pareil ou contenu dans l'autre, ex.
  // « Bruntrutaine » et « CO Bruntrutaine ») ne compte qu'une fois.
  const jour = today();
  const simple = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const memeNom = (a: string, b: string) => { const [x, y] = [simple(a), simple(b)]; return !!x && !!y && (x.includes(y) || y.includes(x)); };
  const editions = (club ? evenementsDependants(club.units, club.current) : []).filter((u) => u.date && endOf({ date: u.date, dateFin: u.dateFin }) >= jour);
  const aVenir = data.events.filter((e) => endOf(e) >= jour);
  const nextEvents = [
    ...aVenir.filter((e) => !editions.some((u) => u.date === e.date && memeNom(u.nom, e.nom))).map((e) => ({ date: e.date, e, u: undefined })),
    ...editions.map((u) => ({ date: u.date!, e: aVenir.find((e) => e.date === u.date && memeNom(u.nom, e.nom)), u })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || Number(!!a.u) - Number(!!b.u))
    .slice(0, 3);
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
  // Pour info : tâches d'ici où je suis mentionné, et celles d'autres entités (moi ou mon entité), en cours.
  const infoIci = data.tasks.filter((t) => pourMoi(t, user.id) && !isDone(data, t)).sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'));
  const infoRecues = pourInfo.filter((x) => !termineeChezElle(x)).sort((a, b) => (a.task.delai || '9999').localeCompare(b.task.delai || '9999'));
  // Blocs vides ce jour-là : ils ne prennent pas de place.
  const vide = (id: string) => (id === 'emails' && !toSend.length && !upcoming.length) || (id === 'sondages' && !toVote.length) || (id === 'compteurs' && !compteurs.length) || (id === 'pourinfo' && !infoIci.length && !infoRecues.length);
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
              <Link key={c.id} to={`/taches?statut=${c.id}`} className="stat" style={{ borderTopColor: c.couleur }} title={`Voir mes tâches ${c.id === 'retard' ? 'en retard' : `« ${c.label} »`}`}>
                <b>{c.id === 'retard' ? late.length : actives.filter((t) => t.statusId === c.id).length}</b>
                <span>{c.label}</span>
              </Link>
            ))}
          </div>
        );
      case 'retard':
        return (
          <>
            <h2>⚠ Mes tâches en retard</h2>
            {late.length ? <div className="cards">{late.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div> : <Empty>Rien en retard, bravo !</Empty>}
          </>
        );
      case 'semaine':
        return (
          <>
            <h2>
              📅 À faire dans les{' '}
              <select className="h2-select" value={jours} aria-label="Nombre de jours" title="Combien de jours à l’avance" onChange={(e) => setPrefs({ aFaireJours: Number(e.target.value) === 7 ? undefined : Number(e.target.value) })}>
                {JOURS_A_FAIRE.includes(jours) ? null : <option value={jours}>{jours}</option>}
                {JOURS_A_FAIRE.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>{' '}
              jours{toutes && <small className="muted"> · toutes les tâches</small>}
            </h2>
            {soon.length ? <div className="cards">{soon.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div> : <Empty>{jours <= 7 ? 'Aucune échéance cette semaine.' : `Aucune échéance dans les ${jours} jours.`}</Empty>}
          </>
        );
      case 'pourinfo':
        return (
          <>
            <h2>👁 Pour info <small className="muted">· pour que tu sois au courant</small></h2>
            <div className="cards">
              {infoIci.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}
              {infoRecues.map((x) => {
                const t = x.task;
                const retard = !!t.delai && daysUntil(t.delai) < 0;
                return (
                  <div key={clePourInfo(x)} className={`tcard ${retard ? 'late' : ''}`} role="button" tabIndex={0} onClick={() => setRecue(clePourInfo(x))} onKeyDown={(e) => e.key === 'Enter' && setRecue(clePourInfo(x))}>
                    <div className="tcard-top">
                      <small className="muted">{x.unite}</small>
                      <small className="muted">{x.statuts.find((s) => s.id === t.statusId)?.label ?? ''}</small>
                    </div>
                    <strong>{t.titre}</strong>
                    {t.remarque && <small className="muted clip">{t.remarque}</small>}
                    <div className="tcard-bottom">
                      <span className="badge pour-info">👁 lecture seule</span>
                      <span className={retard ? 'late-text' : 'muted'}>{delaiRecu(x)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      case 'demandes':
        return club?.current.type === 'central' ? <IncomingRequests onOpen={setEdit} /> : club ? <OutgoingRequests /> : null;
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
              </Link>
            ) : <Empty>Aucune séance planifiée.</Empty>}
          </>
        );
      case 'evenements':
        return (
          <>
            <h2>Prochains événements</h2>
            {nextEvents.map(({ e, u }) => {
              // Événement qui dépend de l'entité : les tâches qui le concernent ici (et celles de l'événement du même nom).
              const tasks = data.tasks.filter((t) => (u && tacheDeLEvenement(t, u.id)) || (!!e && t.eventId === e.id));
              const done = tasks.filter((t) => isDone(data, t)).length;
              const x = u ? { date: u.date!, dateFin: u.dateFin } : e!;
              const quand = x.date <= jour ? 'en cours' : `dans ${daysUntil(x.date)} j`;
              return (
                <Link key={u ? `u:${u.id}` : e!.id} to={`/taches?event=${encodeURIComponent(u ? `u:${u.id}` : e!.id)}`} className="panel link-panel">
                  <strong>{u ? `${UNIT_TYPES[u.type].icon} ${u.nom}` : e!.nom}</strong>
                  <span>{[fmtRange(x.date, x.dateFin), e?.lieu].filter(Boolean).join(' · ')} <em className="muted">({quand})</em></span>
                  <Progress done={done} total={tasks.length} />
                </Link>
              );
            })}
            {!nextEvents.length && <Empty>Aucun événement à venir.</Empty>}
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
      {recue && <PourInfoRecues list={pourInfo} ouverte={recue} onClose={() => setRecue(null)} />}
    </div>
  );
}

/** Ordinateur : blocs sur toute la largeur, et blocs de tâches (colonne de gauche). */
const LARGES = ['edition', 'compteurs'];
const TACHES = ['retard', 'semaine', 'pourinfo'];

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
