import type { AppData, Meeting, Task } from './types';
import { addDays, finLe, isDone, isLate, today } from './utils';
import { shortDate } from './minutes';

// Sélection des points de l'ordre du jour d'une séance, partagée par les onglets Ordre du jour et PV.

export interface AgendaOptions {
  retards: boolean;
  avantProchaine: boolean;
  avantSuivante: boolean;
  bilan: boolean;
  statutsExclus: string[];
  sectionsExclues: string[];
  /** Aussi les tâches dont l'échéance tombe jusqu'à N jours après la séance suivante. */
  joursApres?: number;
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

/** Marges proposées après la séance suivante (jours). */
export const JOURS_APRES = [0, 3, 7, 14, 21, 30];
export const joursApresTexte = (n: number) => (n === 0 ? 'non' : n % 7 === 0 ? `${n / 7} semaine${n > 7 ? 's' : ''}` : n === 30 ? '1 mois' : `${n} jours`);

/**
 * Échéance d'une tâche retenue pour la séance suivante s2 : « pour le … » à sa date, « après le … » peu après (marge
 * « joursApres »). Avant elle (entre les deux séances), rien : seulement la date, la séance suivante serait trop tard.
 */
export const echeanceSuivante = (t: Task, s2: Meeting) =>
  !t.delai || t.delai === s2.date ? `pour le ${s2.titre}` : t.delai > s2.date ? `après le ${s2.titre}` : '';

/**
 * Tâches de l'ordre du jour de la séance s1 :
 * en retard, à faire d'ici s1, d'ici la séance suivante s2 (et peu après : « joursApres »), terminées depuis la séance précédente s0.
 */
export function selectAgenda(data: AppData, s0: Meeting | undefined, s1: Meeting | undefined, s2: Meeting | undefined, o: AgendaOptions) {
  const eligible = (t: Task) => !o.sectionsExclues.includes(t.sectionId);
  const open = data.tasks.filter((t) => !isDone(data, t) && eligible(t) && !o.statutsExclus.includes(t.statusId));
  const late = o.retards ? open.filter((t) => isLate(data, t)) : [];
  const rest = open.filter((t) => !late.includes(t));
  const avant1 = s1 && o.avantProchaine ? rest.filter((t) => t.meetingId === s1.id || !t.delai || t.delai <= s1.date) : [];
  const avant2 =
    s2 && o.avantSuivante
      ? rest.filter((t) => !avant1.includes(t) && (t.meetingId === s2.id || (!!t.delai && t.delai <= addDays(s2.date, o.joursApres ?? 0))))
      : [];
  const since = s0?.date ?? addDays(today(), -60);
  const bilan = o.bilan
    ? data.tasks.filter(
        (t) => isDone(data, t) && eligible(t) && finLe(t) >= since && data.statuses.find((x) => x.id === t.statusId)?.label !== 'Info',
      )
    : [];
  return { late, avant1, avant2, bilan, since };
}

/**
 * Tâche terminée de l'ordre du jour et du PV : « ✓ fait (le …) » pour le premier statut terminé (« Terminé »), sinon le
 * nom de son statut (« A discuter », « Information », « Annulé »…). Elle part aux archives le lendemain de la séance.
 */
export function etatTerminee(data: AppData, t: Task, avecDate = true): string {
  const st = data.statuses.find((x) => x.id === t.statusId);
  if (st && st.id !== data.statuses.find((x) => x.done)?.id) return st.label;
  return `✓ fait${avecDate && t.termineeLe ? ` le ${shortDate(t.termineeLe)}` : ''}`;
}
