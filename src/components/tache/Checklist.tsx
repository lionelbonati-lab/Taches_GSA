import { useState } from 'react';
import type { Task } from '../../data/types';
import { uid } from '../../data/utils';
import type { SetT } from './Quand';

/** Fiche d'une tâche : « ☑️ Checklist », les petites étapes à cocher. */
export function Checklist({ t, setT, dis }: { t: Task; setT: SetT; dis: boolean }) {
  const [newItem, setNewItem] = useState('');
  const setListe = (checklist: Task['checklist']) => setT((x) => ({ ...x, checklist }));
  const addItem = () => {
    if (!newItem.trim()) return;
    setListe([...t.checklist, { id: uid('c'), label: newItem.trim(), done: false }]);
    setNewItem('');
  };
  return (
    <fieldset className="full">
      <legend>☑️ Checklist{t.checklist.length > 0 && ` · ${t.checklist.filter((c) => c.done).length}/${t.checklist.length}`}</legend>
      {t.checklist.map((c) => (
        <div key={c.id} className="check-row">
          <label className="inline">
            <input type="checkbox" checked={c.done} disabled={dis} onChange={() => setListe(t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
            <span className={c.done ? 'strike' : ''}>{c.label}</span>
          </label>
          {!dis && <button type="button" className="icon-btn" onClick={() => setListe(t.checklist.filter((x) => x.id !== c.id))} aria-label="Retirer">✕</button>}
        </div>
      ))}
      {!dis && (
        <div className="row">
          <input
            autoFocus={!t.checklist.length}
            value={newItem}
            placeholder="Ajouter une étape…"
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
  );
}
