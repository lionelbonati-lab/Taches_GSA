import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import type { AgendaClubEvent, ClubEvent, Meeting, OrgUnit, Poll, Task } from '../data/types';
import { useClubOptional } from '../data/club';
import { UNIT_TYPES } from '../data/units';
import { addDays, diffDays, endOf, fmtDate, fmtRange, isDone, isLate, parentOf, today } from '../data/utils';
import { isOpen } from '../data/polls';
import { TaskModal, newTask } from '../components/TaskModal';
import { Avatar, StatusBadge } from '../components/ui';
import { EVENT_FIELDS, ItemModal, MeetingModal, checkEvent, linkedTasksNote, newEvent, newMeeting, useAgendaActions, useMotSeance } from './Agenda';
import { titreSelonDate } from '../data/seances';
import { PageIntro } from '../components/Nav';

// Onglet « Agenda » : vue mensuelle des séances, événements, délais des tâches et fins de sondage.
// Un « + » sur chaque jour pour ajouter une séance, une tâche ou un événement ; glisser-déposer pour changer une date.
// Agenda du club : les événements des autres entités et la prochaine édition des manifestations (sous-comités,
// équipes d'événement) apparaissent dans l'agenda de toutes les entités, à la couleur de l'entité ; chacun choisit
// les entités à afficher (réglage personnel, propre à chaque entité).

type Kind = 'meeting' | 'event' | 'task' | 'poll' | 'manif';
type Item =
  | { kind: 'meeting'; key: string; date: string; m: Meeting }
  | { kind: 'event'; key: string; date: string; e: ClubEvent }
  | { kind: 'task'; key: string; date: string; t: Task }
  | { kind: 'poll'; key: string; date: string; p: Poll }
  /** Agenda du club : prochaine édition d'une manifestation, ou événement d'une autre entité (`e`). */
  | { kind: 'manif'; key: string; date: string; u: OrgUnit; e?: AgendaClubEvent };

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
  const { data, user, can, canSeeTask, canEditTask, creatableSections, prefs, setPrefs, saveTask, setToast } = useStore();
  const club = useClubOptional();
  const { saveMeeting, saveEvent, removeEvent } = useAgendaActions();
  const motSeance = useMotSeance();
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
  // Agenda du club : événements de toutes les entités, lus sur le serveur (relus si une date d'édition change).
  const [clubEvents, setClubEvents] = useState<AgendaClubEvent[]>([]);
  const unitsKey = (club?.units ?? []).map((u) => `${u.id}:${u.date ?? ''}:${u.dateFin ?? ''}:${u.archive ? 1 : 0}`).join();
  useEffect(() => {
    if (!club) return;
    let on = true;
    club.agendaClub().then((r) => on && setClubEvents(r), () => on && setClubEvents([]));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.current.id, unitsKey]);
  // Par entité : ses événements (ceux de l'entité ouverte sont déjà dans son agenda) et sa prochaine édition,
  // sauf si l'un de ses événements tombe déjà à cette date.
  const manifs = useMemo(
    () =>
      (club?.units ?? [])
        .filter((u) => !u.archive)
        .map((u) => {
          const own = u.id === club?.current.id;
          const events = own ? [] : clubEvents.filter((e) => e.uniteId === u.id);
          const edition = (u.type === 'sous-comite' || u.type === 'equipe') && !!u.date && !(own ? data.events : events).some((e) => e.date === u.date);
          return { u, events, edition, own };
        })
        .filter((x) => x.events.length > 0 || x.edition),
    [club?.units, club?.current.id, clubEvents, data.events],
  );
  const masquees = prefs.manifsMasquees ?? [];
  const toggleManif = (id: string) => setPrefs({ manifsMasquees: masquees.includes(id) ? masquees.filter((x) => x !== id) : [...masquees, id] });
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
    // Événement sur plusieurs jours : une case par jour (31 au plus).
    if (seeEvents && kinds.includes('event'))
      data.events.forEach((e) => {
        const n = Math.min(diffDays(e.date, endOf(e)), 30);
        for (let i = 0; i <= n; i++) push({ kind: 'event', key: i ? `${e.id}:${i}` : e.id, date: addDays(e.date, i), e });
      });
    manifs.forEach(({ u, events, edition }) => {
      if (masquees.includes(u.id)) return;
      const span = (key: string, x: { date: string; dateFin?: string }, e?: AgendaClubEvent) => {
        const n = Math.min(diffDays(x.date, endOf(x)), 30);
        for (let i = 0; i <= n; i++) push({ kind: 'manif', key: `${key}:${i}`, date: addDays(x.date, i), u, e });
      };
      if (edition) span(`m-${u.id}`, { date: u.date!, dateFin: u.dateFin });
      events.forEach((e) => span(`c-${u.id}-${e.id}`, e, e));
    });
    if (kinds.includes('poll'))
      (data.polls ?? []).forEach((p) => p.dateLimite && (isOpen(p) || showDone) && push({ kind: 'poll', key: p.id, date: p.dateLimite, p }));
    for (const t of data.tasks) {
      if (!visible(t)) continue;
      if (kinds.includes('task') && t.delai) push({ kind: 'task', key: t.id, date: t.delai, t });
    }
    const rank: Record<Kind, number> = { meeting: 0, manif: 1, event: 2, poll: 3, task: 4 };
    map.forEach((list) => list.sort((a, b) => rank[a.kind] - rank[b.kind]));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, user, days, kinds, effScope, showDone, seeMeetings, seeEvents, canSeeTask, manifs, masquees.join()]);

  if (!user) return null;

  const toggleKind = (k: Kind) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  const goMonth = (ym: string) => {
    setMonth(ym);
    setSelected(monthOf(today()) === ym ? today() : `${ym}-01`);
  };

  const create = (kind: 'meeting' | 'task' | 'event', date: string) => {
    setMenu(null);
    setSelected(date);
    if (kind === 'meeting') setMeeting(newMeeting(data.meetings, date, motSeance));
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
    else if (it.kind === 'manif') navigate(it.u.id === club?.current.id && seeEvents ? '/evenements' : '/organigramme');
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
      // « Comité de mars 2027 » glissé en avril devient « Comité d’avril 2027 ».
      const titre = titreSelonDate(it.m.titre, date) ?? it.m.titre;
      saveMeeting({ ...it.m, date, titre });
      setToast(`🗓️ ${titre} déplacé au ${when}${n ? ` · le délai de ${n} tâche(s) suit` : ''}`);
    } else if (it.kind === 'event') {
      // Glisser un des jours déplace tout l'événement.
      const delta = diffDays(it.date, date);
      const debut = addDays(it.e.date, delta);
      saveEvent({ ...it.e, date: debut, dateFin: it.e.dateFin ? addDays(it.e.dateFin, delta) : undefined });
      setToast(`🎉 ${it.e.nom} déplacé au ${it.e.dateFin ? fmtRange(debut, addDays(it.e.dateFin, delta)) : fmtDate(debut)}`);
    } else if (it.kind === 'task') {
      if (it.t.delaiRef && !confirm(`Le délai de « ${it.t.titre} » suit une séance ou un événement. Le fixer au ${when} retire ce lien. Continuer ?`)) return;
      saveTask({ ...it.t, delai: date, delaiRef: undefined }, false);
      setToast(`✅ « ${it.t.titre} » : délai au ${when}`);
    }
  };

  const chipText = (it: Item) => {
    switch (it.kind) {
      case 'meeting': return `${it.m.heure ? it.m.heure.replace(':', 'h') + ' ' : ''}${it.m.titre}`;
      case 'event': {
        const n = diffDays(it.e.date, endOf(it.e)) + 1;
        return n > 1 ? `${it.e.nom} (${diffDays(it.e.date, it.date) + 1}/${n})` : it.e.nom;
      }
      case 'task': return it.t.titre;
      case 'poll': return `Fin : ${it.p.question}`;
      case 'manif': {
        const x = it.e ?? { date: it.u.date!, dateFin: it.u.dateFin };
        const n = diffDays(x.date, endOf(x)) + 1;
        return `${it.e ? it.e.nom : `🎪 ${it.u.nom}`}${n > 1 ? ` (${diffDays(x.date, it.date) + 1}/${n})` : ''}`;
      }
    }
  };
  const chipTitle = (it: Item) => {
    switch (it.kind) {
      case 'meeting': return `Séance : ${it.m.titre}${it.m.heure ? ` à ${it.m.heure.replace(':', 'h')}` : ''} · ${it.m.lieu || 'lieu à définir'}`;
      case 'event': return `Événement : ${it.e.nom} · ${fmtRange(it.e.date, it.e.dateFin)}${it.e.lieu ? ` · ${it.e.lieu}` : ''}`;
      case 'task': {
        const p = parentOf(data, it.t);
        return `Tâche : ${it.t.titre} · ${data.statuses.find((s) => s.id === it.t.statusId)?.label ?? ''}${p ? ` · liée à « ${p.titre} »` : ''}`;
      }
      case 'poll': return `Sondage : ${it.p.question} (date limite)`;
      case 'manif':
        return it.e
          ? `${it.u.nom} : ${it.e.nom} · ${fmtRange(it.e.date, it.e.dateFin)}${it.e.lieu ? ` · ${it.e.lieu}` : ''}`
          : `Prochaine édition : ${it.u.nom} · ${fmtRange(it.u.date, it.u.dateFin)}`;
    }
  };
  const chipClass = (it: Item) => {
    const late = it.kind === 'task' && isLate(data, it.t);
    const done = it.kind === 'task' && isDone(data, it.t);
    return `cal-chip k-${it.kind}${late ? ' late' : ''}${done ? ' done' : ''}`;
  };
  const chipStyle = (it: Item) =>
    it.kind === 'task'
      ? { borderLeftColor: data.statuses.find((s) => s.id === it.t.statusId)?.couleur }
      : it.kind === 'manif'
        ? ({ '--c': it.u.couleur } as React.CSSProperties)
        : undefined;

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
      <PageIntro />

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
          {manifs.length > 0 && (
            <details className="cal-manifs">
              <summary className={`chip small ${manifs.some((x) => !masquees.includes(x.u.id)) ? 'on' : ''}`}>
                🎪 Agenda du club {manifs.filter((x) => !masquees.includes(x.u.id)).length}/{manifs.length} ▾
              </summary>
              <div className="cal-manifs-panel">
                <small className="muted">Entités dont les dates (prochaine édition, événements) sont affichées dans cet agenda :</small>
                {manifs.map(({ u, events, edition, own }) => (
                  <label key={u.id} className="inline small-check">
                    <input type="checkbox" checked={!masquees.includes(u.id)} onChange={() => toggleManif(u.id)} />
                    <span className="dot" style={{ background: u.couleur }} /> {u.nom}{own ? ' (cette entité)' : ''}{' '}
                    <small className="muted">
                      {[edition && `édition ${fmtRange(u.date, u.dateFin)}`, events.length > 0 && `${events.length} événement${events.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
                    </small>
                  </label>
                ))}
                <div className="row">
                  <button className="btn small" onClick={() => setPrefs({ manifsMasquees: [] })}>Toutes</button>
                  <button className="btn small" onClick={() => setPrefs({ manifsMasquees: manifs.map((x) => x.u.id) })}>Aucune</button>
                </div>
              </div>
            </details>
          )}
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
                      onClick={(e) => { e.stopPropagation(); setSelected(d); if (it.kind !== 'manif') open(it); }}
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
                  <button className={`cal-row k-${it.kind}`} style={it.kind === 'manif' ? chipStyle(it) : undefined} onClick={() => open(it)}>
                    <span className="cal-row-main">
                      <strong className={it.kind === 'task' && isDone(data, it.t) ? 'strike' : ''}>
                        {{ meeting: '🗓️', event: '🎉', task: '✅', poll: '📊', manif: it.kind === 'manif' && it.e ? '🎉' : '' }[it.kind]} {chipText(it)}
                      </strong>
                      <small className="muted">
                        {it.kind === 'meeting' && (it.m.lieu || 'Lieu à définir')}
                        {it.kind === 'event' && (it.e.lieu || 'Événement du club')}
                        {it.kind === 'task' && (parentOf(data, it.t) ? `↳ ${parentOf(data, it.t)!.titre}` : [data.sections.find((s) => s.id === it.t.sectionId)?.nom, it.t.sousSection].filter(Boolean).join(' › '))}
                        {it.kind === 'poll' && 'date limite pour répondre'}
                        {it.kind === 'manif' &&
                          (it.e
                            ? [it.u.nom, fmtRange(it.e.date, it.e.dateFin), it.e.lieu].filter(Boolean).join(' · ')
                            : `${UNIT_TYPES[it.u.type].label}${it.u.id === club?.current.id ? ' (cette entité)' : ''} · prochaine édition ${fmtRange(it.u.date, it.u.dateFin)}`)}
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
      {meeting && <MeetingModal meeting={meeting} onClose={() => setMeeting(null)} />}
      {event && (
        <ItemModal
          title="Événement"
          item={event}
          note={linkedTasksNote(data.tasks, event.id, 'event')}
          fields={EVENT_FIELDS}
          validate={checkEvent}
          onSave={saveEvent}
          onDelete={data.events.some((x) => x.id === event.id) ? removeEvent : undefined}
          onClose={() => setEvent(null)}
        />
      )}
    </div>
  );
}
