import type { AppData, DelaiRef, DelaiUnite, Meeting, Person, Recurrence, Task } from './types';

export const today = () => new Date().toISOString().slice(0, 10);

export const fmtDate = (s?: string) =>
  s ? new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

/** Dernier jour d'un événement sur un ou plusieurs jours. */
export const endOf = (x: { date: string; dateFin?: string }) => (x.dateFin && x.dateFin > x.date ? x.dateFin : x.date);

/** Dates d'un événement : « 27.02.2027 », « 27–28.02.2027 », « 30.06 – 02.07.2027 ». */
export function fmtRange(date?: string, fin?: string) {
  if (!date || !fin || fin <= date) return fmtDate(date);
  const [a, b] = [fmtDate(date), fmtDate(fin)];
  if (date.slice(0, 7) === fin.slice(0, 7)) return `${a.slice(0, 2)}–${b}`;
  if (date.slice(0, 4) === fin.slice(0, 4)) return `${a.slice(0, 5)} – ${b}`;
  return `${a} – ${b}`;
}

export const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fullName = (p?: Pick<Person, 'prenom' | 'nom'>) => (p ? `${p.prenom} ${p.nom}`.trim() : 'Inconnu');
export const shortName = (p?: Pick<Person, 'prenom' | 'nom'>) => (p ? `${p.prenom}${p.nom ? ` ${p.nom[0]}.` : ''}` : '?');
export function initials(p?: Pick<Person, 'prenom' | 'nom'>) {
  if (!p) return '?';
  const first = p.prenom.split('-').map((x) => x[0]).join('').slice(0, 2);
  if (!p.nom) {
    // Sans nom de famille : initiales des mots (Bénévole 1 → B1, Parcours et sécurité → PS), sinon deux premières lettres (Sarah → SA).
    const words = p.prenom.split(/[\s-]+/).filter((w) => w && !/^(de|du|des|la|le|les|et|d’|l’)$/i.test(w));
    return (words.length > 1 ? words[0][0] + words[1][0] : first.length > 1 ? first : p.prenom.slice(0, 2)).toUpperCase();
  }
  return (first + p.nom[0]).toUpperCase();
}

const plain = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
/** Poste à afficher à côté d'un nom, sauf s'il le répète (démo : la personne est désignée par son poste). */
export const posteBesideName = (name: string, poste?: string) =>
  poste && plain(name) !== plain(poste) && !plain(name).startsWith(`${plain(poste)} `) ? poste : '';

/** Toutes les fonctions d'une personne (poste principal + autres). */
export const postesDe = (p: Person) => [p.poste, ...(p.autresPostes ?? '').split(',').map((x) => x.trim())].filter(Boolean);

export const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function isDone(data: AppData, t: Task) {
  return data.statuses.find((s) => s.id === t.statusId)?.done ?? false;
}

export function isLate(data: AppData, t: Task) {
  return !isDone(data, t) && !!t.delai && t.delai < today();
}

// ---------- Tâches liées ----------

/** Tâches liées à une tâche principale. */
export const childrenOf = (data: AppData, id: string) => data.tasks.filter((t) => t.parentId === id);
/** Tâche principale d'une tâche liée. */
export const parentOf = (data: AppData, t: Task) => (t.parentId ? data.tasks.find((x) => x.id === t.parentId) : undefined);

/** Jours de `a` à `b` (dates AAAA-MM-JJ). */
export function diffDays(a: string, b: string) {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
}

export function daysUntil(date: string) {
  const a = new Date(today() + 'T12:00:00').getTime();
  const b = new Date(date + 'T12:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

// ---------- Dates ----------

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}

function addMonths(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  const total = m - 1 + n;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate(); // 31 janv. + 1 mois → 28/29 févr.
  return ymd(ny, nm + 1, Math.min(d, last));
}

// ---------- Délais liés à un événement / une séance ----------

// Délai lié : un nombre de jours, de semaines ou de mois, avant ou après l'événement / la séance.
type Decalage = Pick<DelaiRef, 'joursAvant' | 'unite' | 'moisAvant'>;
export const DELAI_MAX = 999;

/** Décalage lu comme on le saisit : nombre, unité, avant / après. */
export function splitDelai(r: Decalage): { n: number; unite: DelaiUnite; apres: boolean } {
  if (r.unite === 'mois' && r.moisAvant !== undefined) return { n: Math.abs(r.moisAvant), unite: 'mois', apres: r.moisAvant < 0 };
  const j = r.joursAvant;
  // Tâches d'avant le réglage libre : « 2 semaines avant » était gardé en jours (14).
  const semaines = r.unite === 'semaines' || (!r.unite && j !== 0 && j % 7 === 0);
  return { n: Math.abs(semaines ? j / 7 : j), unite: semaines ? 'semaines' : 'jours', apres: j < 0 };
}

/** Décalage à garder dans la tâche. */
export function makeDelai(n: number, unite: DelaiUnite, apres: boolean): Decalage {
  const k = Math.max(0, Math.min(DELAI_MAX, Math.round(n) || 0)) * (apres ? -1 : 1) || 0;
  if (unite === 'mois') return { unite, moisAvant: k, joursAvant: k * 30 };
  return { unite, moisAvant: undefined, joursAvant: unite === 'semaines' ? k * 7 : k };
}

/** « Le jour même », « La veille », « 3 jours avant », « 2 semaines après », « 1 mois avant »… */
export function offsetLabel(r: Decalage) {
  const { n, unite, apres } = splitDelai(r);
  if (n === 0) return 'Le jour même';
  if (unite === 'jours' && n === 1) return apres ? 'Le lendemain' : 'La veille';
  const u = unite === 'mois' ? 'mois' : unite === 'semaines' ? (n > 1 ? 'semaines' : 'semaine') : 'jours';
  return `${n} ${u} ${apres ? 'après' : 'avant'}`;
}

/** Événement ou séance servant de référence au délai de la tâche. */
export function delaiTarget(data: AppData, t: Task): { nom: string; date: string } | null {
  if (!t.delaiRef) return null;
  if (t.delaiRef.type === 'event') {
    const e = data.events.find((x) => x.id === t.eventId);
    return e ? { nom: e.nom, date: e.date } : null;
  }
  const m = data.meetings.find((x) => x.id === t.meetingId);
  return m ? { nom: m.titre, date: m.date } : null;
}

/** Délai d'après la date de l'événement / de la séance et le décalage. */
export const delaiDepuis = (r: Decalage, date: string) =>
  r.unite === 'mois' && r.moisAvant !== undefined ? addMonths(date, -r.moisAvant) : addDays(date, -r.joursAvant);

/** Recalcule le délai lié (ou retire le lien si l'événement / la séance n'existe plus). */
export function applyDelaiRef<T extends Task>(data: AppData, t: T): T {
  if (!t.delaiRef) return t;
  const target = delaiTarget(data, t);
  if (!target) return { ...t, delaiRef: undefined };
  return { ...t, delai: delaiDepuis(t.delaiRef, target.date) };
}

// ---------- Tâches récurrentes ----------

export const RECURRENCES: { id: Recurrence; label: string }[] = [
  { id: 'hebdomadaire', label: 'Chaque semaine' },
  { id: 'mensuelle', label: 'Chaque mois' },
  { id: 'trimestrielle', label: 'Chaque trimestre' },
  { id: 'semestrielle', label: 'Chaque semestre' },
  { id: 'annuelle', label: 'Chaque année' },
];

export const recurrenceLabel = (r?: Recurrence) => RECURRENCES.find((x) => x.id === r)?.label ?? '';

export function nextDate(date: string, r: Recurrence) {
  switch (r) {
    case 'hebdomadaire': return addDays(date, 7);
    case 'mensuelle': return addMonths(date, 1);
    case 'trimestrielle': return addMonths(date, 3);
    case 'semestrielle': return addMonths(date, 6);
    case 'annuelle': return addMonths(date, 12);
  }
}

export const postesOf = (data: AppData, ids: string[]) =>
  Array.from(new Set(ids.map((id) => data.people.find((p) => p.id === id)?.poste).filter((x): x is string => !!x)));

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Postes à retenir pour une tâche récurrente. On garde ceux déjà enregistrés tant que
 * les responsables ne changent pas : si le trésorier quitte son poste, la tâche reste
 * celle « du Trésorier » et ira à son successeur.
 */
export function postesFor(data: AppData, t: Task, before?: Task): string[] | undefined {
  if (!t.recurrence) return undefined;
  if (before?.postesResp && sameSet(before.responsables, t.responsables)) return before.postesResp;
  return postesOf(data, t.responsables);
}

/**
 * Responsables de l'occurrence suivante : les personnes actives qui occupent aujourd'hui
 * les postes enregistrés ; à défaut les mêmes personnes (si actives) ; à défaut un admin.
 */
export function nextResponsables(data: AppData, t: Task): string[] {
  const ids = new Set<string>();
  for (const poste of t.postesResp ?? []) data.people.filter((p) => p.actif && postesDe(p).includes(poste)).forEach((p) => ids.add(p.id));
  if (!ids.size) t.responsables.filter((id) => data.people.some((p) => p.id === id && p.actif)).forEach((id) => ids.add(id));
  if (!ids.size) {
    const admin = data.people.find((p) => p.actif && p.roles.includes('admin'));
    if (admin) ids.add(admin.id);
  }
  return [...ids];
}

/**
 * Tâche principale de l'occurrence suivante d'une tâche liée : l'occurrence suivante de sa tâche principale
 * si elle existe déjà ; aucune tant qu'une tâche principale récurrente n'a pas été reconduite (elle la
 * rejoindra à ce moment-là) ; sinon la même tâche principale (ex. « Paiements »).
 */
function nextParent(data: AppData, t: Task) {
  const parent = t.parentId ? data.tasks.find((x) => x.id === t.parentId) : undefined;
  if (!parent) return undefined;
  if (parent.suivanteId) return parent.suivanteId;
  return parent.recurrence ? undefined : parent.id;
}

/**
 * Prépare l'occurrence suivante d'une tâche récurrente qui vient d'être clôturée.
 * `seance` : séance de l'année suivante pour une tâche annuelle liée à une séance (son délai lié la suit).
 */
export function nextOccurrence(data: AppData, t: Task, seance?: Meeting): Task {
  const open = data.statuses.find((s) => !s.done) ?? data.statuses[0];
  const suit = seance && t.delaiRef?.type === 'meeting' ? t.delaiRef : undefined;
  return {
    ...t,
    id: uid('t'),
    statusId: open.id,
    delai: suit ? delaiDepuis(suit, seance!.date) : t.delai ? nextDate(t.delai, t.recurrence!) : '',
    responsables: nextResponsables(data, t),
    checklist: t.checklist.map((c) => ({ ...c, id: uid('c'), done: false })),
    parentId: nextParent(data, t),
    // L'événement de cette année ne concerne pas l'occurrence suivante ; la séance, seulement celle du même mois l'an prochain.
    eventId: undefined,
    meetingId: seance?.id,
    delaiRef: suit,
    suivanteId: undefined,
    // La demande d'une autre entité concernait cette occurrence-ci.
    proposee: undefined,
    updatedAt: new Date().toISOString(),
  };
}
