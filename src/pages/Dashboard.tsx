import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, Etiquette, ScheduledEmail, Task } from '../data/types';
import { daysUntil, derniereSeancePassee, endOf, estArchivee, fmtDate, fmtRange, isDone, isLate, today } from '../data/utils';
import { aLaDate, horaire, occurrenceDu } from '../data/repetition';
import { TaskCard } from './Tasks';
import { TaskModal } from '../components/FicheTache';
import { Empty } from '../components/ui';
import { attendDesVus, bilanVu, cleVu, pourMoi, vuAvantModif } from '../data/pourInfo';
import { useSuiviPourInfo } from '../data/suiviPourInfo';
import { aPrendrePourMoi } from '../data/aPrendre';
import { echeance, isOpen } from '../data/polls';
import { dueAt, emailState, fillTemplate, whenLabel } from '../data/emails';
import { EmailSend } from '../components/EmailsField';
import { AccueilModal, JOURS_A_FAIRE, joursAFaire, useAccueil } from '../components/Accueil';
import { finAnticipee } from '../data/seances';
import { Icone } from '../components/icones';
import { LieuSeance } from '../components/Liens';

export function Dashboard() {
  const { data, user, saveTask, prefs, setPrefs, can, canSeeTask, setToast, vuPourInfo } = useStore();
  const [edit, setEdit] = useState<Task | null>(null);
  const [send, setSend] = useState<{ task: Task; email: ScheduledEmail } | null>(null);
  const [reglage, setReglage] = useState(false);
  // Blocs et compteurs que la personne a choisi de voir sur cet appareil, dans son ordre (« Personnaliser »).
  const { appareil, blocs, compteurs } = useAccueil();
  // Mes tâches « Pour info » (auteur ou responsable), en cours : qui doit encore les voir (052 : personnes avec un compte).
  const miennesInfo = data.tasks.filter((t) => !!user && t.pourInfo && !t.paiement && !isDone(data, t) && (t.createdBy === user.id || t.responsables.includes(user.id)));
  const suivi = useSuiviPourInfo(miennesInfo);
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
  // Prochaine séance.
  const prochaines = [...data.meetings].filter((m) => m.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 1);
  // Prochains événements : ceux de l'agenda (droit « Événements ») et les étiquettes « événement » datées (toutes avec ce
  // droit, sinon celles dont je suis membre) ; un événement de l'agenda et une étiquette du même jour, de même nom (ou
  // contenu dans l'autre), ne comptent qu'une fois.
  const jour = today();
  const simple = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const memeNom = (a: string, b: string) => { const [x, y] = [simple(a), simple(b)]; return !!x && !!y && (x.includes(y) || y.includes(x)); };
  const voitEvenements = can('tab.events');
  // Événement qui se répète : sa prochaine occurrence.
  const evs = (voitEvenements ? data.events : [])
    .map((e) => (e.repetition ? (occurrenceDu(e, jour) ? aLaDate(e, occurrenceDu(e, jour)!) : undefined) : e))
    .filter((e): e is ClubEvent => !!e && endOf(e) >= jour);
  const ets = (data.etiquettes ?? []).filter((x) => x.type === 'evenement' && !!x.date && endOf({ date: x.date, dateFin: x.dateFin }) >= jour && (voitEvenements || x.membres?.includes(user.id)));
  const pareil = (et: Etiquette, e: ClubEvent) => et.eventId === e.id || (et.date === e.date && memeNom(et.nom, e.nom));
  const nextEvents: { date: string; e?: ClubEvent; et?: Etiquette }[] = [
    ...evs.filter((e) => !ets.some((et) => pareil(et, e))).map((e) => ({ date: e.date, e })),
    ...ets.map((et) => ({ date: et.date!, et, e: evs.find((e) => pareil(et, e)) })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const onStatus = (t: Task, s: string) => {
    const q = finAnticipee(data, t, { ...t, statusId: s });
    if (!q || confirm(q)) saveTask({ ...t, statusId: s }, false);
  };
  // Emails que j'ai programmés : à envoyer maintenant, puis les prochains.
  const myEmails = (data.emails ?? [])
    .filter((e) => e.creePar === user.id)
    .map((e) => ({ e, t: data.tasks.find((t) => t.id === e.taskId)! }))
    .filter((x) => x.t)
    .map((x) => ({ ...x, st: emailState(data, x.t, x.e), at: dueAt(x.t, x.e.quand) ?? '9999' }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const toSend = myEmails.filter((x) => x.st === 'aEnvoyer');
  const upcoming = myEmails.filter((x) => x.st === 'programme').slice(0, 3);
  const toVote = (data.polls ?? []).filter((p) => isOpen(p) && p.votants.includes(user.id) && !p.votes[user.id]);
  // Pour info : tâches où je suis mentionné, en cours. Celles marquées « ✓ Vu » n'y figurent plus (elles restent dans les
  // tâches).
  const vus = prefs.pourInfoVus ?? {};
  const infoTout = data.tasks.filter((t) => pourMoi(t, user.id) && !isDone(data, t)).sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'));
  // Modifiée depuis mon « ✓ Vu » (052) : elle revient, avec ✏️.
  const revoirIci = (t: Task) => vuAvantModif(t.pourInfoVus?.[cleVu(user.id)], t);
  const infoIci = infoTout.filter((t) => !vus[t.id] || revoirIci(t));
  const clesInfo = new Set(infoTout.map((t) => t.id));
  const masquees = infoTout.length - infoIci.length;
  const enAttente = miennesInfo.filter((t) => attendDesVus(bilanVu(t, suivi[t.id])));
  // « ✓ Vu » : la tâche quitte l'accueil, et son auteur voit que je l'ai vue (enregistré sur la tâche).
  const marquerVu = (t: Task) => {
    // On oublie les marques des tâches qui ne sont plus « pour info » (terminées, supprimées) depuis deux mois.
    const garde = Object.fromEntries(Object.entries(vus).filter(([k, d]) => clesInfo.has(k) || daysUntil(d) > -60));
    setPrefs({ pourInfoVus: { ...garde, [t.id]: today() } });
    setToast(`« ${t.titre} » ne s’affiche plus sur l’accueil (toujours dans les points) ; son auteur voit que tu l’as vu.`);
    vuPourInfo(t.id).catch((e) => setToast(`⚠️ ${e instanceof Error ? e.message : e}`));
  };
  const reafficher = () => {
    const reste = Object.fromEntries(Object.entries(vus).filter(([k]) => !clesInfo.has(k)));
    setPrefs({ pourInfoVus: Object.keys(reste).length ? reste : undefined });
  };
  // À prendre : tâches qu'on me propose, tant qu'il reste une place.
  const aPrendre = data.tasks.filter((t) => aPrendrePourMoi(t, user.id) && !isDone(data, t)).sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'));
  // Blocs vides ce jour-là : ils ne prennent pas de place.
  const vide = (id: string) => (id === 'aprendre' && !aPrendre.length) || (id === 'emails' && !toSend.length && !upcoming.length) || (id === 'sondages' && !toVote.length) || (id === 'compteurs' && !compteurs.length) || (id === 'pourinfo' && !infoIci.length && !enAttente.length);
  const ordre = blocs.filter((id) => !vide(id));

  const rendre = (id: string): ReactNode => {
    switch (id) {
      case 'compteurs':
        return (
          <div className="stats">
            {/* Chaque case ouvre la liste de mes tâches filtrée sur ce statut. */}
            {compteurs.map((c) => (
              <Link key={c.id} to={`/taches?statut=${c.id}`} className="stat" style={{ borderTopColor: c.couleur }} title={`Voir mes points ${c.id === 'retard' ? 'en retard' : `« ${c.label} »`}`}>
                <b>{c.id === 'retard' ? late.length : actives.filter((t) => t.statusId === c.id).length}</b>
                <span>{c.label}</span>
              </Link>
            ))}
          </div>
        );
      case 'retard':
        return (
          <>
            <h2><Icone n="alerte" /> Mes points en retard</h2>
            {late.length ? <div className="cards">{late.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div> : <Empty>Rien en retard, bravo !</Empty>}
          </>
        );
      case 'semaine':
        return (
          <>
            <h2>
              <Icone n="date" /> À faire dans les{' '}
              <select className="h2-select" value={jours} aria-label="Nombre de jours" title="Combien de jours à l’avance" onChange={(e) => setPrefs({ aFaireJours: Number(e.target.value) === 7 ? undefined : Number(e.target.value) })}>
                {JOURS_A_FAIRE.includes(jours) ? null : <option value={jours}>{jours}</option>}
                {JOURS_A_FAIRE.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>{' '}
              jours{toutes && <small className="muted"> · tous les points</small>}
            </h2>
            {soon.length ? <div className="cards">{soon.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div> : <Empty>{jours <= 7 ? 'Aucune échéance cette semaine.' : `Aucune échéance dans les ${jours} jours.`}</Empty>}
          </>
        );
      case 'aprendre':
        return (
          <>
            <h2><Icone n="main" /> À prendre <small className="muted">· on te les propose : l’une est pour toi ?</small></h2>
            <div className="cards">{aPrendre.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} />)}</div>
          </>
        );
      case 'pourinfo':
        return (
          <>
            <h2>
              <Icone n="voir" /> Pour info <small className="muted">· pour que tu sois au courant</small>
              {masquees > 0 && (
                <button type="button" className="link-btn h2-action" onClick={reafficher} title="Réafficher les points marqués « ✓ Vu »">
                  Réafficher ({masquees})
                </button>
              )}
            </h2>
            {enAttente.length > 0 && (
              <p className="pour-info-attente">
                <Link to="/taches?delai=pourinfo" title="Tes points « Pour info » en cours, et qui ne les a pas encore vus">
                  <Icone n="voir" />{' '}
                  {enAttente.length === 1
                    ? `Ton point « ${enAttente[0].titre} » n’est pas encore vu par tout le monde`
                    : `${enAttente.length} de tes points « Pour info » ne sont pas encore vus par tout le monde`}
                </Link>
              </p>
            )}
            <div className="cards">
              {infoIci.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} onVu={() => marquerVu(t)} />)}
            </div>
          </>
        );
      case 'emails':
        return (
          <>
            {toSend.length > 0 && (
              <>
                <h2><Icone n="email" /> Emails à envoyer</h2>
                {toSend.map(({ e, t }) => (
                  <div key={e.id} className="panel email-due">
                    <strong>{fillTemplate(data, t, e, e.objet)}</strong>
                    <span className="muted">{whenLabel(t, e.quand)}</span>
                    <button className="btn small primary" onClick={() => setSend({ task: t, email: e })}><Icone n="envoyer" /> Envoyer</button>
                  </div>
                ))}
              </>
            )}
            {upcoming.length > 0 && (
              <>
                <h2><Icone n="horloge" /> Prochains emails programmés</h2>
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
            <h2><Icone n="sondage" /> Sondages à voter</h2>
            {toVote.map((p) => (
              <Link key={p.id} to={`/sondages?id=${encodeURIComponent(p.id)}`} className="panel link-panel">
                <strong>{p.question}</strong>
                <span className="muted">{p.dateLimite ? `Réponds ${p.clotureAuto === false ? 'si possible ' : ''}avant le ${echeance(p)}` : 'En attente de ta réponse'}</span>
              </Link>
            ))}
          </>
        );
      case 'seance':
        return (
          <>
            <h2>
              <Icone n="seances" />{' '}
              Prochaine séance
            </h2>
            {prochaines.map((m) => (
              // Toute la carte mène à la séance ; le lieu placé sur la carte garde son propre lien.
              <div key={m.id} className="panel link-panel lien-etendu">
                <Link to={can('tab.meetings') ? `/comite?seance=${encodeURIComponent(m.id)}` : '/agenda'}><strong>{m.titre}</strong></Link>
                <span>
                  {fmtDate(m.date)}
                  {(m.lieu?.trim() || m.lieuGeo) && <> · <Icone n="lieu" /> <LieuSeance m={m} /></>}
                  {' '}<em className="muted">(dans {daysUntil(m.date)} j)</em>
                </span>
              </div>
            ))}
            {!prochaines.length && <Empty>Aucune séance planifiée.</Empty>}
          </>
        );
      case 'evenements':
        return (
          <>
            <h2><Icone n="evenements" /> Prochains événements</h2>
            {nextEvents.map(({ e, et }) => {
              // Les tâches de l'événement : liées à lui, ou qui portent l'étiquette.
              const tasks = data.tasks.filter((t) => (!!e && t.eventId === e.id) || (!!et && !!t.etiquettes?.includes(et.id)));
              const done = tasks.filter((t) => isDone(data, t)).length;
              const x = et ? { date: et.date!, dateFin: et.dateFin } : e!;
              const quand = x.date <= jour ? 'en cours' : `dans ${daysUntil(x.date)} j`;
              const lien = et ? `/taches?etiquette=${encodeURIComponent(et.id)}` : `/taches?event=${encodeURIComponent(e!.id)}`;
              return (
                <Link key={et ? `et:${et.id}` : e!.id} to={lien} className="panel link-panel">
                  <strong>
                    {et ? et.nom : e!.nom}
                    {et && <> <span className="badge etiquette" style={{ background: et.couleur }} title="Étiquette « événement » : ses points">🏷</span></>}
                  </strong>
                  <span>
                    {[fmtRange(x.date, x.dateFin), e && horaire(e), e?.lieu].filter(Boolean).join(' · ')}
                    {e?.repetition && <> <span title="Se répète" aria-label="se répète"><Icone n="repetition" /></span></>} <em className="muted">({quand})</em>
                  </span>
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

  // Téléphone : les blocs l'un sous l'autre, dans l'ordre. Ordinateur : les compteurs sur toute la largeur ; entre eux, les tâches à gauche et les autres blocs à droite, chacun dans l'ordre choisi.
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
        <h1>Bonjour {user.prenom}</h1>
        <button className="btn small" onClick={() => setReglage(true)} aria-label="Personnaliser l’accueil" title="Choisir ce qui s’affiche sur ton accueil, et dans quel ordre"><Icone n="reglages" /><span className="hide-mobile"> Personnaliser</span></button>
      </div>
      <Bienvenue userId={user.id} />
      {corps}
      {!blocs.length && (
        <Empty>Ton accueil est vide sur {appareil === 'telephone' ? 'ce téléphone' : 'cet ordinateur'} : « Personnaliser » pour choisir ce qui s’affiche.</Empty>
      )}
      {edit && <TaskModal task={edit} isNew={false} onClose={() => setEdit(null)} />}
      {send && <EmailSend task={send.task} email={send.email} onClose={() => setSend(null)} />}
      {reglage && <AccueilModal onClose={() => setReglage(false)} />}
    </div>
  );
}

/** Ordinateur : blocs sur toute la largeur, et blocs de tâches (colonne de gauche). */
const LARGES = ['compteurs'];
const TACHES = ['retard', 'aprendre', 'semaine', 'pourinfo'];

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <small className="muted">{done}/{total} points terminés</small>
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
      <span className="grow"><Icone n="aide" /> <b>Nouveau dans l’appli ?</b> En deux minutes : où trouver quoi, et les gestes courants.</span>
      <Link to="/aide" className="btn primary small" onClick={fermer}>Comment ça marche ?</Link>
      <button className="icon-btn" aria-label="Fermer" title="Fermer" onClick={fermer}>✕</button>
    </div>
  );
}
