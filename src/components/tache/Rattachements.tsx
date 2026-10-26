import { useState } from 'react';
import { useStore } from '../../data/store';
import type { Task } from '../../data/types';
import { childrenOf, fmtDate, isDone, isLate, newTask } from '../../data/utils';
import { Avatar, StatusBadge } from '../ui';
import { Icone } from '../icones';
import { EvenementLie, SeanceIci, SeanceLiee, type SetT } from './Quand';

type Props = {
  t: Task;
  setT: SetT;
  task: Task;
  isNew: boolean;
  dis: boolean;
  editable: boolean;
  complet: boolean;
  /** Tâches rattachées à celle-ci. */
  kids: Task[];
  /** Ouvre une autre tâche par-dessus la fiche (rattachée, ou nouvelle). */
  ouvrir: (x: Task, nouvelle: boolean) => void;
};

/** Fiche d'une tâche : « 🧩 Rattachements » (événement, séance, tâche principale, tâches rattachées). */
export function Rattachements({ t, setT, task, isNew, dis, editable, complet, kids, ouvrir }: Props) {
  const { data, user, linkTask } = useStore();
  const [linking, setLinking] = useState(false);
  if (!user) return null;
  const parentChoices = data.tasks
    .filter((x) => !x.source && (x.id === t.parentId || (x.id !== task.id && !x.parentId && !isDone(data, x))))
    .sort((a, b) => a.titre.localeCompare(b.titre));
  const linkable = data.tasks.filter((x) => !x.source && x.id !== task.id && !x.parentId && !childrenOf(data, x.id).length && !isDone(data, x));
  const bySection = <T extends Task>(list: T[]) =>
    data.sections.map((sec) => ({ sec, list: list.filter((x) => x.sectionId === sec.id) })).filter((g) => g.list.length);
  return (
    <fieldset className="full liens">
      <legend>🧩 Rattachements</legend>
      <div className="form">
        {t.source && <SeanceIci t={t} setT={setT} disabled={dis || !complet} />}
        {!t.source && <EvenementLie t={t} setT={setT} disabled={dis} />}
        {!t.source && <SeanceLiee t={t} setT={setT} disabled={dis} />}
        {!t.source && !kids.length && (
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
        {!t.source && !t.parentId && !isNew && (
          <div className="full linked">
            <span className="field-label">Tâches rattachées{kids.length > 0 && ` · ${kids.filter((k) => isDone(data, k)).length}/${kids.length} terminées`}</span>
            {kids.length > 0 && (
              <>
                <div className="progress"><div style={{ width: `${Math.round((kids.filter((k) => isDone(data, k)).length / kids.length) * 100)}%` }} /></div>
                <ul className="linked-list">
                  {kids.map((k) => (
                    <li key={k.id} className={isDone(data, k) ? 'done' : ''}>
                      <button type="button" className="linked-row" onClick={() => ouvrir(k, false)}>
                        <span className="linked-title">{k.titre}</span>
                        <span className="avatars">{k.responsables.slice(0, 3).map((id) => <Avatar key={id} id={id} size={20} />)}</span>
                        <span className={`linked-date ${isLate(data, k) ? 'late-text' : 'muted'}`}>{k.delai ? fmtDate(k.delai) : '—'}</span>
                        <StatusBadge task={k} />
                      </button>
                      {editable && <button type="button" className="icon-btn" title="Détacher (la tâche reste, sans tâche principale)" onClick={() => linkTask(k.id, undefined)}>✕</button>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!kids.length && <small className="muted">Aucune. Une tâche rattachée a son propre responsable, délai et statut.</small>}
            {editable && (
              <div className="row wrap">
                <button
                  type="button"
                  className="btn small"
                  onClick={() => ouvrir(newTask(user.id, { parentId: task.id, sectionId: task.sectionId, sousSection: task.sousSection, delai: task.delai }), true)}
                >
                  + Nouvelle tâche rattachée
                </button>
                {!linking ? (
                  linkable.length > 0 && <button type="button" className="btn small" onClick={() => setLinking(true)}><Icone n="rattacher" /> Rattacher une tâche existante</button>
                ) : (
                  <select autoFocus defaultValue="" onChange={(e) => { if (e.target.value) linkTask(e.target.value, task.id); setLinking(false); }} onBlur={() => setLinking(false)}>
                    <option value="">— Choisir la tâche à rattacher —</option>
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
          </div>
        )}
      </div>
    </fieldset>
  );
}
