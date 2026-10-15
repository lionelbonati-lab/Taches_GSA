import type { AppData, ClubEvent, RepetitionEvenement, Task } from './types';
import { addDays, diffDays, uid } from './utils';
import { arreterAvant, compterAvant, duree, memeRegle, normaliser, occurrenceAvant } from './repetition';

// Modifier ou supprimer une occurrence d'un événement qui se répète, comme dans un agenda : « Cet événement », « Cet
// événement et tous les suivants » ou « Tous les événements ». Les tâches dont le délai suit une occurrence
// (delaiRef.occurrence) la suivent : vers l'événement modifié à part ou la nouvelle série ; elles perdent leur lien si
// l'occurrence est supprimée (le délai reste).

export type Portee = 'une' | 'suivantes' | 'toutes';

export const PORTEES: { id: Portee; label: string }[] = [
  { id: 'une', label: 'Cet événement' },
  { id: 'suivantes', label: 'Cet événement et tous les suivants' },
  { id: 'toutes', label: 'Tous les événements' },
];

/** Occurrence que suit le délai de la tâche. */
const occ = (t: Task) => (t.delaiRef?.type === 'event' ? t.delaiRef.occurrence : undefined);
const decaler = (xs: string[] | undefined, n: number) => xs?.map((x) => addDays(x, n));

/** Jours de la semaine décalés de `n` jours (lundi et jeudi + 1 → mardi et vendredi). */
const decalerJours = (r: RepetitionEvenement, n: number): RepetitionEvenement =>
  r.jours ? { ...r, jours: r.jours.map((j) => ((((j - 1 + n) % 7) + 7) % 7) + 1).sort() } : r;

/** Enregistre `v` : l'occurrence du `jour` de la série `serie`, modifiée pour `portee`. */
export function modifierOccurrence(d: AppData, serie: ClubEvent, jour: string, x: ClubEvent, portee: Portee) {
  const delta = diffDays(jour, x.date);
  // Occurrence déplacée, règle inchangée : les autres se déplacent pareil (aussi les jours de la semaine choisis).
  const v = x.repetition && delta && memeRegle(x.repetition, serie.repetition) ? { ...x, repetition: decalerJours(x.repetition, delta) } : x;
  const remplacer = (...xs: ClubEvent[]) => { d.events = d.events.flatMap((x) => (x.id === serie.id ? xs : [x])); };
  if (portee === 'une') {
    // Retirée de la série, elle devient un événement à part.
    const seul = normaliser({ ...v, id: uid('e'), repetition: undefined, sauf: undefined, serie: { id: serie.id, date: jour } });
    remplacer({ ...serie, sauf: [...(serie.sauf ?? []), jour].sort() }, seul);
    d.tasks.forEach((t) => {
      if (t.eventId === serie.id && occ(t) === jour) {
        t.eventId = seul.id;
        delete t.delaiRef!.occurrence;
      }
    });
    return;
  }
  if (portee === 'toutes' || !occurrenceAvant(serie, jour)) {
    // Toute la série : le changement de jour de cette occurrence s'applique à toutes (« Une seule fois » : celle-ci reste).
    const debut = v.repetition ? addDays(serie.date, delta) : v.date;
    remplacer(normaliser({
      ...v,
      id: serie.id,
      date: debut,
      dateFin: duree(v) ? addDays(debut, duree(v)) : undefined,
      sauf: v.repetition ? decaler(serie.sauf, delta) : undefined,
    }));
    d.tasks.forEach((t) => {
      const o = occ(t);
      if (t.eventId === serie.id && o) t.delaiRef!.occurrence = addDays(o, delta);
    });
    return;
  }
  // Celle-ci et les suivantes : la série s'arrête la veille, une nouvelle commence (fin en nombre : ce qu'il en reste).
  const id = uid('e');
  const r = v.repetition?.nombre && v.repetition.nombre === serie.repetition?.nombre
    ? { ...v.repetition, nombre: Math.max(1, v.repetition.nombre - compterAvant(serie, jour)) }
    : v.repetition;
  const suite = normaliser({ ...v, id, repetition: r, sauf: r ? decaler(serie.sauf?.filter((x) => x > jour), delta) : undefined, serie: undefined });
  remplacer(arreterAvant(serie, jour), suite);
  d.tasks.forEach((t) => {
    const o = occ(t);
    if (t.eventId === serie.id && o && o >= jour) {
      t.eventId = id;
      t.delaiRef!.occurrence = addDays(o, delta);
    }
  });
  d.events.forEach((x) => { if (x.serie?.id === serie.id && x.serie.date >= jour) x.serie = { id, date: addDays(x.serie.date, delta) }; });
}

/** Supprime l'occurrence du `jour` de la série `serie`, pour `portee` (avec les occurrences modifiées à part concernées). */
export function supprimerOccurrence(d: AppData, serie: ClubEvent, jour: string, portee: Portee) {
  const delier = (cond: (t: Task) => boolean) =>
    d.tasks.forEach((t) => {
      if (!cond(t)) return;
      t.eventId = undefined;
      if (t.delaiRef) delete t.delaiRef.occurrence;
    });
  if (portee === 'une') {
    d.events = d.events.map((x) => (x.id === serie.id ? { ...x, sauf: [...(x.sauf ?? []), jour].sort() } : x));
    delier((t) => t.eventId === serie.id && occ(t) === jour);
    return;
  }
  const tout = portee === 'toutes' || !occurrenceAvant(serie, jour);
  const retires = d.events.filter((x) => x.serie?.id === serie.id && (tout || x.serie.date >= jour)).map((x) => x.id);
  if (tout) retires.push(serie.id);
  d.events = d.events.filter((x) => !retires.includes(x.id)).map((x) => (x.id === serie.id ? arreterAvant(x, jour) : x));
  delier((t) => !!t.eventId && (retires.includes(t.eventId) || (t.eventId === serie.id && (occ(t) ?? '') >= jour)));
}
