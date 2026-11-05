import { useState } from 'react';
import { useStore } from '../../data/store';
import type { Task } from '../../data/types';
import { childrenOf, fmtDate, isDone, isLate, newTask } from '../../data/utils';
import { Avatar, StatusBadge } from '../ui';
import { Icone } from '../icones';
import { EvenementLie, SeanceLiee, type SetT } from './Quand';

type Props = {
  t: Task;
  setT: SetT;
  task: Task;
  isNew: boolean;
  dis: boolean;
  editable: boolean;
  /** Tâches rattachées à celle-ci. */
  kids: Task[];
  /** Ouvre une autre tâche par-dessus la fiche (rattachée, ou nouvelle). */
  ouvrir: (x: Task, nouvelle: boolean) => void;
  /** Rattacher (ou détacher : undefined) un point existant ; par défaut tout de suite (fiche du PV : inscrit aussi au PV). */
  rattacher?: (taskId: string, parentId: string | undefined) => void;
};

/** Fiche d'une tâche : « 🧩 Rattachements » (événement, séance, tâche principale, tâches rattachées). */
export function Rattachements({ t, setT, task, isNew, dis, editable, kids, ouvrir, rattacher }: Props) {
  const { data, user, linkTask: lier } = useStore();
  const linkTask = rattacher ?? lier;
  const [linking, setLinking] = useState(false);
  if (!user) return null;
  const parentChoices = data.tasks
    .filter((x) => !x.paiement && (x.id === t.parentId || (x.id !== task.id && !x.parentId && !isDone(data, x))))
    .sort((a, b) => a.titre.localeCompare(b.titre));
  const linkable = data.tasks.filter((x) => !x.paiement && x.id !== task.id && !x.parentId && !childrenOf(data, x.id).length && !isDone(data, x));
  const bySection = <T extends Task>(list: T[]) =>
    data.sections.map((sec) => ({ sec, list: list.filter((x) => x.sectionId === sec.id) })).filter((g) => g.list.length);
  return (
    <fieldset className="full liens">
      <legend>🧩 Rattachements</legend>
      <div className="form">
        <EvenementLie t={t} setT={setT} disabled={dis} />
        <SeanceLiee t={t} setT={setT} disabled={dis} />
        {!kids.length && (
          <label className="full">
            Point principal
            <select
              value={t.parentId ?? ''}
              disabled={dis}
              onChange={(e) => {
                const p = data.tasks.find((x) => x.id === e.target.value);
                setT((x) => ({ ...x, parentId: p?.id, ...(p && !x.sectionId ? { sectionId: p.sectionId, sousSection: p.sousSection } : {}) }));
              }}
            >
              <option value="">Aucun (point indépendant)</option>
              {bySection(parentChoices).map((g) => (
                <optgroup key={g.sec.id} label={g.sec.nom}>
                  {g.list.map((x) => <option key={x.id} value={x.id}>{x.titre}{x.delai ? ` (${fmtDate(x.delai)})` : ''}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        {!t.parentId && !isNew && (
          <div className="full linked">
            <span className="field-label">Points rattachés{kids.length > 0 && ` · ${kids.filter((k) => isDone(data, k)).length}/${kids.length} terminés`}</span>
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
                      {editable && <button type="button" className="icon-btn" title="Détacher (le point reste, sans point principal)" onClick={() => linkTask(k.id, undefined)}>✕</button>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!kids.length && <small className="muted">Aucun. Un point rattaché a son propre responsable, délai et statut.</small>}
            {editable && (
              <div className="row wrap">
                <button
                  type="button"
                  className="btn small"
                  onClick={() => ouvrir(newTask(user.id, { parentId: task.id, sectionId: task.sectionId, sousSection: task.sousSection, delai: task.delai }), true)}
                >
                  + Nouveau point rattaché
                </button>
                {!linking ? (
                  linkable.length > 0 && <button type="button" className="btn small" onClick={() => setLinking(true)}><Icone n="rattacher" /> Rattacher un point existant</button>
                ) : (
                  <select autoFocus defaultValue="" onChange={(e) => { if (e.target.value) linkTask(e.target.value, task.id); setLinking(false); }} onBlur={() => setLinking(false)}>
                    <option value="">— Choisir le point à rattacher —</option>
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
