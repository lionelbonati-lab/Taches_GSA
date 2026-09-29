import type { AppData, Meeting, Task } from './types';
import { addDays, isDone, isLate, nextDue, today } from './utils';

// Sélection des points de l'ordre du jour d'une séance, partagée par les onglets Ordre du jour et PV.

export interface AgendaOptions {
  retards: boolean;
  avantProchaine: boolean;
  avantSuivante: boolean;
  bilan: boolean;
  statutsExclus: string[];
  sectionsExclues: string[];
}

export const FULL_AGENDA: AgendaOptions = {
  retards: true,
  avantProchaine: true,
  avantSuivante: true,
  bilan: true,
  statutsExclus: [],
  sectionsExclues: [],
};

export const sortedMeetings = (data: AppData) => [...data.meetings].sort((a, b) => a.date.localeCompare(b.date));

/** Séance précédente (s0) et suivante (s2) d'une séance. */
export function meetingContext(data: AppData, s1?: Meeting) {
  const meetings = sortedMeetings(data);
  const after = meetings.filter((m) => s1 && m.date > s1.date);
  const s0 = s1 ? [...meetings].reverse().find((m) => m.date < s1.date) : undefined;
  return { meetings, after, s0, s2: after[0] as Meeting | undefined };
}

/**
 * Tâches de l'ordre du jour de la séance s1 :
 * en retard, à faire d'ici s1, d'ici la séance suivante s2, terminées depuis la séance précédente s0.
 */
export function selectAgenda(data: AppData, s0: Meeting | undefined, s1: Meeting | undefined, s2: Meeting | undefined, o: AgendaOptions) {
  const eligible = (t: Task) => !o.sectionsExclues.includes(t.sectionId);
  const open = data.tasks.filter((t) => !isDone(data, t) && eligible(t) && !o.statutsExclus.includes(t.statusId));
  const late = o.retards ? open.filter((t) => isLate(data, t)) : [];
  const rest = open.filter((t) => !late.includes(t));
  // Une tâche à sous-tâches entre dans l'ordre du jour dès que sa prochaine sous-tâche arrive à échéance.
  const avant1 = s1 && o.avantProchaine ? rest.filter((t) => t.meetingId === s1.id || !nextDue(t) || nextDue(t) <= s1.date) : [];
  const avant2 =
    s2 && o.avantSuivante ? rest.filter((t) => !avant1.includes(t) && (t.meetingId === s2.id || (!!nextDue(t) && nextDue(t) <= s2.date))) : [];
  const since = s0?.date ?? addDays(today(), -60);
  const bilan = o.bilan
    ? data.tasks.filter(
        (t) => isDone(data, t) && eligible(t) && !!t.termineeLe && t.termineeLe >= since && data.statuses.find((x) => x.id === t.statusId)?.label !== 'Info',
      )
    : [];
  return { late, avant1, avant2, bilan, since };
}
