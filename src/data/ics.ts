import type { PointGeo, RepetitionEvenement } from './types';
import { aLaDate, jourSemaine, occurrencesEntre, rangDansMois } from './repetition';

// Fichier d'agenda (.ics, iCalendar RFC 5545) : séances, événements, délais… à importer dans un agenda personnel
// (Google Agenda, Calendrier d'Apple, Outlook). Heures du club : heure de Suisse (Europe/Zurich), décrite dans le fichier.
// Un événement qui se répète garde sa règle (RRULE) quand elle dit exactement la même chose que l'appli ; sinon
// (le 31 de chaque mois, le 29 février…) ses occurrences sont écrites une à une jusqu'à `horizon`.

/** Un élément de l'agenda, dans les mots de l'appli. */
export interface ElementIcs {
  /** Identifiant stable (le même à chaque export). */
  uid: string;
  titre: string;
  /** Premier jour (AAAA-MM-JJ). */
  date: string;
  /** Dernier jour, sur plusieurs jours. */
  dateFin?: string;
  /** Heure de début (« 19:30 ») ; sans heure : toute la journée. */
  heure?: string;
  /** Heure de fin (le dernier jour). */
  heureFin?: string;
  /** Sans heure de fin, sur un seul jour : durée en minutes. */
  dureeDefaut?: number;
  lieu?: string;
  geo?: PointGeo;
  description?: string;
  url?: string;
  repetition?: RepetitionEvenement;
  sauf?: string[];
  /** Ne bloque pas le temps (délai d'une tâche, fin d'un sondage). */
  libre?: boolean;
}

const FUSEAU = 'Europe/Zurich';
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', `TZID:${FUSEAU}`,
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];
const JOURS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const FREQ = { jour: 'DAILY', semaine: 'WEEKLY', mois: 'MONTHLY', an: 'YEARLY' } as const;

const pad = (n: number) => String(n).padStart(2, '0');
const jour = (d: string) => d.replace(/-/g, '');
const lendemain = (d: string, n = 1) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** Date et heure locales, décalées de `min` minutes (minuit passé : le jour suivant). */
function plusMinutes(d: string, h: string, min: number): [string, string] {
  const [hh, mm] = h.split(':').map(Number);
  const t = hh * 60 + mm + min;
  return [lendemain(d, Math.floor(t / 1440)), `${pad(Math.floor((t % 1440) / 60))}:${pad(t % 60)}`];
}
const local = (d: string, h: string) => `${jour(d)}T${h.replace(':', '').padEnd(4, '0').slice(0, 4)}00`;
/** Dernier dimanche du mois (heure d'été : de celui de mars à celui d'octobre). */
const dernierDimanche = (an: number, mois: number) => {
  const x = new Date(Date.UTC(an, mois, 0));
  return lendemain(x.toISOString().slice(0, 10), -x.getUTCDay());
};
/** Fin du jour `d` à l'heure de Suisse, en heure universelle (23h59 moins 1 h en hiver, 2 h en été). */
const finDuJourUtc = (d: string) => {
  const an = Number(d.slice(0, 4));
  const ete = d >= dernierDimanche(an, 3) && d < dernierDimanche(an, 10);
  return `${jour(d)}T${ete ? 21 : 22}5959Z`;
};

/** Texte d'une propriété : barres obliques inverses, virgules, points-virgules et retours à la ligne protégés. */
export const echapper = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lignes de 75 octets au plus, la suite commençant par une espace (sans couper un caractère). */
export function plier(ligne: string): string {
  const enc = new TextEncoder();
  if (enc.encode(ligne).length <= 75) return ligne;
  const out: string[] = [];
  let cur = '';
  let n = 0;
  for (const c of ligne) {
    const b = enc.encode(c).length;
    if (n + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      n = 0;
    }
    cur += c;
    n += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Règle RRULE qui donne exactement les mêmes jours que l'appli (repetition.ts), sinon rien. */
export function regleIcs(r: RepetitionEvenement, date: string, avecHeure: boolean): string | undefined {
  const p: string[] = [`FREQ=${FREQ[r.freq]}`];
  const n = Math.max(1, Math.round(r.intervalle ?? 1));
  if (n > 1) p.push(`INTERVAL=${n}`);
  const js = jourSemaine(date);
  if (r.freq === 'semaine') {
    const jours = [...new Set((r.jours ?? []).filter((j) => j >= 1 && j <= 7))].sort();
    // Le premier jour doit être l'un des jours choisis : sinon les agendas l'ajoutent quand même.
    if (jours.length && !jours.includes(js)) return undefined;
    p.push(`BYDAY=${(jours.length ? jours : [js]).map((j) => JOURS[j - 1]).join(',')}`, 'WKST=MO');
  } else if (r.freq === 'mois' && r.mensuel) {
    const { rang, dernier } = rangDansMois(date);
    if (r.mensuel === 'dernier' && !dernier) return undefined;
    p.push(`BYDAY=${r.mensuel === 'dernier' ? -1 : rang}${JOURS[js - 1]}`);
  } else if ((r.freq === 'mois' && Number(date.slice(8)) > 28) || (r.freq === 'an' && date.slice(5) === '02-29')) {
    // L'appli prend le dernier jour des mois plus courts ; un agenda les sauterait.
    return undefined;
  }
  if (r.nombre && r.jusquau) return undefined;
  if (r.nombre) p.push(`COUNT=${r.nombre}`);
  // Avec des heures, la fin s'écrit en heure universelle.
  else if (r.jusquau) p.push(`UNTIL=${avecHeure ? finDuJourUtc(r.jusquau) : jour(r.jusquau)}`);
  return p.join(';');
}

function debutFin(e: ElementIcs): string[] {
  if (!e.heure) return [`DTSTART;VALUE=DATE:${jour(e.date)}`, `DTEND;VALUE=DATE:${jour(lendemain(e.dateFin ?? e.date))}`];
  const dernier = e.dateFin && e.dateFin > e.date ? e.dateFin : e.date;
  let fin: [string, string];
  if (e.heureFin) fin = [dernier === e.date && e.heureFin <= e.heure ? lendemain(dernier) : dernier, e.heureFin];
  else if (dernier > e.date) fin = [lendemain(dernier), '00:00'];
  else fin = plusMinutes(e.date, e.heure, e.dureeDefaut ?? 60);
  return [`DTSTART;TZID=${FUSEAU}:${local(e.date, e.heure)}`, `DTEND;TZID=${FUSEAU}:${local(...fin)}`];
}

function vevent(e: ElementIcs, tampon: string, regle?: string): string[] {
  const l = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${tampon}`, ...debutFin(e), `SUMMARY:${echapper(e.titre)}`];
  if (regle) {
    l.push(`RRULE:${regle}`);
    const sauf = (e.sauf ?? []).filter((d) => d >= e.date).sort();
    if (sauf.length) l.push(e.heure ? `EXDATE;TZID=${FUSEAU}:${sauf.map((d) => local(d, e.heure!)).join(',')}` : `EXDATE;VALUE=DATE:${sauf.map(jour).join(',')}`);
  }
  if (e.lieu?.trim()) l.push(`LOCATION:${echapper(e.lieu.trim())}`);
  if (e.geo) l.push(`GEO:${e.geo.lat};${e.geo.lng}`);
  const desc = [e.description?.trim(), e.url].filter(Boolean).join('\n\n');
  if (desc) l.push(`DESCRIPTION:${echapper(desc)}`);
  if (e.url) l.push(`URL:${e.url}`);
  if (e.libre) l.push('TRANSP:TRANSPARENT');
  l.push('END:VEVENT');
  return l;
}

/** Fichier .ics complet. `depuis` / `horizon` : période des occurrences écrites une à une (répétitions sans règle exacte). */
export function calendrierIcs(nom: string, elements: ElementIcs[], opts: { depuis: string; horizon: string; maintenant?: Date }): string {
  const t = (opts.maintenant ?? new Date()).toISOString();
  const tampon = `${t.slice(0, 4)}${t.slice(5, 7)}${t.slice(8, 10)}T${t.slice(11, 13)}${t.slice(14, 16)}${t.slice(17, 19)}Z`;
  const lignes = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GSA//Taches GSA//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${echapper(nom)}`, `X-WR-TIMEZONE:${FUSEAU}`];
  if (elements.some((e) => e.heure)) lignes.push(...VTIMEZONE);
  for (const e of elements) {
    if (!e.repetition) {
      lignes.push(...vevent(e, tampon));
      continue;
    }
    const regle = regleIcs(e.repetition, e.date, !!e.heure);
    if (regle) lignes.push(...vevent(e, tampon, regle));
    else for (const o of occurrencesEntre(e, opts.depuis > e.date ? opts.depuis : e.date, opts.horizon)) lignes.push(...vevent({ ...aLaDate(e, o), uid: `${o}-${e.uid}`, repetition: undefined }, tampon));
  }
  lignes.push('END:VCALENDAR');
  return lignes.map(plier).join('\r\n') + '\r\n';
}
