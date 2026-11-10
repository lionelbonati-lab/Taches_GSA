import type { ActivityNotif, AppData, ClubEvent, SerieEvenements, Task } from './types';
import { addDays, diffDays, today, uid } from './utils';
import { candidats, copierPoints, nomReprise, type Candidat } from './reprise';
import { changementsDHeure, evenementsDeLaSerie, racine } from './seriesEvenements';
import { decalerJours } from './series';
import { jourSemaine } from './repetition';
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

/**
 * Période officielle de la saison suivante : aux changements d'heure de son année si c'étaient ceux de la saison (le
 * dernier dimanche d'octobre et de mars ne tombent pas le même jour d'une année à l'autre), sinon décalée de `n` jours.
 */
export function periodeSuivante(s: Pick<SerieEvenements, 'debut' | 'fin'>, n: number, ans: number): Pick<SerieEvenements, 'debut' | 'fin'> {
  if (!s.debut && !s.fin) return {};
  const an = Number((s.debut ?? s.fin!).slice(0, 4)) - (!s.debut ? 1 : 0);
  const ch = changementsDHeure(an);
  const auChangement = (!s.debut || s.debut === ch.debut) && (!s.fin || s.fin === ch.fin);
  const suite = auChangement ? changementsDHeure(an + ans) : undefined;
  return {
    ...(s.debut ? { debut: suite?.debut ?? addDays(s.debut, n) } : {}),
    ...(s.fin ? { fin: suite?.fin ?? addDays(s.fin, n) } : {}),
  };
}

/** Années entre la saison et la suivante (pour les noms : « 2026-27 » → « 2027-28 »). */
export const ansEntre = (debut: string, n: number) => Number(addDays(debut, n).slice(0, 4)) - Number(debut.slice(0, 4));

/** L'événement de la saison suivante : décalé de `n` jours (sa répétition aussi), dans la nouvelle série. */
export function eventDecale(e: ClubEvent, n: number, ans: number, serieId: string): ClubEvent {
  const { sauf: _s, serie: _x, repetition, ...reste } = e;
  const r = repetition && { ...decalerJours(repetition, n), ...(repetition.jusquau ? { jusquau: addDays(repetition.jusquau, n) } : {}) };
  return {
    ...reste,
    id: uid('e'),
    // Sa suite : retrouvée pour y recopier plus tard d'autres points (apparier).
    repriseDe: e.id,
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

/** Un événement de la série d'origine et celui où vont ses points (sa suite, ou son pendant dans une série déjà là). */
export interface Paire {
  ancien: ClubEvent;
  nouveau: ClubEvent;
}

/**
 * Copies des points choisis de la série `s` vers d'autres événements (`paires`) : rattachés à un événement apparié, ils le
 * sont à son pendant, au même écart (l'occurrence suivie décalée d'autant) ; ceux qui portent son étiquette, leur délai
 * décalé d'autant ; ceux de la série seule, de `general` jours. Les points d'un événement sans pendant ne sont pas recopiés.
 */
function copierVers(data: AppData, s: Pick<SerieEvenements, 'id'>, paires: Paire[], general: number, c: Pick<ChoixRepriseSerie, 'taches' | 'responsables'>, moi: string) {
  const evs = evenementsARecopier(data, s);
  const parAncien = new Map(paires.map((p) => [p.ancien.id, p]));
  // L'événement de chaque point proposé (rattaché, ou qui porte son étiquette).
  const groupe = new Map(candidatsSerie(data, s, evs, () => true).parEvenement.flatMap((x) => x.l.map((y) => [y.t.id, x.e.id] as const)));
  const etSerie = etiquetteDeLaSerie(data, s.id);
  const choisies = data.tasks.filter((t) => {
    if (!c.taches.includes(t.id) || t.paiement) return false;
    const g = groupe.get(t.id);
    if (g) return parAncien.has(g);
    // De la série seule : son étiquette, rattaché à aucun de ses événements.
    return !!etSerie && !!t.etiquettes?.includes(etSerie.id) && !(t.eventId && evs.some((e) => e.id === t.eventId));
  });
  return copierPoints(data, choisies, (t) => {
    const p = parAncien.get(groupe.get(t.id) ?? '');
    const n = p ? diffDays(p.ancien.date, p.nouveau.date) : general;
    const liee = !!p && t.eventId === p.ancien.id;
    const ref = liee && t.delaiRef?.type === 'event' ? t.delaiRef : undefined;
    return {
      eventId: liee ? p!.nouveau.id : undefined,
      // Délai calé sur l'événement : sur son pendant (l'occurrence suivie, décalée d'autant) ; sinon décalé d'autant.
      delaiRef: ref && { ...ref, ...(ref.occurrence ? { occurrence: addDays(ref.occurrence, n) } : {}) },
      delai: t.delai ? addDays(t.delai, n) : '',
    };
  }, c.responsables, moi);
}

/**
 * La nouvelle série, ses événements (décalés) et les copies des points choisis, avec les notifications des responsables ;
 * `paires` : chaque événement repris et sa suite (pour les étiquettes).
 */
export function reprendreSerie(data: AppData, s: SerieEvenements, c: ChoixRepriseSerie, moi: string): {
  serie: SerieEvenements;
  events: ClubEvent[];
  paires: Paire[];
  tasks: Task[];
  notifs: ActivityNotif[];
} {
  const evs = evenementsARecopier(data, s);
  const n = c.decalage;
  const ans = ansEntre(debutDe(evs) ?? today(), n);
  const serie: SerieEvenements = {
    id: uid('se'), nom: c.nom.trim(), ...(s.description ? { description: s.description } : {}), repriseDe: s.id, ...periodeSuivante(s, n, ans),
  };
  const paires = evs.filter((e) => c.evenements.includes(e.id)).map((ancien) => ({ ancien, nouveau: eventDecale(ancien, n, ans, serie.id) }));
  return { serie, events: paires.map((p) => p.nouveau), paires, ...copierVers(data, s, paires, n, c, moi) };
}

/** Saisons où recopier les points d'une série sans la recréer : ses reprises (saisons suivantes), puis les autres séries. */
export function seriesCibles(data: Pick<AppData, 'seriesEvenements'>, s: SerieEvenements) {
  const autres = (data.seriesEvenements ?? []).filter((x) => x.id !== s.id);
  return {
    siennes: autres.filter((x) => x.repriseDe === s.id),
    autres: autres.filter((x) => x.repriseDe !== s.id).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  };
}

/** Intitulé d'un événement sans accents, majuscules ni espaces en trop. */
const simple = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Le pendant de chaque événement de la série dans une autre (`cibles`) : sa suite (reprise), sinon celui du même nom
 * (années décalées comprises : « Manche 1 – 2027 » → « 2028 »), sinon, s'ils se répètent, celui du même jour de la semaine
 * à la même heure ; un seul chacun. Aucun : pas de pendant (ses points ne sont pas recopiés, sauf à en choisir un).
 */
export function apparier(evs: ClubEvent[], cibles: ClubEvent[]): Record<string, string> {
  const ans = evs.length && cibles.length ? ansEntre(debutDe(evs)!, diffDays(debutDe(evs)!, debutDe(cibles)!)) : 0;
  const essais: ((a: ClubEvent, b: ClubEvent) => boolean)[] = [
    (a, b) => b.repriseDe === a.id,
    (a, b) => simple(b.nom) === simple(a.nom) || simple(b.nom) === simple(nomReprise(a.nom, ans)),
    (a, b) => !!a.repetition && !!b.repetition && jourSemaine(a.date) === jourSemaine(b.date) && (a.heure ?? '') === (b.heure ?? ''),
  ];
  const out: Record<string, string> = {};
  const pris = new Set<string>();
  for (const essai of essais)
    for (const a of evs) {
      if (out[a.id]) continue;
      const l = cibles.filter((b) => !pris.has(b.id) && essai(a, b));
      if (l.length !== 1) continue;
      out[a.id] = l[0].id;
      pris.add(l[0].id);
    }
  return out;
}

/**
 * Les points choisis de la série `s` recopiés dans la série `cible`, déjà là (sans la recréer) : chaque événement vers
 * son pendant (`pendants` : événement d'origine → événement de `cible`) ; ceux de la série seule, décalés comme le
 * premier jour de la saison.
 */
export function recopierDansSerie(data: AppData, s: SerieEvenements, cible: SerieEvenements, pendants: Record<string, string>, c: Pick<ChoixRepriseSerie, 'taches' | 'responsables'>, moi: string) {
  const evs = evenementsARecopier(data, s);
  const evsCible = evenementsARecopier(data, cible);
  const paires = evs.flatMap((ancien) => {
    const nouveau = evsCible.find((x) => x.id === pendants[ancien.id]);
    return nouveau ? [{ ancien, nouveau }] : [];
  });
  const general = evs.length && evsCible.length ? diffDays(debutDe(evs)!, debutDe(evsCible)!) : 0;
  return { paires, ...copierVers(data, s, paires, general, c, moi) };
}
