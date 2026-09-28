import type { AppData, Person, Recurrence, Task } from './types';

export const today = () => new Date().toISOString().slice(0, 10);

export const fmtDate = (s?: string) =>
  s ? new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fullName = (p?: Person) => (p ? `${p.prenom} ${p.nom}`.trim() : 'Inconnu');
export const shortName = (p?: Person) => (p ? `${p.prenom}${p.nom ? ` ${p.nom[0]}.` : ''}` : '?');
export function initials(p?: Person) {
  if (!p) return '?';
  const first = p.prenom.split('-').map((x) => x[0]).join('').slice(0, 2);
  // Sans nom de famille : deux premières lettres du prénom (Sarah → SA).
  if (!p.nom) return (first.length > 1 ? first : p.prenom.slice(0, 2)).toUpperCase();
  return (first + p.nom[0]).toUpperCase();
}

/** Toutes les fonctions d'une personne (poste principal + autres). */
export const postesDe = (p: Person) => [p.poste, ...(p.autresPostes ?? '').split(',').map((x) => x.trim())].filter(Boolean);

export const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function isDone(data: AppData, t: Task) {
  return data.statuses.find((s) => s.id === t.statusId)?.done ?? false;
}

export function isLate(data: AppData, t: Task) {
  return !isDone(data, t) && !!t.delai && t.delai < today();
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

export const DELAI_OFFSETS: { jours: number; label: string }[] = [
  { jours: 0, label: 'Le jour même' },
  { jours: 1, label: 'La veille' },
  { jours: 3, label: '3 jours avant' },
  { jours: 7, label: '1 semaine avant' },
  { jours: 14, label: '2 semaines avant' },
  { jours: 21, label: '3 semaines avant' },
  { jours: 30, label: '1 mois avant' },
  { jours: 60, label: '2 mois avant' },
  { jours: 90, label: '3 mois avant' },
  { jours: -1, label: 'Le lendemain' },
  { jours: -7, label: '1 semaine après' },
];

export const offsetLabel = (j: number) =>
  DELAI_OFFSETS.find((o) => o.jours === j)?.label ?? (j >= 0 ? `${j} jours avant` : `${-j} jours après`);

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

/** Recalcule le délai lié (ou retire le lien si l'événement / la séance n'existe plus). */
export function applyDelaiRef<T extends Task>(data: AppData, t: T): T {
  if (!t.delaiRef) return t;
  const target = delaiTarget(data, t);
  if (!target) return { ...t, delaiRef: undefined };
  return { ...t, delai: addDays(target.date, -t.delaiRef.joursAvant) };
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

/** Prépare l'occurrence suivante d'une tâche récurrente qui vient d'être clôturée. */
export function nextOccurrence(data: AppData, t: Task): Task {
  const open = data.statuses.find((s) => !s.done) ?? data.statuses[0];
  return {
    ...t,
    id: uid('t'),
    statusId: open.id,
    delai: t.delai ? nextDate(t.delai, t.recurrence!) : '',
    responsables: nextResponsables(data, t),
    // Les sous-tâches restent confiées aux mêmes personnes (si elles sont toujours actives).
    checklist: t.checklist.map((c) => ({
      ...c,
      id: uid('c'),
      done: false,
      assigneeId: data.people.some((p) => p.id === c.assigneeId && p.actif) ? c.assigneeId : undefined,
    })),
    // L'événement / la séance de cette année ne concernent pas l'occurrence suivante.
    eventId: undefined,
    meetingId: undefined,
    delaiRef: undefined,
    suivanteId: undefined,
    updatedAt: new Date().toISOString(),
  };
}
