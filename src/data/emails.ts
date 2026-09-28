import type { AppData, EmailWhen, ScheduledEmail, Task } from './types';
import { addDays, fmtDate, fullName, isDone, nextDate, uid } from './utils';

// Emails programmés au sujet d'une tâche.
// Démo : le navigateur ne peut pas envoyer d'email tout seul. À l'heure prévue, l'auteur reçoit
// une notification et l'email s'ouvre, déjà rempli, dans sa messagerie. Dans la version réelle,
// un serveur l'enverrait automatiquement à l'heure prévue.

export const EMAIL_DELAIS: { jours: number; label: string }[] = [
  { jours: 30, label: '1 mois avant le délai' },
  { jours: 14, label: '2 semaines avant le délai' },
  { jours: 7, label: '1 semaine avant le délai' },
  { jours: 3, label: '3 jours avant le délai' },
  { jours: 1, label: 'La veille du délai' },
  { jours: 0, label: 'Le jour du délai' },
  { jours: -1, label: 'Le lendemain du délai' },
  { jours: -3, label: '3 jours après le délai' },
  { jours: -7, label: '1 semaine après le délai' },
];

export const PLACEHOLDERS = ['{tâche}', '{délai}', '{section}', '{responsables}', '{statut}', '{remarque}', '{lien}', '{expéditeur}'];

export const DEFAULT_OBJET = 'Rappel : {tâche}';
export const DEFAULT_MESSAGE =
  'Bonjour,\n\nPetit rappel concernant la tâche « {tâche} » ({section}), à faire pour le {délai}.\n\nVoir la tâche : {lien}\n\nMeilleures salutations\n{expéditeur}';

export function newEmail(task: Task, userId: string): ScheduledEmail {
  const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1);
  return {
    id: uid('e'),
    taskId: task.id,
    destinataires: [...task.responsables],
    objet: DEFAULT_OBJET,
    message: DEFAULT_MESSAGE,
    quand: task.delai ? { type: 'delai', jours: 3, heure: '08:00' } : { type: 'date', date: tomorrow, heure: '08:00' },
    siNonTerminee: true,
    statut: 'programme',
    creePar: userId,
    creeLe: new Date().toISOString(),
  };
}

/** Date et heure d'envoi (AAAA-MM-JJTHH:MM, heure locale), ou null si la tâche n'a pas de délai. */
export function dueAt(task: Task, q: EmailWhen): string | null {
  const date = q.type === 'date' ? q.date : task.delai ? addDays(task.delai, -q.jours) : '';
  return date ? `${date}T${q.heure || '08:00'}` : null;
}

export const localNow = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export type EmailState = 'programme' | 'aEnvoyer' | 'envoye' | 'annule' | 'sansObjet' | 'sansDate';

export function emailState(data: AppData, task: Task, e: ScheduledEmail): EmailState {
  if (e.statut === 'envoye') return 'envoye';
  if (e.statut === 'annule') return 'annule';
  const at = dueAt(task, e.quand);
  if (!at) return 'sansDate';
  if (at > localNow()) return 'programme';
  return e.siNonTerminee && isDone(data, task) ? 'sansObjet' : 'aEnvoyer';
}

export const STATE_LABEL: Record<EmailState, string> = {
  programme: 'Programmé',
  aEnvoyer: 'À envoyer',
  envoye: 'Envoyé',
  annule: 'Annulé',
  sansObjet: 'Pas envoyé : tâche terminée',
  sansDate: 'En attente d’un délai',
};

export function whenLabel(task: Task, q: EmailWhen) {
  const at = dueAt(task, q);
  const heure = q.heure.replace(':', 'h');
  if (q.type === 'date') return `le ${fmtDate(q.date)} à ${heure}`;
  const rel = EMAIL_DELAIS.find((x) => x.jours === q.jours)?.label.toLowerCase() ?? `${q.jours} jours avant le délai`;
  return at ? `${rel} (${fmtDate(at.slice(0, 10))} à ${heure})` : `${rel} (la tâche n’a pas encore de délai)`;
}

/** Emails programmés d'une tâche, triés par date d'envoi. */
export function emailsOf(data: AppData, taskId: string) {
  const task = data.tasks.find((t) => t.id === taskId);
  return (data.emails ?? [])
    .filter((e) => e.taskId === taskId)
    .sort((a, b) => ((task && dueAt(task, a.quand)) ?? '9').localeCompare((task && dueAt(task, b.quand)) ?? '9'));
}

export function appLink(taskId: string) {
  return `${location.origin}${location.pathname}#/taches?tache=${taskId}`;
}

/** Remplace les champs {tâche}, {délai}… par les valeurs de la tâche. */
export function fillTemplate(data: AppData, task: Task, e: ScheduledEmail, text: string) {
  const person = (id: string) => data.people.find((p) => p.id === id);
  const values: Record<string, string> = {
    '{tâche}': task.titre,
    '{délai}': task.delai ? fmtDate(task.delai) : 'sans délai',
    '{section}': [data.sections.find((s) => s.id === task.sectionId)?.nom, task.sousSection].filter(Boolean).join(' › '),
    '{responsables}': task.responsables.map((id) => fullName(person(id))).join(', '),
    '{statut}': data.statuses.find((s) => s.id === task.statusId)?.label ?? '',
    '{remarque}': task.remarque,
    '{lien}': appLink(task.id),
    '{expéditeur}': fullName(person(e.creePar)),
  };
  return text.replace(/\{[^}]+\}/g, (k) => values[k] ?? k);
}

export function recipients(data: AppData, e: ScheduledEmail) {
  const fromPeople = e.destinataires.map((id) => data.people.find((p) => p.id === id)?.email).filter((x): x is string => !!x);
  const extra = (e.autres ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  return Array.from(new Set([...fromPeople, ...extra]));
}

export function mailtoHref(data: AppData, task: Task, e: ScheduledEmail) {
  const q = `subject=${encodeURIComponent(fillTemplate(data, task, e, e.objet))}&body=${encodeURIComponent(fillTemplate(data, task, e, e.message))}`;
  return `mailto:${recipients(data, e).join(',')}?${q}`;
}

/** Emails à reconduire avec l'occurrence suivante d'une tâche récurrente. */
export function emailsForNext(data: AppData, task: Task, next: Task): ScheduledEmail[] {
  return (data.emails ?? [])
    .filter((e) => e.taskId === task.id && e.statut !== 'annule')
    .map((e) => ({
      ...e,
      id: uid('e'),
      taskId: next.id,
      // Email adressé aux responsables : il va aux responsables de l'occurrence suivante (qui suivent le poste),
      // les autres destinataires restent. Sinon, on garde la liste telle quelle.
      destinataires: task.responsables.length && task.responsables.every((id) => e.destinataires.includes(id))
        ? Array.from(new Set([...e.destinataires.filter((id) => !task.responsables.includes(id)), ...next.responsables]))
        : e.destinataires,
      quand: e.quand.type === 'date' ? { ...e.quand, date: nextDate(e.quand.date, task.recurrence!) } : e.quand,
      statut: 'programme' as const,
      envoyeLe: undefined,
      envoyePar: undefined,
      creeLe: new Date().toISOString(),
    }));
}
