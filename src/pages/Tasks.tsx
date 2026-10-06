import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import type { Task } from '../data/types';
import { childrenOf, daysUntil, fmtDate, fullName, isDone, isLate, parentOf, recurrenceLabel } from '../data/utils';
import { TaskModal, newTask } from '../components/TaskModal';
import { CircuitPaiements, SuiviCentral } from '../components/Tickets';
import { GENRES, genreDe } from '../data/paiements';
import { Avatar, DocPollIcons, Empty, LinkIcon, ProposalTag, RecurIcon, StatusBadge, TicketTag } from '../components/ui';

type SortKey = 'section' | 'sousSection' | 'titre' | 'responsable' | 'statut' | 'delai';

const EMPTY_FILTERS = { q: '', section: '', sous: '', resp: '', statut: '', event: '', meeting: '', delai: '', parent: '', type: '' };

export function Tasks() {
  const { data, user, can, canSeeTask, canEditTask, creatableSections, prefs, setPrefs, saveTask, guest } = useStore();
  const [params] = useSearchParams();
  const [scope, setScope] = useState<'mes' | 'toutes'>(
    params.get('statut') ? (guest ? 'toutes' : 'mes') : params.get('event') || params.get('meeting') || params.get('resp') || params.get('parent') || params.get('type') ? 'toutes' : prefs.vueDefaut,
  );
  const [f, setF] = useState({
    ...EMPTY_FILTERS,
    event: params.get('event') ?? '',
    meeting: params.get('meeting') ?? '',
    resp: params.get('resp') ?? '',
    statut: params.get('statut') ?? '',
    parent: params.get('parent') ?? '',
    type: params.get('type') ?? '',
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'delai', dir: 1 });
  const navigate = useNavigate();
  // Lien depuis une notification : /taches?tache=<id> ouvre directement la tâche.
  // …&email=<id> ouvre en plus l'email programmé à envoyer.
  const [edit, setEdit] = useState<{ task: Task; isNew: boolean; email?: string } | null>(() => {
    const t = data.tasks.find((x) => x.id === params.get('tache'));
    return t ? { task: t, isNew: false, email: params.get('email') ?? undefined } : null;
  });
  const closeEdit = () => {
    setEdit(null);
    if (params.get('tache')) navigate('/taches', { replace: true });
  };

  const [showFilters, setShowFilters] = useState(!!params.get('statut') || !!params.get('type'));
  const [hideDone, setHideDone] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const view = prefs.affichage;

  const viewAll = can('tasks.viewAll');
  const effScope = viewAll ? scope : 'mes';
  const sectionName = (id: string) => data.sections.find((s) => s.id === id)?.nom ?? '';
  const statusOf = (t: Task) => data.statuses.find((s) => s.id === t.statusId);
  const respNames = (t: Task) => t.responsables.map((id) => fullName(data.people.find((p) => p.id === id))).join(', ');

  const list = useMemo(() => {
    if (!user) return [];
    const q = f.q.trim().toLowerCase();
    const res = data.tasks.filter((t) => {
      // « Mes tâches » : aussi mes demandes de remboursement / paiement, pour en suivre l'état.
      if (effScope === 'mes' ? !(t.responsables.includes(user.id) || t.paiement?.demandePar === user.id) : !canSeeTask(t)) return false;
      if (f.type && !(t.paiement && (f.type === 'tickets' || genreDe(t.paiement) === f.type))) return false;
      if (hideDone && view !== 'kanban' && !f.statut && isDone(data, t)) return false;
      if (f.section && t.sectionId !== f.section) return false;
      if (f.sous && t.sousSection !== f.sous) return false;
      if (f.resp && !t.responsables.includes(f.resp)) return false;
      if (f.parent && t.id !== f.parent && t.parentId !== f.parent) return false;
      if (f.statut === 'retard' ? !isLate(data, t) : f.statut && t.statusId !== f.statut) return false;
      if (f.event && t.eventId !== f.event) return false;
      if (f.meeting && t.meetingId !== f.meeting) return false;
      if (f.delai && ['passe', '7', '30'].includes(f.delai) && !t.delai) return false;
      if (f.delai) {
        const n = daysUntil(t.delai);
        if (f.delai === 'passe' && n >= 0) return false;
        if (f.delai === '7' && (n < 0 || n > 7)) return false;
        if (f.delai === '30' && (n < 0 || n > 30)) return false;
        if (f.delai === 'recurrente' && !t.recurrence) return false;
        if (f.delai === 'lie' && !t.delaiRef) return false;
        if (f.delai === 'principale' && !childrenOf(data, t.id).length) return false;
        if (f.delai === 'liee' && !t.parentId) return false;
        if (f.delai === 'email' && !(data.emails ?? []).some((e) => e.taskId === t.id && e.statut === 'programme')) return false;
      }
      if (q && !`${t.titre} ${t.remarque} ${t.sousSection} ${sectionName(t.sectionId)} ${respNames(t)}`.toLowerCase().includes(q)) return false;
      return true;
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
    return res.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, user, effScope, f, sort, hideDone, view]);

  if (!user) return null;
  const sec = data.sections.find((s) => s.id === f.section);
  const activeFilters = Object.entries(f).filter(([, v]) => v).length;

  const setStatus = (t: Task, statusId: string) => {
    if (t.statusId === statusId || !canEditTask(t) || t.paiement) return; // remboursement / paiement : suit son circuit
    saveTask({ ...t, statusId }, false);
  };

  const exportCsv = () => {
    const head = ['Section', 'Sous-section', 'Tâche', 'Tâche principale', 'Responsable(s)', 'Statut', 'Délai', 'En retard', 'Événement', 'Séance', 'Répétition', 'Remarque', 'Sous-tâches'];
    const subs = (t: Task) => t.checklist.map((c) => `${c.done ? '☑' : '☐'} ${c.label}`).join(' | ');
    const rows = list.map((t) => [
      sectionName(t.sectionId), t.sousSection, t.titre, parentOf(data, t)?.titre ?? '', respNames(t), statusOf(t)?.label ?? '', t.delai, isLate(data, t) ? 'oui' : '',
      data.events.find((e) => e.id === t.eventId)?.nom ?? '', data.meetings.find((m) => m.id === t.meetingId)?.titre ?? '', recurrenceLabel(t.recurrence), t.remarque, subs(t),
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
        <h1>Tâches <span className="count">{list.length}</span></h1>
        <div className="actions">
          {viewAll && !guest && (
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
          <button className="btn hide-mobile" onClick={exportCsv}>Export CSV</button>
          <button className="btn hide-mobile" onClick={() => window.print()}>Imprimer</button>
          {creatableSections().length > 0 && <button className="btn primary" onClick={() => setEdit({ task: newTask(user.id, { eventId: f.event || undefined, meetingId: f.meeting || undefined }), isNew: true })}>+ Nouvelle tâche</button>}
        </div>
      </div>

      <div className={`filters ${showFilters ? 'open' : ''}`}>
        <input className="search" placeholder="🔍 Rechercher…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select value={f.section} onChange={(e) => setF({ ...f, section: e.target.value, sous: '' })}>
          <option value="">Toutes sections</option>
          {data.sections.filter((s) => effScope === 'mes' || can('tasks.viewAll', s.id)).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
        <select value={f.sous} disabled={!sec} onChange={(e) => setF({ ...f, sous: e.target.value })}>
          <option value="">Toutes sous-sections</option>
          {sec?.sousSections.map((s) => <option key={s}>{s}</option>)}
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
        <select value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })}>
          <option value="">Tous événements</option>
          {data.events.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
        <select value={f.meeting} onChange={(e) => setF({ ...f, meeting: e.target.value })}>
          <option value="">Toutes séances</option>
          {data.meetings.map((m) => <option key={m.id} value={m.id}>{m.titre}</option>)}
        </select>
        <select value={f.delai} onChange={(e) => setF({ ...f, delai: e.target.value })}>
          <option value="">Tous délais</option>
          <option value="passe">Délai dépassé</option>
          <option value="7">7 prochains jours</option>
          <option value="30">30 prochains jours</option>
          <option value="lie">🔗 Délai lié à un événement / une séance</option>
          <option value="recurrente">🔁 Tâches récurrentes</option>
          <option value="email">📧 Avec email programmé</option>
          <option value="principale">🔗 Tâches principales</option>
          <option value="liee">↳ Tâches liées</option>
        </select>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="">Tâches et paiements</option>
          <option value="tickets">💰 Paiements et remboursements</option>
          <option value="remboursement">{GENRES.remboursement.icon} Remboursements</option>
          <option value="facture">{GENRES.facture.icon} Paiements de factures</option>
        </select>
        <select value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}>
          <option value="">Toutes tâches principales</option>
          {data.tasks.filter((t) => childrenOf(data, t.id).length).map((t) => <option key={t.id} value={t.id}>🔗 {t.titre}</option>)}
        </select>
        <label className="inline hide-toggle"><input type="checkbox" checked={hideDone} onChange={() => setHideDone(!hideDone)} /> Masquer les terminées</label>
        {activeFilters > 0 && <button className="btn link" onClick={() => setF(EMPTY_FILTERS)}>Effacer</button>}
      </div>

      {f.type && <CircuitPaiements total={list.length > 1 ? list.reduce((n, t) => n + (t.paiement?.montant ?? 0), 0) : undefined} />}

      <p className="print-only">Tâches GSA – export du {fmtDate(new Date().toISOString().slice(0, 10))} – {list.length} tâches</p>

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
                    <strong>{t.titre}</strong> <RecurIcon task={t} /> <DocPollIcons task={t} /> <ProposalTag task={t} /> <TicketTag task={t} />
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
                    <strong>{t.titre} <RecurIcon task={t} /> <DocPollIcons task={t} /> <ProposalTag task={t} /></strong>
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

      {effScope === 'mes' && !guest && <SuiviCentral />}
      {edit && <TaskModal task={edit.task} isNew={edit.isNew} openEmailId={edit.email} onClose={closeEdit} />}
    </div>
  );
}

export function TaskCard({ t, onOpen, onStatus }: { t: Task; onOpen: () => void; onStatus: (t: Task, s: string) => void }) {
  const { data, canEditTask } = useStore();
  const editable = canEditTask(t) && !t.paiement; // remboursement / paiement : suit son circuit
  const sectionName = data.sections.find((s) => s.id === t.sectionId)?.nom ?? '';
  const late = isLate(data, t);
  const n = daysUntil(t.delai);
  return (
    <div className={`tcard ${late ? 'late' : ''}`} onClick={onOpen}>
      <div className="tcard-top">
        <small className="muted">{sectionName}{t.sousSection && ` › ${t.sousSection}`}</small>
        <StatusBadge task={t} />
      </div>
      <strong>{t.titre} <RecurIcon task={t} /> <DocPollIcons task={t} /> <ProposalTag task={t} /></strong>
      <TicketTag task={t} />
      <Linked t={t} />
      {t.remarque && <small className="muted clip">{t.remarque}</small>}
      <div className="tcard-bottom">
        <span className="avatars">{t.responsables.map((id) => <Avatar key={id} id={id} size={24} />)}</span>
        <span className={late ? 'late-text' : 'muted'}>
          <LinkIcon task={t} /> {fmtDate(t.delai)} {late ? `(${-n} j de retard)` : n === 0 ? "(aujourd'hui)" : n > 0 && n <= 7 ? `(J-${n})` : ''}
        </span>
      </div>
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

/** Repères : « ↳ tâche principale » pour une tâche liée, « 🔗 x/y » pour une tâche principale. */
export function Linked({ t }: { t: Task }) {
  const { data } = useStore();
  const parent = parentOf(data, t);
  const kids = childrenOf(data, t.id);
  if (parent) return <small className="linked-to" title={`Tâche liée à « ${parent.titre} »`}>↳ {parent.titre}</small>;
  if (!kids.length) return null;
  const done = kids.filter((k) => isDone(data, k)).length;
  return (
    <small className={`linked-count ${done === kids.length ? 'all' : ''}`} title={`${kids.length} tâche(s) liée(s), ${done} terminée(s)`}>
      🔗 {done}/{kids.length} tâches liées
    </small>
  );
}
