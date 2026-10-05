import { hasPermission, userRoles } from './permissions';
import type { AppData, Paiement, Person, Task } from './types';
import { fullName } from './utils';

// Tickets à rembourser : la personne photographie son ticket, un admin le valide en signant,
// la caisse fait le virement (hors de l'appli) puis l'indique « OK ».

export const ETATS: Record<Paiement['etat'], { label: string; icon: string }> = {
  a_valider: { label: 'À valider', icon: '✍️' },
  valide: { label: 'Validé – virement à faire', icon: '💳' },
  paye: { label: 'Payé', icon: '✅' },
  refuse: { label: 'Refusé', icon: '❌' },
};

export const chf = (n: number) => `CHF ${n.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const can = (data: AppData, p: Person | null | undefined, perm: 'paiements.valider' | 'paiements.payer') =>
  !!p && hasPermission(userRoles(data.roles, p), perm);

/** Personnes actives qui ont le droit (validation ou caisse) par un rôle qui le donne expressément ;
 *  à défaut, les admins (qui ont tous les droits). Ainsi le virement va à la caisse, pas au président. */
export const holders = (data: AppData, perm: 'paiements.valider' | 'paiements.payer') => {
  const actifs = data.people.filter((p) => p.actif);
  const expres = actifs.filter((p) => userRoles(data.roles, p).some((r) => !r.locked && r.permissions.includes(perm)));
  return (expres.length ? expres : actifs.filter((p) => hasPermission(userRoles(data.roles, p), perm))).map((p) => p.id);
};

export const paiementTasks = (data: AppData) => data.tasks.filter((t): t is Task & { paiement: Paiement } => !!t.paiement);

/** Section des finances (sinon la première). */
export const sectionFinances = (data: AppData) =>
  (data.sections.find((s) => /compta|financ|caisse|trésor|tresor/i.test(s.nom)) ?? data.sections[0])?.id ?? '';

export const nomDe = (data: AppData, id?: string) => fullName(data.people.find((p) => p.id === id));

/** Statut de la tâche selon l'état du ticket : ouvert tant qu'il n'est pas payé, terminé une fois payé, annulé si refusé. */
export function statutPour(data: AppData, etat: Paiement['etat']) {
  const open = data.statuses.find((s) => !s.done)?.id ?? 's1';
  const done = data.statuses.find((s) => s.done && !/annul/i.test(s.label))?.id ?? data.statuses.find((s) => s.done)?.id ?? open;
  const annule = data.statuses.find((s) => s.done && /annul/i.test(s.label))?.id ?? done;
  return etat === 'paye' ? done : etat === 'refuse' ? annule : open;
}

/** Qui doit agir : les validateurs, puis la caisse, puis plus personne (le demandeur garde la tâche). */
export function responsablesPour(data: AppData, t: Task & { paiement: Paiement }) {
  const r = t.paiement.etat === 'a_valider' ? holders(data, 'paiements.valider') : t.paiement.etat === 'valide' ? holders(data, 'paiements.payer') : [];
  return r.length ? r : [t.paiement.demandePar];
}
