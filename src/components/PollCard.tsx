import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { Poll } from '../data/types';
import { AUTRE_ID, POLL_TYPES, autreTextes, isOpen, optionLabel, results } from '../data/polls';
import { fmtDate, fullName, initials } from '../data/utils';
import { PollEditor } from './PollEditor';

/** Sondage : vote, résultats (barres, tableau des disponibilités) et gestion. */
export function PollCard({ poll, compact, highlight }: { poll: Poll; compact?: boolean; highlight?: boolean }) {
  const { data, user, votePoll, closePoll, deletePoll, canManagePoll } = useStore();
  const mine = user ? poll.votes[user.id] : undefined;
  const [sel, setSel] = useState<string[]>(mine ?? []);
  const myText = user ? poll.textes?.[user.id] ?? '' : '';
  const [texte, setTexte] = useState(myText);
  const [changing, setChanging] = useState(false);
  const [edit, setEdit] = useState(false);
  if (!user) return null;

  const open = isOpen(poll);
  const voter = poll.votants.includes(user.id);
  const showForm = open && voter && (!mine || changing);
  const r = results(poll);
  const person = (id: string) => data.people.find((p) => p.id === id);
  const task = data.tasks.find((t) => t.id === poll.taskId);
  const waiting = poll.votants.filter((id) => !poll.votes[id]);
  const manage = canManagePoll(poll);

  const toggle = (id: string) =>
    setSel((s) => (poll.multiple ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  // « Autre » cochée : la réponse écrite est obligatoire.
  const autreOn = sel.includes(AUTRE_ID) && poll.options.some((o) => o.autre);
  const canSend = (sel.length > 0 || poll.type === 'dates') && (!autreOn || !!texte.trim());

  return (
    <article id={`poll-${poll.id}`} className={`poll ${compact ? 'compact' : ''} ${highlight ? 'highlight' : ''}`}>
      <header className="poll-head">
        <strong>📊 {poll.question}</strong>
        <span className="poll-badges">
          <span className={`pbadge ${open ? 'open' : 'closed'}`}>{open ? 'Ouvert' : 'Clôturé'}</span>
          {!compact && <span className="pbadge">{POLL_TYPES.find((t) => t.id === poll.type)?.label}</span>}
          {poll.anonyme && <span className="pbadge">Anonyme</span>}
        </span>
      </header>
      {poll.description && <p className="poll-desc">{poll.description}</p>}
      <p className="poll-meta">
        {r.voters.length}/{poll.votants.length} réponses
        {poll.dateLimite && ` · jusqu’au ${fmtDate(poll.dateLimite)}`}
        {poll.clotureLe && ` · clôturé le ${fmtDate(poll.clotureLe)}`}
        {!compact && task && <> · tâche <Link to={`/taches?tache=${task.id}`}>« {task.titre} »</Link></>}
        {!compact && ` · créé par ${fullName(person(poll.creePar))}`}
      </p>

      {showForm ? (
        <div className="poll-form">
          {poll.options.map((o) => (
            <label key={o.id} className="poll-choice">
              <input type={poll.multiple ? 'checkbox' : 'radio'} name={`vote-${poll.id}`} checked={sel.includes(o.id)} onChange={() => toggle(o.id)} />
              <span>{optionLabel(o)}{poll.type === 'dates' && !o.autre && <small className="muted"> — disponible</small>}{o.autre && !sel.includes(o.id) && <small className="muted"> — à préciser</small>}</span>
            </label>
          ))}
          {autreOn && (
            <input
              className="poll-autre-input"
              autoFocus
              maxLength={300}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder={poll.type === 'dates' ? 'Propose une autre date ou heure…' : 'Écris ta réponse…'}
              aria-label="Ta réponse"
            />
          )}
          <div className="row">
            <button className="btn primary small" disabled={!canSend} onClick={() => { votePoll(poll.id, sel, autreOn ? texte : undefined); setChanging(false); }}>
              {mine ? 'Mettre à jour ma réponse' : 'Envoyer ma réponse'}
            </button>
            {changing && <button className="btn small" onClick={() => { setSel(mine ?? []); setTexte(myText); setChanging(false); }}>Annuler</button>}
            {poll.type === 'dates' && <small className="muted">Aucune date cochée = pas disponible.</small>}
          </div>
        </div>
      ) : (
        <>
          <ul className="poll-results">
            {r.counts.map(({ option, ids }) => {
              const pct = r.voters.length ? Math.round((ids.length / r.voters.length) * 100) : 0;
              const best = !option.autre && r.max > 0 && ids.length === r.max;
              const textes = option.autre ? autreTextes(poll, ids) : [];
              return (
                <li key={option.id} className={`${best ? 'best' : ''} ${option.autre ? 'autre' : ''}`}>
                  <div className="poll-row">
                    <span>{best && '★ '}{optionLabel(option)}{mine?.includes(option.id) && <small className="muted"> (ton choix)</small>}</span>
                    <b>{ids.length}</b>
                  </div>
                  <div className="poll-bar"><div style={{ width: `${pct}%` }} /></div>
                  {!option.autre && !poll.anonyme && ids.length > 0 && !compact && <small className="muted">{ids.map((id) => initials(person(id))).join(', ')}</small>}
                  {textes.length > 0 && (
                    <ul className="poll-textes">
                      {textes.map((x) => (
                        <li key={x.id}>
                          « {x.texte} »{!poll.anonyme && <small className="muted"> — {compact ? initials(person(x.id)) : fullName(person(x.id))}</small>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {poll.type === 'dates' && !poll.anonyme && !compact && r.voters.length > 0 && (
            <div className="table-scroll">
              <table className="table doodle">
                <thead><tr><th>Membre</th>{poll.options.map((o) => <th key={o.id}>{optionLabel(o)}</th>)}</tr></thead>
                <tbody>
                  {r.voters.map((id) => (
                    <tr key={id}><td>{fullName(person(id))}</td>{poll.options.map((o) => <td key={o.id} className={poll.votes[id].includes(o.id) ? 'yes' : 'no'}>{poll.votes[id].includes(o.id) ? (o.autre && poll.textes?.[id]) || '✓' : '—'}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {open && voter && mine && <button className="btn small" onClick={() => { setSel(mine); setTexte(myText); setChanging(true); }}>Modifier ma réponse</button>}
          {!voter && open && <small className="muted">Tu ne fais pas partie des votants de ce sondage.</small>}
        </>
      )}

      {!compact && open && waiting.length > 0 && (
        <p className="poll-meta">En attente : {waiting.map((id) => fullName(person(id))).join(', ')}</p>
      )}
      {manage && !compact && (
        <div className="poll-actions">
          <button className="btn small" onClick={() => setEdit(true)}>Modifier</button>
          <button className="btn small" onClick={() => closePoll(poll.id, open)}>{open ? 'Clôturer' : 'Rouvrir'}</button>
          <button className="btn small danger" onClick={() => confirm('Supprimer ce sondage et ses réponses ?') && deletePoll(poll.id)}>Supprimer</button>
        </div>
      )}
      {edit && <PollEditor poll={poll} onClose={() => setEdit(false)} />}
    </article>
  );
}
