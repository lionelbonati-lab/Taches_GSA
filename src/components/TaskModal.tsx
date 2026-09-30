import { useRef, useState } from 'react';
import { DocsField, type DocTracking } from './DocsField';
import { PollCard } from './PollCard';
import { PollEditor } from './PollEditor';
import { EmailsField } from './EmailsField';
import { deleteFiles } from '../data/files';
import { useStore } from '../data/store';
import type { Recurrence, Task } from '../data/types';
import { DELAI_OFFSETS, RECURRENCES, applyDelaiRef, childrenOf, fmtDate, fmtDateTime, fullName, isDone, isLate, nextDate, parentOf, shortName, nextResponsables, postesFor, today, uid } from '../data/utils';
import { Avatar, Modal, StatusBadge } from './ui';

export function newTask(userId: string, defaults: Partial<Task> = {}): Task {
  return {
    id: uid('t'),
    sectionId: '',
    sousSection: '',
    titre: '',
    responsables: [userId],
    statusId: 's1',
    delai: today(),
    remarque: '',
    checklist: [],
    createdBy: userId,
    updatedAt: new Date().toISOString(),
    ...defaults,
  };
}

export function TaskModal({ task, isNew, onClose, quick, openEmailId }: { task: Task; isNew: boolean; onClose: () => void; quick?: boolean; openEmailId?: string }) {
  const { data, user, can, canEditTask, canDeleteTask, canAssignOthers: canAssign, creatableSections, saveTask, update, linkTask } = useStore();
  const [t, setT] = useState<Task>(task);
  const [newItem, setNewItem] = useState('');
  // Tâche liée (ou principale) ouverte par-dessus cette fenêtre.
  const [other, setOther] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const [err, setErr] = useState('');
  const track = useRef<DocTracking>({ added: [], removed: [] });
  const [newPoll, setNewPoll] = useState(false);
  if (!user) return null;

  const editable = isNew ? true : canEditTask(task);
  const canAssignOthers = t.sectionId ? canAssign(t.sectionId) : creatableSections().some((s) => canAssign(s.id));
  const section = data.sections.find((s) => s.id === t.sectionId);
  // Sections proposées : celles où le rôle permet de créer (+ la section actuelle en modification).
  const sectionChoices = data.sections.filter((s) => creatableSections().some((c) => c.id === s.id) || s.id === task.sectionId);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));
  const assignable = data.people.filter((p) => p.actif && (canAssignOthers || p.id === user.id));

  const addItem = () => {
    if (!newItem.trim()) return;
    set('checklist', [...t.checklist, { id: uid('c'), label: newItem.trim(), done: false }]);
    setNewItem('');
  };

  // Tâches liées : un seul niveau (une tâche principale n'est pas elle-même liée à une autre).
  const kids = isNew ? [] : childrenOf(data, task.id).sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'));
  const parent = parentOf(data, t);
  const parentChoices = data.tasks
    .filter((x) => x.id === t.parentId || (x.id !== task.id && !x.parentId && !isDone(data, x)))
    .sort((a, b) => a.titre.localeCompare(b.titre));
  const linkable = data.tasks.filter((x) => x.id !== task.id && !x.parentId && !childrenOf(data, x.id).length && !isDone(data, x));
  const secName = (id: string) => data.sections.find((s) => s.id === id)?.nom ?? '';
  const bySection = <T extends Task>(list: T[]) =>
    data.sections.map((sec) => ({ sec, list: list.filter((x) => x.sectionId === sec.id) })).filter((g) => g.list.length);

  const toggleResp = (id: string) =>
    set('responsables', t.responsables.includes(id) ? t.responsables.filter((x) => x !== id) : [...t.responsables, id]);

  const submit = () => {
    if (!t.titre.trim()) return setErr('Le titre de la tâche est obligatoire.');
    if (!t.sectionId) return setErr('Choisis une section.');
    if (!canAssign(t.sectionId) && t.responsables.some((id) => id !== user.id) && JSON.stringify(t.responsables) !== JSON.stringify(task.responsables))
      return setErr('Ton rôle ne permet pas d’assigner d’autres personnes dans cette section.');
    saveTask({ ...t, titre: t.titre.trim() }, isNew);
    deleteFiles(track.current.removed); // fichiers retirés : effacés seulement une fois la tâche enregistrée
    onClose();
  };

  // Annuler : on efface les fichiers ajoutés pendant cette édition.
  const cancel = () => {
    deleteFiles(track.current.added);
    onClose();
  };

  const remove = () => {
    if (!confirm(`Supprimer la tâche « ${task.titre} » ?`)) return;
    update((d) => {
      d.tasks = d.tasks.filter((x) => x.id !== task.id);
      // Ses tâches liées restent, sans tâche principale.
      d.tasks.forEach((x) => { if (x.parentId === task.id) x.parentId = undefined; });
      d.emails = (d.emails ?? []).filter((e) => e.taskId !== task.id);
      // Les sondages liés restent, rattachés à la section de la tâche.
      (d.polls ?? []).forEach((p) => {
        if (p.taskId === task.id) {
          p.taskId = undefined;
          p.sectionId = p.sectionId ?? task.sectionId;
        }
      });
    }, `Suppression de la tâche « ${task.titre} »`);
    deleteFiles([...(task.documents ?? []).filter((d) => d.kind === 'fichier').map((d) => d.id), ...track.current.added]);
    onClose();
  };

  const dis = !editable;
  const postes = postesFor(data, t, isNew ? undefined : task) ?? [];
  return (
    <Modal title={quick ? 'Ajout rapide' : isNew ? 'Nouvelle tâche' : editable ? 'Modifier la tâche' : 'Détail de la tâche'} onClose={cancel} wide={!quick}>
      <div className="form">
        {!quick && parent && (
          <button type="button" className="full parent-banner" onClick={() => setOther({ task: parent, isNew: false })}>
            ↳ Tâche liée à <b>{parent.titre}</b> <span className="muted">({secName(parent.sectionId)}) · ouvrir</span>
          </button>
        )}
        <label className="full">
          Tâche
          <input autoFocus value={t.titre} disabled={dis} onChange={(e) => set('titre', e.target.value)} placeholder="Que faut-il faire ?" />
        </label>
        <label>
          Section
          <select value={t.sectionId} disabled={dis} onChange={(e) => setT((x) => ({ ...x, sectionId: e.target.value, sousSection: '' }))}>
            <option value="">— Choisir —</option>
            {sectionChoices.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </label>
        {!quick && (
          <label>
            Sous-section
            <select value={t.sousSection} disabled={dis || !section} onChange={(e) => set('sousSection', e.target.value)}>
              <option value="">—</option>
              {section?.sousSections.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        )}
        <DelaiField t={t} setT={setT} disabled={dis} />
        <label>
          Statut
          <select value={t.statusId} disabled={dis} onChange={(e) => set('statusId', e.target.value)}>
            {data.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        {!quick && (
          <label>
            Répétition
            <select value={t.recurrence ?? ''} disabled={dis} onChange={(e) => set('recurrence', (e.target.value || undefined) as Recurrence | undefined)}>
              <option value="">Aucune (tâche unique)</option>
              {RECURRENCES.map((r) => <option key={r.id} value={r.id}>🔁 {r.label}</option>)}
            </select>
          </label>
        )}
        {!quick && t.recurrence && (
          <p className="full recur-note">
            🔁 Quand cette tâche sera terminée, la suivante sera créée automatiquement{t.delai ? <> pour le <b>{fmtDate(nextDate(t.delai, t.recurrence))}</b></> : ' (sans délai)'}
            {postes.length > 0 && <> et attribuée au poste <b>{postes.join(', ')}</b></>}
            {' '}(aujourd’hui : {nextResponsables(data, { ...t, postesResp: postes }).map((id) => fullName(data.people.find((p) => p.id === id))).join(', ')}).
            {task.suivanteId && <><br />Occurrence suivante déjà créée.</>}
          </p>
        )}
        <fieldset className="full">
          <legend>Responsable(s)</legend>
          <div className="chips">
            {assignable.map((p) => (
              <button type="button" key={p.id} disabled={dis} className={`chip ${t.responsables.includes(p.id) ? 'on' : ''}`} onClick={() => toggleResp(p.id)}>
                {shortName(p)}
              </button>
            ))}
            {/* Responsables déjà assignés mais hors de la liste sélectionnable (inactif / autres) */}
            {t.responsables.filter((id) => !assignable.some((p) => p.id === id)).map((id) => (
              <span key={id} className="chip on locked">{fullName(data.people.find((p) => p.id === id))}</span>
            ))}
          </div>
          {!canAssignOthers && <small className="muted">Ton rôle ne permet d’assigner des tâches qu’à toi-même{t.sectionId ? ' dans cette section' : ''}.</small>}
        </fieldset>
        {quick && (
          <DocsField compact docs={t.documents ?? []} setDocs={(fn) => setT((x) => ({ ...x, documents: fn(x.documents ?? []) }))} disabled={dis} track={track.current} />
        )}
        {!quick && (
          <>
            <label>
              Événement lié
              <select value={t.eventId ?? ''} disabled={dis} onChange={(e) => setT((x) => applyDelaiRef(data, { ...x, eventId: e.target.value || undefined }))}>
                <option value="">—</option>
                {data.events.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </label>
            <label>
              Séance de comité liée
              <select value={t.meetingId ?? ''} disabled={dis} onChange={(e) => setT((x) => applyDelaiRef(data, { ...x, meetingId: e.target.value || undefined }))}>
                <option value="">—</option>
                {data.meetings.map((m) => <option key={m.id} value={m.id}>{m.titre}</option>)}
              </select>
            </label>
            {!kids.length && (
              <label className="full">
                Tâche principale
                <select
                  value={t.parentId ?? ''}
                  disabled={dis}
                  onChange={(e) => {
                    const p = data.tasks.find((x) => x.id === e.target.value);
                    setT((x) => ({ ...x, parentId: p?.id, ...(p && !x.sectionId ? { sectionId: p.sectionId, sousSection: p.sousSection } : {}) }));
                  }}
                >
                  <option value="">Aucune (tâche indépendante)</option>
                  {bySection(parentChoices).map((g) => (
                    <optgroup key={g.sec.id} label={g.sec.nom}>
                      {g.list.map((x) => <option key={x.id} value={x.id}>{x.titre}{x.delai ? ` (${fmtDate(x.delai)})` : ''}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            <label className="full">
              Remarque
              <textarea rows={3} value={t.remarque} disabled={dis} onChange={(e) => set('remarque', e.target.value)} />
            </label>
            {!t.parentId && (
              <fieldset className="full linked">
                <legend>Tâches liées{kids.length > 0 && ` · ${kids.filter((k) => isDone(data, k)).length}/${kids.length} terminées`}</legend>
                {isNew ? (
                  <small className="muted">Enregistre d’abord la tâche pour lui lier d’autres tâches.</small>
                ) : (
                  <>
                    {kids.length > 0 && (
                      <>
                        <div className="progress"><div style={{ width: `${Math.round((kids.filter((k) => isDone(data, k)).length / kids.length) * 100)}%` }} /></div>
                        <ul className="linked-list">
                          {kids.map((k) => (
                            <li key={k.id} className={isDone(data, k) ? 'done' : ''}>
                              <button type="button" className="linked-row" onClick={() => setOther({ task: k, isNew: false })}>
                                <span className="linked-title">{k.titre}</span>
                                <span className="avatars">{k.responsables.slice(0, 3).map((id) => <Avatar key={id} id={id} size={20} />)}</span>
                                <span className={`linked-date ${isLate(data, k) ? 'late-text' : 'muted'}`}>{k.delai ? fmtDate(k.delai) : '—'}</span>
                                <StatusBadge task={k} />
                              </button>
                              {editable && <button type="button" className="icon-btn" title="Délier (la tâche reste, sans tâche principale)" onClick={() => linkTask(k.id, undefined)}>✕</button>}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {!kids.length && <small className="muted">Aucune tâche liée. Une tâche liée a son propre responsable, délai et statut.</small>}
                    {editable && (
                      <div className="row wrap">
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => setOther({ task: newTask(user.id, { parentId: task.id, sectionId: task.sectionId, sousSection: task.sousSection, delai: task.delai }), isNew: true })}
                        >
                          + Nouvelle tâche liée
                        </button>
                        {!linking ? (
                          linkable.length > 0 && <button type="button" className="btn small" onClick={() => setLinking(true)}>🔗 Lier une tâche existante</button>
                        ) : (
                          <select autoFocus defaultValue="" onChange={(e) => { if (e.target.value) linkTask(e.target.value, task.id); setLinking(false); }} onBlur={() => setLinking(false)}>
                            <option value="">— Choisir la tâche à lier —</option>
                            {bySection(linkable).map((g) => (
                              <optgroup key={g.sec.id} label={g.sec.nom}>
                                {g.list.map((x) => <option key={x.id} value={x.id}>{x.titre}{x.delai ? ` (${fmtDate(x.delai)})` : ''}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        )}
                        {kids.length > 0 && <a className="small-link" href={`#/taches?parent=${task.id}`}>Voir dans la liste →</a>}
                      </div>
                    )}
                  </>
                )}
              </fieldset>
            )}
            <fieldset className="full">
              <legend>Checklist / sous-tâches</legend>
              {t.checklist.map((c) => (
                <div key={c.id} className="check-row">
                  <label className="inline">
                    <input type="checkbox" checked={c.done} disabled={dis} onChange={() => set('checklist', t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
                    <span className={c.done ? 'strike' : ''}>{c.label}</span>
                  </label>
                  {!dis && <button type="button" className="icon-btn" onClick={() => set('checklist', t.checklist.filter((x) => x.id !== c.id))} aria-label="Retirer">✕</button>}
                </div>
              ))}
              {!dis && (
                <div className="row">
                  <input
                    value={newItem}
                    placeholder="Ajouter une sous-tâche…"
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newItem.trim()) {
                        e.preventDefault();
                        addItem();
                      }
                    }}
                  />
                  <button type="button" className="btn" onClick={addItem}>Ajouter</button>
                </div>
              )}
            </fieldset>
            <DocsField docs={t.documents ?? []} setDocs={(fn) => setT((x) => ({ ...x, documents: fn(x.documents ?? []) }))} disabled={dis} track={track.current} />
            <fieldset className="full">
              <legend>Sondages</legend>
              {(data.polls ?? []).filter((p) => p.taskId === task.id).map((p) => <PollCard key={p.id} poll={p} compact />)}
              {isNew ? (
                <small className="muted">Enregistre d’abord la tâche pour y ajouter un sondage.</small>
              ) : (
                can('polls.create') && <button type="button" className="btn small" onClick={() => setNewPoll(true)}>📊 Créer un sondage</button>
              )}
              {!isNew && <a className="small-link" href="#/sondages">Voir tous les sondages →</a>}
            </fieldset>
            <EmailsField task={task} isNew={isNew} openEmailId={openEmailId} />
            {!isNew && <small className="muted full">Dernière modification : {fmtDateTime(task.updatedAt)} · créée par {fullName(data.people.find((p) => p.id === task.createdBy))}</small>}
          </>
        )}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && canDeleteTask(task) && <button className="btn danger" onClick={remove}>Supprimer</button>}
        <span className="grow" />
        <button className="btn" onClick={cancel}>{editable ? 'Annuler' : 'Fermer'}</button>
        {editable && <button className="btn primary" onClick={submit}>{isNew ? 'Créer' : 'Enregistrer'}</button>}
      </div>
      {newPoll && <PollEditor taskId={task.id} onClose={() => setNewPoll(false)} />}
      {other && <TaskModal task={other.task} isNew={other.isNew} onClose={() => setOther(null)} />}
    </Modal>
  );
}

/**
 * Délai : date fixe, ou date calculée à partir d'un événement / d'une séance
 * (« 1 semaine avant le Tournoi d'automne ») qui suit ensuite ses changements de date.
 */
function DelaiField({ t, setT, disabled }: { t: Task; setT: (fn: (x: Task) => Task) => void; disabled: boolean }) {
  const { data } = useStore();
  const refId = t.delaiRef ? (t.delaiRef.type === 'event' ? t.eventId : t.meetingId) : undefined;
  const mode = t.delaiRef && refId ? `${t.delaiRef.type}:${refId}` : 'fixe';
  const upcoming = <T extends { id: string; date: string }>(list: T[], current?: string) =>
    list.filter((x) => x.date >= today() || x.id === current).sort((a, b) => a.date.localeCompare(b.date));
  const events = upcoming(data.events, t.eventId);
  const meetings = upcoming(data.meetings, t.meetingId);

  const onMode = (v: string) => {
    if (v === 'fixe') return setT((x) => ({ ...x, delaiRef: undefined }));
    const [type, id] = v.split(':') as ['event' | 'meeting', string];
    setT((x) =>
      applyDelaiRef(data, {
        ...x,
        ...(type === 'event' ? { eventId: id } : { meetingId: id }),
        delaiRef: { type, joursAvant: x.delaiRef?.joursAvant ?? 7 },
      }),
    );
  };

  return (
    <>
      <label>
        Délai
        <select value={mode} disabled={disabled} onChange={(e) => onMode(e.target.value)}>
          <option value="fixe">📆 Date fixe</option>
          {events.length > 0 && (
            <optgroup label="Selon un événement">
              {events.map((e) => <option key={e.id} value={`event:${e.id}`}>🎉 {e.nom} ({fmtDate(e.date)})</option>)}
            </optgroup>
          )}
          {meetings.length > 0 && (
            <optgroup label="Selon une séance de comité">
              {meetings.map((m) => <option key={m.id} value={`meeting:${m.id}`}>🗓️ {m.titre} ({fmtDate(m.date)})</option>)}
            </optgroup>
          )}
        </select>
      </label>
      {mode === 'fixe' ? (
        <label>
          Date
          <input type="date" value={t.delai} disabled={disabled} onChange={(e) => setT((x) => ({ ...x, delai: e.target.value }))} />
        </label>
      ) : (
        <label>
          Quand ?
          <select
            value={t.delaiRef!.joursAvant}
            disabled={disabled}
            onChange={(e) => setT((x) => applyDelaiRef(data, { ...x, delaiRef: { ...x.delaiRef!, joursAvant: Number(e.target.value) } }))}
          >
            {DELAI_OFFSETS.map((o) => <option key={o.jours} value={o.jours}>{o.label}</option>)}
            {!DELAI_OFFSETS.some((o) => o.jours === t.delaiRef!.joursAvant) && <option value={t.delaiRef!.joursAvant}>{t.delaiRef!.joursAvant} jours avant</option>}
          </select>
          <small className="delai-calc">→ {fmtDate(t.delai)} · suit la date automatiquement</small>
        </label>
      )}
    </>
  );
}
