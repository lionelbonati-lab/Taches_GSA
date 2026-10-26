import { applyDelaiRef, nextOccurrence } from './utils';
import { seancePourSuivante } from './seances';
import { emailsForNext } from './emails';
import type { AppData, Task } from './types';

// Tâche récurrente terminée : son occurrence suivante (tâche, séance, emails reconduits).

/**
 * Occurrence suivante d'une tâche récurrente terminée : la tâche, sa séance (à ajouter à l'agenda si `nouvelle`) et les
 * emails reconduits. `ids` : identifiants fixes, les mêmes sur chaque appareil (rattrapage : une seule occurrence).
 */
export function preparerSuivante(data: AppData, task: Task, ids?: { tache: string; seance: string }) {
  let seance = seancePourSuivante(data, task);
  if (seance?.nouvelle && ids) seance = { ...seance, meeting: { ...seance.meeting, id: ids.seance } };
  const next = nextOccurrence(data, task, seance?.meeting);
  if (ids) next.id = ids.tache;
  let emails = emailsForNext(data, task, next, seance?.meeting);
  if (ids) emails = emails.map((e, i) => ({ ...e, id: idDe('e', `${ids.tache}:${i}`) }));
  return { next, seance, emails };
}

/** Ajoute l'occurrence suivante préparée (séance ajoutée au besoin, tâches liées rattachées, emails reconduits). */
export function ajouterSuivante(d: AppData, task: Task, { next, seance, emails }: ReturnType<typeof preparerSuivante>) {
  if (d.tasks.some((x) => x.id === next.id)) return;
  let suivante = next;
  if (seance?.nouvelle) {
    // Ajoutée entre-temps (deux tâches clôturées d'affilée) : la tâche rejoint celle-ci.
    const deja = d.meetings.find((m) => !m.unique && m.date.slice(0, 7) === seance.meeting.date.slice(0, 7));
    if (!deja) d.meetings.push(seance.meeting);
    else suivante = applyDelaiRef(d, { ...next, meetingId: deja.id });
  }
  d.tasks.unshift(suivante);
  // Tâche principale reconduite : les occurrences suivantes de ses tâches liées la rejoignent.
  d.tasks
    .filter((x) => x.parentId === task.id)
    .forEach((c) => {
      let x = c;
      for (let y = d.tasks.find((z) => z.id === x.suivanteId); y; y = d.tasks.find((z) => z.id === x.suivanteId)) x = y;
      if (x !== c && !x.parentId) x.parentId = next.id;
    });
  if (emails.length) d.emails = [...(d.emails ?? []), ...emails];
}

/** Identifiant tiré d'un texte, le même sur chaque appareil. */
export function idDe(prefix: string, texte: string) {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let i = 0; i < texte.length; i++) {
    const k = texte.charCodeAt(i);
    a = Math.imul(a ^ k, 0x01000193) >>> 0;
    b = Math.imul(b ^ k, 0x5bd1e995) >>> 0;
  }
  return `${prefix}${a.toString(36)}${b.toString(36)}`;
}
