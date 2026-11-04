import type { AppData, ClubEvent, Task } from './types';
import { isDone } from './utils';

// La newsletter du club (PLAN_NEWSLETTER.md) : un point, rien de plus, qui revient chaque mois (répétition « Chaque
// mois »). Les infos sont les points rattachés à lui (« Point principal » dans leur fiche ; ou le bouton « Newsletter »
// de la carte d'un événement) : des informations, des points de groupes ou d'événements différents. Dans sa fiche,
// « Rassembler leurs remarques » reprend leurs remarques dans la sienne, pour celui qui fait la newsletter.

/**
 * Le point de la newsletter : celui pas encore terminé au délai le plus proche (parmi ceux que `voit` laisse voir) ; sinon
 * aucun.
 */
export function newsletterEnCours(data: AppData, voit: (t: Task) => boolean = () => true): Task | undefined {
  return data.tasks
    .filter((t) => t.newsletter && !isDone(data, t) && voit(t))
    .sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'))[0];
}

/** Le premier jour du mois qui suit `jour` (AAAA-MM-JJ). */
export function premierDuMoisSuivant(jour: string): string {
  const [a, m] = jour.split('-').map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
}

/**
 * Nouveau point qui annonce `ev` dans la newsletter `nl` : rattaché à elle et à l'événement, son délai celui de la
 * newsletter ; la remarque reprend la date, l'heure, le lieu et la description de l'événement. La place (section,
 * sous-section) est celle de `base`.
 */
export function pointPourNewsletter(base: Task, nl: Task, ev: ClubEvent, quand: string): Task {
  const remarque = [[ev.nom, quand, ev.lieu].filter(Boolean).join(' · '), ev.description.trim()].filter(Boolean).join('\n');
  return { ...base, titre: `Newsletter : ${ev.nom}`, remarque, parentId: nl.id, eventId: ev.id, delai: nl.delai || base.delai };
}

/** Points rattachés dans l'ordre des sections et des sous-sections, puis par titre. */
export function dansLOrdre(data: AppData, points: Task[]): Task[] {
  const sec = (t: Task) => data.sections.findIndex((s) => s.id === t.sectionId);
  const sous = (t: Task) => data.sections.find((s) => s.id === t.sectionId)?.sousSections.indexOf(t.sousSection) ?? -1;
  return [...points].sort((a, b) => sec(a) - sec(b) || sous(a) - sous(b) || a.titre.localeCompare(b.titre, 'fr'));
}

/** Leurs remarques rassemblées : chaque point, son titre puis sa remarque et ses liens ; une ligne vide entre deux. */
export function texteRemarques(points: Task[]): string {
  return points
    .map((t) => {
      const liens = (t.documents ?? []).filter((d) => d.kind === 'lien' && d.url).map((d) => (d.nom && d.nom !== d.url ? `${d.nom} : ${d.url}` : d.url!));
      return [t.titre.trim(), t.remarque.trim(), ...liens].filter(Boolean).join('\n');
    })
    .join('\n\n');
}
