import { useState } from 'react';
import { useStore } from '../data/store';
import type { Recurrence, Task } from '../data/types';
import { DELAI_OFFSETS, RECURRENCES, applyDelaiRef, fmtDate, fmtDateTime, fullName, nextDate, nextResponsables, postesFor, today, uid } from '../data/utils';
import { Modal } from './ui';

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

export function TaskModal({ task, isNew, onClose, quick }: { task: Task; isNew: boolean; onClose: () => void; quick?: boolean }) {
  const { data, user, canEditTask, canDeleteTask, canAssignOthers: canAssign, creatableSections, saveTask, update } = useStore();
  const [t, setT] = useState<Task>(task);
  const [newItem, setNewItem] = useState('');
  const [err, setErr] = useState('');
  if (!user) return null;

  const editable = isNew ? true : canEditTask(task);
  const canAssignOthers = t.sectionId ? canAssign(t.sectionId) : creatableSections().some((s) => canAssign(s.id));
  const section = data.sections.find((s) => s.id === t.sectionId);
  // Sections proposées : celles où le rôle permet de créer (+ la section actuelle en modification).
  const sectionChoices = data.sections.filter((s) => creatableSections().some((c) => c.id === s.id) || s.id === task.sectionId);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));
  const assignable = data.people.filter((p) => p.actif && (canAssignOthers || p.id === user.id));

  const toggleResp = (id: string) =>
    set('responsables', t.responsables.includes(id) ? t.responsables.filter((x) => x !== id) : [...t.responsables, id]);

  const submit = () => {
    if (!t.titre.trim()) return setErr('Le titre de la tâche est obligatoire.');
    if (!t.sectionId) return setErr('Choisis une section.');
    if (t.responsables.length === 0) return setErr('Au moins un responsable est requis.');
    if (!canAssign(t.sectionId) && t.responsables.some((id) => id !== user.id) && JSON.stringify(t.responsables) !== JSON.stringify(task.responsables))
      return setErr('Ton rôle ne permet pas d’assigner d’autres personnes dans cette section.');
    saveTask({ ...t, titre: t.titre.trim() }, isNew);
    onClose();
  };

  const remove = () => {
    if (!confirm(`Supprimer la tâche « ${task.titre} » ?`)) return;
    update((d) => {
      d.tasks = d.tasks.filter((x) => x.id !== task.id);
    }, `Suppression de la tâche « ${task.titre} »`);
    onClose();
  };

  const dis = !editable;
  const postes = postesFor(data, t, isNew ? undefined : task) ?? [];
  return (
    <Modal title={quick ? 'Ajout rapide' : isNew ? 'Nouvelle tâche' : editable ? 'Modifier la tâche' : 'Détail de la tâche'} onClose={onClose} wide={!quick}>
      <div className="form">
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
            🔁 Quand cette tâche sera terminée, la suivante sera créée automatiquement pour le <b>{fmtDate(nextDate(t.delai, t.recurrence))}</b>
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
                {p.prenom} {p.nom[0]}.
              </button>
            ))}
            {/* Responsables déjà assignés mais hors de la liste sélectionnable (inactif / autres) */}
            {t.responsables.filter((id) => !assignable.some((p) => p.id === id)).map((id) => (
              <span key={id} className="chip on locked">{fullName(data.people.find((p) => p.id === id))}</span>
            ))}
          </div>
          {!canAssignOthers && <small className="muted">Ton rôle ne permet d’assigner des tâches qu’à toi-même{t.sectionId ? ' dans cette section' : ''}.</small>}
        </fieldset>
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
            <label className="full">
              Remarque
              <textarea rows={3} value={t.remarque} disabled={dis} onChange={(e) => set('remarque', e.target.value)} />
            </label>
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
                        set('checklist', [...t.checklist, { id: uid('c'), label: newItem.trim(), done: false }]);
                        setNewItem('');
                      }
                    }}
                  />
                  <button type="button" className="btn" onClick={() => { if (newItem.trim()) { set('checklist', [...t.checklist, { id: uid('c'), label: newItem.trim(), done: false }]); setNewItem(''); } }}>Ajouter</button>
                </div>
              )}
            </fieldset>
            {!isNew && <small className="muted full">Dernière modification : {fmtDateTime(task.updatedAt)} · créée par {fullName(data.people.find((p) => p.id === task.createdBy))}</small>}
          </>
        )}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && canDeleteTask(task) && <button className="btn danger" onClick={remove}>Supprimer</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>{editable ? 'Annuler' : 'Fermer'}</button>
        {editable && <button className="btn primary" onClick={submit}>{isNew ? 'Créer' : 'Enregistrer'}</button>}
      </div>
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
