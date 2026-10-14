import type { APrendre, Task } from './types';

// « 🙋 À prendre » : une tâche proposée à quelques personnes de l'entité ; la première qui clique « Je m'en charge » en
// devient responsable (serveur : gsa_prendre_tache, 038). Elles la lisent (038), la voient dans « Mes tâches » et à
// l'accueil tant qu'il reste une place, et reçoivent une notification 🔔 quand on la leur propose. Une place est prise
// tant que la personne proposée est responsable. « Pas dispo » (gsa_pas_dispo, 039) : la tâche quitte ses listes, l'auteur
// le voit ; elle peut encore s'en charger. Jamais pour les tickets (remboursements, factures).

/** Personnes qu'il faut (1 par défaut, 100 au plus). */
export const nombreAPrendre = (a?: APrendre) => Math.min(Math.max(Math.floor(a?.nombre ?? 1) || 1, 1), 100);

/** Personnes proposées qui s'en chargent (responsables). */
export const volontaires = (t: Pick<Task, 'aPrendre' | 'responsables'>) => (t.aPrendre?.personnes ?? []).filter((id) => t.responsables.includes(id));

/** Il reste au moins une place. */
export const aPrendreOuverte = (t: Pick<Task, 'aPrendre' | 'responsables' | 'paiement'>) =>
  !!t.aPrendre?.personnes.length && !t.paiement && volontaires(t).length < nombreAPrendre(t.aPrendre);

/** Proposée à la personne (ouverte ou non) ; pas une tâche partagée par une autre entité (ses fiches sont d'ailleurs). */
export const proposeeA = (t: Pick<Task, 'aPrendre' | 'paiement' | 'source'>, userId?: string) => !!userId && !t.paiement && !t.source && !!t.aPrendre?.personnes.includes(userId);

/** La personne peut s'en charger : proposée à elle, pas encore responsable, une place libre (tâche terminée : voir isDone). */
export const peutPrendre = (t: Pick<Task, 'aPrendre' | 'responsables' | 'paiement' | 'source'>, userId?: string) =>
  proposeeA(t, userId) && !t.responsables.includes(userId!) && aPrendreOuverte(t);

/** A répondu « Pas dispo ». */
export const pasDispo = (t: Pick<Task, 'aPrendre'>, userId?: string) => !!userId && !!t.aPrendre?.refus?.includes(userId);

/** À prendre pour la personne (listes, accueil, notification) : elle peut s'en charger et n'a pas répondu « Pas dispo ». */
export const aPrendrePourMoi = (t: Pick<Task, 'aPrendre' | 'responsables' | 'paiement' | 'source'>, userId?: string) =>
  peutPrendre(t, userId) && !pasDispo(t, userId);

/** Personnes proposées qui n'ont pas encore répondu (ni responsables, ni « Pas dispo »). */
export const sansReponse = (t: Pick<Task, 'aPrendre' | 'responsables'>) =>
  (t.aPrendre?.personnes ?? []).filter((id) => !t.responsables.includes(id) && !t.aPrendre?.refus?.includes(id));

/**
 * Proposition nettoyée : sans doublons, nombre entre 1 et 100, « Pas dispo » des seules personnes encore proposées et non
 * responsables ; undefined s'il ne reste personne.
 */
export function epurerAPrendre(a: APrendre | undefined, responsables: string[] = []): APrendre | undefined {
  const personnes = [...new Set(a?.personnes ?? [])];
  if (!personnes.length) return undefined;
  const n = nombreAPrendre(a);
  const refus = [...new Set(a?.refus ?? [])].filter((id) => personnes.includes(id) && !responsables.includes(id));
  return { personnes, ...(n > 1 ? { nombre: n } : {}), ...(refus.length ? { refus } : {}) };
}

/** Occurrence suivante d'une tâche à prendre : les personnes proposées ne sont pas reconduites, la place se rouvre. */
export const sansVolontaires = (responsables: string[], a?: APrendre) => (a ? responsables.filter((id) => !a.personnes.includes(id)) : responsables);

/** Occurrence suivante : proposée aux mêmes personnes, sans les « Pas dispo » de celle-ci. */
export const aPrendreSuivante = (a?: APrendre): APrendre | undefined => a && { personnes: a.personnes, ...(a.nombre ? { nombre: a.nombre } : {}) };
