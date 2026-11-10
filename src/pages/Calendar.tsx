import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, Etiquette, Meeting, Poll, Task } from '../data/types';
import { addDays, diffDays, fmtDate, fmtRange, isDone, isLate, newTask, parentOf, today } from '../data/utils';
import { isOpen, sondagesVisibles } from '../data/polls';
import { TaskModal } from '../components/FicheTache';
import { Avatar, StatusBadge } from '../components/ui';
import { MeetingModal, newMeeting, useAgendaActions } from './Agenda';
import { ChoixPortee, EventModal, newEvent, useEventActions } from '../components/EventModal';
import { Chronologie, type CibleChrono } from '../components/Chronologie';
import { aLaDate, duree, fmtHeure, horaire, libelleRepetition, occurrencesEntre } from '../data/repetition';
import type { Portee } from '../data/series';
import { titreSelonDate } from '../data/seances';
import { PageIntro } from '../components/Nav';
import { motSeance } from '../data/seances';
import { Icone, type IconeNom } from '../components/icones';
import { ExportAgenda } from '../components/ExportAgenda';
import { etiquettesDatees } from '../data/agendaIcs';
import { nomAvecSerie, serieDe } from '../data/seriesEvenements';

// Onglet « Agenda » : vue mensuelle des séances, événements, délais des tâches et fins de sondage.
// Un « + » sur chaque jour pour ajouter une séance, une tâche ou un événement ; glisser-déposer pour changer une date.
// Les étiquettes « événement » datées (Bruntrutaine, soirée…) y figurent à leur couleur ; un clic ouvre la chronologie de
// leurs points (comme un événement, pour qui ne gère pas les événements ; les autres l'ouvrent depuis sa fiche).

type Kind = 'meeting' | 'event' | 'task' | 'poll' | 'etiquette';
type Item =
  | { kind: 'meeting'; key: string; date: string; m: Meeting }
  /** `o` : premier jour de l'occurrence (événement qui se répète : l'une d'elles). */
  | { kind: 'event'; key: string; date: string; e: ClubEvent; o: string }
  | { kind: 'task'; key: string; date: string; t: Task }
  | { kind: 'poll'; key: string; date: string; p: Poll }
  /** Étiquette « événement » datée : chacun de ses jours. */
  | { kind: 'etiquette'; key: string; date: string; et: Etiquette };

const ICONE: Record<Kind, IconeNom> = { meeting: 'seances', event: 'evenements', task: 'taches', poll: 'sondage', etiquette: 'etiquette' };
const KINDS: { id: Kind; label: string }[] = [
  { id: 'meeting', label: 'Séances' },
  { id: 'event', label: 'Événements' },
  { id: 'etiquette', label: 'Étiquettes' },
  { id: 'task', label: 'Points' },
  { id: 'poll', label: 'Sondages' },
];
const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

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
  const { saveMeeting } = useAgendaActions();
  const { saveEvent, saveOccurrence } = useEventActions();
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthOf(today()));
  const [selected, setSelected] = useState(today());
  const [kinds, setKinds] = useState<Kind[]>(['meeting', 'event', 'etiquette', 'task', 'poll']);
  const [scope, setScope] = useState<'mes' | 'toutes'>(prefs.vueDefaut);
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [drag, setDrag] = useState<Item | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [task, setTask] = useState<{ t: Task; isNew: boolean } | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [event, setEvent] = useState<{ e: ClubEvent; jour?: string } | null>(null);
  const [chrono, setChrono] = useState<CibleChrono | null>(null);
  // Occurrence d'un événement qui se répète glissée sur un autre jour : celle-ci, les suivantes ou toutes ?
  const [deplace, setDeplace] = useState<{ serie: ClubEvent; jour: string; date: string } | null>(null);
  const [exporter, setExporter] = useState(false);

  // Ferme le petit menu « + » au clic ailleurs.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const sondages = sondagesVisibles(data.polls ?? [], user?.id, can('polls.manage'));
  const seeMeetings = can('tab.meetings');
  const seeEvents = can('tab.events');
  const addMeeting = can('meetings.manage');
  const addEvent = can('events.manage');
  const [nouveau, setNouveau] = useState<{ kind: 'meeting' | 'event'; date: string } | null>(null);
  const addTask = creatableSections().length > 0;
  const viewAll = can('tasks.viewAll');
  // Étiquettes « événement » datées : toutes avec le droit « Événements », sinon celles dont je suis membre.
  // Celle d'un événement de l'agenda : l'événement suffit (sauf pour qui ne voit pas les événements, membre de l'étiquette).
  const etiquettes = etiquettesDatees(data.etiquettes).filter((e) => (seeEvents ? !e.eventId : !!user && e.membres?.includes(user.id)));
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
    // Événement sur plusieurs jours : une case par jour (31 au plus) ; qui se répète : chaque occurrence du mois affiché.
    if (seeEvents && kinds.includes('event'))
      data.events.forEach((e) => {
        const n = Math.min(duree(e), 30);
        for (const o of occurrencesEntre(e, from, to))
          for (let i = 0; i <= n; i++) push({ kind: 'event', key: `${e.id}@${o}:${i}`, date: addDays(o, i), e, o });
      });
    if (kinds.includes('etiquette'))
      etiquettes.forEach((et) => {
        const n = Math.min(duree({ date: et.date!, dateFin: et.dateFin }), 30);
        for (let i = 0; i <= n; i++) push({ kind: 'etiquette', key: `et-${et.id}:${i}`, date: addDays(et.date!, i), et });
      });
    if (kinds.includes('poll'))
      sondages.forEach((p) => p.dateLimite && (isOpen(p) || showDone) && push({ kind: 'poll', key: p.id, date: p.dateLimite, p }));
    for (const t of data.tasks) {
      if (!visible(t)) continue;
      if (kinds.includes('task') && t.delai) push({ kind: 'task', key: t.id, date: t.delai, t });
    }
    // Par genre ; séances et événements : toute la journée d'abord, puis par heure.
    const rank: Record<Kind, number> = { meeting: 0, etiquette: 1, event: 2, poll: 3, task: 4 };
    const heure = (it: Item) => (it.kind === 'meeting' ? it.m.heure : it.kind === 'event' ? it.e.heure : it.kind === 'poll' ? it.p.heureLimite : '') ?? '';
    map.forEach((list) => list.sort((a, b) => rank[a.kind] - rank[b.kind] || heure(a).localeCompare(heure(b))));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (kind === 'meeting' || kind === 'event') setNouveau({ kind, date });
    else setTask({ t: newTask(user.id, { delai: date }), isNew: true });
  };
  const addChoices = [
    addMeeting && { kind: 'meeting' as const, label: 'Séance de comité' },
    addTask && { kind: 'task' as const, label: 'Point' },
    addEvent && { kind: 'event' as const, label: 'Événement' },
  ].filter(Boolean) as { kind: 'meeting' | 'task' | 'event'; label: string }[];

  const open = (it: Item) => {
    if (it.kind === 'task') setTask({ t: it.t, isNew: false });
    else if (it.kind === 'meeting') {
      if (addMeeting) setMeeting(it.m);
      else navigate(`/comite?seance=${encodeURIComponent(it.m.id)}`);
    }
    else if (it.kind === 'event') (addEvent ? setEvent({ e: it.e, jour: it.e.repetition ? it.o : undefined }) : setChrono({ serie: it.e, date: it.o }));
    // Étiquette « événement » : la chronologie de ses points.
    else if (it.kind === 'etiquette') setChrono({ date: it.et.date!, etiquette: it.et });
    else navigate(`/sondages?id=${encodeURIComponent(it.p.id)}`);
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
      setToast(`${titre} déplacé au ${when}${n ? ` · le délai de ${n} point(s) suit` : ''}`);
    } else if (it.kind === 'event') {
      // Glisser un des jours déplace tout l'événement (qui se répète : on demande lesquels).
      const debut = addDays(it.o, diffDays(it.date, date));
      if (it.e.repetition) return setDeplace({ serie: it.e, jour: it.o, date: debut });
      const x = aLaDate(it.e, debut);
      saveEvent(x);
      setToast(`${it.e.nom} déplacé au ${fmtRange(x.date, x.dateFin)}`);
    } else if (it.kind === 'task') {
      if (it.t.delaiRef && !confirm(`Le délai de « ${it.t.titre} » suit une séance ou un événement. Le fixer au ${when} retire ce lien. Continuer ?`)) return;
      saveTask({ ...it.t, delai: date, delaiRef: undefined }, false);
      setToast(`« ${it.t.titre} » : délai au ${when}`);
    }
  };

  const chipText = (it: Item) => {
    switch (it.kind) {
      case 'meeting': return `${it.m.heure ? it.m.heure.replace(':', 'h') + ' ' : ''}${it.m.titre}`;
      case 'event': {
        // L'heure de début le premier jour : « 12h30 Entraînement ».
        const n = duree(it.e) + 1;
        const i = diffDays(it.o, it.date) + 1;
        return `${i === 1 && it.e.heure ? `${fmtHeure(it.e.heure)} ` : ''}${it.e.nom}${n > 1 ? ` (${i}/${n})` : ''}`;
      }
      case 'task': return it.t.titre;
      case 'poll': return `Fin : ${it.p.question}`;
      case 'etiquette': {
        const n = duree({ date: it.et.date!, dateFin: it.et.dateFin }) + 1;
        const i = diffDays(it.et.date!, it.date) + 1;
        return `${it.et.nom}${n > 1 ? ` (${i}/${n})` : ''}`;
      }
    }
  };
  const chipTitle = (it: Item) => {
    switch (it.kind) {
      case 'meeting': return `Séance : ${it.m.titre}${it.m.heure ? ` à ${it.m.heure.replace(':', 'h')}` : ''} · ${it.m.lieu || 'lieu à définir'}`;
      case 'event': {
        const x = aLaDate(it.e, it.o);
        return `Événement : ${[nomAvecSerie(data, it.e), fmtRange(x.date, x.dateFin), horaire(x), it.e.lieu, it.e.repetition && libelleRepetition(it.e)].filter(Boolean).join(' · ')}`;
      }
      case 'task': {
        const p = parentOf(data, it.t);
        return `Point : ${it.t.titre} · ${data.statuses.find((s) => s.id === it.t.statusId)?.label ?? ''}${p ? ` · rattaché à « ${p.titre} »` : ''}`;
      }
      case 'poll': return `Sondage : ${it.p.question} (date limite${it.p.heureLimite ? ` ${it.p.heureLimite.replace(':', 'h')}` : ''})`;
      case 'etiquette': return `Étiquette « ${it.et.nom} » : ${fmtRange(it.et.date, it.et.dateFin)} · un clic ouvre la chronologie de ses points`;
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
      : it.kind === 'etiquette'
        ? ({ '--c': it.et.couleur } as React.CSSProperties)
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
              <button className={effScope === 'mes' ? 'on' : ''} onClick={() => setScope('mes')}>Mes points</button>
              <button className={effScope === 'toutes' ? 'on' : ''} onClick={() => setScope('toutes')}>Tous</button>
            </div>
          )}
          {addChoices.map((c) => (
            <button key={c.kind} className={`btn ${c.kind === 'task' ? 'primary' : ''} hide-mobile`} onClick={() => create(c.kind, selected)}>
              + {c.label}
            </button>
          ))}
          <button className="btn" onClick={() => setExporter(true)} title="Exporter vers mon agenda (fichier .ics)"><Icone n="exporter" /> Exporter</button>
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
          {KINDS.filter((k) => (k.id !== 'meeting' || seeMeetings) && (k.id !== 'event' || seeEvents) && (k.id !== 'etiquette' || etiquettes.length > 0)).map((k) => (
            <button key={k.id} className={`chip small ${kinds.includes(k.id) ? 'on' : ''}`} onClick={() => toggleKind(k.id)}><Icone n={ICONE[k.id]} /> {k.label}</button>
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
                      {addChoices.map((c) => <button key={c.kind} onClick={() => create(c.kind, d)}><Icone n={ICONE[c.kind]} /> {c.label}</button>)}
                    </div>
                  )}
                </div>
                {/* Tout ce qui est ce jour-là : la case garde sa hauteur, la liste défile dedans (pas la page). */}
                <div className="cal-chips">
                  {items.map((it) => (
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
                </div>
              </div>
            );
          })}
        </div>

        <aside className="cal-side panel">
          <h2>{longDate(selected)}</h2>
          {addChoices.length > 0 && (
            <div className="cal-side-add">
              {addChoices.map((c) => <button key={c.kind} className="btn small" onClick={() => create(c.kind, selected)}><Icone n={ICONE[c.kind]} /> {c.label}</button>)}
            </div>
          )}
          {dayItems.length === 0 ? (
            <p className="muted">Rien ce jour-là.</p>
          ) : (
            <ul className="cal-list">
              {dayItems.map((it) => (
                <li key={it.key}>
                  <button className={`cal-row k-${it.kind}`} style={it.kind === 'etiquette' ? chipStyle(it) : undefined} onClick={() => open(it)}>
                    <span className="cal-row-main">
                      <strong className={it.kind === 'task' && isDone(data, it.t) ? 'strike' : ''}>
                        <Icone n={ICONE[it.kind]} /> {chipText(it)}
                      </strong>
                      <small className="muted">
                        {it.kind === 'meeting' && (it.m.lieu || 'Lieu à définir')}
                        {it.kind === 'event' && ([horaire(it.e), it.e.lieu].filter(Boolean).join(' · ') || (!it.e.repetition && 'Événement du club'))}
                        {it.kind === 'event' && it.e.repetition && <>{(horaire(it.e) || it.e.lieu) && ' · '}<Icone n="repetition" /> {libelleRepetition(it.e)}</>}
                        {it.kind === 'event' && serieDe(data, it.e) && <> · <Icone n="serie" /> {serieDe(data, it.e)!.nom}</>}
                        {it.kind === 'task' && (parentOf(data, it.t) ? `↳ ${parentOf(data, it.t)!.titre}` : [data.sections.find((s) => s.id === it.t.sectionId)?.nom, it.t.sousSection].filter(Boolean).join(' › '))}
                        {it.kind === 'poll' && `date limite pour répondre${it.p.heureLimite ? ` à ${it.p.heureLimite.replace(':', 'h')}` : ''}${it.p.clotureAuto === false ? ' (indicative)' : ', clôture automatique'}`}
                        {it.kind === 'etiquette' && `Événement (étiquette) · ${fmtRange(it.et.date, it.et.dateFin)} · ${data.tasks.filter((t) => t.etiquettes?.includes(it.et.id)).length} point(s)`}
                      </small>
                    </span>
                    {it.kind === 'task' && <StatusBadge task={it.t} />}
                    {it.kind === 'task' && <span className="avatars">{it.t.responsables.slice(0, 3).map((id) => <Avatar key={id} id={id} size={22} />)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="cal-hint muted hide-mobile">Astuce : glisse un point, une séance ou un événement sur un autre jour pour changer sa date.</p>
        </aside>
      </div>

      {task && <TaskModal task={task.t} isNew={task.isNew} onClose={() => setTask(null)} />}
      {meeting && <MeetingModal meeting={meeting} onClose={() => setMeeting(null)} />}
      {event && (
        <EventModal
          event={event.e}
          jour={event.jour}
          onClose={() => setEvent(null)}
          onChronologie={() => {
            setChrono({ serie: event.e, date: event.jour ?? event.e.date });
            setEvent(null);
          }}
        />
      )}
      {chrono && <Chronologie cible={chrono} onClose={() => setChrono(null)} />}
      {nouveau?.kind === 'meeting' && <MeetingModal meeting={newMeeting(data.meetings, nouveau.date, motSeance())} onClose={() => setNouveau(null)} />}
      {nouveau?.kind === 'event' && <EventModal event={newEvent(nouveau.date)} onClose={() => setNouveau(null)} />}
      {exporter && (
        <ExportAgenda
          defauts={{ seances: kinds.includes('meeting'), evenements: kinds.includes('event'), taches: kinds.includes('task') ? effScope : 'non', sondages: kinds.includes('poll') }}
          onClose={() => setExporter(false)}
        />
      )}
      {deplace && (
        <ChoixPortee
          action="deplacer"
          onChoisir={(p: Portee) => {
            const { serie, jour, date } = deplace;
            saveOccurrence(serie, jour, aLaDate(serie, date), p);
            setToast(`${serie.nom} déplacé au ${fmtDate(date)}${p === 'une' ? '' : p === 'suivantes' ? ' (et les suivants)' : ' (toute la série)'}`);
            setDeplace(null);
          }}
          onClose={() => setDeplace(null)}
        />
      )}
    </div>
  );
}
