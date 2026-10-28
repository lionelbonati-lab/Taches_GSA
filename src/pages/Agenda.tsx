import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import type { AgendaClubEvent, ClubEvent, Meeting, OrgUnit, PvArchive, Task } from '../data/types';
import { daysUntil, diffDays, endOf, fmtDateTime, fmtRange, fullName, isDone, today, uid } from '../data/utils';
import { aLaDate, derniereOccurrence, horaire, libelleRepetition, occurrenceDu } from '../data/repetition';
import { EventModal, newEvent } from '../components/EventModal';
import { EditionCard, hasEdition } from '../components/Edition';
import { RepriseModal } from '../components/Reprise';
import { reprenable } from '../data/reprise';
import { Empty, Modal, usePlusieursEntites } from '../components/ui';
import { Icone } from '../components/icones';
import { IconeEntite } from '../components/IconesEntite';
import { ChampEntite, NouveauDans, type ChoixEntiteFenetre } from '../components/ChoixEntite';
import { Chez, useMesEntites, type EntiteMoi } from '../data/entites';
import { useComites } from '../data/comites';
import { Progress } from './Dashboard';
import { hydrateArchive } from '../data/entete';
import { cleanHtml } from '../data/sanitize';
import { useUnitLogo } from '../components/Entete';
import { PageIntro } from '../components/Nav';
import { useClubOptional } from '../data/club';
import { aPlanifier, aRenommer, annuelle, convoquesDe, duMois, finDeSerie, motSeance, nomSeance, serieDuMois, seuleDuMois, titreSelonDate } from '../data/seances';
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
  const [cible, setCible] = useState<{ id: string; archive?: boolean; entite?: string } | null>(null);
  useEffect(() => {
    const id = params.get(param) ?? params.get('archive');
    if (!id) return;
    setCible({ id, archive: !params.get(param), entite: params.get('entite') ?? undefined });
    setParams({}, { replace: true });
  }, [params, param, setParams]);
  useEffect(() => {
    if (cible && !cible.archive) document.querySelector('.agenda-item.cible')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [cible]);
  return cible;
}

/** La carte visée (`?entite=` : celle de cette entité, les mêmes numéros pouvant servir dans plusieurs entités). */
const estCible = (cible: { id: string; entite?: string } | null, id: string, u?: string) => !!cible && cible.id === id && (!cible.entite || !u || cible.entite === u);

/** Lien vers les tâches d'une séance, d'un événement : de son entité seulement (filtre « Entité »). */
const tachesDe = (filtre: string, u: string | undefined) => `/taches?${filtre}${u ? `&entite=${encodeURIComponent(u)}` : ''}`;

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
  // Convoqués : ★ et postes du comité (PERSONNES_DU_CLUB.md).
  const convoque = !!user && convoquesDe(data).some((p) => p.id === user.id);
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

/** Archive ouverte (PV ou ordre du jour) d'une séance ; `u` : son entité. */
type VuePv = { meeting: Meeting; pv: PvArchive; kind: 'odj' | 'pv'; u?: string };

/**
 * Séances de tous mes comités (vue « moi »), chacune avec la pilule de son entité : elle s'y affiche, s'y modifie et
 * mène à son ordre du jour et à son PV (ce comité choisi), sans changer d'entité.
 */
export function Meetings() {
  const mes = useMesEntites().filter((e) => e.store.can('tab.meetings'));
  const plusieurs = usePlusieursEntites();
  const [edit, setEdit] = useState<{ m: Meeting; u?: string } | null>(null);
  const [nouvelle, setNouvelle] = useState(false);
  const [viewPv, setViewPv] = useState<VuePv | null>(null);
  const gerables = mes.filter((e) => e.store.can('meetings.manage'));
  // Les séances passées sont repliées en bas (archives des PV et ordres du jour), les plus récentes d'abord.
  const jour = today();
  const toutes = mes
    .flatMap((e) => e.store.data.meetings.map((m) => ({ m, e })))
    .sort((a, b) => a.m.date.localeCompare(b.m.date) || (a.m.heure ?? '').localeCompare(b.m.heure ?? '') || Number(b.e.ici) - Number(a.e.ici));
  const aVenir = toutes.filter((x) => x.m.date >= jour);
  const passees = toutes.filter((x) => x.m.date < jour).reverse();
  const cible = useCible('seance');
  useEffect(() => {
    if (!cible?.archive) return;
    for (const { m, e } of toutes) {
      if (cible.entite && e.u && cible.entite !== e.u.id) continue;
      const pv = m.minutesArchives?.find((x) => x.id === cible.id);
      const odj = m.pvArchives?.find((x) => x.id === cible.id);
      if (pv || odj) return setViewPv({ meeting: m, pv: (pv ?? odj)!, kind: pv ? 'pv' : 'odj', u: e.u?.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible]);

  const carte = ({ m, e }: { m: Meeting; e: EntiteMoi }) => (
    <Chez key={`${e.u?.id ?? ''}:${m.id}`} id={e.u?.id}>
      <CarteSeance
        m={m}
        cible={estCible(cible, m.id, e.u?.id)}
        pilule={plusieurs ? e.u?.nom : undefined}
        onPv={(pv, kind) => setViewPv({ meeting: m, pv, kind, u: e.u?.id })}
        onEdit={() => setEdit({ m, u: e.u?.id })}
      />
    </Chez>
  );

  return (
    <div>
      <div className="page-head">
        <h1>{mes.length > 1 ? 'Séances de mes comités' : 'Séances du comité'}</h1>
        {gerables.length > 0 && <button className="btn primary" onClick={() => setNouvelle(true)}>+ Nouvelle séance</button>}
      </div>
      <PageIntro />
      {gerables.map((e) => (
        <Chez key={e.u?.id ?? ''} id={e.u?.id}>
          <Renommer nom={gerables.length > 1 ? e.u?.nom : undefined} />
          <AnneeProchaine nom={gerables.length > 1 ? e.u?.nom : undefined} />
        </Chez>
      ))}
      <div className="agenda">
        {aVenir.map(carte)}
        {!aVenir.length && <Empty>{passees.length ? 'Aucune séance à venir.' : 'Aucune séance.'}</Empty>}
      </div>
      {passees.length > 0 && (
        <details className="seances-passees" open={passees.some((x) => estCible(cible, x.m.id, x.e.u?.id)) || undefined}>
          <summary><Icone n="archives" /> Séances passées ({passees.length})</summary>
          <div className="agenda">{passees.map(carte)}</div>
        </details>
      )}
      {viewPv && (
        <Chez id={viewPv.u}>
          <ArchiveSeance vue={viewPv} onClose={() => setViewPv(null)} />
        </Chez>
      )}
      {edit && (
        <Chez id={edit.u}>
          <MeetingModal meeting={edit.m} onClose={() => setEdit(null)} />
        </Chez>
      )}
      {nouvelle && <NouvelleSeance gerables={gerables} onClose={() => setNouvelle(false)} />}
    </div>
  );
}

/** Carte d'une séance, dans son entité : ses tâches, ses excusés, ses archives, mes droits chez elle. */
function CarteSeance({ m, cible, pilule, onPv, onEdit }: { m: Meeting; cible: boolean; pilule?: string; onPv: (pv: PvArchive, kind: 'odj' | 'pv') => void; onEdit: () => void }) {
  const { data, can } = useStore();
  const club = useClubOptional();
  const comites = useComites();
  const tasks = data.tasks.filter((t) => t.meetingId === m.id);
  const past = m.date < today();
  return (
    <article id={`cible-${m.id}`} className={`panel agenda-item ${past ? 'past' : ''} ${cible ? 'cible' : ''}`}>
      <DateBlock date={m.date} />
      <div className="grow">
        <strong>{m.titre}</strong>{pilule && <> <span className="tsource" title={`Séance de « ${pilule} »`}>{pilule}</span></>}
        <div className="muted">
          {m.heure && `${m.heure.replace(':', 'h')} · `}<LieuSeance m={m} vide="" />{!past && ` · dans ${daysUntil(m.date)} j`}
          {annuelle(m) ? <> · <Icone n="repetition" /> chaque année</> : ' · une seule fois'}
        </div>
        <Excuses m={m} past={past} />
        <Link to={tachesDe(`meeting=${encodeURIComponent(m.id)}`, pilule && club?.current.id)}>{tasks.length} tâche(s) rattachée(s) à la séance →</Link>
        {((m.pvArchives?.length ?? 0) > 0 || (m.minutesArchives?.length ?? 0) > 0 || can('tab.minutes')) && (
          <div className="pv-archives">
            {(m.minutesArchives ?? []).map((pv, i) => (
              <button key={pv.id} className="chip on" onClick={() => onPv(pv, 'pv')} title={`Validé le ${fmtDateTime(pv.at)}`}>
                <Icone n="pv" /> {pv.titre}{i > 0 ? ` (version du ${fmtDateTime(pv.at)})` : ''}
              </button>
            ))}
            {(m.pvArchives ?? []).map((pv) => (
              <button key={pv.id} className="chip" onClick={() => onPv(pv, 'odj')} title={`Archivé le ${fmtDateTime(pv.at)}`}>
                <Icone n="odj" /> Ordre du jour · {fmtDateTime(pv.at)}
              </button>
            ))}
            {can('tab.minutes') && (
              <Link className="chip" to={`/pv?seance=${m.id}`} onClick={() => club && comites?.choisir(club.current.id)}>
                <Icone n="notes" /> {m.minutes ? 'Reprendre le PV' : 'Prendre les notes du PV'}
              </Link>
            )}
          </div>
        )}
      </div>
      {can('meetings.manage') && <button className="btn small" onClick={onEdit}>Modifier</button>}
    </article>
  );
}

/** PV ou ordre du jour archivé d'une séance, dans son entité (supprimable selon mes droits chez elle). */
function ArchiveSeance({ vue, onClose }: { vue: VuePv; onClose: () => void }) {
  const { can, update } = useStore();
  return (
    <PvViewer
      pv={vue.pv}
      kind={vue.kind}
      canDelete={vue.kind === 'pv' ? can('tab.minutes') : can('meetings.manage') || can('tab.pv')}
      onDelete={() => {
        update((d) => {
          const x = d.meetings.find((y) => y.id === vue.meeting.id)!;
          if (vue.kind === 'pv') x.minutesArchives = (x.minutesArchives ?? []).filter((p) => p.id !== vue.pv.id);
          else x.pvArchives = (x.pvArchives ?? []).filter((p) => p.id !== vue.pv.id);
        }, `Suppression ${vue.kind === 'pv' ? 'du PV' : 'de l’ordre du jour'} archivé « ${vue.pv.titre} »`);
        onClose();
      }}
      onClose={onClose}
    />
  );
}

/** Nouvelle séance : dans l'un de mes comités où je gère les séances, choisi dans la fenêtre (« Comité »). */
function NouvelleSeance({ gerables, onClose }: { gerables: EntiteMoi[]; onClose: () => void }) {
  // Nommée d'après son mois chez le comité choisi ; date, heure et lieu déjà saisis suivent.
  const cree = (e: EntiteMoi, v?: Meeting): Meeting => {
    const m = newMeeting(e.store.data.meetings, v?.date || today(), motSeance(e.u?.type));
    return v ? { ...m, heure: v.heure, lieu: v.lieu, lieuGeo: v.lieuGeo } : m;
  };
  return <NouveauDans entites={gerables} cree={cree}>{(m, choix) => <MeetingModal meeting={m} entite={choix} onClose={onClose} />}</NouveauDans>;
}

/** « jeudi 8 avril 2027 » (sans la virgule que certains navigateurs ajoutent après le jour). */
const jourLong = (date: string) => {
  const d = new Date(date + 'T12:00:00');
  return `${d.toLocaleDateString('fr-CH', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('fr-CH', { month: 'long' })} ${d.getFullYear()}`;
};

/** Séances de l'année prochaine : chaque séance revient le même mois ; on coche celles à ajouter. */
function AnneeProchaine({ nom }: { nom?: string }) {
  const { data, can, update } = useStore();
  const [sauf, setSauf] = useState<string[]>([]);
  const liste = aPlanifier(data.meetings);
  if (!liste.length || !can('meetings.manage')) return null;
  const choisies = liste.filter((x) => !sauf.includes(x.source.id));
  const ajouter = () =>
    update((d) => { d.meetings = [...d.meetings, ...choisies.map((x) => x.meeting)]; }, `Ajout des séances de l’année prochaine : ${choisies.map((x) => x.meeting.titre).join(', ')}`);
  const plusJamais = (m: Meeting) => {
    const ids = serieDuMois(data.meetings, m);
    update((d) => { d.meetings.forEach((x) => { if (ids.includes(x.id)) x.unique = true; }); }, `La séance ${duMois(m.date)} ne revient plus chaque année`);
  };
  return (
    <section className="panel seances-suivantes">
      <h2><Icone n="repetition" /> Séances de l’année prochaine{nom && <> <span className="tsource">{nom}</span></>}</h2>
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
function Renommer({ nom }: { nom?: string }) {
  const { data, can, update } = useStore();
  const [garde, setGarde] = useState(() => {
    try { return localStorage.getItem(GARDER_NOMS) === '1'; } catch { return false; }
  });
  const liste = aRenommer(data.meetings);
  if (!liste.length || garde || !can('meetings.manage')) return null;
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
      <h2><Icone n="modifier" /> Nommer les séances d’après leur mois{nom && <> <span className="tsource">{nom}</span></>}</h2>
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
export function MeetingModal({ meeting, entite, onClose }: { meeting: Meeting; entite?: ChoixEntiteFenetre<Meeting>; onClose: () => void }) {
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
        <ChampEntite choix={entite} v={v} label="Comité" />
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

/**
 * Événements de toutes mes entités (vue « moi »), chacun avec la pilule de son entité : il s'y affiche, s'y modifie et
 * s'y reprend, sans changer d'entité. Avec les événements du club qui dépendent de mes comités.
 */
export function Events() {
  const mes = useMesEntites().filter((e) => e.store.can('tab.events'));
  const plusieurs = usePlusieursEntites();
  const club = useClubOptional();
  const [edit, setEdit] = useState<{ e: ClubEvent; jour?: string; u?: string } | null>(null);
  const [nouveau, setNouveau] = useState(false);
  // Événement passé repris pour une nouvelle édition, avec ses tâches (Reprise.tsx).
  const [reprise, setReprise] = useState<{ e: ClubEvent; u?: string } | null>(null);
  const gerables = mes.filter((e) => e.store.can('events.manage'));
  const cible = useCible('id');
  // Événement qui se répète : une seule fois, à sa prochaine occurrence (série terminée : la dernière).
  const jour = today();
  const affiche = (e: ClubEvent) => (e.repetition ? (occurrenceDu(e, jour) ?? derniereOccurrence(e) ?? e.date) : e.date);
  // Avec les événements du club qui dépendent de chacun de mes comités, à leur date (sans date : à la fin).
  const liste = mes
    .flatMap((ent) => [
      ...ent.store.data.events.map((e) => ({ date: affiche(e), e, u: undefined, ent })),
      ...(club && ent.u ? evenementsDependants(club.units, ent.u) : []).map((u) => ({ date: u.date || '9999', e: undefined, u, ent })),
    ])
    .sort((a, b) => a.date.localeCompare(b.date) || Number(!!a.u) - Number(!!b.u) || (a.e?.heure ?? '').localeCompare(b.e?.heure ?? '') || Number(b.ent.ici) - Number(a.ent.ici));

  return (
    <div>
      <div className="page-head">
        <h1>Événements</h1>
        {gerables.length > 0 && <button className="btn primary" onClick={() => setNouveau(true)}>+ Nouvel événement</button>}
      </div>
      <PageIntro />
      {mes.map((ent) => (
        <Chez key={ent.u?.id ?? ''} id={ent.u?.id}>
          <EditionCard pilule={plusieurs ? ent.u?.nom : undefined} />
        </Chez>
      ))}
      <div className="agenda">
        {liste.map(({ e: serie, u, date, ent }) => (
          <Chez key={`${ent.u?.id ?? ''}:${u ? `u:${u.id}` : serie?.id}`} id={ent.u?.id}>
            {u ? (
              <EvenementDependant u={u} pilule={plusieurs ? ent.u?.nom : undefined} />
            ) : (
              serie && (
                <CarteEvenement
                  serie={serie}
                  date={date}
                  cible={estCible(cible, serie.id, ent.u?.id)}
                  pilule={plusieurs ? ent.u?.nom : undefined}
                  onEdit={() => setEdit({ e: serie, jour: serie.repetition ? date : undefined, u: ent.u?.id })}
                  onReprise={() => setReprise({ e: serie, u: ent.u?.id })}
                />
              )
            )}
          </Chez>
        ))}
        {!liste.length && <Empty>Aucun événement.</Empty>}
      </div>
      {edit && (
        <Chez id={edit.u}>
          <EventModal event={edit.e} jour={edit.jour} onClose={() => setEdit(null)} />
        </Chez>
      )}
      {nouveau && (
        <NouveauDans entites={gerables} cree={(_e, v?: ClubEvent) => (v ? { ...v, id: uid('e') } : newEvent())}>
          {(e, choix) => <EventModal event={e} entite={choix} onClose={() => setNouveau(false)} />}
        </NouveauDans>
      )}
      {reprise && (
        <Chez id={reprise.u}>
          <RepriseChez event={reprise.e} onClose={() => setReprise(null)} />
        </Chez>
      )}
    </div>
  );
}

/** Carte d'un événement (à la date `date` s'il se répète), dans son entité : avancement de ses tâches, mes droits chez elle. */
function CarteEvenement({ serie, date, cible, pilule, onEdit, onReprise }: { serie: ClubEvent; date: string; cible: boolean; pilule?: string; onEdit: () => void; onReprise: () => void }) {
  const { data, can } = useStore();
  const club = useClubOptional();
  const jour = today();
  const e = aLaDate(serie, date);
  const tasks = data.tasks.filter((t) => t.eventId === e.id);
  const fin = endOf(e);
  const past = fin < jour;
  const jours = diffDays(e.date, fin) + 1;
  const quand = past ? '' : e.date <= jour ? 'en cours' : `dans ${daysUntil(e.date)} j`;
  const suite = data.events.find((x) => x.repriseDe === serie.id);
  const ici = pilule ? club?.current.id : undefined;
  return (
    <article id={`cible-${serie.id}`} className={`panel agenda-item ${past ? 'past' : ''} ${cible ? 'cible' : ''}`}>
      <DateBlock date={e.date} fin={e.dateFin} />
      <div className="grow">
        <strong>{e.nom}</strong>{pilule && <> <span className="tsource" title={`Événement de « ${pilule} »`}>{pilule}</span></>}
        <div className="muted">{[horaire(e), e.lieu, jours > 1 && `${jours} jours`, quand].filter(Boolean).join(' · ')}</div>
        {e.repetition && <div className="muted"><Icone n="repetition" /> {libelleRepetition(serie)}</div>}
        <p>{e.description}</p>
        <Progress done={tasks.filter((t) => isDone(data, t)).length} total={tasks.length} />
        <Link to={tachesDe(`event=${encodeURIComponent(e.id)}`, ici)}>Voir les tâches →</Link>
        {suite && <p className="muted reprise"><Icone n="dupliquer" /> Reprise : <Link to={`/evenements?id=${encodeURIComponent(suite.id)}${ici ? `&entite=${encodeURIComponent(ici)}` : ''}`}>{suite.nom}</Link> ({fmtRange(suite.date, suite.dateFin)})</p>}
      </div>
      {can('events.manage') && (
        <div className="agenda-actions">
          <button className="btn small" onClick={onEdit}>Modifier</button>
          {past && reprenable(serie) && (
            <button className="btn small" onClick={onReprise} title="Nouvelle édition de cet événement, avec ses tâches">
              <Icone n="dupliquer" /> Reprendre
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Reprise d'un événement passé, dans son entité (une équipe d'événement : sa prochaine édition). */
function RepriseChez({ event, onClose }: { event: ClubEvent; onClose: () => void }) {
  const club = useClubOptional();
  return <RepriseModal event={event} edition={hasEdition(club?.current)} onClose={onClose} />;
}

/**
 * Événement du club qui dépend du comité ouvert : sa prochaine édition, sa description, ses propres événements à venir
 * et l'avancement des tâches qui le concernent ici (partagées par lui, ou du comité liées à lui ou partagées avec lui).
 */
function EvenementDependant({ u, pilule }: { u: OrgUnit; pilule?: string }) {
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
  return (
    <article className={`panel agenda-item dependant ${past ? 'past' : ''}`} style={{ '--c': u.couleur } as React.CSSProperties}>
      {u.date ? <DateBlock date={u.date} fin={u.dateFin} /> : <div className="dateblock vide" title="Date à fixer"><b>?</b><span>date</span></div>}
      <div className="grow">
        <strong><IconeEntite u={u} /> {u.nom}</strong> <span className="chip dependant-tag" title={`« Dépend de » : ${club.current.nom}`}>{pilule ? `dépend de « ${pilule} »` : 'dépend de ce comité'}</span>
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
        <Link to={tachesDe(`event=${encodeURIComponent(`u:${u.id}`)}`, pilule && club.current.id)}>Voir les tâches →</Link>
        {!taches.length && <small className="muted"> Aucune pour l’instant : range une tâche sous « Événements » › « {u.nom} », ou rattache-la à lui (« <Icone n="rattacher" /> Rattacher à… » ou « Pour quand ? ») ; ou il partage les siennes.</small>}
      </div>
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
