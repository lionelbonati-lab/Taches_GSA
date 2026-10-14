import type { APrendre, PropositionAilleurs, Task } from './types';

// « 🙋 À prendre » : une tâche proposée à quelques personnes de l'entité ; la première qui clique « Je m'en charge » en
// devient responsable (serveur : gsa_prendre_tache, 038). Elles la lisent (038), la voient dans « Mes tâches » et à
// l'accueil tant qu'il reste une place, et reçoivent une notification 🔔 quand on la leur propose. Une place est prise
// tant que la personne proposée est responsable. « Pas dispo » (gsa_pas_dispo, 039) : la tâche quitte ses listes, l'auteur
// le voit ; elle peut encore s'en charger. Jamais pour les tickets (remboursements, factures).
// Tâche partagée (040) : chaque entité du partage la propose aussi à ses personnes (aPrendre.partage, par entité) ; elles
// y répondent depuis leur entité (gsa_repondre_partagee) et deviennent responsables de cette entité (respPartage). Les
// places se comptent toutes entités confondues.

/** Personnes qu'il faut (1 par défaut, 100 au plus). */
export const nombreAPrendre = (a?: APrendre) => Math.min(Math.max(Math.floor(a?.nombre ?? 1) || 1, 1), 100);

/** Personnes proposées ici qui s'en chargent (responsables). */
export const volontaires = (t: Pick<Task, 'aPrendre' | 'responsables'>) => (t.aPrendre?.personnes ?? []).filter((id) => t.responsables.includes(id));

type Ailleurs = Pick<Task, 'aPrendre' | 'respPartage' | 'source'>;

/** Responsables de l'entité `u` (fiches de chez elle) : l'entité de la tâche (vue d'une tâche partagée), ou une entité du partage. */
const respDe = (t: Pick<Task, 'respPartage' | 'source'>, u: string) => (u === t.source?.uniteId ? t.source.responsables : t.respPartage?.[u]) ?? [];

/** Propositions des autres entités : [entité, proposition]. */
export const ailleurs = (t: Pick<Task, 'aPrendre'>) => Object.entries(t.aPrendre?.partage ?? {}).filter(([, a]) => a.personnes?.length) as [string, PropositionAilleurs][];

/** Places prises dans les autres entités. */
export const prisAilleurs = (t: Ailleurs) => ailleurs(t).reduce((n, [u, a]) => n + a.personnes.filter((id) => respDe(t, u).includes(id)).length, 0);

/** Personnes des autres entités qui n'ont pas encore répondu. */
export const attenteAilleurs = (t: Ailleurs) =>
  ailleurs(t).reduce((n, [u, a]) => n + a.personnes.filter((id) => !respDe(t, u).includes(id) && !a.refus?.includes(id)).length, 0);

/** Personnes des autres entités, par entité, avec leur réponse (pour l'affichage). */
export const reponsesAilleurs = (t: Ailleurs) =>
  ailleurs(t).map(([u, a]) => ({ unite: u, personnes: a.personnes.map((id) => ({ id, pris: respDe(t, u).includes(id), refus: !!a.refus?.includes(id) })) }));

/** Il reste au moins une place. */
export const aPrendreOuverte = (t: Pick<Task, 'aPrendre' | 'responsables' | 'respPartage' | 'source' | 'paiement'>) =>
  (!!t.aPrendre?.personnes.length || ailleurs(t).length > 0) && !t.paiement && volontaires(t).length + prisAilleurs(t) < nombreAPrendre(t.aPrendre);

/** Proposée à la personne (ouverte ou non), dans l'entité ouverte (tâche partagée : par elle). */
export const proposeeA = (t: Pick<Task, 'aPrendre' | 'paiement'>, userId?: string) => !!userId && !t.paiement && !!t.aPrendre?.personnes.includes(userId);

type Prenable = Pick<Task, 'aPrendre' | 'responsables' | 'respPartage' | 'source' | 'paiement'>;

/** La personne peut s'en charger : proposée à elle, pas encore responsable, une place libre (tâche terminée : voir isDone). */
export const peutPrendre = (t: Prenable, userId?: string) => proposeeA(t, userId) && !t.responsables.includes(userId!) && aPrendreOuverte(t);

/** A répondu « Pas dispo ». */
export const pasDispo = (t: Pick<Task, 'aPrendre'>, userId?: string) => !!userId && !!t.aPrendre?.refus?.includes(userId);

/** À prendre pour la personne (listes, accueil, notification) : elle peut s'en charger et n'a pas répondu « Pas dispo ». */
export const aPrendrePourMoi = (t: Prenable, userId?: string) => peutPrendre(t, userId) && !pasDispo(t, userId);

/** Personnes proposées ici qui n'ont pas encore répondu (ni responsables, ni « Pas dispo »). */
export const sansReponse = (t: Pick<Task, 'aPrendre' | 'responsables'>) =>
  (t.aPrendre?.personnes ?? []).filter((id) => !t.responsables.includes(id) && !t.aPrendre?.refus?.includes(id));

/** Plus personne n'a à répondre, ici ni ailleurs. */
export const plusPersonne = (t: Pick<Task, 'aPrendre' | 'responsables' | 'respPartage' | 'source'>) => !sansReponse(t).length && !attenteAilleurs(t);

/** Qui l'a proposée : prévenu des réponses (sinon l'auteur de la tâche). */
export const auteurAPrendre = (t: Pick<Task, 'aPrendre' | 'createdBy'>) => t.aPrendre?.par || t.createdBy;

const unique = (l: string[] = []) => [...new Set(l)];

/**
 * Proposition nettoyée : sans doublons, nombre entre 1 et 100, « Pas dispo » des seules personnes encore proposées et non
 * responsables (ici : `responsables` ; dans les autres entités : `respPartage`) ; undefined s'il ne reste personne.
 */
export function epurerAPrendre(a: APrendre | undefined, responsables: string[] = [], respPartage: Record<string, string[]> = {}): APrendre | undefined {
  const personnes = unique(a?.personnes);
  const partage: Record<string, PropositionAilleurs> = {};
  for (const [u, x] of Object.entries(a?.partage ?? {})) {
    const p = unique(x.personnes);
    if (!p.length) continue;
    const refus = unique(x.refus).filter((id) => p.includes(id) && !respPartage[u]?.includes(id));
    partage[u] = { personnes: p, ...(refus.length ? { refus } : {}), ...(x.par ? { par: x.par } : {}) };
  }
  if (!personnes.length && !Object.keys(partage).length) return undefined;
  const n = nombreAPrendre(a);
  const refus = unique(a?.refus).filter((id) => personnes.includes(id) && !responsables.includes(id));
  return {
    personnes,
    ...(n > 1 ? { nombre: n } : {}),
    ...(refus.length ? { refus } : {}),
    ...(a?.par ? { par: a.par } : {}),
    ...(Object.keys(partage).length ? { partage } : {}),
  };
}

/** Occurrence suivante d'une tâche à prendre : les personnes proposées ne sont pas reconduites, la place se rouvre. */
export const sansVolontaires = (responsables: string[], a?: APrendre) => (a ? responsables.filter((id) => !a.personnes.includes(id)) : responsables);

/** Même chose pour les responsables des entités du partage. */
export function sansVolontairesPartage(respPartage: Record<string, string[]> | undefined, a?: APrendre) {
  if (!respPartage || !a?.partage) return respPartage;
  const r: Record<string, string[]> = {};
  for (const [u, l] of Object.entries(respPartage)) {
    const reste = l.filter((id) => !a.partage?.[u]?.personnes.includes(id));
    if (reste.length) r[u] = reste;
  }
  return Object.keys(r).length ? r : undefined;
}

/** Occurrence suivante : proposée aux mêmes personnes, sans les « Pas dispo » de celle-ci. */
export const aPrendreSuivante = (a?: APrendre): APrendre | undefined =>
  a && {
    personnes: a.personnes,
    ...(a.nombre ? { nombre: a.nombre } : {}),
    ...(a.par ? { par: a.par } : {}),
    ...(a.partage ? { partage: Object.fromEntries(Object.entries(a.partage).map(([u, x]) => [u, { personnes: x.personnes, ...(x.par ? { par: x.par } : {}) }])) } : {}),
  };

/**
 * Vue depuis l'entité `moi` d'une tâche à prendre de l'entité `src` (tâche partagée) : ses propositions comme celles
 * d'une tâche d'ici ; celles de l'entité de la tâche et des autres entités, à part (partage, en lecture).
 */
export function aPrendreVu(a: APrendre | undefined, src: string, moi: string): APrendre | undefined {
  if (!a) return undefined;
  const ici = a.partage?.[moi];
  const partage: Record<string, PropositionAilleurs> = {};
  if (a.personnes?.length) partage[src] = { personnes: a.personnes, ...(a.refus?.length ? { refus: a.refus } : {}) };
  for (const [u, x] of Object.entries(a.partage ?? {})) if (u !== moi && x.personnes?.length) partage[u] = x;
  if (!ici?.personnes?.length && !Object.keys(partage).length) return undefined;
  return {
    personnes: ici?.personnes ?? [],
    ...(a.nombre ? { nombre: a.nombre } : {}),
    ...(ici?.refus?.length ? { refus: ici.refus } : {}),
    ...(ici?.par ? { par: ici.par } : {}),
    ...(Object.keys(partage).length ? { partage } : {}),
  };
}

/**
 * Enregistrement depuis l'entité `moi` (même règle côté serveur : gsa_modifier_tache_partagee, 040) : ses propositions
 * et le nombre qu'il faut, dans la tâche de son entité (`orig`) ; les propositions des autres ne changent pas d'ici.
 */
export function aPrendreVersOrigine(orig: APrendre | undefined, vu: APrendre | undefined, moi: string, respIci: string[] = []): APrendre | undefined {
  const partage = { ...orig?.partage };
  delete partage[moi];
  const personnes = unique(vu?.personnes);
  if (personnes.length) {
    // « Pas dispo » : ceux du serveur (les réponses arrivent par gsa_repondre_partagee).
    const refus = (orig?.partage?.[moi]?.refus ?? []).filter((id) => personnes.includes(id) && !respIci.includes(id));
    const par = vu?.par ?? orig?.partage?.[moi]?.par;
    partage[moi] = { personnes, ...(refus.length ? { refus } : {}), ...(par ? { par } : {}) };
  }
  return epurerAPrendre({ ...orig, personnes: orig?.personnes ?? [], nombre: vu ? vu.nombre : orig?.nombre, partage });
}

/**
 * Réponse depuis l'entité `moi` (sa fiche `fiche`) à une tâche à prendre de l'entité de la tâche, partagée avec elle
 * (démo ; version réelle : gsa_repondre_partagee, 040). `t` : la tâche telle qu'enregistrée chez son entité.
 */
export function reponseAilleurs(t: Task, moi: string, fiche: string, prend: boolean, terminee: boolean): Task {
  const ici = t.aPrendre?.partage?.[moi];
  if (t.paiement || !ici?.personnes.includes(fiche)) throw new Error('Cette tâche ne t’est pas proposée.');
  const mes = t.respPartage?.[moi] ?? [];
  let refus = ici.refus ?? [];
  let respPartage = t.respPartage;
  if (prend) {
    if (mes.includes(fiche)) return t;
    if (terminee) throw new Error('Cette tâche est déjà terminée.');
    if (!aPrendreOuverte(t)) throw new Error('Quelqu’un s’en charge déjà.');
    respPartage = { ...t.respPartage, [moi]: [...mes, fiche] };
    refus = refus.filter((id) => id !== fiche);
  } else {
    if (mes.includes(fiche)) throw new Error('Tu t’en charges déjà : retire-toi des responsables dans la tâche.');
    if (refus.includes(fiche)) return t;
    refus = [...refus, fiche];
  }
  const x: PropositionAilleurs = { personnes: ici.personnes, ...(refus.length ? { refus } : {}), ...(ici.par ? { par: ici.par } : {}) };
  return { ...t, respPartage, aPrendre: { ...t.aPrendre!, partage: { ...t.aPrendre!.partage, [moi]: x } }, updatedAt: new Date().toISOString() };
}
