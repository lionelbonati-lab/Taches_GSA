import type { AppData, MeetingMinutes, Task, TaskSnapshot } from './types';
import { initials } from './utils';

// Outils du PV partagés par l'onglet PV et la mise à niveau des données.

export const EMPTY_MINUTES: MeetingMinutes = { presents: [], excuses: [], notes: {} };

export const shortDate = (d: string) => {
  const [y, m, j] = d.split('-');
  return `${j}.${m}.${y.slice(2)}`;
};

export const stateOf = (t: Task): TaskSnapshot => ({
  statusId: t.statusId,
  delai: t.delai,
  responsables: [...t.responsables],
  titre: t.titre,
  sous: Object.fromEntries(t.checklist.map((c) => [c.id, c.done])),
});

/** Description lisible des changements entre deux états d'une tâche. */
export function diffTask(data: AppData, before: TaskSnapshot, after: Task): string[] {
  const label = (id: string) => data.statuses.find((x) => x.id === id)?.label ?? '?';
  const who = (ids: string[]) => ids.map((id) => initials(data.people.find((p) => p.id === id))).join(', ') || '—';
  const out: string[] = [];
  if (before.statusId !== after.statusId) out.push(`statut : ${label(before.statusId)} → ${label(after.statusId)}`);
  if (before.delai !== after.delai) out.push(`délai : ${before.delai ? shortDate(before.delai) : 'libre'} → ${after.delai ? shortDate(after.delai) : 'libre'}`);
  if (before.responsables.join() !== after.responsables.join()) out.push(`responsable : ${who(before.responsables)} → ${who(after.responsables)}`);
  if (before.titre !== after.titre) out.push('intitulé modifié');
  if (before.sous)
    for (const c of after.checklist) {
      if (!(c.id in before.sous)) out.push(`sous-tâche ajoutée : ${c.label}`);
      else if (before.sous[c.id] !== c.done) out.push(`sous-tâche « ${c.label} » ${c.done ? 'faite' : 'rouverte'}`);
    }
  return out;
}

/**
 * Ancien format (état des tâches au début de la séance) → journal des changements.
 * Utilisé une seule fois lors de la mise à niveau des données enregistrées.
 */
export function snapshotToJournal(data: AppData, m: MeetingMinutes) {
  if (!m.snapshot) return;
  const at = m.demarreLe ?? new Date().toISOString();
  m.journal = m.journal ?? [];
  m.nouvelles = m.nouvelles ?? data.tasks.filter((t) => !m.snapshot![t.id]).map((t) => t.id);
  m.supprimees = m.supprimees ?? Object.entries(m.snapshot).filter(([id]) => !data.tasks.some((t) => t.id === id)).map(([, v]) => v.titre);
  for (const t of data.tasks) {
    const before = m.snapshot[t.id];
    const changes = before ? diffTask(data, before, t) : [];
    if (changes.length) m.journal.push({ taskId: t.id, titre: t.titre, changes, at });
  }
  delete m.snapshot;
  if (m.valideLe && !m.version) m.version = 1;
}
