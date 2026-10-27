import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import type { Task } from '../data/types';
import { applyDelaiRef, childrenOf, daysUntil, derniereSeancePassee, estArchivee, fmtDate, fullName, isDone, isLate, newTask, parentOf, recurrenceLabel, today } from '../data/utils';
import { finDeSemaine } from '../data/repetition';
import { sortedMeetings } from '../data/agenda';
import { finAnticipee, versProchaineSeance } from '../data/seances';
import { TaskModal, useAutresCreation } from '../components/FicheTache';
import { CircuitPaiements, SuiviCentral } from '../components/Tickets';
import { AnciennesTaches, useAnciennesTaches } from '../components/AnciennesTaches';
import { GENRES, genreDe } from '../data/paiements';
import { nomAppli } from '../data/nomAppli';
import { APrendreTag, Avatar, DocPollIcons, Empty, LinkIcon, PourInfoTag, ProposalTag, RecurIcon, StatusBadge, TicketTag } from '../components/ui';
import { PourInfoRecues } from '../components/PourInfo';
import { Chez } from '../data/entites';
import { attendDesVus, bilanVu, pourMoi } from '../data/pourInfo';
import { useSuiviPourInfo } from '../data/suiviPourInfo';
import { pasDispo as aDecline, peutPrendre } from '../data/aPrendre';
import { PageIntro } from '../components/Nav';
import { AvisLien } from '../components/EnvoyerLien';
import { useClubOptional } from '../data/club';
import { editionDe, evenementsDependants, tacheDeLEvenement } from '../data/externes';
import { Icone } from '../components/icones';
import { Deroulante } from '../components/Deroulante';
import { PastilleEntite } from '../components/IconesEntite';

type SortKey = 'section' | 'sousSection' | 'titre' | 'responsable' | 'statut' | 'delai';

const EMPTY_FILTERS = { q: '', entite: '', section: '', sous: '', resp: '', statut: '', event: '', meeting: '', delai: '', parent: '', type: '' };

export function Tasks() {
  // Vue « moi » : avec les tâches de mes autres entités (pastille de leur entité ; filtre « Entité »).
  const { dataMoi: data, user, can, canSeeTask, canEditTask, creatableSections, prefs, setPrefs, saveTask, pourInfo } = useStore();
  // Nouvelle tâche : aussi dans l'une de mes autres entités (choisie dans la fenêtre).
  const autresCreation = useAutresCreation();
  const [params] = useSearchParams();
  const [scope, setScope] = useState<'mes' | 'toutes'>(
    params.get('statut') || params.get('delai') ? 'mes' : params.get('event') || params.get('meeting') || params.get('resp') || params.get('parent') || params.get('type') ? 'toutes' : prefs.vueDefaut,
  );
  const [f, setF] = useState({
    ...EMPTY_FILTERS,
    entite: params.get('entite') ?? '',
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
  // …&email=<id> ouvre en plus l'email programmé à envoyer, …&discussion=1 sa discussion (💬). Lien envoyé (WhatsApp…, entité en u : lienPartage.ts) : seulement
  // une tâche que la personne voit dans sa liste.
  const lienTache = params.get('tache');
  const ouvrable = (x: Task) => x.id === lienTache && (!params.get('u') || canSeeTask(x));
  const depuisLien = () => ({ isNew: false, email: params.get('email') ?? undefined, discussion: params.has('discussion') });
  const [edit, setEdit] = useState<{ task: Task; isNew: boolean; email?: string; discussion?: boolean } | null>(() => {
    const t = data.tasks.find(ouvrable);
    return t ? { task: t, ...depuisLien() } : null;
  });
  // Tâche partagée par une autre entité : elle arrive un peu après l'ouverture de l'appli ; on l'ouvre alors.
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
  // Anciennes tâches des entités qui dépendent depuis peu de l'entité ouverte (lecture et copie).
  const anciennes = useAnciennesTaches();
  // Événements qui dépendent de l'entité ouverte (filtre « Tous événements », nouvelle tâche liée à l'un d'eux).
  const club = useClubOptional();
  const dependants = club ? evenementsDependants(club.units, club.current) : [];
  const lienEvenement = (v: string): Partial<Task> => {
    if (!v.startsWith('u:')) return { eventId: v || undefined };
    const u = dependants.find((x) => x.id === v.slice(2));
    return u ? { evenementEntite: editionDe(u) } : {};
  };
  // Nouvelle tâche : pour la séance filtrée (le jour même), liée à l'événement filtré ; sans filtre, pour la prochaine séance.
  const nouvelleTache = () =>
    applyDelaiRef(
      data,
      newTask(
        user!.id,
        f.meeting
          ? { ...lienEvenement(f.event), meetingId: f.meeting, delaiRef: { type: 'meeting', joursAvant: 0 } }
          : f.event ? lienEvenement(f.event) : versProchaineSeance(data.meetings, undefined, club?.current.type),
      ),
    );
  const [voirAnciennes, setVoirAnciennes] = useState(false);
  // Tâches d'autres entités pour info (lecture seule) ; lien d'une notification : /taches?pourinfo=<entité>:<tâche>.
  const [voirPourInfo, setVoirPourInfo] = useState(() => !!params.get('pourinfo'));
  // Reçue par l'une de mes autres entités (…&chez=<entité>) : sa liste, ouverte chez elle.
  const [chezPourInfo, setChezPourInfo] = useState(() => params.get('chez') ?? undefined);
  const fermerPourInfo = () => {
    setVoirPourInfo(false);
    setChezPourInfo(undefined);
    if (params.get('pourinfo')) navigate('/taches', { replace: true });
  };

  const viewAll = can('tasks.viewAll');
  const effScope = viewAll ? scope : 'mes';
  const sectionName = (id: string) => data.sections.find((s) => s.id === id)?.nom ?? '';
  const statusOf = (t: Task) => data.statuses.find((s) => s.id === t.statusId);
  const respNames = (t: Task) => t.responsables.map((id) => fullName(data.people.find((p) => p.id === id))).join(', ');

  const { list, nArchivees } = useMemo(() => {
    if (!user) return { list: [], nArchivees: 0 };
    const q = f.q.trim().toLowerCase();
    let nArchivees = 0;
    const res = data.tasks.filter((t) => {
      // « Mes tâches » : aussi mes demandes de remboursement / paiement, pour en suivre l'état, les tâches pour info et celles
      // qu'on me propose (à prendre, tant qu'il reste une place).
      // Mes « Pour info » pas encore vus : les tâches dont je suis l'auteur ou responsable, que des personnes doivent encore voir.
      if (f.delai === 'pourinfo') {
        if (!(t.createdBy === user.id || t.responsables.includes(user.id)) || !canSeeTask(t) || t.source || t.paiement || !t.pourInfo || !attendDesVus(bilanVu(t, suivi[t.id]))) return false;
      } else if (effScope === 'mes' ? !(t.responsables.includes(user.id) || t.paiement?.demandePar === user.id || pourMoi(t, user.id) || peutPrendre(t, user.id)) : !canSeeTask(t)) return false;
      if (f.type && !(t.paiement && (f.type === 'tickets' || genreDe(t.paiement) === f.type))) return false;
      if (f.entite && (t.source?.uniteId ?? club?.current.id) !== f.entite) return false;
      if (f.section && t.sectionId !== f.section) return false;
      if (f.sous && t.sousSection !== f.sous) return false;
      if (f.resp && !t.responsables.includes(f.resp)) return false;
      if (f.parent && t.id !== f.parent && t.parentId !== f.parent) return false;
      if (f.statut === 'retard' ? !isLate(data, t) : f.statut && t.statusId !== f.statut) return false;
      // « u:<entité> » : un événement qui dépend du comité (tâches partagées par lui, ou liées à lui).
      if (f.event && (f.event.startsWith('u:') ? !tacheDeLEvenement(t, f.event.slice(2)) : t.eventId !== f.event)) return false;
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
      // Archives : les tâches archivées seules ; sinon, elles sont comptées et retirées.
      const archivee = estArchivee(data, t, seancePassee);
      if (archivee) nArchivees++;
      if (archives) return archivee;
      if (archivee) return false;
      return !(hideDone && view !== 'kanban' && !f.statut && isDone(data, t));
    });
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
    return { list: res.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir), nArchivees };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, user, effScope, f, sort, hideDone, view, archives, seancePassee, suivi]);

  // Filtre « Toutes séances » : les séances à venir et celles qui ont encore des tâches dans la liste (archives : celles
  // de leurs tâches) ; pas les anciennes séances, dont les tâches terminées sont archivées.
  const seancesFiltre = useMemo(() => {
    const liees = new Set(data.tasks.filter((t) => t.meetingId && estArchivee(data, t, seancePassee) === archives).map((t) => t.meetingId));
    return sortedMeetings(data).filter((m) => (!archives && m.date >= today()) || liees.has(m.id) || m.id === f.meeting);
  }, [data, seancePassee, archives, f.meeting]);

  if (!user) return null;
  const sec = data.sections.find((s) => s.id === f.section);
  // Sous-sections de la section, et celles de ses tâches hors de la liste (ex. section d'une entité à qui elles sont attribuées).
  const sousDe = (x?: typeof sec) =>
    x ? [...new Set([...x.sousSections, ...data.tasks.filter((t) => t.sectionId === x.id && t.sousSection).map((t) => t.sousSection)])] : [];
  const activeFilters = Object.entries(f).filter(([, v]) => v).length;
  // Filtre « Entité » : l'entité ouverte et celles des tâches d'ailleurs (mes autres entités, partagées).
  const entites = club ? [club.current, ...club.units.filter((u) => u.id !== club.current.id && data.tasks.some((t) => t.source?.uniteId === u.id))] : [];

  const setStatus = (t: Task, statusId: string) => {
    if (t.statusId === statusId || !canEditTask(t) || t.paiement) return; // remboursement / paiement : suit son circuit
    const q = finAnticipee(data, t, { ...t, statusId });
    if (q && !confirm(q)) return;
    saveTask({ ...t, statusId }, false);
  };

  const exportCsv = () => {
    const head = ['Section', 'Sous-section', 'Tâche', 'Tâche principale', 'Responsable(s)', 'Statut', 'Délai', 'En retard', 'Événement', 'Séance', 'Répétition', 'Remarque', 'Sous-tâches'];
    const subs = (t: Task) => t.checklist.map((c) => `${c.done ? '☑' : '☐'} ${c.label}`).join(' | ');
    const rows = list.map((t) => [
      sectionName(t.sectionId), t.sousSection, t.titre, parentOf(data, t)?.titre ?? '', respNames(t), statusOf(t)?.label ?? '', t.delai, isLate(data, t) ? 'oui' : '',
      data.events.find((e) => e.id === t.eventId)?.nom ?? '', data.meetings.find((m) => m.id === t.meetingId)?.titre ?? '', t.seanceComite?.titre ?? '', t.evenementEntite?.nom ?? '', recurrenceLabel(t.recurrence), t.remarque, subs(t),
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
        <h1>{archives ? '🗄 Tâches archivées' : 'Tâches'} <span className="count">{list.length}</span></h1>
        <div className="actions">
          {viewAll && (
            <div className="seg">
              <button className={effScope === 'mes' ? 'on' : ''} onClick={() => setScope('mes')}>Mes tâches</button>
              <button className={effScope === 'toutes' ? 'on' : ''} onClick={() => setScope('toutes')}>Toutes</button>
            </div>
          )}
          <div className="seg hide-mobile">
            <button className={view === 'tableau' ? 'on' : ''} onClick={() => setPrefs({ affichage: 'tableau' })}>Tableau</button>
            <button className={view === 'kanban' ? 'on' : ''} onClick={() => setPrefs({ affichage: 'kanban' })}>Kanban</button>
          </div>
          <button className="btn" onClick={() => setShowFilters(!showFilters)}>Filtres{activeFilters ? ` (${activeFilters})` : ''}</button>
          {(archives || nArchivees > 0) && (
            <button className={`btn ${archives ? 'primary' : ''}`} title="Tâches terminées au plus tard le jour du dernier comité passé" onClick={() => setArchives(!archives)}>
              {archives ? '← Tâches en cours' : <><Icone n="archives" /> Archives ({nArchivees})</>}
            </button>
          )}
          {(pourInfo.length > 0 || voirPourInfo) && <button className="btn" title="Tâches d’autres entités du club, pour que tu sois au courant" onClick={() => setVoirPourInfo(true)}><Icone n="voir" /> Pour info ({pourInfo.length})</button>}
          {!!anciennes?.length && <button className="btn" title="Tâches d’avant le changement de dépendance d’une entité : à consulter et copier" onClick={() => setVoirAnciennes(true)}><Icone n="anciennes" /> Anciennes tâches ({anciennes.length})</button>}
          <button className="btn hide-mobile" onClick={exportCsv}>Export CSV</button>
          <button className="btn hide-mobile" onClick={() => window.print()}>Imprimer</button>
          {(creatableSections().length > 0 || autresCreation.length > 0) && <button className="btn primary" onClick={() => setEdit({ task: nouvelleTache(), isNew: true })}>+ Nouvelle tâche</button>}
        </div>
      </div>
      <PageIntro />
      {lienTache && (
        <AvisLien
          trouve={!!edit}
          nom="une tâche"
          introuvable="Tâche introuvable : elle a peut-être été supprimée, ou ton rôle ne te permet pas de la voir."
          chemin={`/taches?tache=${encodeURIComponent(lienTache)}`}
        />
      )}

      <div className={`filters ${showFilters ? 'open' : ''}`}>
        <input className="search" placeholder="🔍 Rechercher…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        {entites.length > 1 && (
          <select value={f.entite} onChange={(e) => setF({ ...f, entite: e.target.value })} aria-label="Entité">
            <option value="">Toutes entités</option>
            {entites.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
          </select>
        )}
        <select value={f.section} onChange={(e) => setF({ ...f, section: e.target.value, sous: '' })}>
          <option value="">Toutes sections</option>
          {data.sections.filter((s) => effScope === 'mes' || can('tasks.viewAll', s.id)).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
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
        {dependants.length > 0 ? (
          <Deroulante
            value={f.event}
            onChange={(v) => setF({ ...f, event: v })}
            aria-label="Événement"
            options={[
              { value: '', label: 'Tous événements' },
              { groupe: `Événements de « ${club?.current.nom ?? ''} »`, options: data.events.map((e) => ({ value: e.id, label: e.nom })) },
              { groupe: 'Qui dépendent de ce comité', options: dependants.map((u) => ({ value: `u:${u.id}`, label: u.nom, icone: <PastilleEntite u={u} /> })) },
            ]}
          />
        ) : (
          <select value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })}>
            <option value="">Tous événements</option>
            {data.events.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        )}
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
          <option value="recurrente">🔁 Tâches récurrentes</option>
          <option value="email">📧 Avec email programmé</option>
          <option value="principale">🧩 Tâches principales</option>
          <option value="liee">↳ Tâches rattachées</option>
          <option value="pourinfo">👁 Mes « Pour info » pas encore vus</option>
        </select>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="">Tâches et paiements</option>
          <option value="tickets">💰 Paiements et remboursements</option>
          <option value="remboursement">{GENRES.remboursement.icon} Remboursements</option>
          <option value="facture">{GENRES.facture.icon} Paiements de factures</option>
        </select>
        <select value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}>
          <option value="">Toutes tâches principales</option>
          {data.tasks.filter((t) => childrenOf(data, t.id).length).map((t) => <option key={t.id} value={t.id}>🧩 {t.titre}</option>)}
        </select>
        {!archives && <label className="inline hide-toggle" title="Les terminées restent affichées jusqu’au prochain comité, puis sont archivées"><input type="checkbox" checked={hideDone} onChange={() => setHideDone(!hideDone)} /> Masquer les terminées</label>}
        {activeFilters > 0 && <button className="btn link" onClick={() => setF(EMPTY_FILTERS)}>Effacer</button>}
      </div>

      {archives && seancePassee && (
        <p className="archives-note">
          🗄 Tâches terminées au plus tard le jour du dernier comité passé (« {seancePassee.titre} », {fmtDate(seancePassee.date)}). Rien n’est effacé : une tâche rouverte revient dans la liste.
        </p>
      )}

      {f.type && <CircuitPaiements total={list.length > 1 ? list.reduce((n, t) => n + (t.paiement?.montant ?? 0), 0) : undefined} />}

      <p className="print-only">{nomAppli()} – export du {fmtDate(new Date().toISOString().slice(0, 10))} – {list.length} tâches</p>

      {list.length === 0 ? (
        <Empty>Aucune tâche ne correspond.</Empty>
      ) : view === 'tableau' ? (
        <>
          <table className="table desktop-only">
            <thead>
              <tr>
                <Th k="section">Section</Th>
                <Th k="sousSection">Sous-section</Th>
                <Th k="titre">Tâche</Th>
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
                    <strong>{t.titre}</strong> <RecurIcon task={t} /> <DocPollIcons task={t} /> <ProposalTag task={t} /> <PourInfoTag task={t} /> <APrendreTag task={t} /> <TicketTag task={t} />
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
                    <strong>{t.titre} <RecurIcon task={t} /> <DocPollIcons task={t} /> <ProposalTag task={t} /> <PourInfoTag task={t} /> <APrendreTag task={t} /></strong>
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

      {effScope === 'mes' && <SuiviCentral />}
      {edit && <TaskModal task={edit.task} isNew={edit.isNew} choixEntite={edit.isNew} openEmailId={edit.email} ouvrirDiscussion={edit.discussion} onClose={closeEdit} />}
      {voirAnciennes && anciennes && <AnciennesTaches list={anciennes} onClose={() => setVoirAnciennes(false)} />}
      {voirPourInfo && (
        <Chez id={chezPourInfo}>
          <PourInfoDe ouverte={params.get('pourinfo') ?? undefined} discussion={params.has('discussion')} onClose={fermerPourInfo} />
        </Chez>
      )}
    </div>
  );
}

/** « ✓ Vu » d'une tâche pour info (accueil) : elle n'y figure plus. */
export const BoutonVu = ({ onVu }: { onVu: () => void }) => (
  <div className="pour-info-vu" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <button className="btn small" onClick={onVu} title="Je suis au courant : son auteur le voit, et elle quitte l’accueil (elle reste dans les tâches)">
      <Icone n="ok" /> Vu
    </button>
  </div>
);

/** `onVu` : tâche « pour info » de l'accueil, que l'on retire avec « ✓ Vu ». */
export function TaskCard({ t, onOpen, onStatus, onVu }: { t: Task; onOpen: () => void; onStatus: (t: Task, s: string) => void; onVu?: () => void }) {
  const { dataMoi: data, user, canEditTask, prendreTache, pasDispo, setToast } = useStore();
  const [prise, setPrise] = useState(false);
  const editable = canEditTask(t) && !t.paiement; // remboursement / paiement : suit son circuit
  // Tâche à prendre qu'on me propose : « Je m'en charge » ou « Pas dispo » directement sur la carte. Après « Pas dispo », elle
  // reste dans « Mes tâches » tant qu'il y a une place, pour changer d'avis (plus à l'accueil ni dans les notifications).
  const aPrendre = peutPrendre(t, user?.id) && !isDone(data, t);
  const decline = aDecline(t, user?.id);
  const repondre = (prend: boolean) => {
    setPrise(true);
    (prend ? prendreTache : pasDispo)(t)
      .then(() => setToast(prend ? `Tu t’en charges : « ${t.titre} »` : `C’est noté : pas dispo pour « ${t.titre} ». La personne qui te l’a proposée est prévenue.`))
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
      <strong>{t.titre} <RecurIcon task={t} /> <DocPollIcons task={t} /> <ProposalTag task={t} /> <PourInfoTag task={t} /> <APrendreTag task={t} /></strong>
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

/** Repères : « ↳ tâche principale » pour une tâche liée, « x/y tâches rattachées » pour une tâche principale. */
export function Linked({ t }: { t: Task }) {
  const { dataMoi: data } = useStore();
  const parent = parentOf(data, t);
  const kids = childrenOf(data, t.id);
  if (parent) return <small className="linked-to" title={`Tâche rattachée à « ${parent.titre} »`}>↳ {parent.titre}</small>;
  if (!kids.length) return null;
  const done = kids.filter((k) => isDone(data, k)).length;
  return (
    <small className={`linked-count ${done === kids.length ? 'all' : ''}`} title={`${kids.length} tâche(s) rattachée(s), ${done} terminée(s)`}>
      <Icone n="rattacher" /> {done}/{kids.length} tâches rattachées
    </small>
  );
}

/** Tâches pour info reçues par l'entité (l'ouverte, ou l'une de mes autres : Chez). */
function PourInfoDe(props: { ouverte?: string; discussion?: boolean; onClose: () => void }) {
  const { pourInfo } = useStore();
  return <PourInfoRecues list={pourInfo} {...props} />;
}
