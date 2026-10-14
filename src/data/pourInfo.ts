import type { OrgUnit, Person, PourInfo, TachePartagee, Task } from './types';

// « Pour info » : des personnes et des entités voient une tâche sans s'en occuper.
//   - personnes de l'entité de la tâche : elle leur est lisible (serveur : 037, même sans « Voir toutes les tâches »),
//     dans « Mes tâches » avec « 👁 pour info », à l'accueil, et une notification 🔔 quand on les ajoute ;
//   - autres entités du club (leurs admins et rôles « Voir toutes les tâches ») et personnes d'autres entités : en lecture
//     seule, à l'accueil et dans Tâches › « 👁 Pour info » (serveur : gsa_taches_pour_info, 037), avec une notification.
// Jamais pour les tickets (remboursements, factures). Seule l'entité de la tâche change la liste.

/** Pour info nettoyé : sans doublons ni listes vides, sans les responsables ; undefined s'il ne reste personne. */
export function epurerPourInfo(p: PourInfo | undefined, responsables: string[] = []): PourInfo | undefined {
  if (!p) return undefined;
  const personnes = [...new Set(p.personnes ?? [])].filter((id) => !responsables.includes(id));
  const unites = [...new Set(p.unites ?? [])];
  const autres: Record<string, string[]> = {};
  for (const [u, l] of Object.entries(p.autres ?? {})) if (l.length) autres[u] = [...new Set(l)];
  const r: PourInfo = {};
  if (personnes.length) r.personnes = personnes;
  if (unites.length) r.unites = unites;
  if (Object.keys(autres).length) r.autres = autres;
  return Object.keys(r).length ? r : undefined;
}

/** Tâche de l'entité ouverte où la personne est mentionnée pour info. */
export const pourMoi = (t: Pick<Task, 'pourInfo' | 'paiement'>, userId?: string) => !!userId && !t.paiement && !!t.pourInfo?.personnes?.includes(userId);

/**
 * Tâche d'une autre entité, pour info de l'entité ouverte `moi` : visible par la personne connectée ? L'entité
 * mentionnée : ses admins et les rôles « Voir toutes les tâches » (`voitTout`) ; une personne : elle-même.
 */
export const recuePourMoi = (x: TachePartagee, moi: string, userId: string, voitTout: boolean) => {
  const p = x.task.pourInfo;
  return !x.task.paiement && x.uniteId !== moi && ((voitTout && !!p?.unites?.includes(moi)) || !!p?.autres?.[moi]?.includes(userId));
};

/** Tâche reçue terminée chez son entité. */
export const termineeChezElle = (x: TachePartagee) => !!x.statuts.find((s) => s.id === x.task.statusId)?.done;

/** Tâche reçue encore montrée : en cours, ou terminée depuis moins de 30 jours. */
export const encoreMontree = (x: TachePartagee, maintenant = Date.now()) => !termineeChezElle(x) || maintenant - Date.parse(x.task.updatedAt || '') < 30 * 864e5;

/** Nombre de personnes et d'entités mentionnées. */
export const nbPourInfo = (p?: PourInfo) => (p?.personnes?.length ?? 0) + (p?.unites?.length ?? 0) + Object.values(p?.autres ?? {}).reduce((n, l) => n + l.length, 0);

const nom = (x?: { prenom: string; nom: string }) => (x ? `${x.prenom} ${x.nom}`.trim() : '');

/** Personnes et entités mentionnées, en clair (« Prénom Nom », « Entité », « Prénom Nom (Entité) »). */
export function ciblesPourInfo(p: PourInfo | undefined, people: Pick<Person, 'id' | 'prenom' | 'nom'>[], units: Pick<OrgUnit, 'id' | 'nom' | 'membres'>[]) {
  const unite = (id: string) => units.find((u) => u.id === id);
  return [
    ...(p?.personnes ?? []).map((id) => ({ cle: `p:${id}`, texte: nom(people.find((x) => x.id === id)) || '?', genre: 'personne' as const, id })),
    ...(p?.unites ?? []).map((id) => ({ cle: `u:${id}`, texte: unite(id)?.nom ?? '?', genre: 'unite' as const, id })),
    ...Object.entries(p?.autres ?? {}).flatMap(([u, l]) =>
      l.map((id) => ({ cle: `a:${u}:${id}`, texte: `${nom(unite(u)?.membres.find((m) => m.id === id)) || '?'} (${unite(u)?.nom ?? '?'})`, genre: 'autre' as const, id, unite: u })),
    ),
  ];
}
