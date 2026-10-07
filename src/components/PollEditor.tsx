import { useState } from 'react';
import { useStore } from '../data/store';
import type { Poll, PollType } from '../data/types';
import { OUINON, POLL_TYPES, autreOption, committeeOf, electorat } from '../data/polls';
import { fullName, nomPoste, today, uid } from '../data/utils';
import { Modal } from './ui';
import { estPartagee } from '../data/partage';
import { useClubOptional } from '../data/club';
import { UNIT_TYPES } from '../data/units';

const emptyOptions = (type: PollType): Poll['options'] =>
  type === 'ouinon' ? OUINON : type === 'dates'
    ? [{ id: uid('o'), label: '', date: '', heure: '' }, { id: uid('o'), label: '', date: '', heure: '' }]
    : [{ id: uid('o'), label: '' }, { id: uid('o'), label: '' }];

/** Création / modification d'un sondage. */
export function PollEditor({ poll, taskId, onClose }: { poll?: Poll; taskId?: string; onClose: () => void }) {
  const { data, user, savePoll, sondagesEntites } = useStore();
  const club = useClubOptional();
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
  // Réponse « Autre » (texte libre) : gardée à part, ajoutée en dernier à l'enregistrement.
  const [autre, setAutre] = useState(() => !!poll?.options.some((o) => o.autre));
  const [err, setErr] = useState('');
  const set = (patch: Partial<Poll>) => setP((x) => ({ ...x, ...patch }));
  const setOpt = (id: string, patch: Partial<Poll['options'][number]>) => set({ options: p.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const people = data.people.filter((x) => x.actif);
  const task = data.tasks.find((t) => t.id === p.taskId);
  // Autres entités du club dont tous les membres peuvent voter aussi (celles déjà choisies restent, même archivées).
  const entites = club && (sondagesEntites || p.entites?.length) ? club.units.filter((u) => u.id !== club.current.id && (!u.archive || p.entites?.includes(u.id))) : [];
  const total = club && p.entites?.length ? electorat(p, club.current.id, people, club.units).cles.length : p.votants.length;
  // Votants à ajouter : soi-même d'abord.
  const aAjouter = people.filter((x) => !p.votants.includes(x.id)).sort((a, b) => Number(b.id === user?.id) - Number(a.id === user?.id));
  const basculeVotant = (id: string) => set({ votants: p.votants.includes(id) ? p.votants.filter((v) => v !== id) : [...p.votants, id] });
  const basculeEntite = (id: string) => {
    const l = p.entites?.includes(id) ? p.entites.filter((x) => x !== id) : [...(p.entites ?? []), id];
    set({ entites: l.length ? l : undefined });
  };

  const submit = () => {
    if (!p.question.trim()) return setErr('Écris la question.');
    const base = p.type === 'ouinon' ? OUINON : p.options.filter((o) => !o.autre && (p.type === 'dates' ? !!o.date : !!o.label.trim()));
    const options = autre ? [...base, autreOption(p.type)] : base;
    if (base.length < 2) return setErr(p.type === 'dates' ? 'Propose au moins deux dates.' : 'Propose au moins deux réponses.');
    if (!p.votants.length && !p.entites?.length) return setErr('Choisis au moins un votant ou une entité.');
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
            {p.options.filter((o) => !o.autre).map((o, i, list) => (
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
                <button type="button" className="icon-btn" disabled={list.length <= 2} onClick={() => set({ options: p.options.filter((x) => x.id !== o.id) })} aria-label="Retirer">✕</button>
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
        <label className="inline full">
          <input type="checkbox" checked={autre} onChange={(e) => setAutre(e.target.checked)} />
          {p.type === 'dates' ? 'Ajouter « Autre proposition » : chacun peut écrire une autre date' : 'Ajouter « Autre » : chacun peut écrire sa propre réponse'}
        </label>

        <fieldset className="full qui">
          <legend>{entites.length ? `Votants de « ${club!.current.nom} »` : 'Votants'} ({p.votants.length})</legend>
          <div className="row">
            <button type="button" className="btn small" onClick={() => set({ votants: committeeOf(data).map((x) => x.id) })}>Comité</button>
            <button type="button" className="btn small" onClick={() => set({ votants: people.map((x) => x.id) })}>Tout le monde</button>
            <button type="button" className="btn small" onClick={() => set({ votants: [] })}>Personne</button>
          </div>
          <div className="chips">
            {p.votants.map((id) => {
              const x = data.people.find((y) => y.id === id);
              return (
                <span key={id} className="chip on">
                  {fullName(x)}
                  <button type="button" className="chip-x" aria-label={`Retirer ${fullName(x)}`} onClick={() => basculeVotant(id)}>✕</button>
                </span>
              );
            })}
            {!p.votants.length && <span className="muted">Personne pour l’instant.</span>}
            {aAjouter.length > 0 && (
              <select className="chip-add" value="" aria-label="Ajouter un votant" onChange={(e) => e.target.value && basculeVotant(e.target.value)}>
                <option value="">＋ Ajouter…</option>
                {aAjouter.map((x) => <option key={x.id} value={x.id}>{nomPoste(x, user?.id)}</option>)}
              </select>
            )}
          </div>
          <label className="inline"><input type="checkbox" checked={p.anonyme} onChange={(e) => set({ anonyme: e.target.checked })} /> Réponses anonymes (on voit qui a répondu, pas ce qu’il a choisi)</label>
        </fieldset>

        {entites.length > 0 && (
          <fieldset className="full poll-entites">
            <legend>Ouvrir aussi à d’autres entités</legend>
            <small className="muted">Tous leurs membres votent, depuis leur entité (le sondage y apparaît). Qui rejoint ou quitte l’entité vote ou ne vote plus ; une personne de plusieurs entités ne vote qu’une fois.</small>
            <div className="chips">
              {entites.map((u) => (
                <button type="button" key={u.id} className={`chip ${p.entites?.includes(u.id) ? 'on' : ''}`} onClick={() => basculeEntite(u.id)}>
                  {UNIT_TYPES[u.type].icon} {u.nom} <small>({u.membres.filter((m) => !m.viaEntite).length})</small>
                </button>
              ))}
            </div>
            {!!p.entites?.length && <small className="muted">{total} votant{total > 1 ? 's' : ''} en tout.</small>}
          </fieldset>
        )}

        {taskId || task ? (
          <p className="muted full" style={{ margin: 0 }}>📌 Lié à la tâche « {task?.titre} »</p>
        ) : (
          <label>
            Section de l’ordre du jour
            <select value={p.sectionId ?? ''} onChange={(e) => set({ sectionId: e.target.value || undefined })}>
              <option value="">— Aucune (bloc « Sondages ») —</option>
              {data.sections.filter((sec) => !estPartagee(sec.id)).map((sec) => <option key={sec.id} value={sec.id}>{sec.nom}</option>)}
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
