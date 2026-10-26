import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import type { AgendaClubEvent, ClubEvent, Meeting, OrgUnit, PvArchive, Task } from '../data/types';
import { daysUntil, diffDays, endOf, fmtDateTime, fmtRange, fullName, isDone, today, uid } from '../data/utils';
import { aLaDate, derniereOccurrence, horaire, libelleRepetition, occurrenceDu } from '../data/repetition';
import { EventModal, newEvent } from '../components/EventModal';
import { EditionCard } from '../components/Edition';
import { Empty, Modal } from '../components/ui';
import { Icone } from '../components/icones';
import { IconeEntite } from '../components/IconesEntite';
import { Progress } from './Dashboard';
import { hydrateArchive } from '../data/entete';
import { cleanHtml } from '../data/sanitize';
import { useUnitLogo } from '../components/Entete';
import { hasPermission, userRoles } from '../data/permissions';
import { PageIntro } from '../components/Nav';
import { useClubOptional } from '../data/club';
import { aPlanifier, aRenommer, annuelle, duMois, finDeSerie, motSeance, nomSeance, serieDuMois, seuleDuMois, titreSelonDate } from '../data/seances';
import { UNIT_TYPES } from '../data/units';
import { evenementsDependants, tacheDeLEvenement } from '../data/externes';
import { useAnnexesArchive, useOuvrirDocs } from '../components/Annexes';
import { margesArchive, policeArchive } from '../data/styleDocs';
import { BoutonPdf, usePiedImprime } from '../components/BoutonPdf';
import { LieuSeance, Lien } from '../components/Liens';
import { dernierPoint, lienCarte, lieuxConnus } from '../data/lieux';

// Carte (Leaflet) chargée seulement quand on place un lieu.
const CarteLieu = lazy(() => import('../components/CarteLieu'));

// Onglets « Comité » (séances) et « Événements » : même principe, champs différents (fiche d'un événement : EventModal).

/** Enregistrement / suppression des séances (onglets Comité et Agenda). */
export function useAgendaActions() {
  const { data, update } = useStore();
  return {
    saveMeeting: (m: Meeting) => {
      const isNew = !data.meetings.some((x) => x.id === m.id);
      update((d) => { d.meetings = isNew ? [...d.meetings, m] : d.meetings.map((x) => (x.id === m.id ? m : x)); }, `${isNew ? 'Ajout' : 'Modification'} de la séance « ${m.titre} »`);
    },
    removeMeeting: (m: Meeting) => update((d) => {
      // Seule séance annuelle de son mois : ce mois ne sera plus proposé l'année suivante.
      const fin = finDeSerie(d.meetings, m);
      d.meetings = d.meetings.filter((x) => x.id !== m.id).map((x) => (fin.includes(x.id) ? { ...x, unique: true } : x));
      d.tasks.forEach((t) => { if (t.meetingId === m.id) t.meetingId = undefined; });
    }, `Suppression de la séance « ${m.titre} »`),
  };
}

/** Mot des séances de l'entité ouverte : « Comité », « Séance », « Réunion ». */
export const useMotSeance = () => motSeance(useClubOptional()?.current.type);

/**
 * Arrivée depuis la recherche (« ?seance=… », « ?id=… ») : la carte visée, mise en évidence et amenée à l'écran.
 * `archive` : PV ou ordre du jour archivé à ouvrir directement (séances).
 */
function useCible(param: string) {
  const [params, setParams] = useSearchParams();
  const [cible, setCible] = useState<{ id: string; archive?: boolean } | null>(null);
  useEffect(() => {
    const id = params.get(param) ?? params.get('archive');
    if (!id) return;
    setCible({ id, archive: !params.get(param) });
    setParams({}, { replace: true });
  }, [params, param, setParams]);
  useEffect(() => {
    if (cible && !cible.archive) document.getElementById(`cible-${cible.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [cible]);
  return cible;
}

/**
 * Nouvelle séance, nommée d'après son mois (« Comité de mars 2027 ») et qui revient chaque année.
 * Ce mois a déjà sa séance : « Séance extraordinaire de mars 2027 », sans retour l'année suivante.
 */
export function newMeeting(meetings: Meeting[], date = today(), mot = 'Comité'): Meeting {
  const extra = meetings.some((m) => annuelle(m) && m.date.slice(0, 7) === date.slice(0, 7));
  return {
    id: uid('m'), titre: nomSeance(date, extra ? 'Séance extraordinaire' : mot), date, heure: '19:30', lieu: 'À définir',
    ...(extra ? { unique: true } : {}),
  };
}

/** Avertissement : tâches dont le délai suit la date de la séance / de l'événement. */
export const linkedTasksNote = (tasks: Task[], id: string, type: 'meeting' | 'event') =>
  linkedNote(tasks.filter((t) => (type === 'meeting' ? t.meetingId : t.eventId) === id && t.delaiRef?.type === type).length);

/** Excusés d'une séance, et « Je serai absent(e) » pour les membres convoqués. */
function Excuses({ m, past }: { m: Meeting; past: boolean }) {
  const { data, user, update } = useStore();
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState('');
  const list = m.excuses ?? [];
  const mine = user ? list.find((e) => e.personId === user.id) : undefined;
  const convoque = !!user && user.actif && hasPermission(userRoles(data.roles, user), 'tab.meetings') && data.people.some((p) => p.id === user.id);
  const set = (excuse: boolean) => {
    if (!user) return;
    update((d) => {
      const x = d.meetings.find((y) => y.id === m.id)!;
      const others = (x.excuses ?? []).filter((e) => e.personId !== user.id);
      x.excuses = excuse ? [...others, { personId: user.id, le: today(), ...(motif.trim() ? { motif: motif.trim() } : {}) }] : others;
    }, excuse ? `${fullName(user)} s’excuse pour ${m.titre}` : `${fullName(user)} sera finalement présent(e) à ${m.titre}`);
    setOpen(false);
    setMotif('');
  };
  const names = list.map((e) => {
    const p = data.people.find((x) => x.id === e.personId);
    return p ? `${fullName(p)}${e.motif ? ` (${e.motif})` : ''}` : '';
  }).filter(Boolean);
  if (!names.length && (past || !convoque)) return null;
  return (
    <div className="excuses">
      {names.length > 0 && <p className="muted"><Icone n="absent" /> Excusé{names.length > 1 ? 's' : ''} : {names.join(', ')}</p>}
      {!past && convoque && (
        mine ? (
          <p><span className="chip on"><Icone n="ok" /> Tu es excusé(e)</span> <button className="btn small link" onClick={() => set(false)}>Je serai finalement présent(e)</button></p>
        ) : open ? (
          <div className="row wrap">
            <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (facultatif)" aria-label="Motif" maxLength={120} />
            <button className="btn small primary" onClick={() => set(true)}>Confirmer mon absence</button>
            <button className="btn small" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        ) : (
          <button className="btn small" onClick={() => setOpen(true)}><Icone n="absent" /> Je serai absent(e)</button>
        )
      )}
    </div>
  );
}

export function Meetings() {
  const { data, can, update } = useStore();
  const mot = useMotSeance();
  const [edit, setEdit] = useState<Meeting | null>(null);
  const [viewPv, setViewPv] = useState<{ meeting: Meeting; pv: PvArchive; kind: 'odj' | 'pv' } | null>(null);
  const manage = can('meetings.manage');
  const sorted = [...data.meetings].sort((a, b) => a.date.localeCompare(b.date));
  // Les séances passées sont repliées en bas (archives des PV et ordres du jour), les plus récentes d'abord.
  const jour = today();
  const aVenir = sorted.filter((m) => m.date >= jour);
  const passees = sorted.filter((m) => m.date < jour).reverse();
  const cible = useCible('seance');
  useEffect(() => {
    if (!cible?.archive) return;
    for (const m of data.meetings) {
      const pv = m.minutesArchives?.find((x) => x.id === cible.id);
      const odj = m.pvArchives?.find((x) => x.id === cible.id);
      if (pv || odj) return setViewPv({ meeting: m, pv: (pv ?? odj)!, kind: pv ? 'pv' : 'odj' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible]);

  const carte = (m: Meeting) => {
    const tasks = data.tasks.filter((t) => t.meetingId === m.id);
    const past = m.date < jour;
    return (
      <article key={m.id} id={`cible-${m.id}`} className={`panel agenda-item ${past ? 'past' : ''} ${cible?.id === m.id ? 'cible' : ''}`}>
        <DateBlock date={m.date} />
        <div className="grow">
          <strong>{m.titre}</strong>
          <div className="muted">
            {m.heure && `${m.heure.replace(':', 'h')} · `}<LieuSeance m={m} vide="" />{!past && ` · dans ${daysUntil(m.date)} j`}
            {annuelle(m) ? <> · <Icone n="repetition" /> chaque année</> : ' · une seule fois'}
          </div>
          <Excuses m={m} past={past} />
          <Link to={`/taches?meeting=${m.id}`}>{tasks.length} tâche(s) rattachée(s) à la séance →</Link>
          {((m.pvArchives?.length ?? 0) > 0 || (m.minutesArchives?.length ?? 0) > 0 || can('tab.minutes')) && (
            <div className="pv-archives">
              {(m.minutesArchives ?? []).map((pv, i) => (
                <button key={pv.id} className="chip on" onClick={() => setViewPv({ meeting: m, pv, kind: 'pv' })} title={`Validé le ${fmtDateTime(pv.at)}`}>
                  <Icone n="pv" /> {pv.titre}{i > 0 ? ` (version du ${fmtDateTime(pv.at)})` : ''}
                </button>
              ))}
              {(m.pvArchives ?? []).map((pv) => (
                <button key={pv.id} className="chip" onClick={() => setViewPv({ meeting: m, pv, kind: 'odj' })} title={`Archivé le ${fmtDateTime(pv.at)}`}>
                  <Icone n="odj" /> Ordre du jour · {fmtDateTime(pv.at)}
                </button>
              ))}
              {can('tab.minutes') && <Link className="chip" to={`/pv?seance=${m.id}`}><Icone n="notes" /> {m.minutes ? 'Reprendre le PV' : 'Prendre les notes du PV'}</Link>}
            </div>
          )}
        </div>
        {manage && <button className="btn small" onClick={() => setEdit(m)}>Modifier</button>}
      </article>
    );
  };

  return (
    <div>
      <div className="page-head">
        <h1>Séances du comité</h1>
        {manage && <button className="btn primary" onClick={() => setEdit(newMeeting(data.meetings, today(), mot))}>+ Nouvelle séance</button>}
      </div>
      <PageIntro />
      {manage && <Renommer />}
      {manage && <AnneeProchaine />}
      <div className="agenda">
        {aVenir.map(carte)}
        {!aVenir.length && <Empty>{passees.length ? 'Aucune séance à venir.' : 'Aucune séance.'}</Empty>}
      </div>
      {passees.length > 0 && (
        <details className="seances-passees" open={passees.some((m) => m.id === cible?.id) || undefined}>
          <summary><Icone n="archives" /> Séances passées ({passees.length})</summary>
          <div className="agenda">{passees.map(carte)}</div>
        </details>
      )}
      {viewPv && (
        <PvViewer
          pv={viewPv.pv}
          kind={viewPv.kind}
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
      {edit && <MeetingModal meeting={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** « jeudi 8 avril 2027 » (sans la virgule que certains navigateurs ajoutent après le jour). */
const jourLong = (date: string) => {
  const d = new Date(date + 'T12:00:00');
  return `${d.toLocaleDateString('fr-CH', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('fr-CH', { month: 'long' })} ${d.getFullYear()}`;
};

/** Séances de l'année prochaine : chaque séance revient le même mois ; on coche celles à ajouter. */
function AnneeProchaine() {
  const { data, update } = useStore();
  const [sauf, setSauf] = useState<string[]>([]);
  const liste = aPlanifier(data.meetings);
  if (!liste.length) return null;
  const choisies = liste.filter((x) => !sauf.includes(x.source.id));
  const ajouter = () =>
    update((d) => { d.meetings = [...d.meetings, ...choisies.map((x) => x.meeting)]; }, `Ajout des séances de l’année prochaine : ${choisies.map((x) => x.meeting.titre).join(', ')}`);
  const plusJamais = (m: Meeting) => {
    const ids = serieDuMois(data.meetings, m);
    update((d) => { d.meetings.forEach((x) => { if (ids.includes(x.id)) x.unique = true; }); }, `La séance ${duMois(m.date)} ne revient plus chaque année`);
  };
  return (
    <section className="panel seances-suivantes">
      <h2><Icone n="repetition" /> Séances de l’année prochaine</h2>
      <p className="muted">Chaque séance revient l’année suivante, le même mois et le même jour de la semaine. Coche celles à ajouter :</p>
      <ul>
        {liste.map(({ source, meeting }) => (
          <li key={source.id}>
            <label>
              <input type="checkbox" checked={!sauf.includes(source.id)} onChange={() => setSauf(sauf.includes(source.id) ? sauf.filter((x) => x !== source.id) : [...sauf, source.id])} />
              <span><strong>{meeting.titre}</strong> <span className="muted">· {jourLong(meeting.date)}{meeting.heure && `, ${meeting.heure.replace(':', 'h')}`}</span></span>
            </label>
            <button className="btn small link" onClick={() => plusJamais(source)} title={`Le mois de « ${source.titre} » ne sera plus proposé`}>Ne revient plus</button>
          </li>
        ))}
      </ul>
      <button className="btn primary" disabled={!choisies.length} onClick={ajouter}>
        <Icone n="ajouterSeance" /> Ajouter {choisies.length > 1 ? `les ${choisies.length} séances` : 'la séance'}
      </button>
    </section>
  );
}

const GARDER_NOMS = 'gsa-seances-noms-gardes';

/** Anciens noms numérotés (« Comité 4 ») : les remplacer par le mois (« Comité de septembre 2026 »). */
function Renommer() {
  const { data, update } = useStore();
  const [garde, setGarde] = useState(() => {
    try { return localStorage.getItem(GARDER_NOMS) === '1'; } catch { return false; }
  });
  const liste = aRenommer(data.meetings);
  if (!liste.length || garde) return null;
  const renommer = () =>
    update((d) => {
      d.meetings.forEach((m) => { const x = liste.find((y) => y.meeting.id === m.id); if (x) m.titre = x.titre; });
    }, `Séances nommées d’après leur mois (${liste.length})`);
  const garder = () => {
    try { localStorage.setItem(GARDER_NOMS, '1'); } catch { /* rien */ }
    setGarde(true);
  };
  return (
    <section className="panel seances-noms">
      <h2><Icone n="modifier" /> Nommer les séances d’après leur mois</h2>
      <p className="muted">
        « {liste[0].meeting.titre} » deviendrait « {liste[0].titre} ». Le nom suit ensuite la date : une séance déplacée en avril s’appelle « … d’avril ».
      </p>
      {liste.length > 1 && (
        <details>
          <summary>Voir les {liste.length} séances</summary>
          <ul>{liste.map((x) => <li key={x.meeting.id}>{x.meeting.titre} → <strong>{x.titre}</strong></li>)}</ul>
        </details>
      )}
      <p className="row wrap">
        <button className="btn primary" onClick={renommer}><Icone n="modifier" /> Renommer {liste.length > 1 ? `les ${liste.length} séances` : 'la séance'}</button>
        <button className="btn" onClick={garder}>Garder les noms actuels</button>
      </p>
    </section>
  );
}

/** Fiche d'une séance : son nom suit le mois de la date ; elle revient chaque année, sauf si on décoche. */
export function MeetingModal({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const { data } = useStore();
  const { saveMeeting, removeMeeting } = useAgendaActions();
  const mot = useMotSeance();
  const isNew = !data.meetings.some((x) => x.id === meeting.id);
  const [v, setV] = useState<Meeting>(meeting);
  const [choixFait, setChoixFait] = useState(false);
  const [err, setErr] = useState('');
  const [carte, setCarte] = useState(false);
  const set = (p: Partial<Meeting>) => setV((x) => ({ ...x, ...p }));
  // Lieux des autres séances : proposés à la saisie ; un lieu déjà placé sur la carte reprend son épingle.
  const connus = useMemo(() => lieuxConnus(data.meetings.filter((x) => x.id !== meeting.id)), [data.meetings, meeting.id]);
  const setLieu = (lieu: string) => {
    const k = connus.find((x) => x.nom.toLocaleLowerCase('fr') === lieu.trim().toLocaleLowerCase('fr'));
    set({ lieu, ...(k?.geo ? { lieuGeo: k.geo } : {}) });
  };
  const proposition = (date: string) => {
    const n = newMeeting(data.meetings, date, mot);
    return { titre: n.titre, unique: n.unique };
  };
  const setDate = (date: string) =>
    setV((x) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ...x, date };
      // Nouvelle séance pas encore retouchée : nom et retour annuel selon le mois choisi.
      if (isNew && !choixFait && x.titre === proposition(x.date).titre) return { ...x, date, ...proposition(date) };
      return { ...x, date, titre: titreSelonDate(x.titre, date, true) ?? x.titre };
    });
  const autre = !v.unique && /^\d{4}-\d{2}/.test(v.date)
    ? data.meetings.find((x) => x.id !== v.id && annuelle(x) && x.date.slice(0, 7) === v.date.slice(0, 7))
    : undefined;
  const submit = () => {
    if (!v.titre.trim()) return setErr('« Titre » est obligatoire.');
    if (!v.date) return setErr('« Date » est obligatoire.');
    saveMeeting({ ...v, titre: v.titre.trim() });
    onClose();
  };
  const supprimer = () => {
    const fin = seuleDuMois(data.meetings, meeting);
    const msg = fin
      ? `Supprimer « ${meeting.titre} » ?\n\nLa séance ${duMois(meeting.date)} ne sera plus proposée les années suivantes. (Pour la déplacer, change plutôt sa date.)`
      : 'Supprimer définitivement ?';
    if (!confirm(msg)) return;
    removeMeeting(meeting);
    onClose();
  };
  const note = linkedTasksNote(data.tasks, v.id, 'meeting');
  const field = (k: 'heure', label: string, type: string) => (
    <label>
      {label}
      <input type={type} value={v[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} />
    </label>
  );
  return (
    <Modal title={isNew ? 'Nouvelle séance' : 'Séance'} onClose={onClose}>
      <div className="form">
        <label>
          Titre
          <input value={v.titre} onChange={(e) => set({ titre: e.target.value })} />
        </label>
        <label>
          Date
          <input type="date" value={v.date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {field('heure', 'Heure', 'time')}
        <label>
          Lieu
          <input value={v.lieu ?? ''} onChange={(e) => setLieu(e.target.value)} list="lieux-seances" />
          <datalist id="lieux-seances">
            {connus.map((k) => <option key={k.nom} value={k.nom}>{k.geo ? 'placé sur la carte' : ''}</option>)}
          </datalist>
        </label>
        <div className="full lieu-carte">
          {v.lieuGeo ? (
            <p className="row wrap">
              <span><Icone n="lieu" /> Placé sur la carte</span>
              <Lien href={lienCarte(v.lieuGeo)}>Voir</Lien>
              {!carte && <button type="button" className="btn small" onClick={() => setCarte(true)}>Déplacer l’épingle</button>}
              <button type="button" className="btn small" onClick={() => set({ lieuGeo: undefined })}>Retirer de la carte</button>
            </p>
          ) : (
            !carte && <button type="button" className="btn small" onClick={() => setCarte(true)}><Icone n="lieu" /> Placer sur la carte</button>
          )}
          {carte && (
            <Suspense fallback={<p className="muted small">Chargement de la carte…</p>}>
              <CarteLieu point={v.lieuGeo} centre={dernierPoint(data.meetings)} recherche={v.lieu} onChange={(p) => set({ lieuGeo: p })} />
            </Suspense>
          )}
        </div>
        <label className="inline full">
          <input type="checkbox" checked={!v.unique} onChange={(e) => { setChoixFait(true); set({ unique: e.target.checked ? undefined : true }); }} />
          <Icone n="repetition" /> Revient chaque année {/^\d{4}-\d{2}/.test(v.date) && `(séance ${duMois(v.date)})`}
        </label>
        <p className="muted full serie-note">
          {v.unique
            ? 'Séance unique : elle ne sera pas proposée l’année prochaine.'
            : 'Proposée de nouveau l’année prochaine, le même mois. Les tâches annuelles rattachées à cette séance passeront à celle de l’année suivante.'}
          {autre && <> <Icone n="alerte" /> « {autre.titre} » revient déjà ce mois-là : décoche si celle-ci est exceptionnelle.</>}
        </p>
      </div>
      {note && <p className="muted">{note}</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && <button className="btn danger" onClick={supprimer} title="Supprimer la séance" aria-label="Supprimer la séance"><Icone n="supprimer" /></button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>Enregistrer</button>
      </div>
    </Modal>
  );
}

export function Events() {
  const { data, can } = useStore();
  const [edit, setEdit] = useState<{ e: ClubEvent; jour?: string } | null>(null);
  const manage = can('events.manage');
  const cible = useCible('id');
  // Événement qui se répète : une seule fois, à sa prochaine occurrence (série terminée : la dernière).
  const jour = today();
  const affiche = (e: ClubEvent) => (e.repetition ? (occurrenceDu(e, jour) ?? derniereOccurrence(e) ?? e.date) : e.date);
  // Avec les événements du club qui dépendent de ce comité, à leur date (sans date : à la fin).
  const club = useClubOptional();
  const dependants = club ? evenementsDependants(club.units, club.current) : [];
  const liste = [
    ...data.events.map((e) => ({ date: affiche(e), e, u: undefined })),
    ...dependants.map((u) => ({ date: u.date || '9999', e: undefined, u })),
  ].sort((a, b) => a.date.localeCompare(b.date) || Number(!!a.u) - Number(!!b.u) || (a.e?.heure ?? '').localeCompare(b.e?.heure ?? ''));

  return (
    <div>
      <div className="page-head">
        <h1>Événements</h1>
        {manage && <button className="btn primary" onClick={() => setEdit({ e: newEvent() })}>+ Nouvel événement</button>}
      </div>
      <PageIntro />
      <EditionCard />
      <div className="agenda">
        {liste.map(({ e: serie, u, date }) => {
          if (u) return <EvenementDependant key={u.id} u={u} />;
          if (!serie) return null;
          const e = aLaDate(serie, date);
          const tasks = data.tasks.filter((t) => t.eventId === e.id);
          const fin = endOf(e);
          const past = fin < jour;
          const jours = diffDays(e.date, fin) + 1;
          const quand = past ? '' : e.date <= jour ? 'en cours' : `dans ${daysUntil(e.date)} j`;
          return (
            <article key={e.id} id={`cible-${serie.id}`} className={`panel agenda-item ${past ? 'past' : ''} ${cible?.id === serie.id ? 'cible' : ''}`}>
              <DateBlock date={e.date} fin={e.dateFin} />
              <div className="grow">
                <strong>{e.nom}</strong>
                <div className="muted">{[horaire(e), e.lieu, jours > 1 && `${jours} jours`, quand].filter(Boolean).join(' · ')}</div>
                {e.repetition && <div className="muted"><Icone n="repetition" /> {libelleRepetition(serie)}</div>}
                <p>{e.description}</p>
                <Progress done={tasks.filter((t) => isDone(data, t)).length} total={tasks.length} />
                <Link to={`/taches?event=${e.id}`}>Voir les tâches →</Link>
              </div>
              {manage && <button className="btn small" onClick={() => setEdit({ e: serie, jour: serie.repetition ? date : undefined })}>Modifier</button>}
            </article>
          );
        })}
        {!liste.length && <Empty>Aucun événement.</Empty>}
      </div>
      {edit && <EventModal event={edit.e} jour={edit.jour} onClose={() => setEdit(null)} />}
    </div>
  );
}

/**
 * Événement du club qui dépend du comité ouvert : sa prochaine édition, sa description, ses propres événements à venir
 * et l'avancement des tâches qui le concernent ici (partagées par lui, ou du comité liées à lui ou partagées avec lui).
 * Il s'ouvre d'ici pour qui en fait partie.
 */
function EvenementDependant({ u }: { u: OrgUnit }) {
  const { data, externes } = useStore();
  const agenda = externes.agenda ?? [];
  const club = useClubOptional();
  if (!club) return null;
  const jour = today();
  const fin = u.date ? endOf({ date: u.date, dateFin: u.dateFin }) : '';
  const past = !!fin && fin < jour;
  const jours = u.date ? diffDays(u.date, fin) + 1 : 0;
  const quand = !u.date ? 'date de la prochaine édition à fixer' : past ? '' : u.date <= jour ? 'en cours' : `dans ${daysUntil(u.date)} j`;
  // Ses événements à venir (qui se répète : sa prochaine occurrence), hors celui de l'édition.
  const siens = agenda
    .filter((e) => e.uniteId === u.id)
    .map((e) => (e.repetition ? (occurrenceDu(e, jour) ? aLaDate(e, occurrenceDu(e, jour)!) : undefined) : e))
    .filter((e): e is AgendaClubEvent => !!e && endOf(e) >= jour && !(e.date === u.date && (e.dateFin ?? '') === (u.dateFin ?? '')))
    .sort((a, b) => a.date.localeCompare(b.date));
  const taches = data.tasks.filter((t) => tacheDeLEvenement(t, u.id));
  const membre = club.mine.some((x) => x.id === u.id);
  return (
    <article className={`panel agenda-item dependant ${past ? 'past' : ''}`} style={{ '--c': u.couleur } as React.CSSProperties}>
      {u.date ? <DateBlock date={u.date} fin={u.dateFin} /> : <div className="dateblock vide" title="Date à fixer"><b>?</b><span>date</span></div>}
      <div className="grow">
        <strong><IconeEntite u={u} /> {u.nom}</strong> <span className="chip dependant-tag" title={`« Dépend de » : ${club.current.nom}`}>dépend de ce comité</span>
        <div className="muted">{[UNIT_TYPES[u.type].label, jours > 1 && `${jours} jours`, quand].filter(Boolean).join(' · ')}</div>
        {u.description && <p>{u.description}</p>}
        {siens.length > 0 && (
          <ul className="dependant-events">
            {siens.map((e) => (
              <li key={e.id}>
                <Icone n="evenements" /> {e.nom} · {[fmtRange(e.date, e.dateFin), horaire(e), e.lieu].filter(Boolean).join(' · ')}
                {e.repetition && <> · <Icone n="repetition" /> {libelleRepetition(e)}</>}
              </li>
            ))}
          </ul>
        )}
        {taches.length > 0 && <Progress done={taches.filter((t) => isDone(data, t)).length} total={taches.length} />}
        <Link to={`/taches?event=${encodeURIComponent(`u:${u.id}`)}`}>Voir les tâches →</Link>
        {!taches.length && <small className="muted"> Aucune pour l’instant : range une tâche sous « Événements » › « {u.nom} », ou rattache-la à lui (« <Icone n="rattacher" /> Rattacher à… » ou « Pour quand ? ») ; ou il partage les siennes.</small>}
      </div>
      {membre && <button className="btn small" onClick={() => club.switchUnit(u.id, '#/evenements')} title={`Ouvrir « ${u.nom} »`}>Ouvrir</button>}
    </article>
  );
}

/** Consultation d'un ordre du jour archivé (copie figée), imprimable tel quel. */
function PvViewer({ pv, kind, canDelete, onDelete, onClose }: { pv: PvArchive; kind: 'pv' | 'odj'; canDelete: boolean; onDelete: () => void; onClose: () => void }) {
  const { data } = useStore();
  const logo = useUnitLogo();
  // PV avec fichiers joints en annexe : photos et pages de PDF relues (non copiées dans l'archive).
  const doc = useRef<HTMLDivElement>(null);
  const html = cleanHtml(hydrateArchive(pv.html, data, logo));
  useAnnexesArchive(doc, html);
  useOuvrirDocs();
  usePiedImprime(doc);
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
      <style>{`@page { size: A4 ${pv.orientation === 'paysage' ? 'landscape' : 'portrait'}; margin: ${margesArchive(pv.html)}mm; }`}</style>
      <div className="pv-overlay-bar no-print">
        <strong><Icone n="pdf" /> {pv.titre}</strong>
        <small>archivé le {fmtDateTime(pv.at)} par {fullName(data.people.find((p) => p.id === pv.by))}</small>
        <span className="grow" />
        <BoutonPdf className="btn primary" feuille={doc} titre={kind === 'odj' ? `Ordre du jour ${pv.titre}` : pv.titre} paysage={pv.orientation === 'paysage'} margesMm={margesArchive(pv.html)} police={policeArchive(pv.html)} />
        <button className="btn" onClick={() => window.print()}><Icone n="imprimer" /> Imprimer</button>
        {canDelete && <button className="btn danger" onClick={() => confirm(kind === 'pv' ? 'Supprimer ce PV archivé ?' : 'Supprimer cet ordre du jour archivé ?') && onDelete()}>Supprimer</button>}
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
      {/* Contenu généré par l'application elle-même (textes déjà échappés à la création) ; images de l'en-tête remises (data URL contrôlées). */}
      <div ref={doc} className="pv-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>,
    document.body,
  );
}

const linkedNote = (n: number) =>
  n ? <><Icone n="epingle" /> {n} tâche(s) ont un délai calé sur cette date : si tu la changes, leurs délais suivront automatiquement.</> : undefined;

function DateBlock({ date, fin }: { date: string; fin?: string }) {
  const d = new Date(date + 'T12:00:00');
  // Sur plusieurs jours : « 27–28 févr. », « 30 juin–2 juil. ».
  const f = fin && fin > date ? new Date(fin + 'T12:00:00') : null;
  const mois = (x: Date) => x.toLocaleDateString('fr-CH', { month: 'short' });
  return (
    <div className={`dateblock ${f ? 'multi' : ''}`}>
      <b>{d.getDate()}{f && `–${f.getDate()}`}</b>
      <span>{f && mois(f) !== mois(d) ? `${mois(d)}–${mois(f)}` : mois(d)}</span>
      <small>{f && f.getFullYear() !== d.getFullYear() ? `${d.getFullYear()}–${String(f.getFullYear()).slice(2)}` : d.getFullYear()}</small>
    </div>
  );
}
