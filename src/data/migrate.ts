import { statuses as STATUSES } from './seedData';
import { applyDelaiRef, uid } from './utils';
import { snapshotToJournal } from './minutes';
import type { AppData, ChecklistItem, Permission, Task } from './types';

// Format des données enregistrées : numéro de version et mises à niveau des anciennes données (démo, copies, serveur).
export const SCHEMA = 16;

/**
 * Mises à niveau des données déjà enregistrées (évite de tout réinitialiser).
 * Les étapes v8 à v12 ne concernent que la démo : les données réelles partent du format v12.
 */
export function migrate(d: AppData): AppData {
  if ((d.schema ?? 7) < 8) {
    // v8 : onglet PV, donné par défaut au Secrétaire.
    const sec = d.roles.find((r) => r.id === 'secretaire');
    if (sec && !sec.permissions.includes('tab.minutes')) sec.permissions.push('tab.minutes');
  }
  if ((d.schema ?? 7) < 9) {
    // v9 : le PV garde un journal des changements faits depuis l'onglet PV (au lieu d'un état de départ).
    d.meetings.forEach((m) => m.minutes && snapshotToJournal(d, m.minutes));
  }
  if ((d.schema ?? 7) < 10) {
    // v10 : emails programmés.
    if (!d.emails) d.emails = [];
  }
  if ((d.schema ?? 7) < 11) simplifyStatuses(d);
  if ((d.schema ?? 7) < 12) linkSubtasks(d);
  if ((d.schema ?? 7) < 13) {
    // v13 : tickets à rembourser ; la caisse reçoit le droit de faire les virements (validation : admins).
    if (!d.roles.some((r) => r.permissions.includes('paiements.payer')))
      d.roles.filter((r) => r.id === 'caissier' || /caiss|trésor|tresor|financ/i.test(r.label)).forEach((r) => r.permissions.push('paiements.payer'));
  }
  // v14 : circuit caisse → visa ; les tickets « à valider » de la première version sont « reçus » par la caisse.
  if ((d.schema ?? 7) < 14) d.tasks.forEach((t) => { if (t.paiement && (t.paiement.etat as string) === 'a_valider') t.paiement.etat = 'recu'; });
  // v15 : chaque entité a sa caisse ; à défaut, un rôle « Caissier » (droits d'un membre du comité + caisse) à attribuer.
  if ((d.schema ?? 7) < 15 && !d.roles.some((r) => !r.locked && r.permissions.includes('paiements.payer'))) {
    const existant = d.roles.find((r) => r.id === 'caissier');
    if (existant) existant.permissions.push('paiements.payer');
    else {
      const membre = d.roles.find((r) => !r.locked && r.permissions.includes('tab.meetings'));
      const base: Permission[] = membre?.permissions.filter((p) => !p.startsWith('paiements.')) ?? ['tasks.viewAll', 'tasks.editOwn', 'tab.meetings', 'tab.events', 'tab.people'];
      d.roles.push({ id: 'caissier', label: 'Caissier', couleur: '#047857', permissions: [...base, 'paiements.payer'], sections: [] });
    }
  }
  // v16 : registre « Membres du club » ; le Secrétaire y a accès par défaut (les admins l'ont déjà).
  if ((d.schema ?? 7) < 16) d.roles.filter((r) => r.id === 'secretaire' && !r.permissions.includes('club.membres')).forEach((r) => r.permissions.push('club.membres'));
  d.schema = SCHEMA;
  return d;
}

/** Anciens statuts → statuts simplifiés (A valider → En cours, A discuter → À faire, Sans nouvelles → En attente, Info → Terminé). */
const STATUS_MAP: Record<string, string> = { s4: 's2', s5: 's1', s6: 's3', s8: 's7' };

/** v11 : statuts simplifiés (À faire, En cours, En attente, Terminé, Annulé) ; les tâches gardent leur avancement. */
function simplifyStatuses(d: AppData) {
  const known = new Set(STATUSES.map((s) => s.id));
  const sid = (id: string) => (known.has(id) ? id : STATUS_MAP[id] ?? STATUSES[0].id);
  d.tasks = d.tasks.map((t) => ({ ...t, statusId: sid(t.statusId) }));
  d.statuses = structuredClone(STATUSES);
  // Statuts exclus de l'ordre du jour : on retire ceux qui n'existent plus (exclure « Info » ne doit pas exclure « Terminé »).
  Object.values(d.prefs).forEach((p) => p.pv?.statutsExclus && (p.pv.statutsExclus = p.pv.statutsExclus.filter((id) => known.has(id))));
  d.log.unshift({ id: `l${Date.now()}v11`, at: new Date().toISOString(), userId: 'p1', action: 'Statuts simplifiés : À faire, En cours, En attente, Terminé, Annulé' });
}

/** Ancien format des sous-tâches (v10-v11) : personne chargée et délai propre. */
type OldItem = ChecklistItem & { assigneeId?: string; delai?: string; ref?: { type: 'event' | 'meeting'; id: string; joursAvant: number } };

/** v12 : une sous-tâche avec personne chargée ou délai devient une tâche liée ; les autres restent de simples cases à cocher. */
function linkSubtasks(d: AppData) {
  const doneId = d.statuses.find((s) => s.done)?.id ?? 's7';
  const openId = d.statuses.find((s) => !s.done)?.id ?? 's1';
  const now = new Date().toISOString();
  const strip = (c: OldItem): ChecklistItem => ({ id: c.id, label: c.label, done: c.done });
  const out: Task[] = [];
  for (const t of d.tasks) {
    const items = t.checklist as OldItem[];
    const toTask = items.filter((c) => c.assigneeId || c.delai);
    out.push({ ...t, checklist: items.filter((c) => !toTask.includes(c)).map(strip) });
    for (const c of toTask)
      out.push(
        applyDelaiRef(d, {
          id: uid('t'),
          sectionId: t.sectionId,
          sousSection: t.sousSection,
          titre: c.label,
          responsables: c.assigneeId ? [c.assigneeId] : [...t.responsables],
          statusId: c.done ? doneId : openId,
          delai: c.delai || t.delai,
          remarque: '',
          checklist: [],
          parentId: t.id,
          ...(c.ref ? { [c.ref.type === 'meeting' ? 'meetingId' : 'eventId']: c.ref.id, delaiRef: { type: c.ref.type, joursAvant: c.ref.joursAvant } } : {}),
          termineeLe: c.done ? now.slice(0, 10) : undefined,
          createdBy: t.createdBy,
          updatedAt: now,
        }),
      );
  }
  if (out.length !== d.tasks.length)
    d.log.unshift({ id: `l${Date.now()}v12`, at: now, userId: 'p1', action: 'Sous-tâches transformées en tâches liées à leur tâche principale' });
  d.tasks = out;
  d.notifications = (d.notifications ?? []).filter((n) => (n.type as string) !== 'subtask');
}
