import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { FULL_AGENDA, meetingContext, selectAgenda, sortedMeetings } from '../data/agenda';
import { committeeOf, isOpen, pollSection, pollSummary } from '../data/polls';
import type { MeetingMinutes, Poll, Task } from '../data/types';
import { fmtDate, fullName, initials, isDone, today, uid } from '../data/utils';
import { NoteField } from '../components/NoteField';
import { TaskModal, newTask } from '../components/TaskModal';

// Onglet « PV » (secrétaire) : reprend l'ordre du jour de la séance, prise de notes sous chaque point,
// mise à jour des tâches pendant la séance, puis génération / validation / envoi du procès-verbal.

const EMPTY: MeetingMinutes = { presents: [], excuses: [], notes: {} };
const shortDate = (d: string) => {
  const [y, m, j] = d.split('-');
  return `${j}.${m}.${y.slice(2)}`;
};
const longDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const nowHM = () => new Date().toTimeString().slice(0, 5);
const hm = (h?: string) => (h ? h.replace(':', 'h') : '');
const letter = (i: number) => {
  let r = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) r = String.fromCharCode(97 + ((n - 1) % 26)) + r;
  return r;
};

export function Minutes() {
  const { data, user, can, canEditTask, saveTask, update, updateSilent } = useStore();
  const [params] = useSearchParams();
  const meetings = useMemo(() => sortedMeetings(data), [data]);
  // Séance par défaut : celle du jour, sinon la prochaine, sinon la dernière.
  const [meetingId, setMeetingId] = useState(
    () =>
      params.get('seance') ??
      meetings.find((m) => m.date === today())?.id ??
      meetings.find((m) => m.date >= today())?.id ??
      meetings[meetings.length - 1]?.id ??
      '',
  );
  const [view, setView] = useState<'saisie' | 'pv'>('saisie');
  const [edit, setEdit] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);

  const s1 = meetings.find((m) => m.id === meetingId);
  const { s0, s2 } = meetingContext(data, s1);
  const m: MeetingMinutes = { ...EMPTY, ...s1?.minutes };
  const committee = committeeOf(data);
  const person = (id: string) => data.people.find((p) => p.id === id);
  const statusLabel = (id: string) => data.statuses.find((x) => x.id === id)?.label ?? '?';
  const titre = s1 ? `Comité ${shortDate(s1.date)}` : 'Comité';
  const secretaire = data.people.find((p) => p.actif && p.roles.includes('secretaire'));

  useEffect(() => {
    if (view !== 'pv') return;
    const before = document.title;
    document.title = `PV ${titre}`;
    return () => {
      document.title = before;
    };
  }, [view, titre]);

  const setMinutes = (fn: (x: MeetingMinutes) => void) =>
    s1 &&
    updateSilent((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      const mm: MeetingMinutes = structuredClone({ ...EMPTY, ...x.minutes });
      fn(mm);
      x.minutes = mm;
    });
  const setNote = (key: string, v: string) =>
    setMinutes((x) => {
      if (v.trim()) x.notes[key] = v;
      else delete x.notes[key];
    });

  // ---------- Points de la séance ----------
  const sel = selectAgenda(data, s0, s1, s2, FULL_AGENDA);
  const bucket = new Map<string, 'late' | 'p1' | 'p2' | 'bilan'>();
  sel.late.forEach((t) => bucket.set(t.id, 'late'));
  sel.avant1.forEach((t) => bucket.set(t.id, 'p1'));
  sel.avant2.forEach((t) => bucket.set(t.id, 'p2'));
  sel.bilan.forEach((t) => bucket.set(t.id, 'bilan'));
  const snapshot = m.snapshot;
  const newTasks = snapshot ? data.tasks.filter((t) => !snapshot[t.id]) : [];
  const deleted = snapshot ? Object.entries(snapshot).filter(([id]) => !data.tasks.some((t) => t.id === id)).map(([, v]) => v.titre) : [];
  // Points affichés : ceux de l'ordre du jour, + ceux présents au début de la séance (même s'ils ont été reportés), + les nouvelles tâches.
  const ids = new Set<string>([...bucket.keys(), ...(m.pointIds ?? []), ...newTasks.map((t) => t.id)]);
  const points = data.tasks.filter((t) => ids.has(t.id));
  const polls = (data.polls ?? []).filter((p) => isOpen(p) || (p.clotureLe ?? p.dateLimite ?? '') >= sel.since);

  const changesOf = (t: Task): string[] => {
    const s = snapshot?.[t.id];
    if (!s) return [];
    const out: string[] = [];
    if (s.statusId !== t.statusId) out.push(`statut : ${statusLabel(s.statusId)} → ${statusLabel(t.statusId)}`);
    if (s.delai !== t.delai) out.push(`délai : ${s.delai ? shortDate(s.delai) : 'libre'} → ${t.delai ? shortDate(t.delai) : 'libre'}`);
    if (s.responsables.join() !== t.responsables.join())
      out.push(`responsable : ${s.responsables.map((id) => initials(person(id))).join(', ') || '—'} → ${t.responsables.map((id) => initials(person(id))).join(', ') || '—'}`);
    if (s.titre !== t.titre) out.push('intitulé modifié');
    return out;
  };
  const isNewTask = (t: Task) => !!snapshot && !snapshot[t.id];

  const meta = (t: Task) => {
    const b = bucket.get(t.id);
    return [
      t.responsables.map((id) => initials(person(id))).join(', '),
      b !== 'bilan' && t.delai && shortDate(t.delai),
      b === 'late' ? '⚠ en retard' : b === 'p2' && s2 ? `pour le ${s2.titre}` : b === 'bilan' ? '✓ fait' : '',
      isNewTask(t) && '🆕 nouvelle',
    ].filter(Boolean) as string[];
  };

  // Regroupement : section → sous-section → tâches (ordre de l'ordre du jour)
  const RANK = { late: 0, p1: 1, p2: 2, bilan: 3 } as const;
  const bySection = data.sections.map((sec) => {
    const tasks = points
      .filter((t) => t.sectionId === sec.id)
      .sort(
        (a, b) =>
          sec.sousSections.indexOf(a.sousSection) - sec.sousSections.indexOf(b.sousSection) ||
          RANK[bucket.get(a.id) ?? 'p1'] - RANK[bucket.get(b.id) ?? 'p1'] ||
          (a.delai || '9999').localeCompare(b.delai || '9999'),
      );
    const subs: { key: string; label: string; tasks: Task[] }[] = [];
    for (const t of tasks) {
      const key = t.sousSection || `__${t.id}`;
      let g = subs.find((x) => x.key === key);
      if (!g) subs.push((g = { key, label: t.sousSection, tasks: [] }));
      g.tasks.push(t);
    }
    return { sec, subs, polls: polls.filter((p) => pollSection(data, p) === sec.id) };
  });
  const orphanPolls = polls.filter((p) => !data.sections.some((x) => x.id === pollSection(data, p)));

  // ---------- Actions de séance ----------
  const start = () =>
    setMinutes((x) => {
      x.heureDebut = x.heureDebut ?? nowHM();
      x.demarreLe = new Date().toISOString();
      x.snapshot = Object.fromEntries(data.tasks.map((t) => [t.id, { statusId: t.statusId, delai: t.delai, responsables: [...t.responsables], titre: t.titre }]));
      x.pointIds = [...bucket.keys()];
    });
  const setPresence = (id: string, kind: 'present' | 'excuse') =>
    setMinutes((x) => {
      const inP = x.presents.includes(id);
      const inE = x.excuses.includes(id);
      x.presents = x.presents.filter((v) => v !== id);
      x.excuses = x.excuses.filter((v) => v !== id);
      if (kind === 'present' && !inP) x.presents.push(id);
      if (kind === 'excuse' && !inE) x.excuses.push(id);
    });

  const quickStatus = (t: Task, statusId: string) => saveTask({ ...t, statusId }, false);
  const quickDelai = (t: Task, delai: string) => saveTask({ ...t, delai, delaiRef: undefined }, false);
  const addTask = (sectionId: string) =>
    user &&
    setEdit({
      task: newTask(user.id, {
        sectionId,
        responsables: [],
        ...(s2 ? { meetingId: s2.id, delaiRef: { type: 'meeting' as const, joursAvant: 0 }, delai: s2.date } : {}),
      }),
      isNew: true,
    });

  // ---------- Texte et document du PV ----------
  const noteOf = (key: string) => m.notes[key]?.trim() ?? '';
  const taskInPv = (t: Task) => m.tousLesPoints || !!noteOf(`task:${t.id}`) || changesOf(t).length > 0 || isNewTask(t);
  const pollInPv = (p: Poll) => m.tousLesPoints || !!noteOf(`poll:${p.id}`) || !isOpen(p);
  const pvSections = bySection
    .map((g) => ({ ...g, subs: g.subs.map((s) => ({ ...s, tasks: s.tasks.filter(taskInPv) })).filter((s) => s.tasks.length), polls: g.polls.filter(pollInPv) }))
    .filter((g) => m.tousLesPoints || noteOf(`sec:${g.sec.id}`) || g.subs.length || g.polls.length);
  const others = [...orphanPolls.filter(pollInPv)];
  const presentsTxt = m.presents.map((id) => `${fullName(person(id))} (${initials(person(id))})`).join(', ') || '—';
  const excusesTxt = m.excuses.map((id) => fullName(person(id))).join(', ') || '—';
  const absents = committee.filter((p) => !m.presents.includes(p.id) && !m.excuses.includes(p.id));

  const taskLine = (t: Task) => `${t.titre} (${meta(t).join(' · ')})`;
  const plainText = () => {
    const out: string[] = [`PROCÈS-VERBAL – ${titre}`];
    if (s1) out.push(`${longDate(s1.date)} · ${hm(m.heureDebut ?? s1.heure)}${m.heureFin ? ` – ${hm(m.heureFin)}` : ''} · Lieu : ${s1.lieu || 'à définir'}`);
    out.push(`Présents : ${presentsTxt}`, `Excusés : ${excusesTxt}`);
    if (m.invites?.trim()) out.push(`Invités : ${m.invites.trim()}`);
    out.push('');
    pvSections.forEach((g, i) => {
      out.push(`${i + 1}. ${g.sec.nom}`);
      if (noteOf(`sec:${g.sec.id}`)) out.push(...noteOf(`sec:${g.sec.id}`).split('\n').map((l) => `   ${l}`));
      let j = 0;
      g.subs.forEach((s) => {
        const pad = s.label ? '      ' : '   ';
        if (s.label) out.push(`   ${letter(j++)}. ${s.label}`);
        s.tasks.forEach((t) => {
          out.push(`${pad}${s.label ? '■' : `${letter(j++)}.`} ${taskLine(t)}`);
          noteOf(`task:${t.id}`).split('\n').filter(Boolean).forEach((l) => out.push(`${pad}   → ${l}`));
          changesOf(t).forEach((c) => out.push(`${pad}   ↻ ${c}`));
        });
      });
      g.polls.forEach((p) => {
        out.push(`   ${letter(j++)}. Sondage : ${p.question} — ${pollSummary(p)}`);
        noteOf(`poll:${p.id}`).split('\n').filter(Boolean).forEach((l) => out.push(`      → ${l}`));
      });
    });
    let n = pvSections.length;
    others.forEach((p) => out.push(`${++n}. Sondage : ${p.question} — ${pollSummary(p)}`));
    if (noteOf('divers')) out.push(`${++n}. Divers`, ...noteOf('divers').split('\n').map((l) => `   ${l}`));
    if (newTasks.length) {
      out.push('', 'NOUVELLES TÂCHES DÉCIDÉES');
      newTasks.forEach((t) => out.push(`   ■ ${t.titre} (${data.sections.find((x) => x.id === t.sectionId)?.nom ?? ''} · ${meta(t).filter((x) => x !== '🆕 nouvelle').join(' · ')})`));
    }
    if (deleted.length) out.push('', `Tâches supprimées : ${deleted.join(', ')}`);
    if (s2) out.push('', `Prochaine séance : ${s2.titre}, ${longDate(s2.date)}${s2.heure ? ` à ${hm(s2.heure)}` : ''} – ${s2.lieu || 'lieu à définir'}`);
    out.push('', `PV établi par ${fullName(secretaire ?? user ?? undefined)} le ${fmtDate(today())}`);
    return out.join('\n');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText());
      setMsg('📋 Texte du PV copié.');
    } catch {
      setMsg('Copie impossible dans ce navigateur.');
    }
  };
  const email = () => {
    const to = committee.map((p) => p.email).filter(Boolean).join(',');
    let body = plainText();
    if (body.length > 1800) body = body.slice(0, 1800) + '\n…\n(PV complet en pièce jointe / imprimé)';
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(`PV – ${titre}`)}&body=${encodeURIComponent(body)}`;
  };
  const validate = () => {
    if (!s1 || !user || !sheetRef.current) return;
    const html = sheetRef.current.outerHTML;
    update((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      x.minutes = { ...EMPTY, ...x.minutes, valideLe: new Date().toISOString(), validePar: user.id };
      x.minutesArchives = [{ id: uid('pvf'), at: new Date().toISOString(), by: user.id, titre: `PV ${titre}`, html }, ...(x.minutesArchives ?? [])].slice(0, 10);
    }, `PV du ${s1.titre} validé et archivé`);
    setMsg(`✅ PV validé et archivé dans « ${s1.titre} » (onglet Comité). Tu peux maintenant l’envoyer par email.`);
  };

  // ---------- Rendu ----------
  const statusSelect = (t: Task) => (
    <select className="min-status" value={t.statusId} disabled={!canEditTask(t)} onChange={(e) => quickStatus(t, e.target.value)} aria-label={`Statut de ${t.titre}`}>
      {data.statuses.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
    </select>
  );
  const noteToggle = (key: string, label: string) =>
    noteOf(key) || openNotes[key] ? (
      <NoteField value={m.notes[key] ?? ''} onCommit={(v) => setNote(key, v)} placeholder={label} autoFocus={openNotes[key] && !noteOf(key)} />
    ) : null;

  const taskRow = (t: Task) => {
    const ch = changesOf(t);
    const b = bucket.get(t.id);
    return (
      <div key={t.id} className={`min-task ${ch.length ? 'changed' : ''} ${isNewTask(t) ? 'new' : ''} ${b === 'late' ? 'late' : ''} ${isDone(data, t) ? 'done' : ''}`}>
        <div className="min-task-head">
          <span className="min-title">
            {t.titre} <span className="odj-meta">({meta(t).join(' · ')})</span>
            {t.remarque && <span className="odj-rem"> – {t.remarque}</span>}
          </span>
          <span className="min-controls">
            {statusSelect(t)}
            <input type="date" className="min-date" value={t.delai} disabled={!canEditTask(t)} title={t.delaiRef ? 'Délai lié (le changer supprime le lien)' : 'Délai'} onChange={(e) => quickDelai(t, e.target.value)} />
            <button className="icon-btn" title="Modifier la tâche" onClick={() => setEdit({ task: t, isNew: false })}>✏️</button>
            {!noteOf(`task:${t.id}`) && !openNotes[`task:${t.id}`] && (
              <button className="icon-btn" title="Ajouter une note" onClick={() => setOpenNotes({ ...openNotes, [`task:${t.id}`]: true })}>📝</button>
            )}
          </span>
        </div>
        {ch.length > 0 && <div className="min-changes">↻ {ch.join(' · ')}</div>}
        {noteToggle(`task:${t.id}`, 'Note / décision sur ce point…')}
      </div>
    );
  };
  const pollRow = (p: Poll) => (
    <div key={p.id} className="min-task poll-row-min">
      <div className="min-task-head">
        <span className="min-title odj-poll">📊 Sondage : {p.question} <span className="odj-meta">— {pollSummary(p)}</span></span>
        <span className="min-controls">
          {!noteOf(`poll:${p.id}`) && !openNotes[`poll:${p.id}`] && (
            <button className="icon-btn" title="Ajouter une note" onClick={() => setOpenNotes({ ...openNotes, [`poll:${p.id}`]: true })}>📝</button>
          )}
        </span>
      </div>
      {noteToggle(`poll:${p.id}`, 'Note / décision sur ce sondage…')}
    </div>
  );

  const pvDoc: ReactNode = (
    <div ref={sheetRef} className="pv-sheet portrait t-normale">
      <header className="pv-head">
        <div className="pv-club"><img src="./icon.svg" alt="" width={22} height={22} /> G.S. Ajoie – Comité</div>
        <p className="pv-kicker">Procès-verbal</p>
        <h1>{titre}</h1>
        {s1 && <p className="pv-meta">{longDate(s1.date)}</p>}
      </header>
      <section className="odj-head">
        <p><b>Début de séance :</b> {hm(m.heureDebut ?? s1?.heure) || '—'}{m.heureFin && <> · <b>Fin :</b> {hm(m.heureFin)}</>}</p>
        <p><b>Lieu :</b> {s1?.lieu || 'à définir'}</p>
        <p><b>Présents :</b> {presentsTxt}</p>
        <p><b>Excusés :</b> {excusesTxt}</p>
        {absents.length > 0 && (m.presents.length > 0 || m.excuses.length > 0) && <p><b>Absents :</b> {absents.map((p) => fullName(p)).join(', ')}</p>}
        {m.invites?.trim() && <p><b>Invités :</b> {m.invites.trim()}</p>}
      </section>
      <section className="pv-part">
        <h2>Points traités</h2>
        {pvSections.length === 0 && !others.length && !noteOf('divers') ? (
          <p className="pv-empty">Aucune note ni mise à jour pour l’instant.</p>
        ) : (
          <ol className="odj">
            {pvSections.map((g) => (
              <li key={g.sec.id}>
                <span className="odj-sec">{g.sec.nom}</span>
                {noteOf(`sec:${g.sec.id}`) && <p className="min-pv-note">{noteOf(`sec:${g.sec.id}`)}</p>}
                {(g.subs.length > 0 || g.polls.length > 0) && (
                  <ol className="odj-l1">
                    {g.subs.map((s) =>
                      s.label ? (
                        <li key={s.key}>
                          {s.label}
                          <ul className="odj-l2">{s.tasks.map((t) => <li key={t.id}>{pvTask(t)}</li>)}</ul>
                        </li>
                      ) : (
                        s.tasks.map((t) => <li key={t.id}>{pvTask(t)}</li>)
                      ),
                    )}
                    {g.polls.map((p) => (
                      <li key={p.id}>
                        <span className="odj-poll">Sondage : {p.question} — {pollSummary(p)}</span>
                        {noteOf(`poll:${p.id}`) && <p className="min-pv-note">{noteOf(`poll:${p.id}`)}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
            {others.map((p) => (
              <li key={p.id}><span className="odj-sec">Sondage : {p.question}</span> — {pollSummary(p)}</li>
            ))}
            {noteOf('divers') && (
              <li><span className="odj-sec">Divers</span><p className="min-pv-note">{noteOf('divers')}</p></li>
            )}
          </ol>
        )}
      </section>
      {newTasks.length > 0 && (
        <section className="pv-part">
          <h2>Nouvelles tâches décidées</h2>
          <ul className="odj-l2">
            {newTasks.map((t) => (
              <li key={t.id}>{t.titre} <span className="odj-meta">({[data.sections.find((x) => x.id === t.sectionId)?.nom, ...meta(t).filter((x) => x !== '🆕 nouvelle')].join(' · ')})</span></li>
            ))}
          </ul>
        </section>
      )}
      {deleted.length > 0 && <p><b>Tâches supprimées :</b> {deleted.join(', ')}</p>}
      {s2 && (
        <p className="pv-next"><b>Prochaine séance :</b> {s2.titre}, {longDate(s2.date)}{s2.heure && ` à ${hm(s2.heure)}`} – Lieu : {s2.lieu || 'à définir'}</p>
      )}
      <footer className="pv-foot">
        PV établi par {fullName(secretaire ?? user ?? undefined)} le {fmtDate(today())}
        {m.valideLe && ` · validé le ${fmtDate(m.valideLe.slice(0, 10))}`} · Tâches GSA
      </footer>
    </div>
  );
  function pvTask(t: Task) {
    return (
      <>
        {t.titre} <span className="odj-meta">({meta(t).join(' · ')})</span>
        {noteOf(`task:${t.id}`) && <p className="min-pv-note">→ {noteOf(`task:${t.id}`)}</p>}
        {changesOf(t).length > 0 && <p className="min-pv-change">↻ {changesOf(t).join(' · ')}</p>}
      </>
    );
  }

  if (!s1) return <p className="muted">Aucune séance de comité. Crée d’abord une séance dans l’onglet Comité.</p>;

  return (
    <div className="minutes-page">
      <div className="page-head no-print">
        <h1>PV</h1>
        <div className="actions">
          <select value={meetingId} onChange={(e) => { setMeetingId(e.target.value); setMsg(''); }} aria-label="Séance">
            {meetings.map((x) => <option key={x.id} value={x.id}>{x.titre} – {fmtDate(x.date)}{x.minutes?.valideLe ? ' ✓' : ''}</option>)}
          </select>
          <div className="seg">
            <button className={view === 'saisie' ? 'on' : ''} onClick={() => setView('saisie')}>✍️ Prise de notes</button>
            <button className={view === 'pv' ? 'on' : ''} onClick={() => setView('pv')}>📄 PV</button>
          </div>
        </div>
      </div>
      {msg && <p className="pv-msg no-print">{msg}</p>}

      {view === 'saisie' ? (
        <div className="min-layout">
          <div className="min-main">
            <section className="panel min-session">
              <div className="min-session-row">
                <strong>{s1.titre} · {longDate(s1.date)}</strong>
                <span className="muted">Lieu : {s1.lieu || 'à définir'}</span>
              </div>
              <div className="min-session-row">
                <label className="inline">Début <input type="time" value={m.heureDebut ?? ''} onChange={(e) => setMinutes((x) => { x.heureDebut = e.target.value || undefined; })} /></label>
                <label className="inline">Fin <input type="time" value={m.heureFin ?? ''} onChange={(e) => setMinutes((x) => { x.heureFin = e.target.value || undefined; })} /></label>
                {!m.snapshot ? (
                  <button className="btn primary" onClick={start}>▶ Démarrer la séance</button>
                ) : !m.heureFin ? (
                  <button className="btn" onClick={() => setMinutes((x) => { x.heureFin = nowHM(); })}>⏹ Terminer la séance</button>
                ) : (
                  <span className="pbadge closed">Séance terminée</span>
                )}
                {m.valideLe && <span className="pbadge open">PV validé le {fmtDate(m.valideLe.slice(0, 10))}</span>}
              </div>
              {!m.snapshot && <p className="muted small-note">Démarre la séance pour que les mises à jour de tâches faites ensuite apparaissent dans le PV.</p>}
            </section>

            <section className="panel">
              <h2 className="min-h2">Présences</h2>
              <div className="min-presence">
                {committee.map((p) => (
                  <div key={p.id} className="min-person">
                    <span>{fullName(p)} <span className="muted">({initials(p)})</span></span>
                    <span className="seg small">
                      <button className={m.presents.includes(p.id) ? 'on present' : ''} onClick={() => setPresence(p.id, 'present')}>Présent</button>
                      <button className={m.excuses.includes(p.id) ? 'on excuse' : ''} onClick={() => setPresence(p.id, 'excuse')}>Excusé</button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="row">
                <button className="btn small" onClick={() => setMinutes((x) => { x.presents = committee.map((p) => p.id).filter((id) => !x.excuses.includes(id)); })}>Tous présents (sauf excusés)</button>
                <input className="grow" placeholder="Invités / autres personnes présentes" value={m.invites ?? ''} onChange={(e) => setMinutes((x) => { x.invites = e.target.value; })} />
              </div>
            </section>

            <section className="min-agenda">
              {bySection.map((g, i) => (
                <div key={g.sec.id} className="panel min-section">
                  <h3>{i + 1}. {g.sec.nom}</h3>
                  <NoteField value={m.notes[`sec:${g.sec.id}`] ?? ''} onCommit={(v) => setNote(`sec:${g.sec.id}`, v)} placeholder={`Notes pour « ${g.sec.nom} »…`} />
                  {g.subs.map((s, j) => (
                    <div key={s.key} className="min-sub">
                      {s.label ? <div className="min-sub-title">{letter(j)}. {s.label}</div> : null}
                      {s.tasks.map(taskRow)}
                    </div>
                  ))}
                  {g.polls.map(pollRow)}
                  {can('tasks.createAny', g.sec.id) && <button className="btn small link" onClick={() => addTask(g.sec.id)}>+ Nouvelle tâche décidée</button>}
                </div>
              ))}
              {orphanPolls.length > 0 && (
                <div className="panel min-section">
                  <h3>Sondages</h3>
                  {orphanPolls.map(pollRow)}
                </div>
              )}
              <div className="panel min-section">
                <h3>Divers</h3>
                <NoteField value={m.notes.divers ?? ''} onCommit={(v) => setNote('divers', v)} placeholder="Points divers, informations, prochaine séance…" />
              </div>
            </section>
          </div>
          <aside className="min-side">
            <div className="panel">
              <h2 className="min-h2">Suivi de la séance</h2>
              <p>{m.presents.length} présent(s) · {m.excuses.length} excusé(s)</p>
              <p>{Object.keys(m.notes).length} note(s)</p>
              <p>{points.filter((t) => changesOf(t).length).length} tâche(s) mise(s) à jour</p>
              <p>{newTasks.length} nouvelle(s) tâche(s)</p>
              <button className="btn primary" onClick={() => setView('pv')}>📄 Voir le PV</button>
              <small className="muted">Les notes s’enregistrent automatiquement.</small>
            </div>
          </aside>
        </div>
      ) : (
        <>
          <div className="actions no-print min-pv-actions">
            <label className="inline"><input type="checkbox" checked={!!m.tousLesPoints} onChange={(e) => setMinutes((x) => { x.tousLesPoints = e.target.checked; })} /> Inclure tous les points de l’ordre du jour</label>
            <span className="grow" />
            <button className="btn" onClick={() => window.print()}>🖨 Imprimer / PDF</button>
            <button className="btn" onClick={copy}>📋 Copier le texte</button>
            <button className="btn" onClick={email}>✉ Envoyer par email</button>
            {can('tab.minutes') && <button className="btn primary" onClick={validate}>✅ {m.valideLe ? 'Valider une nouvelle version' : 'Valider et archiver'}</button>}
          </div>
          <div className="pv-preview">{pvDoc}</div>
        </>
      )}

      {edit && <TaskModal task={edit.task} isNew={edit.isNew} onClose={() => setEdit(null)} />}
    </div>
  );
}
