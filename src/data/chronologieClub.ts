import type { AppData, ClubEvent, DelaiRef, Etiquette, Meeting, SerieEvenements, Task } from './types';
import { addDays, applyDelaiRef, diffDays, endOf, today } from './utils';
import { aLaDate, duree, occurrencesEntre } from './repetition';
import { etiquettesDatees, memeEvenement } from './agendaIcs';

// Chronologie du club (Agenda › Chronologie, ChronologieClub.tsx) : séances et événements dans le temps, chacun avec ses
// points, année par année ou d'une assemblée générale à l'autre (case « Assemblée générale » d'un événement ou d'une
// séance). Deux voies : à gauche les séances, et les points rattachés ni à une séance ni à un événement (à leur délai) ;
// à droite les événements (un événement qui se répète : une seule carte) et les étiquettes « événement » datées.
//
// À qui est un point (un seul) :
//  1. son délai est calé sur une séance, un événement ou une étiquette datée (📌) : à elle ;
//  2. rattaché à un événement : à lui ; 3. à une séance : à elle ;
//  4. il porte l'étiquette d'un événement (rangé dans sa sous-section) : à lui ;
//  5. sinon à personne : seul dans la voie des séances, à son délai (sans délai : « Sans date »), toujours montré.
// Une carte qu'on ne voit pas (pas le droit « Séances » ou « Événements ») ne retient pas ses points : ils passent à la
// règle suivante.
// Les points d'une séance ou d'un événement ne sont montrés que si on l'a demandé (« + », `Vue.ouvertes`), à leur date,
// dans sa voie (« Réserver la salle · Soirée récréative », 2 mois avant) ; sous elle s'ils tombent le même jour (ou pendant
// l'événement), s'ils n'ont pas de délai, ou si leur délai sort de la période. Ceux d'une séance ou d'un événement d'une
// autre période, à leur date dans celle-ci, de même.
// Une série d'événements (programme hivernal, championnat) : une seule ligne, à son début officiel (sa période officielle,
// seriesEvenements.ts ; commencée avant la période : son premier jour), sinon à la date de son premier événement de la
// période ; son « + » montre ses événements, chacun à sa date, et les points de son étiquette (4 bis), comme ci-dessus.
// Un événement sur plusieurs jours (ou une étiquette datée) : une ligne « fin » à son dernier jour (FinFrise), que relie
// un crochet « [ » dans la page.

/** Période affichée, du `de` au `a` (inclus). Vue AG : l'assemblée du début et celle de la fin (absente : pas encore prévue). */
export interface Periode {
  de: string;
  a: string;
  agDebut?: RepereAg;
  agFin?: RepereAg;
}

/** Une assemblée générale : sa date et son nom. */
export interface RepereAg {
  date: string;
  nom: string;
}

/** Même jour, `n` ans plus tard (29 février → 28). */
export function decalerAns(date: string, n: number) {
  const y = Number(date.slice(0, 4)) + n;
  const md = date.slice(5);
  const bissextile = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `${y}-${md === '02-29' && !bissextile ? '02-28' : md}`;
}

/** Année civile. */
export const periodeAnnee = (an: number): Periode => ({ de: `${an}-01-01`, a: `${an}-12-31` });

/** Assemblées générales (séances et événements cochés ; un événement qui se répète : chacune de ses dates), par date. */
export function assemblees(data: Pick<AppData, 'meetings' | 'events'>, jour = today()): RepereAg[] {
  const out = new Map<string, RepereAg>();
  for (const m of data.meetings) if (m.ag && m.date) out.set(m.date, { date: m.date, nom: m.titre });
  for (const e of data.events) {
    if (!e.ag || !e.date) continue;
    const dates = e.repetition ? occurrencesEntre(e, decalerAns(jour, -20), decalerAns(jour, 20), 100) : [e.date];
    for (const d of dates) if (!out.has(d)) out.set(d, { date: d, nom: e.nom });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Périodes d'une assemblée générale à la suivante (les deux comprises) ; avant la première et après la dernière : une
 * année. Aucune assemblée : aucune période.
 */
export function periodesAg(ags: RepereAg[]): Periode[] {
  if (!ags.length) return [];
  const out: Periode[] = [{ de: decalerAns(ags[0].date, -1), a: ags[0].date, agFin: ags[0] }];
  for (let i = 0; i + 1 < ags.length; i++) out.push({ de: ags[i].date, a: ags[i + 1].date, agDebut: ags[i], agFin: ags[i + 1] });
  const der = ags[ags.length - 1];
  out.push({ de: der.date, a: decalerAns(der.date, 1), agDebut: der });
  return out;
}

/** Période qui contient le `jour` (le jour d'une assemblée : celle qui se termine par elle). */
export function periodeDuJour(periodes: Periode[], jour = today()): number {
  if (!periodes.length) return -1;
  const i = periodes.findIndex((p) => p.de < jour && jour <= p.a);
  if (i >= 0) return i;
  return jour <= periodes[0].de ? 0 : periodes.length - 1;
}

/**
 * Séance, événement (qui se répète : toute la série) ou étiquette « événement » datée de la chronologie. `points` : tous ses
 * points de la vue (son « + ») ; `dessous` : ceux montrés sous elle (même jour, sans délai, ou délai hors de la période).
 */
export type Carte =
  | { k: 'seance'; cle: string; date: string; m: Meeting; points: Task[]; dessous: Task[] }
  /** `occurrences` : premiers jours de ses dates dans la période (événement qui se répète, avec celles modifiées seules). */
  | { k: 'evenement'; cle: string; date: string; fin: string; e: ClubEvent; occurrences: string[]; points: Task[]; dessous: Task[] }
  | { k: 'etiquette'; cle: string; date: string; fin: string; et: Etiquette; points: Task[]; dessous: Task[] };

/**
 * Série d'événements : une ligne ; `cartes` : ses événements de la période (montrés quand elle est ouverte) ; `points` /
 * `dessous` : ceux de son étiquette, comme pour une carte.
 */
export interface SerieFrise {
  k: 'serie';
  cle: string;
  date: string;
  s: SerieEvenements;
  cartes: Carte[];
  points: Task[];
  dessous: Task[];
}

/** Dernier jour d'un événement sur plusieurs jours (ou d'une étiquette datée) : « fin », relié à lui par un crochet « [ ». */
export interface FinFrise {
  k: 'fin';
  cle: string;
  de: Extract<Carte, { k: 'evenement' | 'etiquette' }>;
}

/** Un point à sa date : seul (rattaché à rien), ou d'une séance / d'un événement (`de` : son nom et sa date). */
export interface PointFrise {
  k: 'point';
  cle: string;
  t: Task;
  de?: { cle: string; nom: string; date: string };
}

/** Ligne de la frise : un jour, à gauche les séances et leurs points (et les points seuls), à droite les événements et les leurs. */
export interface Jour {
  date: string;
  gauche: (Carte | PointFrise)[];
  droite: (Carte | PointFrise | SerieFrise | FinFrise)[];
}

export interface Frise {
  jours: Jour[];
  /** Points sans délai rattachés à rien (« Sans date »). */
  sansDate: Task[];
  /** Nombre de points de la vue (montrés ou derrière un « + »). */
  nbPoints: number;
  /** Séances et événements hors de la période dont des points tombent dans la période (« Afficher tous les points »). */
  ailleurs: string[];
  /** Toutes les séances et tous les événements de la période, montrés ou dans une série fermée (« Déplacer » : vers où). */
  cartes: Carte[];
}

/** Ce que voit la personne et les points retenus (déjà filtrés). */
export interface Vue {
  seances: boolean;
  evenements: boolean;
  /** Fiche de la personne (étiquettes datées dont elle est membre, sans le droit « Événements »). */
  moi?: string;
  points: Task[];
  /** Filtre « Étiquette » : les événements qui ne la portent pas, sans point retenu, ne sont pas montrés. */
  etiquette?: string;
  /** Séances et événements dont les points sont montrés, séries dont les événements le sont (« + »). */
  ouvertes?: ReadonlySet<string>;
}

const cleSeance = (id: string) => `s:${id}`;
const cleEvenement = (id: string) => `e:${id}`;
const cleEtiquette = (id: string) => `et:${id}`;
const cleSerie = (id: string) => `se:${id}`;

/** Événement d'origine d'une date modifiée seule (sinon lui-même). */
export const origineDe = (events: ClubEvent[], e: ClubEvent) => (e.serie && events.some((x) => x.id === e.serie!.id) ? e.serie.id : e.id);

/** Étiquettes « événement » datées montrées comme des cartes (comme dans le Calendrier). */
export function etiquettesCartes(data: Pick<AppData, 'etiquettes' | 'events'>, vue: Pick<Vue, 'evenements' | 'moi'>): Etiquette[] {
  return etiquettesDatees(data.etiquettes).filter((et) =>
    vue.evenements
      ? !et.eventId && !data.events.some((e) => memeEvenement(et, e))
      : !!vue.moi && !!et.membres?.includes(vue.moi),
  );
}

/** Index pour placer les points : d'un événement à sa carte, d'une étiquette à la carte de son événement… */
function indexer(data: AppData, vue: Vue) {
  const evenements = new Map<string, string>();
  const parEtiquette = new Map<string, string>();
  /** Étiquette d'une série → la série. */
  const parSerie = new Map<string, string>();
  if (vue.evenements) {
    for (const e of data.events) evenements.set(e.id, origineDe(data.events, e));
    for (const et of data.etiquettes ?? []) {
      if (et.eventId && evenements.has(et.eventId)) parEtiquette.set(et.id, evenements.get(et.eventId)!);
      else if (et.serieId && data.seriesEvenements?.some((x) => x.id === et.serieId)) parSerie.set(et.id, et.serieId);
    }
  }
  const etiquettes = new Set(etiquettesCartes(data, vue).map((x) => x.id));
  const seances = new Set(vue.seances ? data.meetings.map((m) => m.id) : []);
  return { evenements, parEtiquette, parSerie, etiquettes, seances };
}

/** Clé de la carte où va le point (règles en tête du fichier) ; aucune : seul, à son délai. */
export function carteDuPoint(t: Task, x: ReturnType<typeof indexer>): string | undefined {
  const ev = t.eventId ? x.evenements.get(t.eventId) : undefined;
  const se = t.meetingId && x.seances.has(t.meetingId) ? t.meetingId : undefined;
  const r = t.delaiRef;
  if (r?.type === 'meeting' && se) return cleSeance(se);
  if (r?.type === 'event' && ev) return cleEvenement(ev);
  if (r?.type === 'etiquette' && r.etiquetteId) {
    if (x.etiquettes.has(r.etiquetteId)) return cleEtiquette(r.etiquetteId);
    if (x.parEtiquette.has(r.etiquetteId)) return cleEvenement(x.parEtiquette.get(r.etiquetteId)!);
  }
  if (ev) return cleEvenement(ev);
  if (se) return cleSeance(se);
  for (const id of t.etiquettes ?? []) {
    if (x.parEtiquette.has(id)) return cleEvenement(x.parEtiquette.get(id)!);
    if (x.etiquettes.has(id)) return cleEtiquette(id);
  }
  // 4 bis. L'étiquette d'une série d'événements (ce qui vaut pour toute la série) : à la série.
  for (const id of t.etiquettes ?? []) if (x.parSerie.has(id)) return cleSerie(x.parSerie.get(id)!);
  return undefined;
}

/** Délai, puis titre ; sans délai à la fin. */
const parDelai = (a: Task, b: Task) => (a.delai || '9999').localeCompare(b.delai || '9999') || a.titre.localeCompare(b.titre, 'fr');

/** Nom et date d'une séance ou d'un événement (sa clé), même hors de la période. */
function infoCarte(data: AppData, cle: string): { nom: string; date: string } | undefined {
  const id = cle.slice(cle.indexOf(':') + 1);
  if (cle.startsWith('s:')) {
    const m = data.meetings.find((y) => y.id === id);
    return m && { nom: m.titre, date: m.date };
  }
  if (cle.startsWith('e:')) {
    const e = data.events.find((y) => y.id === id);
    return e && { nom: e.nom, date: e.date };
  }
  if (cle.startsWith('se:')) {
    const se = data.seriesEvenements?.find((y) => y.id === id);
    const debut = se?.debut ?? data.events.filter((y) => y.dansSerie === id).map((y) => y.date).sort()[0];
    return se && { nom: se.nom, date: debut ?? '' };
  }
  const et = data.etiquettes?.find((y) => y.id === id);
  return et && { nom: et.nom, date: et.date ?? '' };
}

/** La frise de la période. */
export function construireFrise(data: AppData, p: Periode, vue: Vue, jour = today()): Frise {
  const x = indexer(data, vue);
  const dans = (d: string) => d >= p.de && d <= p.a;
  const ouverte = (cle: string) => !!vue.ouvertes?.has(cle);
  const cartes = new Map<string, Carte>();

  if (vue.seances) for (const m of data.meetings) if (m.date && dans(m.date)) cartes.set(cleSeance(m.id), { k: 'seance', cle: cleSeance(m.id), date: m.date, m, points: [], dessous: [] });

  if (vue.evenements) {
    // Un événement et ses dates modifiées seules : une carte.
    const groupes = new Map<string, ClubEvent[]>();
    for (const e of data.events) {
      const o = origineDe(data.events, e);
      groupes.set(o, [...(groupes.get(o) ?? []), e]);
    }
    for (const [id, evs] of groupes) {
      const e = evs.find((y) => y.id === id)!;
      if (!e.date) continue;
      const debuts = [
        ...(e.repetition ? occurrencesEntre(e, p.de, p.a) : endOf(e) >= p.de && e.date <= p.a ? [e.date] : []),
        ...evs.filter((y) => y.id !== id && y.date && endOf(y) >= p.de && y.date <= p.a).map((y) => y.date),
      ].sort();
      if (!debuts.length) continue;
      const fins = [...(e.repetition ? debuts.map((d) => endOf(aLaDate(e, d))) : [endOf(e)]), ...evs.filter((y) => y.id !== id).map(endOf)];
      cartes.set(cleEvenement(id), {
        k: 'evenement', cle: cleEvenement(id), date: debuts[0] < p.de ? p.de : debuts[0], fin: fins.sort().slice(-1)[0], e, occurrences: e.repetition ? debuts : [], points: [], dessous: [],
      });
    }
  }
  for (const et of etiquettesCartes(data, vue)) {
    const fin = endOf({ date: et.date!, dateFin: et.dateFin });
    if (fin >= p.de && et.date! <= p.a) cartes.set(cleEtiquette(et.id), { k: 'etiquette', cle: cleEtiquette(et.id), date: et.date! < p.de ? p.de : et.date!, fin, et, points: [], dessous: [] });
  }

  // Séries d'événements : une ligne pour leurs événements de la période, à son début officiel s'il en a un (commencée avant
  // la période : son premier jour ; qui commence après : à son premier événement), sinon à son premier événement.
  const series = new Map<string, SerieFrise>();
  for (const c of cartes.values()) {
    if (c.k !== 'evenement' || !c.e.dansSerie) continue;
    const se = data.seriesEvenements?.find((y) => y.id === c.e.dansSerie);
    if (!se) continue;
    const cle = cleSerie(se.id);
    if (!series.has(cle)) series.set(cle, { k: 'serie', cle, date: c.date, s: se, cartes: [], points: [], dessous: [] });
    series.get(cle)!.cartes.push(c);
  }
  const dateSerie = (se: SerieFrise) => {
    const o = se.s.debut;
    if (o && o <= p.a && (!se.s.fin || se.s.fin >= p.de)) return o < p.de ? p.de : o;
    return se.cartes.map((c) => c.date).sort()[0] ?? se.date;
  };
  for (const se of series.values()) se.date = dateSerie(se);

  const seuls: Task[] = [];
  const sansDate: Task[] = [];
  /** Points d'une séance ou d'un événement, à leur date (dans sa voie). */
  const aLeurDate: { t: Task; cle: string; gauche: boolean }[] = [];
  const ailleurs = new Set<string>();
  for (const t of vue.points) {
    const cle = carteDuPoint(t, x);
    if (!cle) {
      if (!t.delai) sansDate.push(t);
      else if (dans(t.delai)) seuls.push(t);
      continue;
    }
    const serie = series.get(cle);
    if (serie) {
      serie.points.push(t);
      if (!t.delai || !dans(t.delai) || t.delai === serie.date) serie.dessous.push(t);
      else aLeurDate.push({ t, cle, gauche: false });
      continue;
    }
    const c = cartes.get(cle);
    if (!c) {
      // Séance ou événement d'une autre période : le point, s'il tombe dans celle-ci.
      if (t.delai && dans(t.delai)) {
        ailleurs.add(cle);
        aLeurDate.push({ t, cle, gauche: cle.startsWith('s:') });
      }
      continue;
    }
    // Événement qui se répète (sa carte revient d'une période à l'autre) : ses points de la période, et ceux sans délai.
    if (c.k === 'evenement' && c.e.repetition && t.delai && !dans(t.delai)) continue;
    c.points.push(t);
    const memeJour = c.k === 'seance' || (c.k === 'evenement' && c.e.repetition) ? t.delai === c.date : t.delai >= c.date && t.delai <= c.fin;
    if (!t.delai || !dans(t.delai) || memeJour) c.dessous.push(t);
    else aLeurDate.push({ t, cle, gauche: c.k === 'seance' });
  }

  // Filtre « Étiquette » : les événements qui ne la portent pas et n'ont aucun point retenu sont retirés.
  if (vue.etiquette) {
    for (const [cle, c] of cartes) {
      if (c.points.length || c.k === 'seance') continue;
      const porte = c.k === 'etiquette'
        ? c.et.id === vue.etiquette
        : (data.etiquettes ?? []).some((et) => et.id === vue.etiquette && (et.eventId === c.e.id || (!!et.serieId && et.serieId === c.e.dansSerie)));
      if (!porte) cartes.delete(cle);
    }
  }
  for (const [cle, se] of series) {
    se.cartes = se.cartes.filter((c) => cartes.has(c.cle));
    if (!se.cartes.length && !se.points.length) series.delete(cle);
    else if (se.cartes.length) se.date = dateSerie(se);
  }
  /** Événements d'une série fermée : ni eux, ni leurs points ne sont montrés. */
  const caches = new Set([...series.values()].filter((se) => !ouverte(se.cle)).flatMap((se) => se.cartes.map((c) => c.cle)));

  const jours = new Map<string, Jour>();
  const jourDe = (d: string) => {
    if (!jours.has(d)) jours.set(d, { date: d, gauche: [], droite: [] });
    return jours.get(d)!;
  };
  let nbPoints = seuls.length;
  for (const c of cartes.values()) {
    c.points.sort(parDelai);
    c.dessous.sort(parDelai);
    nbPoints += c.points.length;
    if (caches.has(c.cle)) continue;
    if (c.k === 'seance') jourDe(c.date).gauche.push(c);
    else jourDe(c.date).droite.push(c);
  }
  for (const se of series.values()) {
    se.dessous.sort(parDelai);
    nbPoints += se.points.length;
    if (se.date && dans(se.date)) jourDe(se.date).droite.push(se);
  }
  for (const t of seuls) jourDe(t.delai).gauche.push({ k: 'point', cle: `t:${t.id}`, t });
  // Fin d'un événement sur plusieurs jours (pas une série qui se répète), montré : à son dernier jour, dans la période.
  for (const c of cartes.values()) {
    if (caches.has(c.cle) || (c.k !== 'evenement' && c.k !== 'etiquette') || (c.k === 'evenement' && c.e.repetition)) continue;
    if (c.fin > c.date && dans(c.fin)) jourDe(c.fin).droite.push({ k: 'fin', cle: `fin:${c.cle}`, de: c });
  }
  for (const { t, cle, gauche } of aLeurDate) {
    if (ailleurs.has(cle)) nbPoints++;
    if (!ouverte(cle) || caches.has(cle)) continue;
    const c = cartes.get(cle) ?? series.get(cle);
    const info = c ? { nom: c.k === 'serie' ? c.s.nom : nomCarte(c), date: c.date } : infoCarte(data, cle);
    const el: PointFrise = { k: 'point', cle: `t:${t.id}`, t, de: { cle, nom: info?.nom ?? '', date: info?.date ?? '' } };
    (gauche ? jourDe(t.delai).gauche : jourDe(t.delai).droite).push(el);
  }
  // « Aujourd'hui » : une ligne, même vide.
  if (dans(jour)) jourDe(jour);
  // Séances et événements d'abord (par heure, puis nom), puis les points (par titre), puis les fins.
  type El = Carte | PointFrise | SerieFrise | FinFrise;
  const heure = (c: El) => (c.k === 'seance' ? c.m.heure ?? '' : c.k === 'evenement' ? c.e.heure ?? '' : '');
  const nom = (c: El) => (c.k === 'point' ? c.t.titre : c.k === 'serie' ? c.s.nom : c.k === 'fin' ? nomCarte(c.de) : nomCarte(c));
  const rang = (c: El) => (c.k === 'fin' ? 2 : c.k === 'point' ? 1 : 0);
  const tri = (a: El, b: El) => rang(a) - rang(b) || heure(a).localeCompare(heure(b)) || nom(a).localeCompare(nom(b), 'fr');
  for (const j of jours.values()) {
    j.gauche.sort(tri);
    j.droite.sort(tri);
  }
  return {
    jours: [...jours.values()].sort((a, b) => a.date.localeCompare(b.date)), sansDate: sansDate.sort(parDelai), nbPoints, ailleurs: [...ailleurs], cartes: [...cartes.values()],
  };
}

export const nomCarte = (c: Carte) => (c.k === 'seance' ? c.m.titre : c.k === 'evenement' ? c.e.nom : c.et.nom);

/** La carte est une assemblée générale. */
export const estAg = (c: Carte) => (c.k === 'seance' ? !!c.m.ag : c.k === 'evenement' ? !!c.e.ag : false);

// ---------- Déplacer un point ----------

/** Décalage d'un point déjà calé sur ce genre de référence (« 1 semaine avant ») ; sinon le jour même. */
function decalage(t: Task, type: DelaiRef['type']): Pick<DelaiRef, 'joursAvant' | 'unite' | 'moisAvant'> {
  const r = t.delaiRef;
  if (r?.type !== type) return { joursAvant: 0 };
  return { joursAvant: r.joursAvant, ...(r.unite ? { unite: r.unite } : {}), ...(r.moisAvant !== undefined ? { moisAvant: r.moisAvant } : {}) };
}

/** Le lien vers la carte d'où vient le point est retiré (« déplacé de… vers… »). */
function sansOrigine(t: Task, depuis?: string): Task {
  if (depuis?.startsWith('s:')) return { ...t, meetingId: undefined };
  if (depuis?.startsWith('e:')) return { ...t, eventId: undefined };
  return t;
}

/** Point rattaché à la séance, son délai calé sur elle (même écart s'il l'était déjà sur une séance). */
export function versSeance(data: AppData, t: Task, m: Meeting, depuis?: string): Task {
  return applyDelaiRef(data, { ...sansOrigine(t, depuis), meetingId: m.id, delaiRef: { type: 'meeting', ...decalage(t, 'meeting') } });
}

/**
 * Point rattaché à l'événement, son délai calé sur lui (même écart s'il l'était déjà sur un événement). Qui se répète :
 * sur la date de la carte la plus proche de son délai.
 */
export function versEvenement(data: AppData, t: Task, e: ClubEvent, occurrences: string[], depuis?: string): Task {
  const ref = t.delai || today();
  const occurrence = e.repetition && occurrences.length
    ? [...occurrences].sort((a, b) => Math.abs(diffDays(a, ref)) - Math.abs(diffDays(b, ref)))[0]
    : undefined;
  return applyDelaiRef(data, {
    ...sansOrigine(t, depuis), eventId: e.id, delaiRef: { type: 'event', ...decalage(t, 'event'), ...(occurrence ? { occurrence } : {}) },
  });
}

/** Point qui porte l'étiquette « événement » datée, son délai calé sur elle. */
export function versEtiquette(data: AppData, t: Task, et: Etiquette, depuis?: string): Task {
  const etiquettes = t.etiquettes?.includes(et.id) ? t.etiquettes : [...(t.etiquettes ?? []), et.id];
  return applyDelaiRef(data, { ...sansOrigine(t, depuis), etiquettes, delaiRef: { type: 'etiquette', etiquetteId: et.id, ...decalage(t, 'etiquette') } });
}

/** Point détaché de sa séance et de son événement, à une date fixe. */
export const aDateFixe = (t: Task, date: string): Task => ({ ...t, delai: date, delaiRef: undefined, meetingId: undefined, eventId: undefined });

/** Date proposée pour un dépôt entre deux jours de la frise (`lo` et `hi`, exclus) : au milieu ; s'ils se suivent, `hi`. */
export function dateEntre(lo: string, hi: string): string {
  const n = diffDays(lo, hi);
  return n <= 1 ? hi : addDays(lo, Math.floor(n / 2));
}

/** Événement sur plusieurs jours : nombre de jours (pour l'affichage « 3 jours »). */
export const nbJours = (e: Pick<ClubEvent, 'date' | 'dateFin'>) => duree(e) + 1;
