// Compteur de temps personnel (PLAN_COMPTEUR_TEMPS.md) : un chronomètre à soi, indicatif, pour noter le temps donné au
// club, dans l'appli et en dehors. Personne d'autre ne le voit, admins compris. Ce module : les entrées, les totaux par
// jour (plages du compteur et du mode automatique réunies : une minute ne compte qu'une fois, puis les ajouts), le
// compteur oublié et l'export. L'état et la synchronisation sont dans compteurEtat.tsx.

/** compteur : lancé puis arrêté à la main ; ajout : petits boutons (+5 min…) ; auto : temps dans l'appli (optionnel). */
export type SorteTemps = 'compteur' | 'ajout' | 'auto';

export interface EntreeTemps {
  id: string;
  sorte: SorteTemps;
  /** Compteur, automatique : début (ISO). */
  debut?: string;
  /** Compteur, automatique : fin (ISO). Compteur en marche : absente. */
  fin?: string;
  /** Ajout : jour (AAAA-MM-JJ, heure locale) et minutes (négatives : retirées). */
  jour?: string;
  minutes?: number;
  /** « Sur quoi ? » (facultatif). */
  libelle?: string;
  /** Ajout : moment de l'appui (les appuis rapprochés s'additionnent). */
  le?: string;
  /** Compteur en marche : « Continuer » au rappel du compteur oublié (ISO) ; le rappel repart de là. */
  rappele?: string;
}

export interface ReglagesCompteur {
  /**
   * Le bouton ⏱ est retiré de la barre du haut (choix de la personne). Il y est d'office (décision du 11.11.2026) ;
   * l'ancien réglage « actif » (affiché seulement si on l'avait coché) est ignoré.
   */
  masque: boolean;
  /** Mode automatique : le temps passé dans l'appli compte tout seul. */
  auto: boolean;
  /** Compteur oublié : rappel après tant d'heures. */
  oubliHeures: number;
}

export const REGLAGES_DEFAUT: ReglagesCompteur = { masque: false, auto: false, oubliHeures: 4 };
export const OUBLI_CHOIX = [2, 4, 6, 8, 12];
/** Petits boutons du panneau (minutes). */
export const AJOUTS = [5, 15, 30, 60];
export const RETRAIT = 5;
/** Mode automatique : un geste dans les 2 dernières minutes. */
export const AUTO_GESTE_MS = 2 * 60_000;
/** Mode automatique : la plage en cours est prolongée à chaque pas. */
export const AUTO_PAS_MS = 30_000;
/** Appuis sur un même petit bouton à moins d'une minute : une seule entrée. */
const REGROUPER_MS = 60_000;
/** Libellé : longueur au plus. */
export const LIBELLE_MAX = 80;
/** Une plage ou un ajout : 24 h au plus. */
export const DUREE_MAX_MS = 24 * 3_600_000;

const MIN = 60_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Jour local (AAAA-MM-JJ) d'un instant. */
export const jourDe = (t: number | Date) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Début du jour local (ms). */
export const debutJour = (jour: string) => new Date(`${jour}T00:00:00`).getTime();
/** Jour local décalé de `n` jours. */
export const decalerJour = (jour: string, n: number) => {
  const d = new Date(`${jour}T12:00:00`);
  d.setDate(d.getDate() + n);
  return jourDe(d);
};
/** Lundi de la semaine du jour. */
export const lundiDe = (jour: string) => decalerJour(jour, -((new Date(`${jour}T12:00:00`).getDay() + 6) % 7));
/** Valeur d'un champ « datetime-local » ↔ ISO. */
export const versChampHeure = (iso: string) => {
  const d = new Date(iso);
  return `${jourDe(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const depuisChampHeure = (v: string) => (v ? new Date(v).toISOString() : '');

/** « 42 min », « 1 h 25 », « 2 h ». */
export function fmtDuree(ms: number) {
  const signe = ms < 0 ? '−' : '';
  const m = Math.round(Math.abs(ms) / MIN);
  if (m < 60) return `${signe}${m} min`;
  const h = Math.floor(m / 60);
  return `${signe}${h} h${m % 60 ? ` ${pad(m % 60)}` : ''}`;
}
/** « 0:42 » ; avec les secondes : « 0:42:05 ». */
export function fmtChrono(ms: number, secondes = false) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return secondes ? `${h}:${pad(m)}:${pad(s % 60)}` : `${h}:${pad(m)}`;
}
/** « 14h05 ». */
export const fmtHeure = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}h${pad(d.getMinutes())}`;
};
/** « mercredi 11 novembre ». */
export const fmtJour = (jour: string, annee = false) =>
  new Date(`${jour}T12:00:00`).toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', ...(annee ? { year: 'numeric' } : {}) });

export const enMarche = (entrees: EntreeTemps[]) =>
  entrees.filter((e) => e.sorte === 'compteur' && !e.fin && e.debut).sort((a, b) => a.debut!.localeCompare(b.debut!))[0];

/** Plage (ms) d'un compteur ou du mode automatique ; en marche : jusqu'à `now`. */
function plage(e: EntreeTemps, now: number): [number, number] | null {
  if (e.sorte === 'ajout' || !e.debut) return null;
  const a = Date.parse(e.debut);
  const b = e.fin ? Date.parse(e.fin) : now;
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? [a, b] : null;
}

/** Durée totale des plages réunies (une minute ne compte qu'une fois). */
function dureeReunie(plages: [number, number][]) {
  const p = [...plages].sort((x, y) => x[0] - y[0]);
  let total = 0;
  let a = -Infinity;
  let b = -Infinity;
  for (const [x, y] of p) {
    if (x > b) {
      if (b > a) total += b - a;
      a = x;
      b = y;
    } else b = Math.max(b, y);
  }
  return b > a ? total + (b - a) : total;
}

export interface Jour {
  jour: string;
  /** Total du jour (ms, jamais négatif). */
  total: number;
  /** Plages du compteur seules (réunies). */
  compteur: number;
  /** Temps automatique hors des plages du compteur. */
  auto: number;
  /** Ajouts et retraits. */
  ajouts: number;
}

/** Totaux par jour local : plages du compteur et du mode automatique réunies, puis les ajouts. */
export function parJour(entrees: EntreeTemps[], now: number): Map<string, Jour> {
  const plages = new Map<string, { compteur: [number, number][]; auto: [number, number][] }>();
  const ajouts = new Map<string, number>();
  for (const e of entrees) {
    if (e.sorte === 'ajout') {
      if (e.jour && Number.isFinite(e.minutes)) ajouts.set(e.jour, (ajouts.get(e.jour) ?? 0) + e.minutes! * MIN);
      continue;
    }
    const p = plage(e, now);
    if (!p) continue;
    // Une plage qui passe minuit est partagée entre ses jours.
    for (let j = jourDe(p[0]); debutJour(j) < p[1]; j = decalerJour(j, 1)) {
      const a = Math.max(p[0], debutJour(j));
      const b = Math.min(p[1], debutJour(decalerJour(j, 1)));
      if (b <= a) continue;
      const x = plages.get(j) ?? { compteur: [], auto: [] };
      x[e.sorte === 'auto' ? 'auto' : 'compteur'].push([a, b]);
      plages.set(j, x);
    }
  }
  const out = new Map<string, Jour>();
  for (const j of new Set([...plages.keys(), ...ajouts.keys()])) {
    const p = plages.get(j);
    const compteur = p ? dureeReunie(p.compteur) : 0;
    const tout = p ? dureeReunie([...p.compteur, ...p.auto]) : 0;
    const a = ajouts.get(j) ?? 0;
    out.set(j, { jour: j, total: Math.max(0, tout + a), compteur, auto: tout - compteur, ajouts: a });
  }
  return out;
}

/** Total des jours de `du` à `au` compris. */
export function totalEntre(jours: Map<string, Jour>, du: string, au: string) {
  let t = 0;
  for (const [j, x] of jours) if (j >= du && j <= au) t += x.total;
  return t;
}

/** Totaux d'aujourd'hui, de la semaine (lundi), du mois et de l'année. */
export function totaux(jours: Map<string, Jour>, now: number) {
  const auj = jourDe(now);
  return {
    jour: jours.get(auj)?.total ?? 0,
    semaine: totalEntre(jours, lundiDe(auj), auj),
    mois: totalEntre(jours, `${auj.slice(0, 7)}-01`, auj),
    annee: totalEntre(jours, `${auj.slice(0, 4)}-01-01`, auj),
  };
}

/** Durée d'une entrée seule (sans réunion) : plage ou ajout. */
export function dureeEntree(e: EntreeTemps, now: number) {
  if (e.sorte === 'ajout') return (e.minutes ?? 0) * MIN;
  const p = plage(e, now);
  return p ? p[1] - p[0] : 0;
}

/** Jour d'une entrée (début de la plage, ou jour de l'ajout). */
export const jourEntree = (e: EntreeTemps) => (e.sorte === 'ajout' ? e.jour ?? '' : e.debut ? jourDe(Date.parse(e.debut)) : '');

/** Temps par libellé sur une période (plages non réunies : chaque libellé garde son temps). */
export function parLibelle(entrees: EntreeTemps[], du: string, au: string, now: number) {
  const m = new Map<string, number>();
  for (const e of entrees) {
    if (e.sorte === 'auto') continue;
    const j = jourEntree(e);
    if (!j || j < du || j > au) continue;
    const l = e.libelle?.trim() || '';
    m.set(l, (m.get(l) ?? 0) + dureeEntree(e, now));
  }
  return [...m].filter(([, t]) => t !== 0).sort((a, b) => b[1] - a[1]);
}

/** Derniers libellés employés (les plus récents d'abord, sans doublon). */
export function derniersLibelles(entrees: EntreeTemps[], n = 8) {
  const vus = new Set<string>();
  const quand = (e: EntreeTemps) => e.debut ?? e.le ?? e.jour ?? '';
  for (const e of [...entrees].sort((a, b) => quand(b).localeCompare(quand(a)))) {
    const l = e.libelle?.trim();
    if (l && !vus.has(l)) vus.add(l);
    if (vus.size >= n) break;
  }
  return [...vus];
}

/** Compteur oublié : en marche depuis plus de `oubliHeures` (ou depuis le dernier « Continuer »). */
export const estOublie = (e: EntreeTemps | undefined, r: ReglagesCompteur, now: number) =>
  !!e && !e.fin && now - Date.parse(e.rappele ?? e.debut!) > r.oubliHeures * 3_600_000;

/**
 * Ajout de `minutes` au jour `jour` : un appui qui suit de moins d'une minute un ajout du même jour et du même libellé
 * s'y additionne (une entrée « +20 min » plutôt que quatre « +5 min ») ; revenu à zéro, l'entrée disparaît. Renvoie
 * l'entrée à écrire et celle à retirer.
 */
export function ajout(entrees: EntreeTemps[], minutes: number, jour: string, libelle: string | undefined, now: number, nouvelId: () => string) {
  const l = libelle?.trim() || undefined;
  const der = entrees
    .filter((e) => e.sorte === 'ajout' && e.jour === jour && (e.libelle?.trim() || undefined) === l && e.le && now - Date.parse(e.le) < REGROUPER_MS)
    .sort((a, b) => b.le!.localeCompare(a.le!))[0];
  if (der) {
    const m = (der.minutes ?? 0) + minutes;
    return m === 0 ? { retirer: der.id } : { ecrire: { ...der, minutes: m, le: new Date(now).toISOString() } };
  }
  const e: EntreeTemps = { id: nouvelId(), sorte: 'ajout', jour, minutes, le: new Date(now).toISOString(), ...(l ? { libelle: l } : {}) };
  return { ecrire: e };
}

/** Entrée lue (cache, serveur) : gardée seulement si elle a la bonne forme. */
export function entreeValide(x: unknown): EntreeTemps | null {
  if (!x || typeof x !== 'object') return null;
  const e = x as Partial<EntreeTemps>;
  if (typeof e.id !== 'string' || !e.id || !['compteur', 'ajout', 'auto'].includes(e.sorte as string)) return null;
  const date = (s: unknown) => typeof s === 'string' && Number.isFinite(Date.parse(s));
  if (e.sorte === 'ajout') {
    if (typeof e.jour !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.jour) || typeof e.minutes !== 'number' || !Number.isFinite(e.minutes)) return null;
  } else if (!date(e.debut) || (e.fin !== undefined && !date(e.fin))) return null;
  const out: EntreeTemps = { id: e.id, sorte: e.sorte! };
  for (const k of ['debut', 'fin', 'jour', 'le', 'rappele'] as const) if (typeof e[k] === 'string') out[k] = e[k];
  if (typeof e.minutes === 'number') out.minutes = e.minutes;
  if (typeof e.libelle === 'string' && e.libelle.trim()) out.libelle = e.libelle.trim().slice(0, LIBELLE_MAX);
  return out;
}

export function reglagesValides(x: unknown): ReglagesCompteur {
  const r = (x && typeof x === 'object' ? x : {}) as Partial<ReglagesCompteur>;
  return {
    masque: r.masque === true,
    auto: r.auto === true,
    oubliHeures: typeof r.oubliHeures === 'number' && r.oubliHeures > 0 ? r.oubliHeures : REGLAGES_DEFAUT.oubliHeures,
  };
}

const NOMS: Record<SorteTemps, string> = { compteur: 'Compteur', ajout: 'Ajout', auto: 'Automatique' };

/** Lignes du fichier CSV (pour soi) : une par entrée, de la plus ancienne à la plus récente. */
export function lignesCsv(entrees: EntreeTemps[], now: number): (string | number)[][] {
  const quand = (e: EntreeTemps) => e.debut ?? `${e.jour}T00:00`;
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleString('fr-CH', { dateStyle: 'short', timeStyle: 'short' }) : '');
  return [
    ['Jour', 'Sorte', 'Début', 'Fin', 'Minutes', 'Libellé'],
    ...[...entrees]
      .sort((a, b) => quand(a).localeCompare(quand(b)))
      .map((e) => [
        jourEntree(e),
        NOMS[e.sorte],
        date(e.debut),
        e.sorte === 'ajout' ? '' : e.fin ? date(e.fin) : 'en cours',
        Math.round(dureeEntree(e, now) / MIN),
        e.libelle ?? '',
      ]),
  ];
}
