import { useState } from 'react';
import { useStore } from '../../data/store';
import type { Task } from '../../data/types';
import { ancetresOf, childrenOf, fmtDate, isDone, isLate, newTask, parentOf, peutRattacherA } from '../../data/utils';
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
  /** Points rattachés directement à celui-ci. */
  kids: Task[];
  /** Ouvre une autre tâche par-dessus la fiche (rattachée, ou nouvelle). */
  ouvrir: (x: Task, nouvelle: boolean) => void;
  /** Rattacher (ou détacher : undefined) un point existant ; par défaut tout de suite (fiche du PV : inscrit aussi au PV). */
  rattacher?: (taskId: string, parentId: string | undefined) => void;
};

/**
 * Fiche d'un point : « 🧩 Rattachements » (événement, séance, le point auquel il est rattaché, ceux qui lui sont rattachés).
 * En cascade : un point rattaché à un autre peut lui-même en avoir de rattachés, sans boucle.
 */
export function Rattachements({ t, setT, task, isNew, dis, editable, kids, ouvrir, rattacher }: Props) {
  const { data, user, linkTask: lier } = useStore();
  const linkTask = rattacher ?? lier;
  const [linking, setLinking] = useState(false);
  if (!user) return null;
  // « Rattaché à » : tout point en cours, sauf lui-même et ceux qui lui sont rattachés (à tout niveau : pas de boucle).
  const parentChoices = data.tasks
    .filter((x) => !x.paiement && (x.id === t.parentId || (!isDone(data, x) && peutRattacherA(data, task.id, x.id))))
    .sort((a, b) => a.titre.localeCompare(b.titre));
  // Rattacher un point existant à celui-ci : tout point en cours, sauf lui-même, ceux auxquels il est rattaché (boucle)
  // et ceux qui lui sont déjà rattachés. Un point déjà rattaché ailleurs y est déplacé.
  const ancetres = new Set(ancetresOf(data, t).map((x) => x.id));
  const linkable = data.tasks.filter((x) => !x.paiement && x.id !== task.id && !ancetres.has(x.id) && x.parentId !== task.id && !isDone(data, x));
  const ailleurs = (x: Task) => parentOf(data, x)?.titre;
  const bySection = <T extends Task>(list: T[]) =>
    data.sections.map((sec) => ({ sec, list: list.filter((x) => x.sectionId === sec.id) })).filter((g) => g.list.length);
  return (
    <fieldset className="full liens">
      <legend>🧩 Rattachements</legend>
      <div className="form">
        <EvenementLie t={t} setT={setT} disabled={dis} />
        <SeanceLiee t={t} setT={setT} disabled={dis} />
        <label className="full">
          Rattaché à
          <select
            value={t.parentId ?? ''}
            disabled={dis}
            onChange={(e) => {
              const p = data.tasks.find((x) => x.id === e.target.value);
              setT((x) => ({ ...x, parentId: p?.id, ...(p && !x.sectionId ? { sectionId: p.sectionId, sousSection: p.sousSection } : {}) }));
            }}
          >
            <option value="">Aucun point (indépendant)</option>
            {bySection(parentChoices).map((g) => (
              <optgroup key={g.sec.id} label={g.sec.nom}>
                {g.list.map((x) => <option key={x.id} value={x.id}>{x.titre}{x.delai ? ` (${fmtDate(x.delai)})` : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {!isNew && (
          <div className="full linked">
            <span className="field-label">Points rattachés à celui-ci{kids.length > 0 && ` · ${kids.filter((k) => isDone(data, k)).length}/${kids.length} terminés`}</span>
            {kids.length > 0 && (
              <>
                <div className="progress"><div style={{ width: `${Math.round((kids.filter((k) => isDone(data, k)).length / kids.length) * 100)}%` }} /></div>
                <ul className="linked-list">
                  {kids.map((k) => (
                    <li key={k.id} className={isDone(data, k) ? 'done' : ''}>
                      <button type="button" className="linked-row" onClick={() => ouvrir(k, false)}>
                        <span className="linked-title">
                          {k.titre}
                          {/* En cascade : ses propres points rattachés. */}
                          {childrenOf(data, k.id).length > 0 && <small className="muted" title="Points rattachés à celui-ci"> <Icone n="rattacher" /> {childrenOf(data, k.id).length}</small>}
                        </span>
                        <span className="avatars">{k.responsables.slice(0, 3).map((id) => <Avatar key={id} id={id} size={20} />)}</span>
                        <span className={`linked-date ${isLate(data, k) ? 'late-text' : 'muted'}`}>{k.delai ? fmtDate(k.delai) : '—'}</span>
                        <StatusBadge task={k} />
                      </button>
                      {editable && <button type="button" className="icon-btn" title="Détacher (le point reste, rattaché à aucun point)" onClick={() => linkTask(k.id, undefined)}>✕</button>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!kids.length && <small className="muted">Aucun. Un point rattaché a son propre responsable, délai et statut ; il peut lui-même en avoir de rattachés.</small>}
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
                        {g.list.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.titre}{x.delai ? ` (${fmtDate(x.delai)})` : ''}{ailleurs(x) ? ` — rattaché à « ${ailleurs(x)} »` : ''}
                          </option>
                        ))}
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
