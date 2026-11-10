import type { AppData, ClubEvent, Etiquette, SerieEvenements, Task } from './types';
import { endOf, today, uid } from './utils';
import { aLaDate, derniereOccurrence, occurrenceDu } from './repetition';
import { evenementPasse } from './etiquettes';

// Séries d'événements : des événements de l'agenda réunis sous un nom. Le programme hivernal (salle, course à pied,
// spinning ou renfo, natation, VTT : chacun se répète chaque semaine), un championnat interne en 5 manches (5 événements,
// chacun à sa date). Chaque événement garde ses dates, son lieu, sa répétition, son étiquette et ses points ; la série
// les montre ensemble : une seule carte dans la page Événements (ses événements dedans), son prochain événement seulement
// à l'accueil, le nom de la série à côté de celui de l'événement (agenda, choix d'un événement), tous ses points d'un
// coup dans la liste des points (filtre « Événement »).
// Un événement qui se répète est dans la série avec toutes ses dates (celles modifiées seules comprises). Retirer un
// événement de la série, ou supprimer la série, ne touche ni à l'événement ni à ses points.
// La série peut avoir son étiquette (etiquettes.ts, reglerEtiquetteSerie) : ses membres voient les points de tous ses
// événements, et ceux de sa sous-section dans « Événements » (ce qui vaut pour toute la série). « Reprendre la série »
// (repriseSerie.ts) prépare la saison suivante : ses événements décalés, avec leurs points.
// Les séries sont une liste de l'appli comme les autres (« seriesEvenements », lisible par tout le club : rien à faire
// sur le serveur) ; ce que les événements en disent est dans leur fiche (ClubEvent.dansSerie).

export const nouvelleSerie = (nom = ''): SerieEvenements => ({ id: uid('se'), nom, description: '' });

/** Séries du club, par nom. */
export const seriesDuClub = (data: Pick<AppData, 'seriesEvenements'>) =>
  [...(data.seriesEvenements ?? [])].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

/** La série de l'événement (s'il en fait partie et qu'elle existe). */
export const serieDe = (data: Pick<AppData, 'seriesEvenements'>, e?: Pick<ClubEvent, 'dansSerie'>) =>
  e?.dansSerie ? data.seriesEvenements?.find((s) => s.id === e.dansSerie) : undefined;

/**
 * Nom d'un événement avec celui de sa série, pour le reconnaître dans une liste (« Manche 2 · Championnat interne 2027 ») ;
 * le nom qui contient déjà celui de la série reste tel quel.
 */
export function nomAvecSerie(data: Pick<AppData, 'seriesEvenements'>, e: Pick<ClubEvent, 'nom' | 'dansSerie'>) {
  const s = serieDe(data, e);
  return s && !e.nom.toLowerCase().includes(s.nom.trim().toLowerCase()) ? `${e.nom} · ${s.nom}` : e.nom;
}

/** Événements de la série (une date modifiée seule d'un événement qui se répète y est aussi, à part), par premier jour. */
export const evenementsDeLaSerie = (events: ClubEvent[], id: string) =>
  events.filter((e) => e.dansSerie === id).sort((a, b) => a.date.localeCompare(b.date) || (a.heure ?? '').localeCompare(b.heure ?? ''));

/** Date d'un événement à montrer : la sienne ; s'il se répète, sa prochaine occurrence (toutes passées : la dernière). */
export const dateAffichee = (e: ClubEvent, jour = today()) =>
  e.repetition ? (occurrenceDu(e, jour) ?? derniereOccurrence(e) ?? e.date) : e.date;

/** Série passée : tous ses événements le sont (sans événement : pas encore). */
export const seriePassee = (evs: ClubEvent[], jour = today()) => evs.length > 0 && evs.every((e) => evenementPasse(e, jour));

/**
 * Prochain événement de la série (en cours ou à venir), à sa date : celui qui commence le plus tôt ; tous passés : le
 * dernier ; sans événement : aucun.
 */
export function prochainDeLaSerie(evs: ClubEvent[], jour = today()): ClubEvent | undefined {
  const tri = (a: ClubEvent, b: ClubEvent) => a.date.localeCompare(b.date) || (a.heure ?? '').localeCompare(b.heure ?? '');
  const dates = evs.map((e) => aLaDate(e, dateAffichee(e, jour)));
  const aVenir = dates.filter((_, i) => !evenementPasse(evs[i], jour));
  return aVenir.sort(tri)[0] ?? dates.sort(tri).reverse()[0];
}

/**
 * Période de la série : sa période officielle (`s`, chaque bout à part), sinon du premier jour de son premier événement
 * au dernier jour du dernier ; `fin` absente : un de ses événements se répète sans fin.
 */
export function periodeDeLaSerie(evs: ClubEvent[], s?: Pick<SerieEvenements, 'debut' | 'fin'>): { debut: string; fin?: string } | undefined {
  const p = periodeDesEvenements(evs);
  const debut = s?.debut || p?.debut;
  if (!debut) return undefined;
  const fin = s?.fin || p?.fin;
  return { debut, ...(fin ? { fin } : {}) };
}

/**
 * Ce que ses événements font hors de la période officielle de la série : « Natation dès le 04.09.2026 », « VTT jusqu'au
 * 10.04.2027 » (le premier qui commence avant, le dernier qui finit après).
 */
export function horsPeriode(evs: ClubEvent[], s: Pick<SerieEvenements, 'debut' | 'fin'>): { avant?: { e: ClubEvent; date: string }; apres?: { e: ClubEvent; date: string } } {
  const avant = s.debut ? [...evs].filter((e) => e.date < s.debut!).sort((a, b) => a.date.localeCompare(b.date))[0] : undefined;
  const fins = evs.map((e) => {
    const der = e.repetition ? derniereOccurrence(e) : e.date;
    return { e, date: der ? endOf(aLaDate(e, der)) : '9999-12-31' };
  });
  const apres = s.fin ? fins.filter((x) => x.date > s.fin!).sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
  return { ...(avant ? { avant: { e: avant, date: avant.date } } : {}), ...(apres ? { apres } : {}) };
}

/**
 * Le changement d'heure d'automne (dernier dimanche d'octobre) de l'année `an`, et celui du printemps suivant (dernier
 * dimanche de mars) : la période officielle du programme hivernal.
 */
export function changementsDHeure(an: number): { debut: string; fin: string } {
  const dernierDimanche = (a: number, mois: number) => {
    const d = new Date(Date.UTC(a, mois + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().slice(0, 10);
  };
  return { debut: dernierDimanche(an, 9), fin: dernierDimanche(an + 1, 2) };
}

/** Du premier jour du premier événement au dernier jour du dernier ; `fin` absente : l'un se répète sans fin. */
function periodeDesEvenements(evs: ClubEvent[]): { debut: string; fin?: string } | undefined {
  if (!evs.length) return undefined;
  const debut = evs.map((e) => e.date).sort()[0];
  let fin = '';
  for (const e of evs) {
    const der = e.repetition ? derniereOccurrence(e) : e.date;
    if (!der) return { debut };
    const f = endOf(aLaDate(e, der));
    if (f > fin) fin = f;
  }
  return { debut, fin };
}

/** Étiquettes des événements de la série (case « Étiquette » de chacun). */
export const etiquettesDeLaSerie = (etiquettes: Etiquette[] = [], evs: ClubEvent[]) =>
  etiquettes.filter((et) => !!et.eventId && evs.some((e) => e.id === et.eventId));

/**
 * Points de la série : rattachés à l'un de ses événements, ou qui portent l'étiquette de l'un d'eux (comme sur la carte
 * d'un événement) ou celle de la série (rangés dans sa sous-section, par exemple).
 */
export function pointsDeLaSerie(data: Pick<AppData, 'tasks' | 'etiquettes'>, serieId: string, evs: ClubEvent[]): Task[] {
  const ids = new Set(evs.map((e) => e.id));
  const ets = new Set([...etiquettesDeLaSerie(data.etiquettes, evs), ...(data.etiquettes ?? []).filter((et) => et.serieId === serieId)].map((et) => et.id));
  return data.tasks.filter((t) => (!!t.eventId && ids.has(t.eventId)) || !!t.etiquettes?.some((id) => ets.has(id)));
}

/** L'événement d'origine : une date modifiée seule d'un événement qui se répète suit celui-ci (s'il existe encore). */
export const racine = (events: ClubEvent[], e: ClubEvent) => (e.serie && events.some((x) => x.id === e.serie!.id) ? e.serie.id : e.id);

/** Range l'événement `id` (avec ses dates modifiées seules) dans la série `serieId` ; sans série : il la quitte. */
export function rangerDansSerie(d: AppData, id: string, serieId?: string) {
  d.events.forEach((e) => {
    if (racine(d.events, e) !== id) return;
    if (serieId) e.dansSerie = serieId;
    else delete e.dansSerie;
  });
}

/** Ajoute la série, ou l'enregistre telle quelle si elle existe déjà. */
export function enregistrerSerie(d: AppData, s: SerieEvenements) {
  const x: SerieEvenements = {
    ...s, nom: s.nom.trim(), description: s.description?.trim() || undefined, debut: s.debut || undefined, fin: s.fin || undefined, newsletter: s.newsletter || undefined,
  };
  const liste = d.seriesEvenements ?? [];
  d.seriesEvenements = liste.some((y) => y.id === x.id) ? liste.map((y) => (y.id === x.id ? x : y)) : [...liste, x];
}

/** La série enregistrée, avec ces événements (`ids` : les événements d'origine) ; ceux qui n'y sont plus la quittent. */
export function enregistrerSerieEtEvenements(d: AppData, s: SerieEvenements, ids: string[]) {
  enregistrerSerie(d, s);
  const garder = new Set(ids);
  d.events.forEach((e) => {
    if (garder.has(racine(d.events, e))) e.dansSerie = s.id;
    else if (e.dansSerie === s.id) delete e.dansSerie;
  });
}

/**
 * Supprime la série : ses événements restent dans l'agenda, avec leurs points, sans série ; son étiquette reste sur ses
 * points, à relier (page Étiquettes ; etiquettes.ts, synchroniserEtiquettes).
 */
export function supprimerSerie(d: AppData, id: string) {
  d.seriesEvenements = (d.seriesEvenements ?? []).filter((s) => s.id !== id);
  d.events.forEach((e) => {
    if (e.dansSerie === id) delete e.dansSerie;
  });
}

/** Filtre « Événement » de la liste des points : une série (« serie:<id> »), sinon un événement. */
export const FILTRE_SERIE = 'serie:';
export const filtreSerie = (v: string) => (v.startsWith(FILTRE_SERIE) ? v.slice(FILTRE_SERIE.length) : undefined);
