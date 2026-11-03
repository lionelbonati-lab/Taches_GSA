import { useStore } from '../../data/store';
import { notesSeances } from '../../data/minutes';
import type { Task } from '../../data/types';
import { fmtDate } from '../../data/utils';
import { TexteNote } from '../NoteField';
import { Icone } from '../icones';

/**
 * Fiche d'une tâche : « Notes des séances », ce que le PV de chaque séance en dit (et de ses occurrences précédentes
 * quand elle se répète), la plus récente d'abord. Qui tient le PV voit aussi les notes d'un PV pas encore validé ;
 * les autres, celles des PV validés. Rien si aucun PV n'en parle.
 */
export function NotesSeances({ task }: { task: Task }) {
  const { data, can } = useStore();
  const brouillons = can('tab.minutes');
  // La tâche enregistrée (relue en direct) : la note prise pendant la séance s'affiche dès qu'elle est écrite.
  const notes = notesSeances(data, data.tasks.find((x) => x.id === task.id) ?? task, brouillons);
  if (!notes.length) return null;
  return (
    <fieldset className="full notes-seances">
      <legend><Icone n="notes" /> Notes des séances</legend>
      <ol>
        {notes.map((n) => (
          <li key={`${n.meeting.id}-${n.occurrence?.id ?? ''}`}>
            <div className="notes-seances-titre">
              <strong>{n.meeting.titre}</strong>
              <small className="muted"> · {fmtDate(n.meeting.date)}{n.occurrence ? ' · occurrence précédente' : ''}</small>
              {n.enCours && <span className="pbadge" title="Le PV de cette séance n’est pas encore validé : la note peut encore changer">PV en cours</span>}
            </div>
            <p className="notes-seances-texte"><TexteNote note={n.note} /></p>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
