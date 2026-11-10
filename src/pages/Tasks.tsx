import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import type { Task } from '../data/types';
import { applyDelaiRef, childrenOf, daysUntil, descendantsOf, derniereSeancePassee, estArchivee, fmtDate, fullName, isDone, isLate, newTask, parentOf, recurrenceLabel, today } from '../data/utils';
import { finDeSemaine } from '../data/repetition';
import { sortedMeetings } from '../data/agenda';
import { finAnticipee, versProchaineSeance } from '../data/seances';
import { TaskModal } from '../components/FicheTache';
import { CircuitPaiements } from '../components/Tickets';
import { GENRES, genreDe } from '../data/paiements';
import { nomAppli } from '../data/nomAppli';
import { APrendreTag, Avatar, DocPollIcons, Empty, EtiquettesTag, LinkIcon, PourInfoTag, RecurIcon, StatusBadge, TicketTag } from '../components/ui';
import { etiquettesDesLieux, etiquettesRangees, evenementPasse, lieuxDe } from '../data/etiquettes';
import { attendDesVus, bilanVu, pourMoi } from '../data/pourInfo';
import { useSuiviPourInfo } from '../data/suiviPourInfo';
import { pasDispo as aDecline, peutPrendre } from '../data/aPrendre';
import { PageIntro } from '../components/Nav';
import { AvisLien } from '../components/EnvoyerLien';
import { Icone } from '../components/icones';
import { FILTRE_SERIE, filtreSerie, nomAvecSerie, seriesDuClub } from '../data/seriesEvenements';

type SortKey = 'section' | 'sousSection' | 'titre' | 'responsable' | 'statut' | 'delai';

const EMPTY_FILTERS = { q: '', etiquette: '', section: '', sous: '', resp: '', statut: '', event: '', meeting: '', delai: '', parent: '', type: '' };

/**
 * Notification d'un message (💬, 📣 : …&discussion=1) : la discussion s'ouvre dans « Messages », pas par-dessus la fiche ;
 * la fermer ramène aux discussions, et l'icône de la tâche y ouvre la fiche. Les notifications déjà envoyées gardent
 * l'ancien lien (sur téléphone aussi) : elles passent par ici.
 */
export function Tasks() {
  const [params] = useSearchParams();
  const tache = params.get('tache');
  if (params.has('discussion') && tache) return <Navigate to={`/messages?d=${encodeURIComponent(tache)}`} replace />;
  return <ListeTaches />;
}

function ListeTaches() {
  const { data, user, can, canSeeTask, canEditTask, creatableSections, prefs, setPrefs, saveTask } = useStore();
  const [params] = useSearchParams();
  const [scope, setScope] = useState<'mes' | 'toutes'>(
    // Lien vers les points d'une étiquette, d'un événement, d'une séance… : tous ses points, pas seulement les miens.
    params.get('statut') || params.get('delai') ? 'mes' : params.get('etiquette') || params.get('event') || params.get('meeting') || params.get('resp') || params.get('parent') || params.get('type') ? 'toutes' : prefs.vueDefaut,
  );
  const [f, setF] = useState({
    ...EMPTY_FILTERS,
    etiquette: params.get('etiquette') ?? '',
    event: params.get('event') ?? '',
    meeting: params.get('meeting') ?? '',
    resp: params.get('resp') ?? '',
    statut: params.get('statut') ?? '',
    delai: params.get('delai') ?? '',
    parent: params.get('parent') ?? '',
    type: params.get('type') ?? '',
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'delai', dir: 1 });
  // Suivi des « Pour info » (052) : qui doit encore voir les tâches (filtre « Mes Pour info pas encore vus », pastilles).
  const suivi = useSuiviPourInfo(data.tasks);
  const navigate = useNavigate();
  // Lien depuis une notification : /taches?tache=<id> ouvre directement la tâche.
  // …&email=<id> ouvre en plus l'email programmé à envoyer, …&discussion=1 sa discussion (💬). Seulement une tâche que la
  // personne voit.
  const lienTache = params.get('tache');
  const ouvrable = (x: Task) => x.id === lienTache && canSeeTask(x);
  const depuisLien = () => ({ isNew: false, email: params.get('email') ?? undefined, discussion: params.has('discussion') });
  const [edit, setEdit] = useState<{ task: Task; isNew: boolean; email?: string; discussion?: boolean } | null>(() => {
    const t = data.tasks.find(ouvrable);
    return t ? { task: t, ...depuisLien() } : null;
  });
  // Version réelle : la tâche peut arriver un peu après l'ouverture de l'appli ; on l'ouvre alors.
  const attendue = useRef(edit ? null : lienTache);
  useEffect(() => {
    const t = attendue.current ? data.tasks.find(ouvrable) : undefined;
    if (!t) return;
    attendue.current = null;
    setEdit((e) => e ?? { task: t, ...depuisLien() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.tasks, params]);
  const closeEdit = () => {
    setEdit(null);
    if (params.get('tache')) navigate('/taches', { replace: true });
  };

  const [showFilters, setShowFilters] = useState(!!params.get('statut') || !!params.get('type') || !!params.get('delai'));
  // Terminées : visibles jusqu'à la séance suivante, puis archivées (estArchivee) ; « Masquer les terminées » les retire avant.
  const hideDone = !!prefs.masquerTerminees;
  const setHideDone = (v: boolean) => setPrefs({ masquerTerminees: v });
  const [archives, setArchives] = useState(false);
  const seancePassee = derniereSeancePassee(data);
  const [dragId, setDragId] = useState<string | null>(null);
  const view = prefs.affichage;
  // Filtre « Événement » : une série d'événements (« serie:<id> », seriesEvenements.ts), sinon un événement.
  const serieFiltree = filtreSerie(f.event);
  const evenementFiltre = serieFiltree ? '' : f.event;
  // Nouvelle tâche : pour la séance filtrée (le jour même), liée à l'événement filtré, avec l'étiquette filtrée ; sans
  // filtre, pour la prochaine séance.
  const nouvelleTache = () =>
    applyDelaiRef(
      data,
      newTask(user!.id, {
        ...(f.meeting
          ? { eventId: evenementFiltre || undefined, meetingId: f.meeting, delaiRef: { type: 'meeting', joursAvant: 0 } }
          : evenementFiltre ? { eventId: evenementFiltre } : versProchaineSeance(data.meetings)),
        ...(f.etiquette ? { etiquettes: [f.etiquette], ...placeDe(f.etiquette) } : {}),
      }),
    );
  /** Place de l'étiquette filtrée (la première, si elle en a une) : le nouveau point y est rangé. */
  const placeDe = (id: string) => {
    const e = data.etiquettes?.find((x) => x.id === id);
    const l = e ? lieuxDe(e, data.sections)[0] : undefined;
    return l ? { sectionId: l.sectionId, sousSection: l.sousSection ?? '' } : {};
  };
  // « Toutes » : celles des sections « Voir toutes », et celles de mes étiquettes.
  const viewAll = can('tasks.viewAll') || !!data.etiquettes?.some((e) => !!user && e.membres?.includes(user.id));
  const effScope = viewAll ? scope : 'mes';
  const sectionName = (id: string) => data.sections.find((s) => s.id === id)?.nom ?? '';
  const statusOf = (t: Task) => data.statuses.find((s) => s.id === t.statusId);
  const respNames = (t: Task) => t.responsables.map((id) => fullName(data.people.find((p) => p.id === id))).join(', ');

  const { list, nArchivees, evenementsAvec, nTous } = useMemo(() => {
    if (!user) return { list: [], nArchivees: 0, evenementsAvec: new Set<string>(), nTous: 0 };
    const q = f.q.trim().toLowerCase();
    // Étiquettes d'un point : celles qu'il porte, et celles d'office de sa place (section, sous-section, événement) ; un
    // point pas réenregistré depuis qu'une étiquette a reçu sa place ne la porte pas encore, mais il est bien à elle.
    const auto = etiquettesDesLieux(data);
    const etiquettesDe = (t: Task) => (t.paiement ? t.etiquettes ?? [] : [...(t.etiquettes ?? []), ...auto(t.sectionId, t.sousSection, t.eventId)]);
    // Événements d'un point : celui auquel il est rattaché (une date modifiée à part compte pour sa série), et celui dont il
    // porte l'étiquette (rangé dans sa sous-section), comme sur la carte de l'événement et dans sa chronologie.
    const serieDe = new Map(data.events.filter((x) => x.serie).map((x) => [x.id, x.serie!.id]));
    const evenementDe = new Map((data.etiquettes ?? []).filter((e) => e.eventId).map((e) => [e.id, e.eventId!]));
    const evenementsDe = (t: Task) =>
      [...new Set([...(t.eventId ? [t.eventId, serieDe.get(t.eventId) ?? ''] : []), ...etiquettesDe(t).map((id) => evenementDe.get(id) ?? '')])].filter(Boolean);
    // Série d'événements filtrée : les points de l'un de ses événements, et ceux de son étiquette (sa sous-section).
    const dansLaSerie = serieFiltree ? new Set(data.events.filter((e) => e.dansSerie === serieFiltree).map((e) => e.id)) : undefined;
    const etiquetteSerie = serieFiltree ? (data.etiquettes ?? []).find((e) => e.serieId === serieFiltree)?.id : undefined;
    const duFiltre = (t: Task) =>
      dansLaSerie ? evenementsDe(t).some((id) => dansLaSerie.has(id)) || (!!etiquetteSerie && etiquettesDe(t).includes(etiquetteSerie)) : evenementsDe(t).includes(f.event);
    // Points rattachés au point du filtre « Rattachés à », à tous les niveaux.
    const sousLeFiltre = new Set(f.parent ? descendantsOf(data, f.parent).map((x) => x.id) : []);
    // Tous les filtres, sauf `sauf` : les choix du filtre « Événement » sont ceux qui ont des tâches avec les autres filtres.
    // `portee` : mes points ou tous (pour dire combien « Tous » en montrerait).
    const garde = (t: Task, sauf?: 'event', portee = effScope) => {
      // « Mes tâches » : aussi mes demandes de remboursement / paiement, pour en suivre l'état, les tâches pour info et celles
      // qu'on me propose (à prendre, tant qu'il reste une place).
      // Mes « Pour info » pas encore vus : les tâches dont je suis l'auteur ou responsable, que des personnes doivent encore voir.
      if (f.delai === 'pourinfo') {
        if (!(t.createdBy === user.id || t.responsables.includes(user.id)) || !canSeeTask(t) || t.paiement || !t.pourInfo || !attendDesVus(bilanVu(t, suivi[t.id]))) return false;
      } else if (portee === 'mes' ? !(t.responsables.includes(user.id) || t.paiement?.demandePar === user.id || pourMoi(t, user.id) || peutPrendre(t, user.id)) : !canSeeTask(t)) return false;
      if (f.type && !(t.paiement && (f.type === 'tickets' || genreDe(t.paiement) === f.type))) return false;
      if (f.etiquette && !etiquettesDe(t).includes(f.etiquette)) return false;
      if (f.section && t.sectionId !== f.section) return false;
      if (f.sous && t.sousSection !== f.sous) return false;
      if (f.resp && !t.responsables.includes(f.resp)) return false;
      // « Rattachés à … » : le point choisi et ceux qui lui sont rattachés, à tous les niveaux.
      if (f.parent && t.id !== f.parent && !sousLeFiltre.has(t.id)) return false;
      if (f.statut === 'retard' ? !isLate(data, t) : f.statut && t.statusId !== f.statut) return false;
      if (sauf !== 'event' && f.event && !duFiltre(t)) return false;
      if (f.meeting && t.meetingId !== f.meeting) return false;
      if (f.delai && ['passe', '7', '30', 'semaine'].includes(f.delai) && !t.delai) return false;
      if (f.delai) {
        const n = daysUntil(t.delai);
        if (f.delai === 'passe' && n >= 0) return false;
        if (f.delai === '7' && (n < 0 || n > 7)) return false;
        if (f.delai === '30' && (n < 0 || n > 30)) return false;
        // Cette semaine (résumé du lundi) : à faire d'ici dimanche, en retard comprises.
        if (f.delai === 'semaine' && (t.delai > finDeSemaine(today()) || isDone(data, t))) return false;
        if (f.delai === 'recurrente' && !t.recurrence) return false;
        if (f.delai === 'lie' && !t.delaiRef) return false;
        if (f.delai === 'principale' && !childrenOf(data, t.id).length) return false;
        if (f.delai === 'liee' && !t.parentId) return false;
        if (f.delai === 'email' && !(data.emails ?? []).some((e) => e.taskId === t.id && e.statut === 'programme')) return false;
      }
      if (q && !`${t.titre} ${t.remarque} ${t.sousSection} ${sectionName(t.sectionId)} ${respNames(t)}`.toLowerCase().includes(q)) return false;
      return true;
    };
    // Archives : les tâches archivées seules ; sinon, elles sont comptées et retirées.
    const archivee = (t: Task) => estArchivee(data, t, seancePassee);
    const montree = (t: Task) => (archives ? archivee(t) : !archivee(t) && !(hideDone && view !== 'kanban' && !f.statut && isDone(data, t)));
    let nArchivees = 0;
    const res = data.tasks.filter((t) => {
      if (!garde(t)) return false;
      if (archivee(t)) nArchivees++;
      return montree(t);
    });
    const evenementsAvec = new Set(data.tasks.filter((t) => garde(t, 'event') && montree(t)).flatMap(evenementsDe));
    // « Mes points » filtrés : combien « Tous » en montrerait (les filtres ne gardent que mes points).
    const nTous = effScope === 'mes' && viewAll ? data.tasks.filter((t) => garde(t, undefined, 'toutes') && montree(t)).length : 0;
    const val = (t: Task): string | number => {
      switch (sort.key) {
        case 'section': return sectionName(t.sectionId);
        case 'sousSection': return t.sousSection;
        case 'titre': return t.titre.toLowerCase();
        case 'responsable': return respNames(t);
        case 'statut': return data.statuses.findIndex((s) => s.id === t.statusId);
        case 'delai': return t.delai || (sort.dir === 1 ? '9999' : '0000'); // sans délai : en fin de liste
      }
    };
    return { list: res.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir), nArchivees, evenementsAvec, nTous };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, user, effScope, viewAll, f, sort, hideDone, view, archives, seancePassee, suivi]);

  // Filtre « Toutes séances » : les séances à venir et celles qui ont encore des tâches dans la liste (archives : celles
  // de leurs tâches) ; pas les anciennes séances, dont les tâches terminées sont archivées.
  const seancesFiltre = useMemo(() => {
    const liees = new Set(data.tasks.filter((t) => t.meetingId && estArchivee(data, t, seancePassee) === archives).map((t) => t.meetingId));
    return sortedMeetings(data).filter((m) => (!archives && m.date >= today()) || liees.has(m.id) || m.id === f.meeting);
  }, [data, seancePassee, archives, f.meeting]);

  if (!user) return null;
  const sec = data.sections.find((s) => s.id === f.section);
  // Sous-sections de la section, et celles de ses tâches hors de la liste.
  const sousDe = (x?: typeof sec) =>
    x ? [...new Set([...x.sousSections, ...data.tasks.filter((t) => t.sectionId === x.id && t.sousSection).map((t) => t.sousSection)])] : [];
  const activeFilters = Object.entries(f).filter(([, v]) => v).length;
  // Filtre « Événement » : ceux qui ont des tâches avec les autres filtres, par date (les passés à part).
  const evenementsChoix = data.events.filter((e) => evenementsAvec.has(e.id) || e.id === f.event).sort((a, b) => a.date.localeCompare(b.date));
  // Séries d'événements qui ont des points avec les autres filtres (et celle filtrée).
  const seriesChoix = seriesDuClub(data).filter(
    (s) => s.id === serieFiltree || data.events.some((e) => e.dansSerie === s.id && evenementsAvec.has(e.id)) || (data.etiquettes ?? []).some((e) => e.serieId === s.id),
  );
  // Filtre « Étiquette » : les groupes, les événements à venir, puis les passés à part.
  const rangees = etiquettesRangees(data.etiquettes, data.events);

  const setStatus = (t: Task, statusId: string) => {
    if (t.statusId === statusId || !canEditTask(t) || t.paiement) return; // remboursement / paiement : suit son circuit
    const q = finAnticipee(data, t, { ...t, statusId });
    if (q && !confirm(q)) return;
    saveTask({ ...t, statusId }, false);
  };

  const exportCsv = () => {
    const head = ['Section', 'Sous-section', 'Point', 'Rattaché à', 'Responsable(s)', 'Statut', 'Délai', 'En retard', 'Événement', 'Séance', 'Étiquettes', 'Répétition', 'Remarque', 'Checklist'];
    const subs = (t: Task) => t.checklist.map((c) => `${c.done ? '☑' : '☐'} ${c.label}`).join(' | ');
    const rows = list.map((t) => [
      sectionName(t.sectionId), t.sousSection, t.titre, parentOf(data, t)?.titre ?? '', respNames(t), statusOf(t)?.label ?? '', t.delai, isLate(data, t) ? 'oui' : '',
      data.events.find((e) => e.id === t.eventId)?.nom ?? '', data.meetings.find((m) => m.id === t.meetingId)?.titre ?? '',
      (t.etiquettes ?? []).map((id) => data.etiquettes?.find((e) => e.id === id)?.nom).filter(Boolean).join(', '), recurrenceLabel(t.recurrence), t.remarque, subs(t),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `taches-gsa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const Th = ({ k, children }: { k: SortKey; children: string }) => (
    <th onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))} className="sortable">
      {children} {sort.key === k ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </th>
  );

  return (
    <div>
      <div className="page-head">
        <h1>{archives ? '🗄 Points archivés' : 'Points'} <span className="count">{list.length}</span></h1>
        <div className="actions">
          {viewAll && (
            <div className="seg">
              <button className={effScope === 'mes' ? 'on' : ''} onClick={() => setScope('mes')}>Mes points</button>
              <button className={effScope === 'toutes' ? 'on' : ''} onClick={() => setScope('toutes')}>Tous</button>
            </div>
          )}
          <div className="seg hide-mobile">
            <button className={view === 'tableau' ? 'on' : ''} onClick={() => setPrefs({ affichage: 'tableau' })}>Tableau</button>
            <button className={view === 'kanban' ? 'on' : ''} onClick={() => setPrefs({ affichage: 'kanban' })}>Kanban</button>
          </div>
          <button className="btn" onClick={() => setShowFilters(!showFilters)}>Filtres{activeFilters ? ` (${activeFilters})` : ''}</button>
          {(archives || nArchivees > 0) && (
            <button className={`btn ${archives ? 'primary' : ''}`} title="Points terminés au plus tard le jour du dernier comité passé" onClick={() => setArchives(!archives)}>
              {archives ? '← Points en cours' : <><Icone n="archives" /> Archives ({nArchivees})</>}
            </button>
          )}
          <button className="btn" onClick={() => navigate('/etiquettes')}><Icone n="etiquette" /> Étiquettes</button>
          <button className="btn hide-mobile" onClick={exportCsv}>Export CSV</button>
          <button className="btn hide-mobile" onClick={() => window.print()}>Imprimer</button>
          {creatableSections().length > 0 && <button className="btn primary" onClick={() => setEdit({ task: nouvelleTache(), isNew: true })}>+ Nouveau point</button>}
        </div>
      </div>
      <PageIntro />
      {lienTache && (
        <AvisLien
          trouve={!!edit}
          nom="un point"
          introuvable="Point introuvable : il a peut-être été supprimé, ou ton rôle ne te permet pas de le voir."
        />
      )}

      <div className={`filters ${showFilters ? 'open' : ''}`}>
        <input className="search" placeholder="🔍 Rechercher…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        {!!data.etiquettes?.length && (
          <select value={f.etiquette} onChange={(e) => setF({ ...f, etiquette: e.target.value })} aria-label="Étiquette">
            <option value="">Toutes étiquettes</option>
            {rangees.groupes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            {rangees.aVenir.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            {rangees.passees.length > 0 && (
              <optgroup label="Événements passés">
                {rangees.passees.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </optgroup>
            )}
          </select>
        )}
        <select value={f.section} onChange={(e) => setF({ ...f, section: e.target.value, sous: '' })}>
          <option value="">Toutes sections</option>
          {data.sections.filter((s) => effScope === 'mes' || can('tasks.viewAll', s.id) || data.tasks.some((t) => t.sectionId === s.id && canSeeTask(t))).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
        <select value={f.sous} disabled={!sec} onChange={(e) => setF({ ...f, sous: e.target.value })}>
          <option value="">Toutes sous-sections</option>
          {sousDe(sec).map((s) => <option key={s}>{s}</option>)}
        </select>
        {effScope === 'toutes' && (
          <select value={f.resp} onChange={(e) => setF({ ...f, resp: e.target.value })}>
            <option value="">Tous responsables</option>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
          </select>
        )}
        <select value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })}>
          <option value="">Tous statuts</option>
          {data.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          <option value="retard">⚠ En retard</option>
        </select>
        <select value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })} aria-label="Événement">
          <option value="">Tous événements</option>
          {seriesChoix.length > 0 && (
            <optgroup label="Séries d’événements">
              {seriesChoix.map((s) => <option key={s.id} value={FILTRE_SERIE + s.id}>{s.nom} (toute la série)</option>)}
            </optgroup>
          )}
          {evenementsChoix.filter((e) => !evenementPasse(e)).map((e) => <option key={e.id} value={e.id}>{nomAvecSerie(data, e)}</option>)}
          {evenementsChoix.some((e) => evenementPasse(e)) && (
            <optgroup label="Événements passés">
              {evenementsChoix.filter((e) => evenementPasse(e)).reverse().map((e) => <option key={e.id} value={e.id}>{nomAvecSerie(data, e)}</option>)}
            </optgroup>
          )}
        </select>
        <select value={f.meeting} onChange={(e) => setF({ ...f, meeting: e.target.value })}>
          <option value="">Toutes séances</option>
          {seancesFiltre.map((m) => <option key={m.id} value={m.id}>{m.titre}</option>)}
        </select>
        <select value={f.delai} onChange={(e) => setF({ ...f, delai: e.target.value })}>
          <option value="">Tous délais</option>
          <option value="passe">Délai dépassé</option>
          <option value="semaine">Cette semaine (à faire)</option>
          <option value="7">7 prochains jours</option>
          <option value="30">30 prochains jours</option>
          <option value="lie">📌 Délai calé sur un événement / une séance</option>
          <option value="recurrente">🔁 Points récurrents</option>
          <option value="email">📧 Avec email programmé</option>
          <option value="principale">🧩 Avec des points rattachés</option>
          <option value="liee">↳ Rattachés à un autre point</option>
          <option value="pourinfo">👁 Mes « Pour info » pas encore vus</option>
        </select>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="">Points et paiements</option>
          <option value="tickets">💰 Paiements et remboursements</option>
          <option value="remboursement">{GENRES.remboursement.icon} Remboursements</option>
          <option value="facture">{GENRES.facture.icon} Paiements de factures</option>
        </select>
        <select value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}>
          <option value="">Rattachés à : tous les points</option>
          {data.tasks.filter((t) => childrenOf(data, t.id).length).map((t) => <option key={t.id} value={t.id}>🧩 Rattachés à « {t.titre} »</option>)}
        </select>
        {!archives && <label className="inline hide-toggle" title="Les terminés restent affichés jusqu’au prochain comité, puis sont archivés"><input type="checkbox" checked={hideDone} onChange={() => setHideDone(!hideDone)} /> Masquer les terminés</label>}
        {activeFilters > 0 && <button className="btn link" onClick={() => setF(EMPTY_FILTERS)}>Effacer</button>}
      </div>

      {archives && seancePassee && (
        <p className="archives-note">
          🗄 Points terminés au plus tard le jour du dernier comité passé (« {seancePassee.titre} », {fmtDate(seancePassee.date)}). Rien n’est effacé : un point rouvert revient dans la liste.
        </p>
      )}

      {f.type && <CircuitPaiements total={list.length > 1 ? list.reduce((n, t) => n + (t.paiement?.montant ?? 0), 0) : undefined} />}

      <p className="print-only">{nomAppli()} – export du {fmtDate(new Date().toISOString().slice(0, 10))} – {list.length} points</p>

      {activeFilters > 0 && nTous > list.length && (
        <p className="archives-note filtre-mes no-print">
          Filtres appliqués à <b>tes points</b> seulement : {list.length} sur {nTous}.{' '}
          <button type="button" className="btn small link" onClick={() => setScope('toutes')}>Voir les {nTous} points</button>
        </p>
      )}

      {list.length === 0 ? (
        <Empty>
          Aucun point {archives ? 'archivé ' : nArchivees > 0 ? 'en cours ' : ''}ne correspond.
          {!archives && nArchivees > 0 && (
            <>
              {' '}{nArchivees} point{nArchivees > 1 ? 's' : ''} terminé{nArchivees > 1 ? 's' : ''} dans les archives.{' '}
              <button type="button" className="btn small link" onClick={() => setArchives(true)}>Les voir</button>
            </>
          )}
        </Empty>
      ) : view === 'tableau' ? (
        <>
          <table className="table desktop-only">
            <thead>
              <tr>
                <Th k="section">Section</Th>
                <Th k="sousSection">Sous-section</Th>
                <Th k="titre">Point</Th>
                <Th k="responsable">Responsable</Th>
                <Th k="statut">Statut</Th>
                <Th k="delai">Délai</Th>
                <th>Remarque</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} onClick={() => setEdit({ task: t, isNew: false })} className={isLate(data, t) ? 'row-late' : ''}>
                  <td>{sectionName(t.sectionId)}</td>
                  <td className="muted">{t.sousSection}</td>
                  <td>
                    <strong>{t.titre}</strong> <RecurIcon task={t} /> <DocPollIcons task={t} /> <EtiquettesTag task={t} /> <PourInfoTag task={t} /> <APrendreTag task={t} /> <TicketTag task={t} />
                    {t.checklist.length > 0 && <small className="muted"> · ☑ {t.checklist.filter((c) => c.done).length}/{t.checklist.length}</small>}
                    <Linked t={t} />
                  </td>
                  <td><span className="avatars">{t.responsables.map((id) => <Avatar key={id} id={id} size={24} />)}</span></td>
                  <td><StatusBadge task={t} /></td>
                  <td className="nowrap">{fmtDate(t.delai)} <LinkIcon task={t} /></td>
                  <td className="muted"><span className="clip">{t.remarque}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cards mobile-only">
            {list.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setEdit({ task: t, isNew: false })} onStatus={setStatus} />)}
          </div>
        </>
      ) : (
        <div className="kanban">
          {data.statuses.map((s) => {
            const col = list.filter((t) => t.statusId === s.id);
            return (
              <div key={s.id} className="kcol" onDragOver={(e) => e.preventDefault()} onDrop={() => { const t = list.find((x) => x.id === dragId); if (t) setStatus(t, s.id); setDragId(null); }}>
                <div className="khead" style={{ borderColor: s.couleur }}>{s.label} <span className="count">{col.length}</span></div>
                {col.map((t) => (
                  <div key={t.id} className={`kcard ${isLate(data, t) ? 'late' : ''}`} draggable={canEditTask(t) && !t.paiement} onDragStart={() => setDragId(t.id)} onClick={() => setEdit({ task: t, isNew: false })}>
                    <small className="muted">{sectionName(t.sectionId)} › {t.sousSection}</small>
                    <strong>{t.titre} <RecurIcon task={t} /> <DocPollIcons task={t} /> <EtiquettesTag task={t} /> <PourInfoTag task={t} /> <APrendreTag task={t} /></strong>
                    <TicketTag task={t} />
                    <Linked t={t} />
                    <div className="kmeta">
                      <span className="avatars">{t.responsables.map((id) => <Avatar key={id} id={id} size={22} />)}</span>
                      <span className={isLate(data, t) ? 'late-text' : 'muted'}>{fmtDate(t.delai)} <LinkIcon task={t} /></span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {edit && <TaskModal task={edit.task} isNew={edit.isNew} openEmailId={edit.email} ouvrirDiscussion={edit.discussion} onClose={closeEdit} />}
    </div>
  );
}

/** « ✓ Vu » d'une tâche pour info (accueil) : elle n'y figure plus. */
export const BoutonVu = ({ onVu }: { onVu: () => void }) => (
  <div className="pour-info-vu" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <button className="btn small" onClick={onVu} title="Je suis au courant : son auteur le voit, et il quitte l’accueil (il reste dans les points)">
      <Icone n="ok" /> Vu
    </button>
  </div>
);

/** `onVu` : tâche « pour info » de l'accueil, que l'on retire avec « ✓ Vu ». */
export function TaskCard({ t, onOpen, onStatus, onVu }: { t: Task; onOpen: () => void; onStatus: (t: Task, s: string) => void; onVu?: () => void }) {
  const { data, user, canEditTask, prendreTache, pasDispo, setToast } = useStore();
  const [prise, setPrise] = useState(false);
  const editable = canEditTask(t) && !t.paiement; // remboursement / paiement : suit son circuit
  // Tâche à prendre qu'on me propose : « Je m'en charge » ou « Pas dispo » directement sur la carte. Après « Pas dispo », elle
  // reste dans « Mes tâches » tant qu'il y a une place, pour changer d'avis (plus à l'accueil ni dans les notifications).
  const aPrendre = peutPrendre(t, user?.id) && !isDone(data, t);
  const decline = aDecline(t, user?.id);
  const repondre = (prend: boolean) => {
    setPrise(true);
    (prend ? prendreTache : pasDispo)(t)
      .then(() => setToast(prend ? `Tu t’en charges : « ${t.titre} »` : `C’est noté : pas dispo pour « ${t.titre} ». La personne qui te l’a proposé est prévenue.`))
      .catch((e: Error) => setToast(e.message))
      .finally(() => setPrise(false));
  };
  const sectionName = data.sections.find((s) => s.id === t.sectionId)?.nom ?? '';
  const late = isLate(data, t);
  const n = daysUntil(t.delai);
  return (
    <div className={`tcard ${late ? 'late' : ''}`} onClick={onOpen}>
      <div className="tcard-top">
        <small className="muted">{sectionName}{t.sousSection && ` › ${t.sousSection}`}</small>
        <StatusBadge task={t} />
      </div>
      <strong>{t.titre} <RecurIcon task={t} /> <DocPollIcons task={t} /> <EtiquettesTag task={t} /> <PourInfoTag task={t} /> <APrendreTag task={t} /></strong>
      <TicketTag task={t} />
      <Linked t={t} />
      {t.remarque && <small className="muted clip">{t.remarque}</small>}
      <div className="tcard-bottom">
        <span className="avatars">{t.responsables.map((id) => <Avatar key={id} id={id} size={24} />)}</span>
        <span className={late ? 'late-text' : 'muted'}>
          <LinkIcon task={t} /> {fmtDate(t.delai)} {late ? `(${-n} j de retard)` : n === 0 ? "(aujourd'hui)" : n > 0 && n <= 7 ? `(J-${n})` : ''}
        </span>
      </div>
      {aPrendre && (
        <div className="a-prendre-tap" onClick={(e) => e.stopPropagation()}>
          {decline && <small className="muted"><Icone n="refuser" /> Tu as répondu « Pas dispo ».</small>}
          <button className={`btn small ${decline ? '' : 'primary'}`} disabled={prise} onClick={() => repondre(true)}><Icone n="main" /> Je m’en charge{decline ? ' quand même' : ''}</button>
          {!decline && <button className="btn small" disabled={prise} onClick={() => repondre(false)}><Icone n="refuser" /> Pas dispo</button>}
        </div>
      )}
      {onVu && <BoutonVu onVu={onVu} />}
      {editable && (
        <div className="status-tap" onClick={(e) => e.stopPropagation()}>
          {data.statuses.map((s) => (
            <button key={s.id} className={t.statusId === s.id ? 'on' : ''} style={t.statusId === s.id ? { background: s.couleur, borderColor: s.couleur } : {}} onClick={() => onStatus(t, s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Repères : « ↳ point » pour un point rattaché à un autre, « x/y points rattachés » pour un point qui en a ; en cascade,
 * un point peut avoir les deux.
 */
export function Linked({ t }: { t: Task }) {
  const { data } = useStore();
  const parent = parentOf(data, t);
  const kids = childrenOf(data, t.id);
  if (!parent && !kids.length) return null;
  const done = kids.filter((k) => isDone(data, k)).length;
  return (
    <>
      {parent && <small className="linked-to" title={`Point rattaché à « ${parent.titre} »`}>↳ {parent.titre}</small>}
      {kids.length > 0 && (
        <small className={`linked-count ${done === kids.length ? 'all' : ''}`} title={`${kids.length} point(s) rattaché(s) à celui-ci, ${done} terminé(s)`}>
          <Icone n="rattacher" /> {done}/{kids.length} points rattachés
        </small>
      )}
    </>
  );
}
