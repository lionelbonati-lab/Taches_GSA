import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, OrgUnit, ScheduledEmail, TachePartagee, Task } from '../data/types';
import { daysUntil, derniereSeancePassee, endOf, estArchivee, fmtDate, fmtRange, isDone, isLate, today } from '../data/utils';
import { aLaDate, horaire, occurrenceDu } from '../data/repetition';
import { BoutonVu, TaskCard } from './Tasks';
import { TaskModal } from '../components/FicheTache';
import { Empty, usePlusieursEntites } from '../components/ui';
import { PourInfoRecues, clePourInfo, delaiRecu, useRecueDepuis } from '../components/PourInfo';
import { attendDesVus, bilanVu, clesVu, modifieeDepuisMonVu, pourMoi, termineeChezElle, vuAvantModif } from '../data/pourInfo';
import { useSuiviPourInfo } from '../data/suiviPourInfo';
import { aPrendrePourMoi } from '../data/aPrendre';
import { echeance, isOpen } from '../data/polls';
import { dueAt, emailState, fillTemplate, whenLabel } from '../data/emails';
import { EmailSend } from '../components/EmailsField';
import { useClubOptional } from '../data/club';
import { EditionCard } from '../components/Edition';
import { AccueilModal, JOURS_A_FAIRE, joursAFaire, useAccueil } from '../components/Accueil';
import { evenementsDependants, tacheDeLEvenement } from '../data/externes';
import { tacheDeMesEntites } from '../data/vueClub';
import { finAnticipee } from '../data/seances';
import { Icone } from '../components/icones';
import { IconeEntite } from '../components/IconesEntite';
import { Chez, useMesEntites, useSeancesMoi, useSondagesMoi, type EntiteMoi } from '../data/entites';
import { useComites } from '../data/comites';
import { LieuSeance } from '../components/Liens';

export function Dashboard() {
  // Vue « moi » : avec les tâches de mes autres entités.
  const { dataMoi: data, user, saveTask, prefs, setPrefs, can, canSeeTask, pourInfo, setToast, vuPourInfo } = useStore();
  const club = useClubOptional();
  const [edit, setEdit] = useState<Task | null>(null);
  const [send, setSend] = useState<{ task: Task; email: ScheduledEmail } | null>(null);
  const [reglage, setReglage] = useState(false);
  // Tâche d'une autre entité pour info, ouverte en lecture seule.
  const [recue, setRecue] = useState<string | null>(null);
  // Blocs et compteurs que la personne a choisi de voir sur cet appareil, dans son ordre (« Personnaliser »).
  const { appareil, blocs, compteurs } = useAccueil();
  // Mes tâches « Pour info » (auteur ou responsable), en cours : qui doit encore les voir (052 : personnes avec un compte).
  // Vue du club : celles de mes entités.
  const miennesInfo = data.tasks.filter((t) => !!user && t.pourInfo && !t.paiement && tacheDeMesEntites(t, club) && !isDone(data, t) && (t.createdBy === user.id || t.responsables.includes(user.id)));
  const suivi = useSuiviPourInfo(miennesInfo);
  // Vue « moi » : les séances de toutes mes entités, chacune avec la pilule de son entité (comme les tâches).
  const seances = useSeancesMoi();
  // Et leurs événements.
  const mesEntites = useMesEntites();
  // Et leurs sondages (à voter).
  const sondages = useSondagesMoi();
  const mesEvenements = mesEntites.filter((e) => e.store.can('tab.events'));
  const plusieurs = usePlusieursEntites();
  const comites = useComites();
  const depuis = useRecueDepuis();
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
  // Prochaine séance de chacune de mes entités, dans l'ordre chronologique (à date égale, celle de l'entité ouverte d'abord).
  const seancesAVenir = seances.filter((x) => x.m.date >= today()).sort((a, b) => a.m.date.localeCompare(b.m.date) || Number(b.ici) - Number(a.ici));
  const prochaines = seancesAVenir.filter((x, i) => seancesAVenir.findIndex((y) => y.u?.id === x.u?.id) === i);
  // Prochains événements de toutes mes entités : ceux de leur agenda et ceux du club qui dépendent d'elles (leur prochaine
  // édition, comme dans Agenda › Événements) ; le même dans un agenda (même date, nom pareil ou contenu dans l'autre, ex.
  // « Bruntrutaine » et « CO Bruntrutaine ») ne compte qu'une fois.
  const jour = today();
  const simple = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const memeNom = (a: string, b: string) => { const [x, y] = [simple(a), simple(b)]; return !!x && !!y && (x.includes(y) || y.includes(x)); };
  const pareil = (u: OrgUnit, e: ClubEvent) => u.date === e.date && memeNom(u.nom, e.nom);
  // Événement qui se répète : sa prochaine occurrence.
  const evs = mesEvenements.flatMap((ent) =>
    ent.store.data.events
      .map((e) => (e.repetition ? (occurrenceDu(e, jour) ? aLaDate(e, occurrenceDu(e, jour)!) : undefined) : e))
      .filter((e): e is ClubEvent => !!e && endOf(e) >= jour)
      .map((e) => ({ e, ent })),
  );
  const eds = mesEvenements
    .flatMap((ent) => (club && ent.u ? evenementsDependants(club.units, ent.u) : []).map((u) => ({ u, ent })))
    .filter((x, i, l) => x.u.date && endOf({ date: x.u.date, dateFin: x.u.dateFin }) >= jour && l.findIndex((y) => y.u.id === x.u.id) === i);
  const nextEvents: { date: string; e?: ClubEvent; u?: OrgUnit; ent: EntiteMoi; entE?: EntiteMoi }[] = [
    ...evs.filter((x) => !eds.some((y) => pareil(y.u, x.e))).map((x) => ({ date: x.e.date, e: x.e, u: undefined, ent: x.ent, entE: x.ent })),
    ...eds.map((y) => {
      const meme = evs.find((x) => pareil(y.u, x.e));
      return { date: y.u.date!, u: y.u, ent: y.ent, e: meme?.e, entE: meme?.ent };
    }),
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || Number(!!a.u) - Number(!!b.u) || Number(b.ent.ici) - Number(a.ent.ici))
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
  const toVote = sondages.filter(({ p }) => isOpen(p) && p.cleMoi && !p.votes[p.cleMoi]);
  // Pour info : tâches d'ici où je suis mentionné, et celles d'autres entités (moi ou mon entité), en cours.
  // Celles marquées « ✓ Vu » n'y figurent plus (elles restent dans Tâches › 👁 Pour info).
  const vus = prefs.pourInfoVus ?? {};
  const infoTout = data.tasks.filter((t) => pourMoi(t, user.id) && !isDone(data, t)).sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'));
  const recuesTout = pourInfo.filter((x) => !termineeChezElle(x)).sort((a, b) => (a.task.delai || '9999').localeCompare(b.task.delai || '9999'));
  // Modifiée depuis mon « ✓ Vu » (052) : elle revient, avec ✏️.
  const revoirIci = (t: Task) => vuAvantModif(t.pourInfoVus?.[`p:${user.id}`], t);
  const revoirRecue = (x: TachePartagee) => {
    const d = depuis(x);
    return !!d.fiche && modifieeDepuisMonVu(x.task, clesVu(x.task, x.uniteId, d.ici, d.fiche, d.voitTout));
  };
  const infoIci = infoTout.filter((t) => !vus[t.id] || revoirIci(t));
  const infoRecues = recuesTout.filter((x) => !vus[clePourInfo(x)] || revoirRecue(x));
  const clesInfo = new Set([...infoTout.map((t) => t.id), ...recuesTout.map(clePourInfo)]);
  const masquees = infoTout.length + recuesTout.length - infoIci.length - infoRecues.length;
  const enAttente = miennesInfo.filter((t) => attendDesVus(bilanVu(t, suivi[t.id])));
  // « ✓ Vu » : la tâche quitte l'accueil, et son auteur voit que je l'ai vue (enregistré sur la tâche). `uniteId` : tâche
  // d'une autre entité (reçue pour info, partagée).
  const marquerVu = (cle: string, titre: string, tacheId: string, uniteId?: string) => {
    // On oublie les marques des tâches qui ne sont plus « pour info » (terminées, supprimées) depuis deux mois.
    const garde = Object.fromEntries(Object.entries(vus).filter(([k, d]) => clesInfo.has(k) || daysUntil(d) > -60));
    setPrefs({ pourInfoVus: { ...garde, [cle]: today() } });
    setToast(`« ${titre} » ne s’affiche plus sur l’accueil (toujours dans Tâches › Pour info) ; son auteur voit que tu l’as vue.`);
    vuPourInfo(cle, tacheId, uniteId).catch((e) => setToast(`⚠️ ${e instanceof Error ? e.message : e}`));
  };
  const reafficher = () => {
    const reste = Object.fromEntries(Object.entries(vus).filter(([k]) => !clesInfo.has(k)));
    setPrefs({ pourInfoVus: Object.keys(reste).length ? reste : undefined });
  };
  // À prendre : tâches qu'on me propose, tant qu'il reste une place.
  const aPrendre = data.tasks.filter((t) => aPrendrePourMoi(t, user.id) && !isDone(data, t)).sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'));
  // Blocs vides ce jour-là : ils ne prennent pas de place.
  const vide = (id: string) => (id === 'aprendre' && !aPrendre.length) || (id === 'emails' && !toSend.length && !upcoming.length) || (id === 'sondages' && !toVote.length) || (id === 'compteurs' && !compteurs.length) || (id === 'pourinfo' && !infoIci.length && !infoRecues.length && !enAttente.length);
  const ordre = blocs.filter((id) => !vide(id));

  const rendre = (id: string): ReactNode => {
    switch (id) {
      case 'edition':
        // Prochaine édition de chacune de mes entités qui en a (équipe d'événement, sous-comité).
        return mesEntites.map((ent) => (
          <Chez key={ent.u?.id ?? ''} id={ent.u?.id}>
            <EditionCard pilule={plusieurs ? ent.u?.nom : undefined} />
          </Chez>
        ));
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
            <h2><Icone n="alerte" /> Mes tâches en retard</h2>
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
              jours{toutes && <small className="muted"> · toutes les tâches</small>}
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
                <button type="button" className="link-btn h2-action" onClick={reafficher} title="Réafficher les tâches marquées « ✓ Vu »">
                  Réafficher ({masquees})
                </button>
              )}
            </h2>
            {enAttente.length > 0 && (
              <p className="pour-info-attente">
                <Link to="/taches?delai=pourinfo" title="Tes tâches « Pour info » en cours, et qui ne les a pas encore vues">
                  <Icone n="voir" />{' '}
                  {enAttente.length === 1
                    ? `Ta tâche « ${enAttente[0].titre} » n’est pas encore vue par tout le monde`
                    : `${enAttente.length} de tes tâches « Pour info » ne sont pas encore vues par tout le monde`}
                </Link>
              </p>
            )}
            <div className="cards">
              {infoIci.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit(t)} onStatus={onStatus} onVu={() => marquerVu(t.id, t.titre, t.source?.id ?? t.id, t.source?.uniteId)} />)}
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
                      {revoirRecue(x) ? (
                        <span className="badge pour-info revoir" title="Elle a changé depuis ton « ✓ Vu »">✏️ À revoir</span>
                      ) : (
                        <span className="badge pour-info"><Icone n="voir" /> lecture seule</span>
                      )}
                      <span className={retard ? 'late-text' : 'muted'}>{delaiRecu(x)}</span>
                    </div>
                    <BoutonVu onVu={() => marquerVu(clePourInfo(x), t.titre, t.id, x.uniteId)} />
                  </div>
                );
              })}
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
            {toVote.map(({ p, ent }) => (
              <Link key={`${ent.u?.id ?? ''}:${p.id}`} to={`/sondages?id=${encodeURIComponent(p.id)}`} className="panel link-panel">
                <strong>{p.question}{plusieurs && <> <span className="tsource">{p.source?.unite ?? ent.u?.nom}</span></>}</strong>
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
              {prochaines.length > 1 ? 'Prochaines séances' : (prochaines[0]?.u ?? club?.current)?.type === 'equipe' ? 'Prochaine réunion' : 'Prochaine séance'}
            </h2>
            {prochaines.map(({ m, u, ici }) => (
              // Toute la carte mène à la séance (son comité choisi pour l'ordre du jour et le PV, sans changer d'entité) ; le lieu placé sur la carte garde son propre lien.
              <div key={`${u?.id ?? ''}:${m.id}`} className="panel link-panel lien-etendu">
                {ici || !u ? (
                  <Link to={`/comite?seance=${encodeURIComponent(m.id)}`} onClick={() => club && comites?.choisir(club.current.id)}><strong>{m.titre}</strong>{plusieurs && u && <> <span className="tsource">{u.nom}</span></>}</Link>
                ) : (
                  <Link to={`/comite?seance=${encodeURIComponent(m.id)}`} title={`Séance de « ${u.nom} »`} onClick={() => comites?.choisir(u.id)}>
                    <strong>{m.titre}</strong> <span className="tsource">{u.nom}</span>
                  </Link>
                )}
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
            {nextEvents.map(({ e, u, ent, entE }) => {
              // Événement qui dépend de mon comité : les tâches qui le concernent chez lui (et celles de l'événement du même
              // nom, dans son entité).
              const lui = u ? ent.store.data : undefined;
              const sien = e && entE ? entE.store.data : undefined;
              const tasks = [
                ...(lui ? lui.tasks.filter((t) => tacheDeLEvenement(t, u!.id)).map((t) => ({ t, d: lui })) : []),
                ...(sien ? sien.tasks.filter((t) => t.eventId === e!.id && !(u && tacheDeLEvenement(t, u.id) && sien === lui)).map((t) => ({ t, d: sien })) : []),
              ];
              const done = tasks.filter((x) => isDone(x.d, x.t)).length;
              const x = u ? { date: u.date!, dateFin: u.dateFin } : e!;
              const quand = x.date <= jour ? 'en cours' : `dans ${daysUntil(x.date)} j`;
              // Événement de l'agenda de l'une de mes autres entités : « x:<entité>:<id> » (filtre « Événement » des tâches).
              const lien = `/taches?event=${encodeURIComponent(u ? `u:${u.id}` : !ent.ici && ent.u ? `x:${ent.u.id}:${e!.id}` : e!.id)}`;
              return (
                <Link key={u ? `u:${u.id}` : `${ent.u?.id ?? ''}:${e!.id}`} to={lien} className="panel link-panel">
                  <strong>
                    {u ? <><IconeEntite u={u} /> {u.nom}</> : e!.nom}
                    {plusieurs && !u && ent.u && <> <span className="tsource">{ent.u.nom}</span></>}
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
      {recue && <PourInfoRecues list={pourInfo} ouverte={recue} onClose={() => setRecue(null)} />}
    </div>
  );
}

/** Ordinateur : blocs sur toute la largeur, et blocs de tâches (colonne de gauche). */
const LARGES = ['edition', 'compteurs'];
const TACHES = ['retard', 'aprendre', 'semaine', 'pourinfo'];

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
      <span className="grow"><Icone n="aide" /> <b>Nouveau dans l’appli ?</b> En deux minutes : où trouver quoi, et les gestes courants.</span>
      <Link to="/aide" className="btn primary small" onClick={fermer}>Comment ça marche ?</Link>
      <button className="icon-btn" aria-label="Fermer" title="Fermer" onClick={fermer}>✕</button>
    </div>
  );
}
