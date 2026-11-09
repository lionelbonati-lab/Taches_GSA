import type { ActivityNotif, AppData, ClubEvent, SerieEvenements, Task } from './types';
import { addDays, today, uid } from './utils';
import { candidats, copierPoints, nomReprise, type Candidat } from './reprise';
import { evenementsDeLaSerie, racine } from './seriesEvenements';
import { decalerJours } from './series';
import { etiquetteDeLaSerie } from './etiquettes';

// Reprendre une série d'événements pour la saison suivante (« Reprendre » sur la carte de la série) : le programme
// hivernal 2026-27 devient 2027-28, en une fois. Ses événements (cochés) sont recopiés décalés d'autant (52 semaines par
// défaut : le même jour de la semaine), leur répétition aussi (jusqu'au… décalé ; les dates retirées ou modifiées seules ne
// suivent pas : la nouvelle saison repart de la règle), dans une nouvelle série, à son nom (années décalées). Les points
// qui les préparaient (rattachés à eux, ou qui portent leur étiquette ou celle de la série) sont recopiés comme pour
// « Reprendre » un événement (reprise.ts) : « à faire », au même écart de leur événement, un délai fixe décalé d'autant.
// Les étiquettes suivent (etiquettes.ts, suiteEtiquette et suiteEtiquetteSerie) : la nouvelle saison a les siennes, avec
// les mêmes membres ; ses points recopiés vont dans leurs sous-sections. Rien ne change pour la saison passée.

/** Événements d'origine de la série (ses dates modifiées seules suivent le leur, et ne sont pas reprises). */
export const evenementsARecopier = (data: Pick<AppData, 'events'>, s: Pick<SerieEvenements, 'id'>) =>
  evenementsDeLaSerie(data.events, s.id).filter((e) => racine(data.events, e) === e.id);

/** Premier jour de la série (celui de son premier événement). */
export const debutDe = (evs: ClubEvent[]) => evs.map((e) => e.date).sort()[0];

/** Décalage proposé, en jours : 52 semaines (le même jour de la semaine), autant de fois qu'il faut pour ne pas commencer dans le passé. */
export function decalageReprise(evs: ClubEvent[], jour = today()) {
  const debut = debutDe(evs);
  let n = 364;
  while (debut && addDays(debut, n) < jour) n += 364;
  return n;
}

/** Années entre la saison et la suivante (pour les noms : « 2026-27 » → « 2027-28 »). */
export const ansEntre = (debut: string, n: number) => Number(addDays(debut, n).slice(0, 4)) - Number(debut.slice(0, 4));

/** L'événement de la saison suivante : décalé de `n` jours (sa répétition aussi), dans la nouvelle série. */
export function eventDecale(e: ClubEvent, n: number, ans: number, serieId: string): ClubEvent {
  const { sauf: _s, serie: _x, repriseDe: _r, repetition, ...reste } = e;
  const r = repetition && { ...decalerJours(repetition, n), ...(repetition.jusquau ? { jusquau: addDays(repetition.jusquau, n) } : {}) };
  return {
    ...reste,
    id: uid('e'),
    nom: nomReprise(e.nom, ans),
    date: addDays(e.date, n),
    dateFin: e.dateFin && e.dateFin > e.date ? addDays(e.dateFin, n) : undefined,
    ...(r ? { repetition: r } : {}),
    dansSerie: serieId,
  };
}

/** Points proposés : ceux de chaque événement, puis ceux de l'étiquette de la série qui ne sont à aucun d'eux. */
export function candidatsSerie(data: AppData, s: Pick<SerieEvenements, 'id'>, evs: ClubEvent[], peut: (sectionId: string) => boolean) {
  const vus = new Set<string>();
  const parEvenement = evs.map((e) => {
    const l = candidats(data, e, peut).filter((x) => !vus.has(x.t.id));
    l.forEach((x) => vus.add(x.t.id));
    return { e, l };
  });
  const et = etiquetteDeLaSerie(data, s.id);
  const serie: Candidat[] = et
    ? data.tasks
        .filter((t) => !t.paiement && !vus.has(t.id) && !!t.etiquettes?.includes(et.id) && peut(t.sectionId))
        .map((t) => ({ t, coche: !t.recurrence }))
        .sort((a, b) => (a.t.delai || '9999').localeCompare(b.t.delai || '9999'))
    : [];
  return { parEvenement, serie };
}

export interface ChoixRepriseSerie {
  nom: string;
  /** Décalage, en jours. */
  decalage: number;
  /** Événements d'origine à reprendre. */
  evenements: string[];
  /** Points à reprendre. */
  taches: string[];
  /** Mêmes responsables (encore actifs) ; sinon à attribuer ensuite. */
  responsables: boolean;
}

/**
 * La nouvelle série, ses événements (décalés) et les copies des points choisis, avec les notifications des responsables ;
 * `paires` : chaque événement repris et sa suite (pour les étiquettes).
 */
export function reprendreSerie(data: AppData, s: SerieEvenements, c: ChoixRepriseSerie, moi: string): {
  serie: SerieEvenements;
  events: ClubEvent[];
  paires: { ancien: ClubEvent; nouveau: ClubEvent }[];
  tasks: Task[];
  notifs: ActivityNotif[];
} {
  const evs = evenementsARecopier(data, s);
  const n = c.decalage;
  const ans = ansEntre(debutDe(evs) ?? today(), n);
  const serie: SerieEvenements = { id: uid('se'), nom: c.nom.trim(), ...(s.description ? { description: s.description } : {}), repriseDe: s.id };
  const paires = evs.filter((e) => c.evenements.includes(e.id)).map((ancien) => ({ ancien, nouveau: eventDecale(ancien, n, ans, serie.id) }));
  const suite = new Map(paires.map((p) => [p.ancien.id, p.nouveau]));
  // Points d'un événement qui n'est pas repris : pas recopiés.
  const proposes = new Set(candidatsSerie(data, s, evs, () => true).parEvenement.filter((x) => suite.has(x.e.id)).flatMap((x) => x.l.map((y) => y.t.id)));
  const etSerie = etiquetteDeLaSerie(data, s.id);
  const choisies = data.tasks.filter(
    (t) => c.taches.includes(t.id) && !t.paiement && (proposes.has(t.id) || (!!etSerie && !!t.etiquettes?.includes(etSerie.id) && !(t.eventId && evs.some((e) => e.id === t.eventId)))),
  );
  const { tasks, notifs } = copierPoints(data, choisies, (t) => {
    const nouveau = t.eventId ? suite.get(t.eventId) : undefined;
    const ref = nouveau && t.delaiRef?.type === 'event' ? t.delaiRef : undefined;
    return {
      eventId: nouveau?.id,
      // Délai calé sur l'événement : sur sa suite (l'occurrence suivie, décalée d'autant) ; sinon décalé d'autant.
      delaiRef: ref && { ...ref, ...(ref.occurrence ? { occurrence: addDays(ref.occurrence, n) } : {}) },
      delai: t.delai ? addDays(t.delai, n) : '',
    };
  }, c.responsables, moi);
  return { serie, events: paires.map((p) => p.nouveau), paires, tasks, notifs };
}
