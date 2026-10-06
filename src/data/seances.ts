import type { AppData, Meeting, Task, UnitType } from './types';
import { UNIT_TYPES } from './units';
import { today, uid } from './utils';

// Séances qui reviennent chaque année : une séance revient l'année suivante le même mois (sauf si elle est
// « unique »). Leur nom suit le mois (« Comité de mars 2027 ») ; une tâche annuelle liée à une séance passe à
// celle du même mois l'année suivante.

export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « de mars », « d’avril ». */
export const duMois = (date: string) => {
  const mois = MOIS[Number(date.slice(5, 7)) - 1] ?? '';
  return `${/^[aeiouéè]/i.test(mois) ? 'd’' : 'de '}${mois}`;
};

/** Mot d'une séance selon l'entité : « Comité », « Séance », « Réunion ». */
export const motSeance = (type: UnitType = 'central') => UNIT_TYPES[type].seances.replace(/s$/, '');

/** Nom d'une séance d'après son mois : « Comité de mars 2027 », « Réunion d’avril 2027 ». */
export const nomSeance = (date: string, mot = 'Comité') => `${mot} ${duMois(date)} ${date.slice(0, 4)}`;

const AVEC_MOIS = new RegExp(`^(.+?) (?:de |d['’])(?:${MOIS.join('|')}) \\d{4}$`, 'i');
// Anciens noms numérotés : « Comité 4 », « Comité 1 (2027) », « Séance du CO 2 ».
const NUMEROTE = /^(.+?) \d{1,3}(?: \(\d{4}\))?$/;

/**
 * Titre remis au mois de la date (« Comité de mars 2027 » → « Comité d’avril 2027 »), ou null pour un titre libre.
 * `anciens` : aussi les noms numérotés (« Comité 4 »).
 */
export function titreSelonDate(titre: string, date: string, anciens = false) {
  const t = titre.trim();
  const x = t.match(AVEC_MOIS) ?? (anciens ? t.match(NUMEROTE) : null);
  return x && /^\d{4}-\d{2}-\d{2}$/.test(date) ? nomSeance(date, x[1]) : null;
}

/** Revient chaque année (par défaut). */
export const annuelle = (m: Meeting) => !m.unique;
const moisDe = (date: string) => date.slice(0, 7);
const parDate = (a: Meeting, b: Meeting) => a.date.localeCompare(b.date);

/** Même mois l'année suivante, même jour de la semaine au même rang (2e jeudi → 2e jeudi ; 5e → dernier). */
export function memeJourAnSuivant(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const jour = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const premier = new Date(Date.UTC(y + 1, m - 1, 1)).getUTCDay();
  const fin = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  let j = 1 + ((jour - premier + 7) % 7) + (Math.ceil(d / 7) - 1) * 7;
  while (j > fin) j -= 7;
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

/** Titre de la séance de l'année suivante : même nom au nouveau mois, sinon l'année remplacée, sinon le même titre. */
function titreAnSuivant(m: Meeting, date: string) {
  const an = m.date.slice(0, 4);
  return titreSelonDate(m.titre, date, true) ?? m.titre.split(an).join(String(Number(an) + 1));
}

/**
 * Séance du même mois l'année suivante : celle qui existe déjà, sinon une nouvelle (pas encore enregistrée).
 * Rien pour une séance unique quand ce mois-là n'a pas de séance l'année suivante.
 */
export function seanceAnSuivant(meetings: Meeting[], m: Meeting): { meeting: Meeting; nouvelle: boolean } | undefined {
  const date = memeJourAnSuivant(m.date);
  const deja = meetings.filter((x) => annuelle(x) && moisDe(x.date) === moisDe(date)).sort(parDate)[0];
  if (deja) return { meeting: deja, nouvelle: false };
  if (!annuelle(m)) return undefined;
  return { meeting: { id: uid('m'), titre: titreAnSuivant(m, date), date, heure: m.heure, lieu: m.lieu, ordreDuJour: '', notes: '' }, nouvelle: true };
}

/** Tâche annuelle liée à une séance : la séance du même mois l'année suivante (existante, ou à créer si elle est à venir). */
export function seancePourSuivante(data: AppData, t: Task) {
  if (t.recurrence !== 'annuelle' || !t.meetingId) return undefined;
  const m = data.meetings.find((x) => x.id === t.meetingId);
  const s = m && seanceAnSuivant(data.meetings, m);
  return s && !(s.nouvelle && s.meeting.date < today()) ? s : undefined;
}

/**
 * Séances de l'année prochaine à créer : pour chaque mois, la dernière séance annuelle passée revient un an plus
 * tard, tant que ce mois-là n'a pas déjà sa séance.
 */
export function aPlanifier(meetings: Meeting[], jour = today()) {
  const derniere = new Map<string, Meeting>();
  for (const m of meetings) {
    const k = m.date.slice(5, 7);
    const avant = derniere.get(k);
    if (annuelle(m) && m.date < jour && (!avant || avant.date < m.date)) derniere.set(k, m);
  }
  return [...derniere.values()]
    .flatMap((source) => {
      const s = seanceAnSuivant(meetings, source);
      return s?.nouvelle && s.meeting.date >= jour ? [{ source, meeting: s.meeting }] : [];
    })
    .sort((a, b) => parDate(a.meeting, b.meeting));
}

/** Séances annuelles du même mois, jusqu'à celle-ci : à marquer « unique » pour que ce mois ne revienne plus. */
export const serieDuMois = (meetings: Meeting[], m: Meeting) =>
  meetings.filter((x) => annuelle(x) && x.date.slice(5, 7) === m.date.slice(5, 7) && x.date <= m.date).map((x) => x.id);

/** Seule séance annuelle de son mois (cette année-là). */
export const seuleDuMois = (meetings: Meeting[], m: Meeting) =>
  annuelle(m) && !meetings.some((x) => x.id !== m.id && annuelle(x) && moisDe(x.date) === moisDe(m.date));

/** Supprimer la seule séance annuelle d'un mois arrête ce mois (sinon il serait reproposé) : séances à marquer « unique ». */
export const finDeSerie = (meetings: Meeting[], m: Meeting) =>
  seuleDuMois(meetings, m) ? serieDuMois(meetings, m).filter((id) => id !== m.id) : [];

/** Séances au nom numéroté (« Comité 4 ») et leur nom d'après le mois (« Comité de septembre 2026 »). */
export function aRenommer(meetings: Meeting[]) {
  const pris = new Set(meetings.map((m) => m.titre));
  return [...meetings].sort(parDate).flatMap((m) => {
    const base = AVEC_MOIS.test(m.titre.trim()) ? null : titreSelonDate(m.titre, m.date, true);
    if (!base) return [];
    let titre = base;
    for (let i = 2; pris.has(titre); i++) titre = `${base} (${i})`;
    pris.add(titre);
    return [{ meeting: m, titre }];
  });
}
