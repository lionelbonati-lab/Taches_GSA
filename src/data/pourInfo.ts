import type { OrgUnit, Person, PourInfo, TachePartagee, Task, VuPourInfo } from './types';

// « Pour info » : des personnes et des entités voient une tâche sans s'en occuper.
//   - personnes de l'entité de la tâche : elle leur est lisible (serveur : 037, même sans « Voir toutes les tâches »),
//     dans « Mes tâches » avec « 👁 pour info », à l'accueil, et une notification 🔔 quand on les ajoute ;
//   - autres entités du club (leurs admins et rôles « Voir toutes les tâches ») et personnes d'autres entités : en lecture
//     seule, à l'accueil et dans Tâches › « 👁 Pour info » (serveur : gsa_taches_pour_info, 037), avec une notification.
// Jamais pour les tickets (remboursements, factures). Tâche partagée : les entités du partage changent aussi la liste (040).

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

/** Tâche où la personne est mentionnée pour info dans l'entité ouverte (tâche partagée : vue d'ici, voir pourInfoVu). */
export const pourMoi = (t: Pick<Task, 'pourInfo' | 'paiement'>, userId?: string) => !!userId && !t.paiement && !!t.pourInfo?.personnes?.includes(userId);

/**
 * Vue depuis l'entité `moi` du « Pour info » d'une tâche de l'entité `src` (tâche partagée, 040) : les personnes d'ici
 * (autres[moi]) comme personnes ; celles de l'entité de la tâche comme personnes d'une autre entité (autres[src]).
 */
export function pourInfoVu(p: PourInfo | undefined, src: string, moi: string): PourInfo | undefined {
  if (!p) return undefined;
  const autres = { ...p.autres };
  const ici = autres[moi] ?? [];
  delete autres[moi];
  if (p.personnes?.length) autres[src] = p.personnes;
  return epurerPourInfo({ personnes: ici, unites: (p.unites ?? []).filter((u) => u !== moi), autres });
}

/** Enregistrement depuis l'entité `moi` : la vue d'ici remise dans la forme de l'entité de la tâche `src` (même contrôle côté serveur). */
export function pourInfoVersOrigine(orig: PourInfo | undefined, vu: PourInfo | undefined, src: string, moi: string): PourInfo | undefined {
  const autres = { ...vu?.autres };
  const personnes = autres[src] ?? [];
  delete autres[src];
  if (vu?.personnes?.length) autres[moi] = vu.personnes;
  const unites = [...(vu?.unites ?? []).filter((u) => u !== src && u !== moi), ...(orig?.unites?.includes(moi) ? [moi] : [])];
  return epurerPourInfo({ personnes, unites, autres });
}

type Vus = Record<string, VuPourInfo>;

/** « ✓ Vu » vus depuis l'entité `moi` (tâche partagée de l'entité `src`) : mêmes clés que pourInfoVu. */
export function vusVu(v: Vus | undefined, src: string, moi: string): Vus | undefined {
  if (!v) return undefined;
  const out: Vus = {};
  for (const [k, x] of Object.entries(v)) {
    const [g, a, b] = k.split(':');
    if (g === 'p') out[`a:${src}:${a}`] = x;
    else if (g === 'a' && a === moi) out[`p:${b}`] = x;
    else if (g !== 'u' || a !== moi) out[k] = x;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Clés « Pour info » de la personne connectée (fiche `fiche` dans l'entité ouverte `depuis`) sur une tâche de l'entité
 * `unite` : elle-même, et son entité si elle en voit toutes les tâches (`voitTout`). Même règle que gsa_pour_info_vu (046).
 */
export function clesVu(t: Pick<Task, 'pourInfo' | 'paiement'>, unite: string, depuis: string, fiche: string, voitTout: boolean): string[] {
  const p = t.paiement ? undefined : t.pourInfo;
  if (!p) return [];
  if (unite === depuis) return p.personnes?.includes(fiche) ? [`p:${fiche}`] : [];
  return [...(p.autres?.[depuis]?.includes(fiche) ? [`a:${depuis}:${fiche}`] : []), ...(voitTout && p.unites?.includes(depuis) ? [`u:${depuis}`] : [])];
}

/** « ✓ Vu » ajoutés (démo ; version réelle : gsa_pour_info_vu) : la première fois compte. Rien de nouveau : `v` tel quel. */
export function ajouterVus(v: Vus | undefined, cles: string[], le: string, par: string): Vus | undefined {
  const nouvelles = cles.filter((k) => !v?.[k]);
  if (!nouvelles.length) return v;
  return { ...v, ...Object.fromEntries(nouvelles.map((k) => [k, k.startsWith('u:') ? { le, par } : { le }])) };
}

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
