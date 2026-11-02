import { useStore } from '../../data/store';
import type { Recurrence, Task } from '../../data/types';
import { RECURRENCES, addDays, applyDelaiRef, fmtDate, fullName, nextOccurrence, nextResponsables, postesFor, today } from '../../data/utils';
import { motSeance, seanceApres, seancePourSuivante } from '../../data/seances';
import type { SetT } from './Quand';

type Props = { t: Task; setT: SetT; task: Task; isNew: boolean; dis: boolean; ouverte: boolean };

/** Fiche d'une tâche : « 🔁 Répétition » et ce que sera l'occurrence suivante (séance, délai, responsables). */
export function Repetition({ t, setT, task, isNew, dis, ouverte }: Props) {
  const { data } = useStore();
  const postes = postesFor(data, t, isNew ? undefined : task) ?? [];
  // Répétition : « à chaque comité » ; séance et délai de l'occurrence suivante.
  const mot = motSeance().toLowerCase();
  const prochaine = t.recurrence ? seancePourSuivante(data, t) : undefined;
  const seanceLiee = data.meetings.find((m) => m.id === t.meetingId);
  const delaiSuivant = t.recurrence ? nextOccurrence(data, t, prochaine?.meeting).delai : '';
  const repeter = (r: Recurrence | undefined) =>
    setT((x) => {
      if (r !== 'seance' || x.meetingId) return { ...x, recurrence: r };
      // À chaque séance : la tâche va d'abord à la prochaine séance prévue.
      const s = seanceApres(data.meetings, addDays(today(), -1));
      return s && !s.nouvelle ? applyDelaiRef(data, { ...x, recurrence: r, meetingId: s.meeting.id }) : { ...x, recurrence: r };
    });
  return (
    <>
      {ouverte && (
        <label className="full">
          🔁 Répétition
          <select value={t.recurrence ?? ''} disabled={dis} onChange={(e) => repeter((e.target.value || undefined) as Recurrence | undefined)}>
            <option value="">Aucune (tâche unique)</option>
            {RECURRENCES.map((r) => (
              <option key={r.id} value={r.id}>🔁 {r.id !== 'seance' ? r.label : `À chaque ${mot}`}</option>
            ))}
          </select>
        </label>
      )}
      {t.recurrence && (
        <p className="full recur-note">
          🔁 Quand cette tâche sera terminée, la suivante sera créée automatiquement
          {t.recurrence !== 'seance' ? (
            delaiSuivant ? <> pour le <b>{fmtDate(delaiSuivant)}</b></> : ' (sans délai)'
          ) : prochaine ? (
            <>
              {' '}pour la séance suivante, <b>{prochaine.meeting.titre}</b> ({fmtDate(prochaine.meeting.date)}{prochaine.nouvelle ? ', ajoutée à l’agenda à ce moment-là' : ''})
              {delaiSuivant && <>, délai le <b>{fmtDate(delaiSuivant)}</b></>}
            </>
          ) : (
            <>, sans séance ni délai : aucune séance n’est prévue après {seanceLiee ? `« ${seanceLiee.titre} »` : 'aujourd’hui'} (si une séance est ajoutée dans l’Agenda d’ici là, la suivante y sera rattachée)</>
          )}
          {postes.length > 0 && <> et attribuée au poste <b>{postes.join(', ')}</b></>}
          {' '}(aujourd’hui : {nextResponsables(data, { ...t, postesResp: postes }).map((id) => fullName(data.people.find((p) => p.id === id))).join(', ')}).
          {task.suivanteId && <><br />Occurrence suivante déjà créée.</>}
        </p>
      )}
    </>
  );
}
