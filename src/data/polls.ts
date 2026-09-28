import type { AppData, Person, Poll, PollOption } from './types';
import { hasPermission, userRoles } from './permissions';
import { fmtDate, today } from './utils';

export const OUINON: PollOption[] = [
  { id: 'oui', label: 'Oui' },
  { id: 'non', label: 'Non' },
  { id: 'abst', label: 'Abstention' },
];

export const POLL_TYPES: { id: Poll['type']; label: string }[] = [
  { id: 'ouinon', label: 'Oui / Non / Abstention' },
  { id: 'choix', label: 'Choix parmi des options' },
  { id: 'dates', label: 'Choix de dates (disponibilités)' },
];

export const isOpen = (p: Poll) => !p.clotureLe && (!p.dateLimite || p.dateLimite >= today());

export function optionLabel(o: PollOption) {
  if (!o.date) return o.label;
  const d = new Date(o.date + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${d}${o.heure ? ` · ${o.heure.replace(':', 'h')}` : ''}${o.label ? ` · ${o.label}` : ''}`;
}

/** Réponses des votants (on ignore celles de personnes retirées de la liste). */
export function results(p: Poll) {
  const voters = Object.keys(p.votes).filter((id) => p.votants.includes(id));
  const counts = p.options.map((o) => ({ option: o, ids: voters.filter((v) => p.votes[v].includes(o.id)) }));
  const max = Math.max(0, ...counts.map((c) => c.ids.length));
  return { voters, counts, max };
}

export function pollSection(data: AppData, p: Poll) {
  return p.sectionId ?? data.tasks.find((t) => t.id === p.taskId)?.sectionId;
}

/** Résumé d'une ligne (ordre du jour, texte copié). */
export function pollSummary(p: Poll) {
  const r = results(p);
  const parts =
    p.type === 'dates'
      ? r.max > 0
        ? [`meilleure date : ${r.counts.filter((c) => c.ids.length === r.max).map((c) => optionLabel(c.option)).join(' / ')} (${r.max} dispo.)`]
        : ['aucune disponibilité pour l’instant']
      : r.counts.map((c) => `${c.option.label} ${c.ids.length}`);
  const state = isOpen(p) ? (p.dateLimite ? `ouvert jusqu’au ${fmtDate(p.dateLimite)}` : 'ouvert') : 'clôturé';
  return `${parts.join(' · ')} — ${r.voters.length}/${p.votants.length} réponses, ${state}`;
}

/** Membres du comité (rôles ayant l'onglet Comité) : votants proposés par défaut. */
export const committeeOf = (data: AppData): Person[] =>
  data.people.filter((p) => p.actif && hasPermission(userRoles(data.roles, p), 'tab.meetings'));
