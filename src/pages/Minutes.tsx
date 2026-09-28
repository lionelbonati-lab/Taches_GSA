import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { FULL_AGENDA, meetingContext, selectAgenda, sortedMeetings } from '../data/agenda';
import { committeeOf, isOpen, pollSection, pollSummary } from '../data/polls';
import { EMPTY_MINUTES, diffTask, shortDate, stateOf } from '../data/minutes';
import type { MeetingMinutes, Poll, Task, TaskSnapshot } from '../data/types';
import { fmtDate, fmtDateTime, fullName, initials, isDone, today, uid } from '../data/utils';
import { NoteField } from '../components/NoteField';
import { TaskModal, newTask } from '../components/TaskModal';

// Onglet « PV » (secrétaire) : reprend l'ordre du jour de la séance, prise de notes sous chaque point,
// mise à jour des tâches (enregistrée dans le PV), génération / validation / envoi du procès-verbal,
// correction après coup avec versions successives.

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
  // Tâche ouverte depuis le PV : on compare avant / après pour l'inscrire au PV.
  const [pending, setPending] = useState<{ id: string; before?: TaskSnapshot; isNew: boolean } | null>(null);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);

  const s1 = meetings.find((m) => m.id === meetingId);
  const { s0, s2 } = meetingContext(data, s1);
  const m: MeetingMinutes = { ...EMPTY_MINUTES, ...s1?.minutes };
  const committee = committeeOf(data);
  const person = (id: string) => data.people.find((p) => p.id === id);
  const titre = s1 ? `Comité ${shortDate(s1.date)}` : 'Comité';
  const secretaire = data.people.find((p) => p.actif && p.roles.includes('secretaire'));
  const version = m.version ?? 0;
  const locked = !!m.valideLe && !m.enCorrection; // PV validé : lecture seule jusqu'à « Corriger »
  const editable = can('tab.minutes') && !locked;
  const draftVersion = m.enCorrection ? version + 1 : version || 1;

  useEffect(() => {
    if (view !== 'pv') return;
    const before = document.title;
    document.title = `PV ${titre}${draftVersion > 1 ? ` v${draftVersion}` : ''}`;
    return () => {
      document.title = before;
    };
  }, [view, titre, draftVersion]);

  const setMinutes = (fn: (x: MeetingMinutes) => void) =>
    s1 &&
    updateSilent((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      const mm: MeetingMinutes = structuredClone({ ...EMPTY_MINUTES, ...x.minutes });
      fn(mm);
      x.minutes = mm;
    });
  const setNote = (key: string, v: string) =>
    setMinutes((x) => {
      if (v.trim()) x.notes[key] = v;
      else delete x.notes[key];
    });
  const record = (t: Task, changes: string[]) =>
    changes.length &&
    setMinutes((x) => {
      x.journal = [...(x.journal ?? []), { taskId: t.id, titre: t.titre, changes, at: new Date().toISOString() }];
    });

  // Modifications faites dans la fiche tâche ouverte depuis le PV : enregistrées une fois la tâche sauvegardée.
  useEffect(() => {
    if (!pending || edit) return;
    const t = data.tasks.find((x) => x.id === pending.id);
    if (pending.isNew) {
      if (t) setMinutes((x) => { x.nouvelles = [...(x.nouvelles ?? []), t.id]; });
    } else if (!t && pending.before) {
      setMinutes((x) => { x.supprimees = [...(x.supprimees ?? []), pending.before!.titre]; });
    } else if (t && pending.before) {
      record(t, diffTask(data, pending.before, t));
    }
    setPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pending, edit]);

  // ---------- Points de la séance ----------
  const sel = selectAgenda(data, s0, s1, s2, FULL_AGENDA);
  const bucket = new Map<string, 'late' | 'p1' | 'p2' | 'bilan'>();
  sel.late.forEach((t) => bucket.set(t.id, 'late'));
  sel.avant1.forEach((t) => bucket.set(t.id, 'p1'));
  sel.avant2.forEach((t) => bucket.set(t.id, 'p2'));
  sel.bilan.forEach((t) => bucket.set(t.id, 'bilan'));
  const journal = m.journal ?? [];
  const nouvelles = new Set(m.nouvelles ?? []);
  const newTasks = data.tasks.filter((t) => nouvelles.has(t.id));
  const deleted = m.supprimees ?? [];
  // Points affichés : ordre du jour + points présents au début de la séance + tâches modifiées ou créées depuis le PV.
  const ids = new Set<string>([...bucket.keys(), ...(m.pointIds ?? []), ...journal.map((j) => j.taskId), ...nouvelles]);
  const points = data.tasks.filter((t) => ids.has(t.id));
  const polls = (data.polls ?? []).filter((p) => isOpen(p) || (p.clotureLe ?? p.dateLimite ?? '') >= sel.since);
  const changesOf = (t: Task) => journal.filter((j) => j.taskId === t.id).flatMap((j) => j.changes);
  const isNewTask = (t: Task) => nouvelles.has(t.id);

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

  const quickChange = (t: Task, patch: Partial<Task>) => {
    const after = { ...t, ...patch };
    saveTask(after, false);
    record(t, diffTask(data, stateOf(t), after));
  };
  const openTask = (t: Task) => {
    setEdit({ task: t, isNew: false });
    setPending({ id: t.id, before: stateOf(t), isNew: false });
  };
  const addTask = (sectionId: string) => {
    if (!user) return;
    const t = newTask(user.id, {
      sectionId,
      responsables: [],
      ...(s2 ? { meetingId: s2.id, delaiRef: { type: 'meeting' as const, joursAvant: 0 }, delai: s2.date } : {}),
    });
    setEdit({ task: t, isNew: true });
    setPending({ id: t.id, isNew: true });
  };

  // Correction après coup : rouvrir un PV validé ; la prochaine validation crée une nouvelle version.
  const startCorrection = () => {
    if (!s1) return;
    update((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      x.minutes = { ...EMPTY_MINUTES, ...x.minutes, enCorrection: true };
    }, `PV du ${s1.titre} rouvert pour correction`);
    setView('saisie');
    setMsg(`✏️ Correction du PV (future version ${version + 1}) : modifie les notes, présences ou points, puis valide.`);
  };
  const cancelCorrection = () => {
    if (!s1 || !m.derniereValidee || !confirm('Annuler les corrections et revenir à la dernière version validée ?')) return;
    update((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      x.minutes = { ...structuredClone(m.derniereValidee!), derniereValidee: m.derniereValidee, enCorrection: false };
    }, `Correction du PV du ${s1.titre} annulée`);
    setMsg('Corrections annulées : retour à la version validée.');
  };

  // ---------- Texte et document du PV ----------
  const noteOf = (key: string) => m.notes[key]?.trim() ?? '';
  const taskInPv = (t: Task) => m.tousLesPoints || !!noteOf(`task:${t.id}`) || changesOf(t).length > 0 || isNewTask(t);
  const pollInPv = (p: Poll) => m.tousLesPoints || !!noteOf(`poll:${p.id}`) || !isOpen(p);
  const pvSections = bySection
    .map((g) => ({ ...g, subs: g.subs.map((s) => ({ ...s, tasks: s.tasks.filter(taskInPv) })).filter((s) => s.tasks.length), polls: g.polls.filter(pollInPv) }))
    .filter((g) => m.tousLesPoints || noteOf(`sec:${g.sec.id}`) || g.subs.length || g.polls.length);
  const others = orphanPolls.filter(pollInPv);
  const presentsTxt = m.presents.map((id) => `${fullName(person(id))} (${initials(person(id))})`).join(', ') || '—';
  const excusesTxt = m.excuses.map((id) => fullName(person(id))).join(', ') || '—';
  const absents = committee.filter((p) => !m.presents.includes(p.id) && !m.excuses.includes(p.id));
  const versionLine =
    draftVersion > 1
      ? m.enCorrection
        ? `Version ${draftVersion} (corrigée, non encore validée) – remplace la version ${version}`
        : `Version ${version} – corrigée le ${fmtDate(m.valideLe!.slice(0, 10))}`
      : '';

  const taskLine = (t: Task) => `${t.titre} (${meta(t).join(' · ')})`;
  const plainText = () => {
    const out: string[] = [`PROCÈS-VERBAL – ${titre}`];
    if (versionLine) out.push(versionLine);
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
    const subject = draftVersion > 1 ? `PV corrigé (version ${draftVersion}) – ${titre}` : `PV – ${titre}`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  const validate = () => {
    if (!s1 || !user || !sheetRef.current) return;
    const n = m.valideLe ? (m.enCorrection ? version + 1 : version) : 1;
    const html = sheetRef.current.outerHTML;
    const now = new Date().toISOString();
    update((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      const mm: MeetingMinutes = { ...EMPTY_MINUTES, ...x.minutes, valideLe: now, validePar: user.id, version: n, enCorrection: false };
      const { derniereValidee: _old, ...copyOf } = mm;
      void _old;
      mm.derniereValidee = structuredClone(copyOf);
      x.minutes = mm;
      const label = n > 1 ? `PV ${titre} – version ${n} (corrigé le ${fmtDate(now.slice(0, 10))})` : `PV ${titre}`;
      x.minutesArchives = [{ id: uid('pvf'), at: now, by: user.id, titre: label, html }, ...(x.minutesArchives ?? [])].slice(0, 10);
    }, n > 1 ? `PV du ${s1.titre} corrigé : version ${n} validée` : `PV du ${s1.titre} validé et archivé`);
    setMsg(
      n > 1
        ? `✅ Version ${n} validée et archivée (la version ${n - 1} reste consultable dans l’onglet Comité). Tu peux envoyer le PV corrigé.`
        : `✅ PV validé et archivé dans « ${s1.titre} » (onglet Comité). Tu peux maintenant l’envoyer par email.`,
    );
  };

  // ---------- Rendu ----------
  const noteToggle = (key: string, label: string) =>
    noteOf(key) || (openNotes[key] && editable) ? (
      <NoteField value={m.notes[key] ?? ''} onCommit={(v) => setNote(key, v)} placeholder={label} autoFocus={openNotes[key] && !noteOf(key)} readOnly={!editable} />
    ) : null;

  const taskRow = (t: Task) => {
    const ch = changesOf(t);
    const b = bucket.get(t.id);
    const can2 = editable && canEditTask(t);
    return (
      <div key={t.id} className={`min-task ${ch.length ? 'changed' : ''} ${isNewTask(t) ? 'new' : ''} ${b === 'late' ? 'late' : ''} ${isDone(data, t) ? 'done' : ''}`}>
        <div className="min-task-head">
          <span className="min-title">
            {t.titre} <span className="odj-meta">({meta(t).join(' · ')})</span>
            {t.remarque && <span className="odj-rem"> – {t.remarque}</span>}
          </span>
          {editable && (
            <span className="min-controls">
              <select className="min-status" value={t.statusId} disabled={!can2} onChange={(e) => quickChange(t, { statusId: e.target.value })} aria-label={`Statut de ${t.titre}`}>
                {data.statuses.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
              <input type="date" className="min-date" value={t.delai} disabled={!can2} title={t.delaiRef ? 'Délai lié (le changer supprime le lien)' : 'Délai'}
                onChange={(e) => quickChange(t, { delai: e.target.value, delaiRef: undefined })} />
              <button className="icon-btn" title="Modifier la tâche" onClick={() => openTask(t)}>✏️</button>
              {!noteOf(`task:${t.id}`) && !openNotes[`task:${t.id}`] && (
                <button className="icon-btn" title="Ajouter une note" onClick={() => setOpenNotes({ ...openNotes, [`task:${t.id}`]: true })}>📝</button>
              )}
            </span>
          )}
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
        {editable && !noteOf(`poll:${p.id}`) && !openNotes[`poll:${p.id}`] && (
          <span className="min-controls">
            <button className="icon-btn" title="Ajouter une note" onClick={() => setOpenNotes({ ...openNotes, [`poll:${p.id}`]: true })}>📝</button>
          </span>
        )}
      </div>
      {noteToggle(`poll:${p.id}`, 'Note / décision sur ce sondage…')}
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

  const pvDoc: ReactNode = (
    <div ref={sheetRef} className="pv-sheet portrait t-normale">
      <header className="pv-head">
        <div className="pv-club"><img src="./icon.svg" alt="" width={22} height={22} /> G.S. Ajoie – Comité</div>
        <p className="pv-kicker">Procès-verbal{draftVersion > 1 ? ` · version ${draftVersion}` : ''}</p>
        <h1>{titre}</h1>
        {s1 && <p className="pv-meta">{longDate(s1.date)}</p>}
        {versionLine && <p className="pv-version">{versionLine}</p>}
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
        {m.valideLe && !m.enCorrection && ` · version ${version} validée le ${fmtDate(m.valideLe.slice(0, 10))}`} · Tâches GSA
      </footer>
    </div>
  );

  if (!s1) return <p className="muted">Aucune séance de comité. Crée d’abord une séance dans l’onglet Comité.</p>;

  const statusBanner = m.valideLe && (
    <div className={`min-banner no-print ${m.enCorrection ? 'editing' : 'locked'}`}>
      {m.enCorrection ? (
        <>
          <span>✏️ <b>Correction en cours</b> – la validation créera la <b>version {version + 1}</b> (la version {version} reste archivée).</span>
          <span className="grow" />
          {m.derniereValidee && <button className="btn small" onClick={cancelCorrection}>Annuler la correction</button>}
          <button className="btn small primary" onClick={() => setView('pv')}>Voir et valider</button>
        </>
      ) : (
        <>
          <span>✅ <b>PV validé</b> (version {version}) le {fmtDateTime(m.valideLe)} – lecture seule.</span>
          <span className="grow" />
          {can('tab.minutes') && <button className="btn small primary" onClick={startCorrection}>✏️ Corriger le PV</button>}
        </>
      )}
    </div>
  );

  return (
    <div className="minutes-page">
      <div className="page-head no-print">
        <h1>PV</h1>
        <div className="actions">
          <select value={meetingId} onChange={(e) => { setMeetingId(e.target.value); setMsg(''); setOpenNotes({}); }} aria-label="Séance">
            {meetings.map((x) => (
              <option key={x.id} value={x.id}>
                {x.titre} – {fmtDate(x.date)}{x.minutes?.valideLe ? ` ✓${(x.minutes.version ?? 1) > 1 ? ` v${x.minutes.version}` : ''}` : ''}
              </option>
            ))}
          </select>
          <div className="seg">
            <button className={view === 'saisie' ? 'on' : ''} onClick={() => setView('saisie')}>✍️ Prise de notes</button>
            <button className={view === 'pv' ? 'on' : ''} onClick={() => setView('pv')}>📄 PV</button>
          </div>
        </div>
      </div>
      {statusBanner}
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
                <label className="inline">Début <input type="time" value={m.heureDebut ?? ''} disabled={!editable} onChange={(e) => setMinutes((x) => { x.heureDebut = e.target.value || undefined; })} /></label>
                <label className="inline">Fin <input type="time" value={m.heureFin ?? ''} disabled={!editable} onChange={(e) => setMinutes((x) => { x.heureFin = e.target.value || undefined; })} /></label>
                {editable && !m.valideLe && (!m.demarreLe ? (
                  <button className="btn primary" onClick={start}>▶ Démarrer la séance</button>
                ) : !m.heureFin ? (
                  <button className="btn" onClick={() => setMinutes((x) => { x.heureFin = nowHM(); })}>⏹ Terminer la séance</button>
                ) : (
                  <span className="pbadge closed">Séance terminée – notes et points encore modifiables</span>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2 className="min-h2">Présences</h2>
              <div className="min-presence">
                {committee.map((p) => (
                  <div key={p.id} className="min-person">
                    <span>{fullName(p)} <span className="muted">({initials(p)})</span></span>
                    <span className="seg small">
                      <button disabled={!editable} className={m.presents.includes(p.id) ? 'on present' : ''} onClick={() => setPresence(p.id, 'present')}>Présent</button>
                      <button disabled={!editable} className={m.excuses.includes(p.id) ? 'on excuse' : ''} onClick={() => setPresence(p.id, 'excuse')}>Excusé</button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="row">
                {editable && <button className="btn small" onClick={() => setMinutes((x) => { x.presents = committee.map((p) => p.id).filter((id) => !x.excuses.includes(id)); })}>Tous présents (sauf excusés)</button>}
                <input className="grow" placeholder="Invités / autres personnes présentes" value={m.invites ?? ''} readOnly={!editable} onChange={(e) => setMinutes((x) => { x.invites = e.target.value; })} />
              </div>
            </section>

            <section className="min-agenda">
              {bySection.map((g, i) => (
                <div key={g.sec.id} className="panel min-section">
                  <h3>{i + 1}. {g.sec.nom}</h3>
                  {(editable || noteOf(`sec:${g.sec.id}`)) && (
                    <NoteField value={m.notes[`sec:${g.sec.id}`] ?? ''} onCommit={(v) => setNote(`sec:${g.sec.id}`, v)} placeholder={`Notes pour « ${g.sec.nom} »…`} readOnly={!editable} />
                  )}
                  {g.subs.map((s, j) => (
                    <div key={s.key} className="min-sub">
                      {s.label ? <div className="min-sub-title">{letter(j)}. {s.label}</div> : null}
                      {s.tasks.map(taskRow)}
                    </div>
                  ))}
                  {g.polls.map(pollRow)}
                  {editable && can('tasks.createAny', g.sec.id) && <button className="btn small link" onClick={() => addTask(g.sec.id)}>+ Nouvelle tâche décidée</button>}
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
                <NoteField value={m.notes.divers ?? ''} onCommit={(v) => setNote('divers', v)} placeholder="Points divers, informations, prochaine séance…" readOnly={!editable} />
              </div>
            </section>
          </div>
          <aside className="min-side">
            <div className="panel">
              <h2 className="min-h2">Suivi de la séance</h2>
              <p>{m.presents.length} présent(s) · {m.excuses.length} excusé(s)</p>
              <p>{Object.keys(m.notes).length} note(s)</p>
              <p>{new Set(journal.map((j) => j.taskId)).size} tâche(s) mise(s) à jour</p>
              <p>{newTasks.length} nouvelle(s) tâche(s)</p>
              <button className="btn primary" onClick={() => setView('pv')}>📄 Voir le PV</button>
              <small className="muted">{editable ? 'Les notes s’enregistrent automatiquement. Seules les modifications de tâches faites ici figurent dans le PV.' : 'PV validé : lecture seule.'}</small>
            </div>
          </aside>
        </div>
      ) : (
        <>
          <div className="actions no-print min-pv-actions">
            <label className="inline"><input type="checkbox" checked={!!m.tousLesPoints} disabled={!editable} onChange={(e) => setMinutes((x) => { x.tousLesPoints = e.target.checked; })} /> Inclure tous les points de l’ordre du jour</label>
            <span className="grow" />
            <button className="btn" onClick={() => window.print()}>🖨 Imprimer / PDF</button>
            <button className="btn" onClick={copy}>📋 Copier le texte</button>
            <button className="btn" onClick={email}>✉ Envoyer par email</button>
            {can('tab.minutes') && (locked ? (
              <button className="btn primary" onClick={startCorrection}>✏️ Corriger le PV</button>
            ) : (
              <button className="btn primary" onClick={validate}>✅ {m.enCorrection ? `Valider la version ${version + 1}` : 'Valider et archiver'}</button>
            ))}
          </div>
          <div className="pv-preview">{pvDoc}</div>
        </>
      )}

      {edit && <TaskModal task={edit.task} isNew={edit.isNew} onClose={() => setEdit(null)} />}
    </div>
  );
}
