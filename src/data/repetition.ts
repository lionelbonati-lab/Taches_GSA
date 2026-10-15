import type { ClubEvent, RepetitionEvenement } from './types';

// Événements qui se répètent, comme dans un agenda : tous les N jours, semaines (certains jours), mois (le 15, ou le
// 3e jeudi…) ou ans ; sans fin, jusqu'à une date ou pendant N occurrences. L'événement garde sa première occurrence
// (date, dateFin, heures) ; les autres se calculent ici. Une occurrence supprimée ou modifiée seule est retirée de la
// série (`sauf`) ; modifiée seule, elle devient un événement à part (`serie`, voir series.ts).

type Evt = Pick<ClubEvent, 'date' | 'dateFin' | 'repetition' | 'sauf'>;

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (d: string) => d.split('-').map(Number) as [number, number, number];
const utc = (y: number, m: number, j: number) => new Date(Date.UTC(y, m - 1, j));
const iso = (x: Date) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
const plus = (d: string, n: number) => {
  const [y, m, j] = parts(d);
  return iso(utc(y, m, j + n));
};
const ecart = (a: string, b: string) => Math.round((utc(...parts(b)).getTime() - utc(...parts(a)).getTime()) / 86400000);
const joursDuMois = (y: number, m: number) => utc(y, m + 1, 0).getUTCDate();
const fmt = (d: string) => d.split('-').reverse().join('.');

/** 1 = lundi … 7 = dimanche. */
export const jourSemaine = (d: string) => ((utc(...parts(d)).getUTCDay() + 6) % 7) + 1;

/** Rang du jour dans son mois (2 : le deuxième jeudi), et s'il est le dernier de ce jour-là dans le mois. */
export function rangDansMois(d: string) {
  const [y, m, j] = parts(d);
  return { rang: Math.ceil(j / 7), dernier: j + 7 > joursDuMois(y, m) };
}

/** Jours de la semaine d'une répétition chaque semaine (par défaut : celui du premier jour). */
const joursDe = (r: RepetitionEvenement, date: string) => {
  const js = [...new Set((r.jours ?? []).filter((j) => j >= 1 && j <= 7))].sort();
  return js.length ? js : [jourSemaine(date)];
};

/** Longueur approchée d'une période, en jours (pour chercher autour d'une date). */
const periode = (r?: RepetitionEvenement) =>
  !r ? 1 : Math.max(1, r.intervalle ?? 1) * { jour: 1, semaine: 7, mois: 31, an: 366 }[r.freq];

const TOURS_MAX = 5000;

/**
 * Premiers jours des occurrences, dans l'ordre, retirées (`sauf`) comprises. `depuis` : commencer vers ce jour (sans
 * effet avec une fin en nombre d'occurrences, comptées depuis la première).
 */
function* candidats(e: Evt, depuis?: string): Generator<string> {
  const r = e.repetition;
  if (!r) {
    yield e.date;
    return;
  }
  const n = Math.max(1, Math.round(r.intervalle ?? 1));
  const saut = depuis && !r.nombre && depuis > e.date ? depuis : undefined;
  const [y0, m0, j0] = parts(e.date);
  const lundi = plus(e.date, 1 - jourSemaine(e.date));
  const jours = joursDe(r, e.date);
  const pas = r.freq === 'an' ? 12 * n : n;
  let k = 0;
  if (saut) {
    if (r.freq === 'jour') k = Math.floor(ecart(e.date, saut) / n);
    else if (r.freq === 'semaine') k = Math.floor(ecart(lundi, saut) / (7 * n));
    else {
      const [ys, ms] = parts(saut);
      k = Math.max(0, Math.floor(((ys - y0) * 12 + ms - m0) / pas) - 1);
    }
  }
  let compte = 0;
  for (let tours = 0; tours < TOURS_MAX; tours++, k++) {
    let lot: string[];
    if (r.freq === 'jour') lot = [plus(e.date, k * n)];
    else if (r.freq === 'semaine') lot = jours.map((j) => plus(lundi, k * 7 * n + j - 1));
    else {
      const t = m0 - 1 + k * pas;
      const [y, m] = [y0 + Math.floor(t / 12), (t % 12) + 1];
      const fin = joursDuMois(y, m);
      let j = Math.min(j0, fin);
      if (r.freq === 'mois' && r.mensuel) {
        const js = jourSemaine(e.date);
        if (r.mensuel === 'dernier') j = fin - ((jourSemaine(`${y}-${pad(m)}-${pad(fin)}`) - js + 7) % 7);
        else j = 1 + ((js - jourSemaine(`${y}-${pad(m)}-01`) + 7) % 7) + 7 * (rangDansMois(e.date).rang - 1);
      }
      lot = j <= fin ? [`${y}-${pad(m)}-${pad(j)}`] : [];
    }
    for (const d of lot) {
      if (d < e.date) continue;
      if (r.jusquau && d > r.jusquau) return;
      yield d;
      if (r.nombre && ++compte >= r.nombre) return;
    }
  }
}

const retiree = (e: Evt, d: string) => !!e.sauf?.includes(d);

/** Durée en jours (0 : sur un seul jour). */
export const duree = (e: Pick<ClubEvent, 'date' | 'dateFin'>) => (e.dateFin && e.dateFin > e.date ? ecart(e.date, e.dateFin) : 0);

/** L'événement à l'occurrence qui commence le `date` (même durée). */
export const aLaDate = <T extends Evt>(e: T, date: string): T => {
  const d = duree(e);
  return { ...e, date, dateFin: d ? plus(date, d) : undefined };
};

/** Premiers jours des occurrences (hors retirées) qui touchent la période du `de` au `a` (inclus). */
export function occurrencesEntre(e: Evt, de: string, a: string, max = 500): string[] {
  const d = duree(e);
  const out: string[] = [];
  for (const x of candidats(e, plus(de, -d))) {
    if (x > a || out.length >= max) break;
    if (plus(x, d) >= de && !retiree(e, x)) out.push(x);
  }
  return out;
}

/** Occurrence en cours ou à venir le `jour` (la première pas encore finie) ; aucune : la série est passée. */
export function occurrenceDu(e: Evt, jour: string): string | undefined {
  const d = duree(e);
  for (const x of candidats(e, plus(jour, -d))) if (plus(x, d) >= jour && !retiree(e, x)) return x;
  return undefined;
}

/** Première occurrence après le jour `apres` (exclu). */
export function occurrenceApres(e: Evt, apres: string): string | undefined {
  for (const x of candidats(e, apres)) if (x > apres && !retiree(e, x)) return x;
  return undefined;
}

/** Dernière occurrence (série qui se termine) ; sans fin : aucune. */
export function derniereOccurrence(e: Evt): string | undefined {
  const r = e.repetition;
  if (r && !r.jusquau && !r.nombre) return undefined;
  let der: string | undefined;
  for (const x of candidats(e, r?.jusquau ? plus(r.jusquau, -2 * periode(r)) : undefined)) if (!retiree(e, x)) der = x;
  // Fenêtre vide (occurrences retirées) : toute la série.
  if (!der && r?.jusquau) for (const x of candidats(e)) if (!retiree(e, x)) der = x;
  return der;
}

/** Occurrence la plus proche du jour `date` (à égalité, la suivante). */
export function occurrenceProche(e: Evt, date: string): string | undefined {
  let avant: string | undefined;
  for (const x of candidats(e, plus(date, -2 * periode(e.repetition)))) {
    if (retiree(e, x)) continue;
    if (x >= date) return avant && ecart(avant, date) < ecart(date, x) ? avant : x;
    avant = x;
  }
  return avant;
}

export const estOccurrence = (e: Evt, date: string) => occurrencesEntre(e, date, date).includes(date);

/** Nombre d'occurrences (retirées comprises) avant le jour `date`. */
export function compterAvant(e: Evt, date: string) {
  let n = 0;
  for (const x of candidats(e)) {
    if (x >= date) break;
    n++;
  }
  return n;
}

/** Il reste une occurrence (non retirée) avant le jour `date`. */
export function occurrenceAvant(e: Evt, date: string) {
  for (const x of candidats(e)) {
    if (x >= date) return false;
    if (!retiree(e, x)) return true;
  }
  return false;
}

/** La série arrêtée avant le jour `date` (« cet événement et les suivants » supprimés ou modifiés à part). */
export function arreterAvant<T extends Evt>(e: T, date: string): T {
  const r = e.repetition!;
  const fin = r.nombre
    ? { nombre: Math.min(r.nombre, compterAvant(e, date)), jusquau: undefined }
    : { nombre: undefined, jusquau: r.jusquau && r.jusquau < date ? r.jusquau : plus(date, -1) };
  const sauf = e.sauf?.filter((x) => x < date);
  return sansVides({ ...e, repetition: sansVides({ ...r, ...fin }), sauf: sauf?.length ? sauf : undefined });
}

/** Même règle de répétition (fin comprise). */
export const memeRegle = (a?: RepetitionEvenement, b?: RepetitionEvenement) => {
  const cle = (r?: RepetitionEvenement) =>
    r ? [r.freq, r.intervalle ?? 1, [...new Set(r.jours ?? [])].sort().join(), r.mensuel ?? '', r.jusquau ?? '', r.nombre ?? ''].join('|') : '';
  return cle(a) === cle(b);
};

/** Sans les clés à `undefined` (données enregistrées telles quelles). */
function sansVides<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Répétition nettoyée (valeurs par défaut retirées, une seule fin), et l'événement placé à sa première occurrence
 * (ex. créé un mercredi « toutes les semaines le jeudi » : il commence le jeudi). Sans répétition : ni `sauf`.
 */
export function normaliser<T extends ClubEvent>(e: T): T {
  const r = e.repetition;
  if (!r) return sansVides({ ...e, repetition: undefined, sauf: undefined });
  const n = Math.max(1, Math.round(r.intervalle ?? 1));
  const propre: RepetitionEvenement = sansVides({
    freq: r.freq,
    intervalle: n > 1 ? n : undefined,
    jours: r.freq === 'semaine' ? joursDe(r, e.date) : undefined,
    mensuel: r.freq === 'mois' ? r.mensuel : undefined,
    jusquau: r.jusquau || undefined,
    nombre: r.jusquau ? undefined : r.nombre ? Math.max(1, Math.round(r.nombre)) : undefined,
  });
  const x = { ...e, repetition: propre };
  const premier = candidats(x).next().value as string | undefined;
  const y = premier && premier !== e.date ? aLaDate(x, premier) : x;
  return sansVides({ ...y, sauf: e.sauf?.length ? [...new Set(e.sauf)].sort() : undefined });
}

// ---------- Textes ----------

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const RANGS = ['premier', 'deuxième', 'troisième', 'quatrième', 'cinquième'];
const liste = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}` : xs[0] ?? '');
export const nomJour = (j: number) => JOURS[j - 1];

/** Chaque mois : « le 15 », « le 1er », « le troisième jeudi », « le dernier jeudi ». */
export function jourDuMois(date: string, mensuel?: RepetitionEvenement['mensuel']) {
  const j = parts(date)[2];
  if (!mensuel) return `le ${j === 1 ? '1er' : j}`;
  const js = JOURS[jourSemaine(date) - 1];
  return mensuel === 'dernier' ? `le dernier ${js}` : `le ${RANGS[rangDansMois(date).rang - 1]} ${js}`;
}

/** « Toutes les semaines le jeudi », « Tous les 2 mois le 15 », « Tous les ans le 15 octobre ». */
export function libelleRegle(r: RepetitionEvenement, date: string): string {
  const n = Math.max(1, r.intervalle ?? 1);
  const [, m, j] = parts(date);
  switch (r.freq) {
    case 'jour':
      return n > 1 ? `Tous les ${n} jours` : 'Tous les jours';
    case 'semaine': {
      const js = joursDe(r, date);
      const quels = js.join() === '1,2,3,4,5' ? 'du lundi au vendredi' : liste(js.map((x) => `le ${JOURS[x - 1]}`));
      return `${n > 1 ? `Toutes les ${n} semaines` : 'Toutes les semaines'} ${quels}`;
    }
    case 'mois':
      return `${n > 1 ? `Tous les ${n} mois` : 'Tous les mois'} ${jourDuMois(date, r.mensuel)}`;
    case 'an':
      return `${n > 1 ? `Tous les ${n} ans` : 'Tous les ans'} le ${j === 1 ? '1er' : j} ${MOIS[m - 1]}`;
  }
}

/** La règle et sa fin : « Toutes les semaines le jeudi, jusqu'au 15.11.2026 », « Tous les jours, 10 fois ». */
export function libelleRepetition(e: Pick<ClubEvent, 'date' | 'repetition'>): string {
  const r = e.repetition;
  if (!r) return '';
  return libelleRegle(r, e.date) + (r.jusquau ? `, jusqu’au ${fmt(r.jusquau)}` : r.nombre ? `, ${r.nombre} fois` : '');
}

/** « 12h30 ». */
export const fmtHeure = (h?: string) => (h ? h.replace(':', 'h') : '');

/** « 12h30–13h30 », « 19h30 » ; toute la journée : rien. Sur plusieurs jours, l'heure de fin est celle du dernier jour. */
export const horaire = (e: Pick<ClubEvent, 'heure' | 'heureFin'>) =>
  !e.heure ? '' : e.heureFin ? `${fmtHeure(e.heure)}–${fmtHeure(e.heureFin)}` : fmtHeure(e.heure);
