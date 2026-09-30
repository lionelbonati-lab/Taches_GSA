import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, Meeting, Poll, Task } from '../data/types';
import { addDays, fmtDate, isDone, isLate, parentOf, today } from '../data/utils';
import { isOpen } from '../data/polls';
import { TaskModal, newTask } from '../components/TaskModal';
import { Avatar, StatusBadge } from '../components/ui';
import { EVENT_FIELDS, ItemModal, MEETING_FIELDS, linkedTasksNote, newEvent, newMeeting, useAgendaActions } from './Agenda';

// Onglet « Agenda » : vue mensuelle des séances, événements, délais des tâches et fins de sondage.
// Un « + » sur chaque jour pour ajouter une séance, une tâche ou un événement ; glisser-déposer pour changer une date.

type Kind = 'meeting' | 'event' | 'task' | 'poll';
type Item =
  | { kind: 'meeting'; key: string; date: string; m: Meeting }
  | { kind: 'event'; key: string; date: string; e: ClubEvent }
  | { kind: 'task'; key: string; date: string; t: Task }
  | { kind: 'poll'; key: string; date: string; p: Poll };

const KINDS: { id: Kind; label: string }[] = [
  { id: 'meeting', label: '🗓️ Séances' },
  { id: 'event', label: '🎉 Événements' },
  { id: 'task', label: '✅ Tâches' },
  { id: 'poll', label: '📊 Sondages' },
];
const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const MAX_CHIPS = 4;

const monthOf = (date: string) => date.slice(0, 7);
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
const dow = (date: string) => (new Date(date + 'T12:00:00').getDay() + 6) % 7; // lundi = 0
/** « jeudi 29 octobre 2026 » (sans la virgule que certains navigateurs ajoutent après le jour). */
function longDate(date: string) {
  const d = new Date(date + 'T12:00:00');
  return `${d.toLocaleDateString('fr-CH', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('fr-CH', { month: 'long' })} ${d.getFullYear()}`;
}

export function Calendar() {
  const { data, user, can, canSeeTask, canEditTask, creatableSections, prefs, saveTask, setToast } = useStore();
  const { saveMeeting, removeMeeting, saveEvent, removeEvent } = useAgendaActions();
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthOf(today()));
  const [selected, setSelected] = useState(today());
  const [kinds, setKinds] = useState<Kind[]>(['meeting', 'event', 'task', 'poll']);
  const [scope, setScope] = useState<'mes' | 'toutes'>(prefs.vueDefaut);
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [drag, setDrag] = useState<Item | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [task, setTask] = useState<{ t: Task; isNew: boolean } | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [event, setEvent] = useState<ClubEvent | null>(null);

  // Ferme le petit menu « + » au clic ailleurs.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const seeMeetings = can('tab.meetings');
  const seeEvents = can('tab.events');
  const addMeeting = can('meetings.manage');
  const addEvent = can('events.manage');
  const addTask = creatableSections().length > 0;
  const viewAll = can('tasks.viewAll');
  const effScope = viewAll ? scope : 'mes';

  // Jours affichés : semaines complètes (lundi → dimanche) couvrant le mois.
  const days = useMemo(() => {
    const first = `${month}-01`;
    const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
    const start = addDays(first, -dow(first));
    const end = addDays(last, 6 - dow(last));
    const out: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    if (!user) return map;
    const from = days[0];
    const to = days[days.length - 1];
    const push = (it: Item) => {
      if (it.date < from || it.date > to) return;
      map.set(it.date, [...(map.get(it.date) ?? []), it]);
    };
    const mine = (t: Task) => t.responsables.includes(user.id);
    const visible = (t: Task) => (effScope === 'mes' ? mine(t) : canSeeTask(t)) && (showDone || !isDone(data, t));
    if (seeMeetings && kinds.includes('meeting')) data.meetings.forEach((m) => push({ kind: 'meeting', key: m.id, date: m.date, m }));
    if (seeEvents && kinds.includes('event')) data.events.forEach((e) => push({ kind: 'event', key: e.id, date: e.date, e }));
    if (kinds.includes('poll'))
      (data.polls ?? []).forEach((p) => p.dateLimite && (isOpen(p) || showDone) && push({ kind: 'poll', key: p.id, date: p.dateLimite, p }));
    for (const t of data.tasks) {
      if (!visible(t)) continue;
      if (kinds.includes('task') && t.delai) push({ kind: 'task', key: t.id, date: t.delai, t });
    }
    const rank: Record<Kind, number> = { meeting: 0, event: 1, poll: 2, task: 3 };
    map.forEach((list) => list.sort((a, b) => rank[a.kind] - rank[b.kind]));
    return map;
  }, [data, user, days, kinds, effScope, showDone, seeMeetings, seeEvents, canSeeTask]);

  if (!user) return null;

  const toggleKind = (k: Kind) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  const goMonth = (ym: string) => {
    setMonth(ym);
    setSelected(monthOf(today()) === ym ? today() : `${ym}-01`);
  };

  const create = (kind: 'meeting' | 'task' | 'event', date: string) => {
    setMenu(null);
    setSelected(date);
    if (kind === 'meeting') setMeeting(newMeeting(data.meetings, date));
    else if (kind === 'event') setEvent(newEvent(date));
    else setTask({ t: newTask(user.id, { delai: date }), isNew: true });
  };
  const addChoices = [
    addMeeting && { kind: 'meeting' as const, label: '🗓️ Séance de comité' },
    addTask && { kind: 'task' as const, label: '✅ Tâche' },
    addEvent && { kind: 'event' as const, label: '🎉 Événement' },
  ].filter(Boolean) as { kind: 'meeting' | 'task' | 'event'; label: string }[];

  const open = (it: Item) => {
    if (it.kind === 'task') setTask({ t: it.t, isNew: false });
    else if (it.kind === 'meeting') (addMeeting ? setMeeting(it.m) : navigate('/comite'));
    else if (it.kind === 'event') (addEvent ? setEvent(it.e) : navigate('/evenements'));
    else navigate(`/sondages?id=${it.p.id}`);
  };

  // ---------- Glisser-déposer : changer la date ----------
  const canMove = (it: Item) =>
    it.kind === 'meeting' ? addMeeting : it.kind === 'event' ? addEvent : it.kind === 'task' ? canEditTask(it.t) : false;
  const move = (it: Item, date: string) => {
    if (it.date === date) return;
    const when = fmtDate(date);
    if (it.kind === 'meeting') {
      const n = data.tasks.filter((t) => t.meetingId === it.m.id && t.delaiRef?.type === 'meeting').length;
      saveMeeting({ ...it.m, date });
      setToast(`🗓️ ${it.m.titre} déplacé au ${when}${n ? ` · le délai de ${n} tâche(s) suit` : ''}`);
    } else if (it.kind === 'event') {
      saveEvent({ ...it.e, date });
      setToast(`🎉 ${it.e.nom} déplacé au ${when}`);
    } else if (it.kind === 'task') {
      if (it.t.delaiRef && !confirm(`Le délai de « ${it.t.titre} » suit une séance ou un événement. Le fixer au ${when} retire ce lien. Continuer ?`)) return;
      saveTask({ ...it.t, delai: date, delaiRef: undefined }, false);
      setToast(`✅ « ${it.t.titre} » : délai au ${when}`);
    }
  };

  const chipText = (it: Item) => {
    switch (it.kind) {
      case 'meeting': return `${it.m.heure ? it.m.heure.replace(':', 'h') + ' ' : ''}${it.m.titre}`;
      case 'event': return it.e.nom;
      case 'task': return it.t.titre;
      case 'poll': return `Fin : ${it.p.question}`;
    }
  };
  const chipTitle = (it: Item) => {
    switch (it.kind) {
      case 'meeting': return `Séance : ${it.m.titre}${it.m.heure ? ` à ${it.m.heure.replace(':', 'h')}` : ''} · ${it.m.lieu || 'lieu à définir'}`;
      case 'event': return `Événement : ${it.e.nom}${it.e.lieu ? ` · ${it.e.lieu}` : ''}`;
      case 'task': {
        const p = parentOf(data, it.t);
        return `Tâche : ${it.t.titre} · ${data.statuses.find((s) => s.id === it.t.statusId)?.label ?? ''}${p ? ` · liée à « ${p.titre} »` : ''}`;
      }
      case 'poll': return `Sondage : ${it.p.question} (date limite)`;
    }
  };
  const chipClass = (it: Item) => {
    const late = it.kind === 'task' && isLate(data, it.t);
    const done = it.kind === 'task' && isDone(data, it.t);
    return `cal-chip k-${it.kind}${late ? ' late' : ''}${done ? ' done' : ''}`;
  };
  const chipStyle = (it: Item) => (it.kind === 'task' ? { borderLeftColor: data.statuses.find((s) => s.id === it.t.statusId)?.couleur } : undefined);

  const dayItems = byDay.get(selected) ?? [];
  const monthLabel = new Date(`${month}-15T12:00:00`).toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });

  return (
    <div className="cal-page">
      <div className="page-head">
        <h1>Agenda</h1>
        <div className="actions">
          {viewAll && (
            <div className="seg">
              <button className={effScope === 'mes' ? 'on' : ''} onClick={() => setScope('mes')}>Mes tâches</button>
              <button className={effScope === 'toutes' ? 'on' : ''} onClick={() => setScope('toutes')}>Toutes</button>
            </div>
          )}
          {addChoices.map((c) => (
            <button key={c.kind} className={`btn ${c.kind === 'task' ? 'primary' : ''} hide-mobile`} onClick={() => create(c.kind, selected)}>
              + {c.label.replace(/^\S+ /, '')}
            </button>
          ))}
        </div>
      </div>

      <div className="cal-bar">
        <div className="cal-nav">
          <button className="btn small" onClick={() => goMonth(shiftMonth(month, -1))} aria-label="Mois précédent">‹</button>
          <strong className="cal-month">{monthLabel}</strong>
          <button className="btn small" onClick={() => goMonth(shiftMonth(month, 1))} aria-label="Mois suivant">›</button>
          {month !== monthOf(today()) && <button className="btn small" onClick={() => goMonth(monthOf(today()))}>Aujourd’hui</button>}
        </div>
        <div className="cal-filters">
          {KINDS.filter((k) => (k.id !== 'meeting' || seeMeetings) && (k.id !== 'event' || seeEvents)).map((k) => (
            <button key={k.id} className={`chip small ${kinds.includes(k.id) ? 'on' : ''}`} onClick={() => toggleKind(k.id)}>{k.label}</button>
          ))}
          <label className="inline small-check"><input type="checkbox" checked={showDone} onChange={() => setShowDone(!showDone)} /> Terminées</label>
        </div>
      </div>

      <div className="cal-layout">
        <div className="cal-grid" role="grid" aria-label={`Agenda ${monthLabel}`}>
          {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const out = monthOf(d) !== month;
            return (
              <div
                key={d}
                role="gridcell"
                aria-label={longDate(d)}
                aria-selected={d === selected}
                className={`cal-day${out ? ' out' : ''}${d === today() ? ' today' : ''}${d === selected ? ' sel' : ''}${over === d ? ' over' : ''}${dow(d) > 4 ? ' we' : ''}`}
                onClick={() => setSelected(d)}
                onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(d); } }}
                onDragLeave={() => setOver((o) => (o === d ? null : o))}
                onDrop={(e) => { e.preventDefault(); if (drag) move(drag, d); setDrag(null); setOver(null); }}
              >
                <div className="cal-day-head">
                  <span className="cal-num">{Number(d.slice(8))}</span>
                  {addChoices.length > 0 && (
                    <button
                      className="cal-add"
                      title="Ajouter ce jour-là"
                      aria-label={`Ajouter le ${fmtDate(d)}`}
                      onClick={(e) => { e.stopPropagation(); if (addChoices.length === 1) create(addChoices[0].kind, d); else setMenu(menu === d ? null : d); }}
                    >
                      +
                    </button>
                  )}
                  {menu === d && (
                    <div className="cal-menu" ref={menuRef} onClick={(e) => e.stopPropagation()}>
                      <small>Ajouter le {fmtDate(d)}</small>
                      {addChoices.map((c) => <button key={c.kind} onClick={() => create(c.kind, d)}>{c.label}</button>)}
                    </div>
                  )}
                </div>
                <div className="cal-chips">
                  {items.slice(0, MAX_CHIPS).map((it) => (
                    <button
                      key={it.key}
                      className={chipClass(it)}
                      style={chipStyle(it)}
                      title={chipTitle(it)}
                      draggable={canMove(it)}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag(it); }}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      onClick={(e) => { e.stopPropagation(); setSelected(d); open(it); }}
                    >
                      {chipText(it)}
                    </button>
                  ))}
                  {items.length > MAX_CHIPS && <span className="cal-more">+{items.length - MAX_CHIPS} autre{items.length - MAX_CHIPS > 1 ? 's' : ''}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="cal-side panel">
          <h2>{longDate(selected)}</h2>
          {addChoices.length > 0 && (
            <div className="cal-side-add">
              {addChoices.map((c) => <button key={c.kind} className="btn small" onClick={() => create(c.kind, selected)}>+ {c.label}</button>)}
            </div>
          )}
          {dayItems.length === 0 ? (
            <p className="muted">Rien ce jour-là.</p>
          ) : (
            <ul className="cal-list">
              {dayItems.map((it) => (
                <li key={it.key}>
                  <button className={`cal-row k-${it.kind}`} onClick={() => open(it)}>
                    <span className="cal-row-main">
                      <strong className={it.kind === 'task' && isDone(data, it.t) ? 'strike' : ''}>
                        {{ meeting: '🗓️', event: '🎉', task: '✅', poll: '📊' }[it.kind]} {chipText(it)}
                      </strong>
                      <small className="muted">
                        {it.kind === 'meeting' && (it.m.lieu || 'Lieu à définir')}
                        {it.kind === 'event' && (it.e.lieu || 'Événement du club')}
                        {it.kind === 'task' && (parentOf(data, it.t) ? `↳ ${parentOf(data, it.t)!.titre}` : [data.sections.find((s) => s.id === it.t.sectionId)?.nom, it.t.sousSection].filter(Boolean).join(' › '))}
                        {it.kind === 'poll' && 'date limite pour répondre'}
                      </small>
                    </span>
                    {it.kind === 'task' && <StatusBadge task={it.t} />}
                    {it.kind === 'task' && <span className="avatars">{it.t.responsables.slice(0, 3).map((id) => <Avatar key={id} id={id} size={22} />)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="cal-hint muted hide-mobile">Astuce : glisse une tâche, une séance ou un événement sur un autre jour pour changer sa date.</p>
        </aside>
      </div>

      {task && <TaskModal task={task.t} isNew={task.isNew} onClose={() => setTask(null)} />}
      {meeting && (
        <ItemModal
          title="Séance de comité"
          item={meeting}
          note={linkedTasksNote(data.tasks, meeting.id, 'meeting')}
          fields={MEETING_FIELDS}
          onSave={saveMeeting}
          onDelete={data.meetings.some((x) => x.id === meeting.id) ? removeMeeting : undefined}
          onClose={() => setMeeting(null)}
        />
      )}
      {event && (
        <ItemModal
          title="Événement"
          item={event}
          note={linkedTasksNote(data.tasks, event.id, 'event')}
          fields={EVENT_FIELDS}
          onSave={saveEvent}
          onDelete={data.events.some((x) => x.id === event.id) ? removeEvent : undefined}
          onClose={() => setEvent(null)}
        />
      )}
    </div>
  );
}
