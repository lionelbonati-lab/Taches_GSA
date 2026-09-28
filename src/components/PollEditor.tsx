import { useState } from 'react';
import { useStore } from '../data/store';
import type { Poll, PollType } from '../data/types';
import { OUINON, POLL_TYPES, committeeOf } from '../data/polls';
import { shortName, today, uid } from '../data/utils';
import { Modal } from './ui';

const emptyOptions = (type: PollType): Poll['options'] =>
  type === 'ouinon' ? OUINON : type === 'dates'
    ? [{ id: uid('o'), label: '', date: '', heure: '' }, { id: uid('o'), label: '', date: '', heure: '' }]
    : [{ id: uid('o'), label: '' }, { id: uid('o'), label: '' }];

/** Création / modification d'un sondage. */
export function PollEditor({ poll, taskId, onClose }: { poll?: Poll; taskId?: string; onClose: () => void }) {
  const { data, user, savePoll } = useStore();
  const [p, setP] = useState<Poll>(
    () =>
      poll ?? {
        id: uid('poll'),
        question: '',
        type: 'ouinon',
        multiple: false,
        options: OUINON,
        votants: committeeOf(data).map((x) => x.id),
        anonyme: false,
        taskId,
        creePar: user?.id ?? '',
        creeLe: new Date().toISOString(),
        votes: {},
      },
  );
  const [err, setErr] = useState('');
  const set = (patch: Partial<Poll>) => setP((x) => ({ ...x, ...patch }));
  const setOpt = (id: string, patch: Partial<Poll['options'][number]>) => set({ options: p.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const people = data.people.filter((x) => x.actif);
  const task = data.tasks.find((t) => t.id === p.taskId);

  const submit = () => {
    if (!p.question.trim()) return setErr('Écris la question.');
    const options = p.type === 'ouinon' ? OUINON : p.options.filter((o) => (p.type === 'dates' ? !!o.date : !!o.label.trim()));
    if (options.length < 2) return setErr(p.type === 'dates' ? 'Propose au moins deux dates.' : 'Propose au moins deux réponses.');
    if (!p.votants.length) return setErr('Choisis au moins un votant.');
    savePoll({ ...p, question: p.question.trim(), options, multiple: p.type === 'dates' ? true : p.type === 'ouinon' ? false : p.multiple }, !poll);
    onClose();
  };

  return (
    <Modal title={poll ? 'Modifier le sondage' : 'Nouveau sondage'} onClose={onClose} wide>
      <div className="form">
        <label className="full">
          Question
          <input autoFocus value={p.question} onChange={(e) => set({ question: e.target.value })} placeholder="Ex. Qui est disponible pour le souper ?" />
        </label>
        <label className="full">
          Précisions (facultatif)
          <textarea rows={2} value={p.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} />
        </label>
        <label>
          Type
          <select value={p.type} onChange={(e) => { const type = e.target.value as PollType; set({ type, options: emptyOptions(type) }); }}>
            {POLL_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label>
          Date limite (facultatif)
          <input type="date" value={p.dateLimite ?? ''} min={today()} onChange={(e) => set({ dateLimite: e.target.value || undefined })} />
        </label>

        {p.type !== 'ouinon' && (
          <fieldset className="full">
            <legend>{p.type === 'dates' ? 'Dates proposées' : 'Réponses possibles'}</legend>
            {p.options.map((o, i) => (
              <div key={o.id} className="row">
                {p.type === 'dates' ? (
                  <>
                    <input type="date" value={o.date ?? ''} onChange={(e) => setOpt(o.id, { date: e.target.value })} aria-label={`Date ${i + 1}`} />
                    <input type="time" value={o.heure ?? ''} onChange={(e) => setOpt(o.id, { heure: e.target.value })} aria-label={`Heure ${i + 1}`} />
                    <input className="grow" placeholder="Remarque (facultatif)" value={o.label} onChange={(e) => setOpt(o.id, { label: e.target.value })} />
                  </>
                ) : (
                  <input className="grow" placeholder={`Réponse ${i + 1}`} value={o.label} onChange={(e) => setOpt(o.id, { label: e.target.value })} />
                )}
                <button type="button" className="icon-btn" disabled={p.options.length <= 2} onClick={() => set({ options: p.options.filter((x) => x.id !== o.id) })} aria-label="Retirer">✕</button>
              </div>
            ))}
            <button type="button" className="btn small" onClick={() => set({ options: [...p.options, { id: uid('o'), label: '', ...(p.type === 'dates' ? { date: '', heure: '' } : {}) }] })}>
              + {p.type === 'dates' ? 'Ajouter une date' : 'Ajouter une réponse'}
            </button>
            {p.type === 'choix' && (
              <label className="inline"><input type="checkbox" checked={p.multiple} onChange={(e) => set({ multiple: e.target.checked })} /> Plusieurs réponses possibles</label>
            )}
            {p.type === 'dates' && <small className="muted">Chacun coche toutes les dates où il est disponible.</small>}
          </fieldset>
        )}

        <fieldset className="full">
          <legend>Votants ({p.votants.length})</legend>
          <div className="row">
            <button type="button" className="btn small" onClick={() => set({ votants: committeeOf(data).map((x) => x.id) })}>Comité</button>
            <button type="button" className="btn small" onClick={() => set({ votants: people.map((x) => x.id) })}>Tout le monde</button>
            <button type="button" className="btn small" onClick={() => set({ votants: [] })}>Personne</button>
          </div>
          <div className="chips">
            {people.map((x) => (
              <button type="button" key={x.id} className={`chip ${p.votants.includes(x.id) ? 'on' : ''}`}
                onClick={() => set({ votants: p.votants.includes(x.id) ? p.votants.filter((v) => v !== x.id) : [...p.votants, x.id] })}>
                {shortName(x)}
              </button>
            ))}
          </div>
          <label className="inline"><input type="checkbox" checked={p.anonyme} onChange={(e) => set({ anonyme: e.target.checked })} /> Réponses anonymes (on voit qui a répondu, pas ce qu’il a choisi)</label>
        </fieldset>

        {taskId || task ? (
          <p className="muted full" style={{ margin: 0 }}>📌 Lié à la tâche « {task?.titre} »</p>
        ) : (
          <label>
            Section de l’ordre du jour
            <select value={p.sectionId ?? ''} onChange={(e) => set({ sectionId: e.target.value || undefined })}>
              <option value="">— Aucune (bloc « Sondages ») —</option>
              {data.sections.map((sec) => <option key={sec.id} value={sec.id}>{sec.nom}</option>)}
            </select>
          </label>
        )}
      </div>
      {poll && Object.keys(poll.votes).length > 0 && <p className="muted">⚠ Des réponses existent déjà : retirer une réponse possible efface les votes correspondants.</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>{poll ? 'Enregistrer' : 'Créer le sondage'}</button>
      </div>
    </Modal>
  );
}
