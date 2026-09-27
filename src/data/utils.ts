import type { AppData, Person, Task } from './types';

export const today = () => new Date().toISOString().slice(0, 10);

export const fmtDate = (s?: string) =>
  s ? new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fullName = (p?: Person) => (p ? `${p.prenom} ${p.nom}` : 'Inconnu');
export const initials = (p?: Person) => (p ? p.prenom[0] + p.nom[0] : '?');

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
