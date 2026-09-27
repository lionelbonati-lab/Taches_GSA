import { useState } from 'react';
import { useStore } from '../data/store';
import { canEditTask } from '../data/permissions';
import type { Task } from '../data/types';
import { fmtDateTime, fullName, today, uid } from '../data/utils';
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
  const { data, user, perms, can, saveTask, update } = useStore();
  const [t, setT] = useState<Task>(task);
  const [newItem, setNewItem] = useState('');
  const [err, setErr] = useState('');
  if (!user) return null;

  const editable = isNew ? true : canEditTask(perms, user.id, task);
  const canAssignOthers = can('tasks.createAny') || can('tasks.editAny');
  const section = data.sections.find((s) => s.id === t.sectionId);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));
  const assignable = data.people.filter((p) => p.actif && (canAssignOthers || p.id === user.id));

  const toggleResp = (id: string) =>
    set('responsables', t.responsables.includes(id) ? t.responsables.filter((x) => x !== id) : [...t.responsables, id]);

  const submit = () => {
    if (!t.titre.trim()) return setErr('Le titre de la tâche est obligatoire.');
    if (!t.sectionId) return setErr('Choisis une section.');
    if (t.responsables.length === 0) return setErr('Au moins un responsable est requis.');
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
            {data.sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
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
        <label>
          Délai
          <input type="date" value={t.delai} disabled={dis} onChange={(e) => set('delai', e.target.value)} />
        </label>
        <label>
          Statut
          <select value={t.statusId} disabled={dis} onChange={(e) => set('statusId', e.target.value)}>
            {data.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
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
          {!canAssignOthers && <small className="muted">Ton rôle ne permet de créer des tâches que pour toi-même.</small>}
        </fieldset>
        {!quick && (
          <>
            <label>
              Événement lié
              <select value={t.eventId ?? ''} disabled={dis} onChange={(e) => set('eventId', e.target.value || undefined)}>
                <option value="">—</option>
                {data.events.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </label>
            <label>
              Séance de comité liée
              <select value={t.meetingId ?? ''} disabled={dis} onChange={(e) => set('meetingId', e.target.value || undefined)}>
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
        {!isNew && editable && (can('tasks.editAny') || task.createdBy === user.id) && <button className="btn danger" onClick={remove}>Supprimer</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>{editable ? 'Annuler' : 'Fermer'}</button>
        {editable && <button className="btn primary" onClick={submit}>{isNew ? 'Créer' : 'Enregistrer'}</button>}
      </div>
    </Modal>
  );
}
