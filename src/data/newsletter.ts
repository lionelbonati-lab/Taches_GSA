import type { AppData, ClubEvent, Task } from './types';
import { occurrenceDu, occurrencesEntre } from './repetition';
import { evenementPasse } from './etiquettes';
import { addDays, occurrenceSuivie, today } from './utils';

// La newsletter du club (PLAN_NEWSLETTER.md) : un événement de l'agenda coché « Newsletter du club » (fiche de
// l'événement), qui revient d'ordinaire chaque mois ; chaque date est une édition. Une info pour la newsletter est un
// point rattaché à une édition (« Pour quand ? » › la newsletter, à cette date ; ou le bouton « Newsletter » d'un
// événement) ; sa remarque est le texte de l'info. « Remarques » (Chronologie.tsx) les liste pour une édition.

/** Une édition : l'événement (la série, ou une date modifiée seule) et son jour. */
export interface Edition {
  eventId: string;
  date: string;
}

/**
 * La newsletter du club : l'événement coché (une série, pas une date modifiée seule) qui a encore des éditions à venir ;
 * sinon le premier coché.
 */
export function newsletterDuClub(events: ClubEvent[], jour = today()): ClubEvent | undefined {
  const cochees = events.filter((e) => e.newsletter && !e.serie);
  return cochees.find((e) => !evenementPasse(e, jour)) ?? cochees[0];
}

/** Éditions du `de` au `a` (inclus) : les dates de la série, et celles modifiées seules (événements à part). */
export function editionsEntre(events: ClubEvent[], nl: ClubEvent, de: string, a: string): Edition[] {
  const dates = nl.repetition ? occurrencesEntre(nl, de, a) : nl.date >= de && nl.date <= a ? [nl.date] : [];
  const aPart = events.filter((e) => e.serie?.id === nl.id && e.date >= de && e.date <= a).map((e) => ({ eventId: e.id, date: e.date }));
  return [...dates.map((date) => ({ eventId: nl.id, date })), ...aPart].sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Édition où annoncer un événement qui commence le `debut` : la dernière avant lui (ou le jour même) qui n'est pas encore
 * passée ; sinon la prochaine, qui paraît après lui (`apres`).
 */
export function editionPour(events: ClubEvent[], nl: ClubEvent, debut: string, jour = today()): (Edition & { apres?: boolean }) | undefined {
  const avant = editionsEntre(events, nl, jour, debut);
  if (avant.length) return avant[avant.length - 1];
  const suivante = editionsEntre(events, nl, jour, addDays(jour, 400))[0];
  return suivante && { ...suivante, apres: true };
}

/**
 * Points d'une date d'un événement qui se répète (une édition de la newsletter) : ceux calés sur cette date ; les autres
 * rattachés à la série, d'après leur délai (la première date qui le suit ; sans délai : la prochaine date). Un événement
 * qui ne se répète pas : tous ceux rattachés à lui.
 */
export function pointsDeLaDate(tasks: Task[], serie: ClubEvent, date: string, jour = today()): Task[] {
  return tasks.filter((t) => {
    if (t.eventId !== serie.id) return false;
    if (!serie.repetition) return true;
    const o = t.delaiRef?.type === 'event' ? t.delaiRef.occurrence : undefined;
    if (o) return occurrenceSuivie(serie, o) === date;
    return occurrenceDu(serie, t.delai || jour) === date;
  });
}

/**
 * Nouveau point pour annoncer `ev` dans l'édition `ed` de la newsletter : titre, remarque (date, heure, lieu, description
 * de l'événement) ; délai calé sur l'édition (le jour même). La place (section, sous-section) est à mettre par l'appelant.
 */
export function pointNewsletter(data: AppData, base: Task, ev: ClubEvent, quand: string, ed: Edition): Task {
  const serie = data.events.find((e) => e.id === ed.eventId);
  const remarque = [[ev.nom, quand, ev.lieu].filter(Boolean).join(' · '), ev.description.trim()].filter(Boolean).join('\n');
  return {
    ...base,
    titre: `Newsletter : ${ev.nom}`,
    remarque,
    eventId: ed.eventId,
    delai: ed.date,
    delaiRef: { type: 'event', joursAvant: 0, unite: 'jours', ...(serie?.repetition ? { occurrence: ed.date } : {}) },
  };
}

/** Texte à copier : chaque point, son titre puis sa remarque, et ses liens ; une ligne vide entre deux points. */
export function texteRemarques(points: Task[]): string {
  return points
    .map((t) => {
      const liens = (t.documents ?? []).filter((d) => d.kind === 'lien' && d.url).map((d) => (d.nom && d.nom !== d.url ? `${d.nom} : ${d.url}` : d.url!));
      return [t.titre.trim(), t.remarque.trim(), ...liens].filter(Boolean).join('\n');
    })
    .join('\n\n');
}
