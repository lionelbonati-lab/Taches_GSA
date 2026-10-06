import { hasPermission, userRoles } from './permissions';
import type { AppData, Paiement, Person, Task, Timbre } from './types';
import { fullName } from './utils';

// Remboursements (une personne a avancé l'argent : photo de son ticket) et paiements de factures (payées
// directement à qui les envoie). Ce sont des tâches : la caisse les reçoit et demande le visa à quelqu'un d'autre
// que le demandeur → cette personne signe (sceau « OK pour paiement » posé sur le justificatif) → la caisse fait
// le virement (hors de l'appli) puis l'indique « OK ».

export type Ticket = Task & { paiement: Paiement };

export const ETATS: Record<Paiement['etat'], { label: string; court: string; icon: string }> = {
  recu: { label: 'Reçu – à traiter par la caisse', court: 'À traiter', icon: '📥' },
  visa: { label: 'Visa demandé', court: 'Visa demandé', icon: '✍️' },
  valide: { label: 'Visé – virement à faire', court: 'Virement à faire', icon: '🏦' },
  paye: { label: 'Payé', court: 'Payé', icon: '✅' },
  refuse: { label: 'Refusé', court: 'Refusé', icon: '❌' },
};

export type GenreTicket = 'remboursement' | 'facture';
export const genreDe = (p: Pick<Paiement, 'type'>): GenreTicket => (p.type === 'facture' ? 'facture' : 'remboursement');
export const GENRES: Record<GenreTicket, { icon: string; nom: string; nouveau: string; a: string; ce: string; duDoc: string; vise: string; accord: string; sous: string }> = {
  remboursement: {
    icon: '🧾', nom: 'Remboursement', nouveau: 'Nouveau remboursement', a: 'À rembourser à', ce: 'ce remboursement',
    duDoc: 'du ticket', vise: 'Ticket visé', accord: 'le remboursement', sous: 'Remboursements',
  },
  facture: {
    icon: '💳', nom: 'Paiement de facture', nouveau: 'Nouveau paiement', a: 'À payer à', ce: 'cette facture',
    duDoc: 'de la facture', vise: 'Facture visée', accord: 'le paiement', sous: 'Paiements',
  },
};
export const genre = (p: Pick<Paiement, 'type'>) => GENRES[genreDe(p)];

export const TIMBRE_DEFAUT: Timbre = { entete: '', texte: 'OK pour paiement', couleur: '#1d4ed8', fond: 85, encre: 100 };
export const COULEURS_TIMBRE = [
  { id: '#1d4ed8', label: 'Bleu' },
  { id: '#b91c1c', label: 'Rouge' },
  { id: '#15803d', label: 'Vert' },
  { id: '#1f2937', label: 'Noir' },
];
export const timbreDe = (data: AppData): Timbre => ({ ...TIMBRE_DEFAUT, ...data.timbre });

export const chf = (n: number) => `CHF ${n.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const can = (data: AppData, p: Person | null | undefined, perm: 'paiements.valider' | 'paiements.payer') =>
  !!p && hasPermission(userRoles(data.roles, p), perm);

/** Personnes actives qui ont le droit par un rôle qui le donne expressément ; à défaut, les admins
 *  (qui ont tous les droits). Ainsi les tickets vont à la caisse, pas au président. */
export const holders = (data: AppData, perm: 'paiements.valider' | 'paiements.payer') => {
  const expres = expresses(data, perm);
  return (expres.length ? expres : data.people.filter((p) => p.actif && hasPermission(userRoles(data.roles, p), perm))).map((p) => p.id);
};

/**
 * Personnes qui peuvent ouvrir une demande : la caisse, le demandeur et les responsables de l'étape en cours
 * (la personne qui doit viser, tant que le visa est demandé). Les autres la voient dans la liste sans l'ouvrir.
 */
export const peutOuvrirTicket = (data: AppData, t: Task, userId?: string) =>
  !!userId && !!t.paiement && (holders(data, 'paiements.payer').includes(userId) || t.paiement.demandePar === userId || t.responsables.includes(userId));

/** Personnes actives qui ont le droit par un rôle qui le donne expressément (pas seulement en tant qu'admin). */
const expresses = (data: AppData, perm: 'paiements.valider' | 'paiements.payer') =>
  data.people.filter((p) => p.actif && userRoles(data.roles, p).some((r) => !r.locked && r.permissions.includes(perm)));

/** Caissiers de l'entité : sans eux, elle ne reçoit pas de tickets. */
export const caissiers = (data: AppData) => expresses(data, 'paiements.payer');

/** Membres du comité de l'entité : ceux qui ont l'onglet Séances ou le droit de viser. */
export const auComite = (data: AppData, p: Person) => {
  const roles = userRoles(data.roles, p);
  return hasPermission(roles, 'tab.meetings') || hasPermission(roles, 'paiements.valider');
};

/** Signataires que la caisse peut choisir : les membres du comité de son entité, jamais le demandeur ;
 *  d'abord ceux qui ont le droit de viser. */
export function signataires(data: AppData, t: Ticket) {
  const ext = t.paiement.externe?.email;
  const comite = data.people.filter(
    (p) => p.actif && p.id !== t.paiement.demandePar && !(ext && p.email?.trim().toLowerCase() === ext) && auComite(data, p),
  );
  const autorises = comite.filter((p) => hasPermission(userRoles(data.roles, p), 'paiements.valider'));
  return { autorises, autres: comite.filter((p) => !autorises.includes(p)) };
}

export const paiementTasks = (data: AppData) => data.tasks.filter((t): t is Ticket => !!t.paiement);

/** Section des finances (sinon la première). */
export const sectionFinances = (data: AppData) =>
  (data.sections.find((s) => /compta|financ|caisse|trésor|tresor/i.test(s.nom)) ?? data.sections[0])?.id ?? '';

export const nomDe = (data: AppData, id?: string) => fullName(data.people.find((p) => p.id === id));

/** Demandeur du ticket : sa fiche, ou, pour un ticket reçu d'une autre entité, son nom et son entité. */
export const demandeur = (data: AppData, p: Paiement) => (p.externe ? `${p.externe.par} (${p.externe.unite})` : nomDe(data, p.demandePar));

/** Statut de la tâche selon l'état du ticket : ouvert tant qu'il n'est pas payé, terminé une fois payé, annulé si refusé. */
export function statutPour(data: AppData, etat: Paiement['etat']) {
  const open = data.statuses.find((s) => !s.done)?.id ?? 's1';
  const done = data.statuses.find((s) => s.done && !/annul/i.test(s.label))?.id ?? data.statuses.find((s) => s.done)?.id ?? open;
  const annule = data.statuses.find((s) => s.done && /annul/i.test(s.label))?.id ?? done;
  return etat === 'paye' ? done : etat === 'refuse' ? annule : open;
}

/** Qui doit agir : la caisse, puis la personne qui vise, puis la caisse ; le demandeur si son ticket est refusé. */
export function responsablesPour(data: AppData, t: Ticket) {
  const { etat, visa, demandePar } = t.paiement;
  const r = etat === 'visa' && visa ? [visa.a] : etat === 'recu' || etat === 'valide' ? holders(data, 'paiements.payer') : [];
  return r.length ? r : demandePar ? [demandePar] : [];
}
