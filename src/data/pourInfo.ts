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

/** Clé « Pour info » vue depuis l'entité `moi` (tâche partagée de l'entité `src`), comme pourInfoVu ; null : `moi` mentionnée en entier. */
export function cleVue(k: string, src: string, moi: string): string | null {
  const [g, a, b] = k.split(':');
  if (g === 'p') return `a:${src}:${a}`;
  if (g === 'a' && a === moi) return `p:${b}`;
  return g === 'u' && a === moi ? null : k;
}

/** « ✓ Vu » vus depuis l'entité `moi` (tâche partagée de l'entité `src`) : mêmes clés que pourInfoVu ; ceux de `moi` mentionnée en entier, retirés. */
export function vusVu(v: Vus | undefined, src: string, moi: string): Vus | undefined {
  if (!v) return undefined;
  const out: Vus = {};
  for (const [k, x] of Object.entries(v)) {
    const c = cleVue(k, src, moi);
    if (c) out[c] = x;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Clés « Pour info » de la personne connectée (fiche `fiche` dans l'entité ouverte `depuis`) sur une tâche de l'entité
 * `unite` : elle-même, et elle au titre de son entité si elle en voit toutes les tâches (`voitTout`). Même règle que
 * gsa_pour_info_vu (046).
 */
export function clesVu(t: Pick<Task, 'pourInfo' | 'paiement'>, unite: string, depuis: string, fiche: string, voitTout: boolean): string[] {
  const p = t.paiement ? undefined : t.pourInfo;
  if (!p) return [];
  if (unite === depuis) return p.personnes?.includes(fiche) ? [`p:${fiche}`] : [];
  return [...(p.autres?.[depuis]?.includes(fiche) ? [`a:${depuis}:${fiche}`] : []), ...(voitTout && p.unites?.includes(depuis) ? [`u:${depuis}:${fiche}`] : [])];
}

/**
 * « ✓ Vu » ajoutés (démo ; version réelle : gsa_pour_info_vu, 046 et 052) : la première fois compte ; sur une tâche modifiée
 * depuis (`contenu`, sa date contenuLe), le nouveau « Vu » est noté à part (`revu`). Rien de nouveau : `v` tel quel.
 */
export function ajouterVus(v: Vus | undefined, cles: string[], le: string, contenu?: string): Vus | undefined {
  const maj = cles.filter((k) => !v?.[k] || (!!contenu && contenu > dernierVu(v[k])));
  if (!maj.length) return v;
  return { ...v, ...Object.fromEntries(maj.map((k) => [k, v?.[k] ? { ...v[k], revu: le } : { le }])) };
}

/** Dernier « ✓ Vu » : revu après une modification, sinon le premier. */
export const dernierVu = (v: VuPourInfo) => v.revu ?? v.le;

/** « ✓ Vu » donné avant la dernière modification du contenu de la tâche (contenuLe, 052) : elle a changé depuis. */
export const vuAvantModif = (v: VuPourInfo | undefined, t: Pick<Task, 'contenuLe'>) => !!v && !!t.contenuLe && t.contenuLe > dernierVu(v);

/** Tâche que la personne connectée a marquée « ✓ Vu » (ses clés `cles`, voir clesVu), modifiée depuis. */
export const modifieeDepuisMonVu = (t: Pick<Task, 'contenuLe' | 'pourInfoVus'>, cles: string[]) => cles.some((k) => vuAvantModif(t.pourInfoVus?.[k], t));

/**
 * Personnes attendues (052, gsa_pour_info_suivi) : clés « Pour info » qui attendent un « ✓ Vu » (« p:fiche », « a:entité:fiche »
 * avec un compte et une fiche active ; « u:entité:fiche » : chacune des personnes qui reçoivent une entité mentionnée en
 * entier). Les autres personnes mentionnées n'ont pas de compte (ou plus de fiche active) : elles ne reçoivent rien.
 */
export type Attendus = string[];

/**
 * Personnes attendues sur la tâche `t` de l'entité `unite` (démo ; version réelle : gsa_pour_info_attendus, 052) : `compte`
 * dit si une fiche d'une entité a un compte (et est active), `recoit` qui reçoit une entité mentionnée en entier.
 */
export function attendusDe(t: Pick<Task, 'pourInfo' | 'responsables' | 'paiement'>, unite: string, compte: (entite: string, fiche: string) => boolean, recoit: (entite: string) => string[]): Attendus {
  const p = t.paiement ? undefined : t.pourInfo;
  return [...new Set([
    ...(p?.personnes ?? []).filter((id) => !t.responsables.includes(id) && compte(unite, id)).map((id) => `p:${id}`),
    ...Object.entries(p?.autres ?? {}).filter(([u]) => u !== unite).flatMap(([u, l]) => l.filter((id) => compte(u, id)).map((id) => `a:${u}:${id}`)),
    ...(p?.unites ?? []).filter((u) => u !== unite).flatMap((u) => recoit(u).map((f) => `u:${u}:${f}`)),
  ])].sort();
}

/** Ce « ✓ Vu » est le dernier attendu (démo ; version réelle : gsa_pour_info_vu, 052) : l'auteur est prévenu. */
export const dernierAttendu = (avant: Vus | undefined, apres: Vus | undefined, attendus: Attendus) =>
  attendus.length > 0 && attendus.every((k) => apres?.[k]) && attendus.some((k) => !avant?.[k]);

/** Entités mentionnées en entier : les personnes qui les reçoivent (entité → fiches), d'après les personnes attendues. */
export function recoiventDe(attendus: Attendus, unites: string[] = []): Record<string, string[]> {
  return Object.fromEntries(unites.map((u) => [u, attendus.filter((k) => k.startsWith(`u:${u}:`)).map((k) => k.slice(u.length + 3))]));
}

/** Où en sont les « ✓ Vu » d'une tâche, en personnes. */
export interface BilanVu {
  /** Personnes qui l'ont vue. */
  n: number;
  /** Personnes qui doivent la voir. */
  total: number;
  /** Parmi celles qui l'ont vue : avant sa dernière modification. */
  avantModif: number;
  /** Personnes mentionnées sans compte (ne reçoivent rien, pas comptées). */
  sansCompte: number;
  /** Total sûr : sans les personnes attendues (serveur sans 052), une entité mentionnée en entier ne compte que ceux qui l'ont vue. */
  complet: boolean;
}

/**
 * Bilan des « ✓ Vu » d'une tâche. Avec les personnes attendues (052) : celles-là ; sinon chaque personne mentionnée (hors
 * responsables), et pour une entité mentionnée en entier, les personnes qui l'ont vue.
 */
export function bilanVu(t: Pick<Task, 'pourInfo' | 'pourInfoVus' | 'contenuLe' | 'responsables' | 'paiement'>, attendus?: Attendus | null): BilanVu {
  const p = t.paiement ? undefined : t.pourInfo;
  const v = t.pourInfoVus ?? {};
  const personnes = [
    ...(p?.personnes ?? []).filter((id) => !t.responsables.includes(id)).map((id) => `p:${id}`),
    ...Object.entries(p?.autres ?? {}).flatMap(([u, l]) => l.map((id) => `a:${u}:${id}`)),
  ];
  const unites = p?.unites ?? [];
  const cles = attendus
    ? [...personnes.filter((k) => attendus.includes(k)), ...attendus.filter((k) => k.startsWith('u:') && unites.includes(k.split(':')[1]))]
    : [...personnes, ...unites.flatMap((u) => Object.keys(vusDeLEntite(v, u)).map((f) => `u:${u}:${f}`))];
  return {
    n: cles.filter((k) => v[k]).length,
    total: cles.length,
    avantModif: cles.filter((k) => vuAvantModif(v[k], t)).length,
    sansCompte: attendus ? personnes.filter((k) => !attendus.includes(k)).length : 0,
    complet: !!attendus || !unites.length,
  };
}

/** « vue par tout le monde », « vue par 3 sur 4 », « pas encore vue » ; vide si personne ne doit la voir. */
export function texteVu(b: BilanVu) {
  if (!b.total && b.complet) return '';
  if (b.complet && b.n === b.total) return 'vue par tout le monde';
  if (!b.n) return 'pas encore vue';
  return b.complet ? `vue par ${b.n} sur ${b.total}` : `vue par ${b.n}`;
}

/** Tâche « Pour info » que des personnes doivent encore voir. */
export const attendDesVus = (b: BilanVu) => b.n < b.total || (!b.complet && !b.n);

/** « ✓ Vu » des personnes d'une entité mentionnée en entier (« u:entité:fiche ») : fiche → vu. */
export function vusDeLEntite(v: Vus | undefined, entite: string): Vus {
  const pre = `u:${entite}:`;
  return Object.fromEntries(Object.entries(v ?? {}).filter(([k]) => k.startsWith(pre)).map(([k, x]) => [k.slice(pre.length), x]));
}

/**
 * Où en est une pastille : « vu », « partiel » (entité : une partie de ses personnes), « pas-vu ». Entité : celles qui
 * la reçoivent (`recoivent`, fiches ; inconnues : celles qui l'ont vue), toutes doivent l'avoir vue.
 */
export function etatVu(cle: string, v: Vus | undefined, recoivent?: string[]): { etat: 'vu' | 'partiel' | 'pas-vu'; n: number; total: number } {
  if (!cle.startsWith('u:')) return { etat: v?.[cle] ? 'vu' : 'pas-vu', n: v?.[cle] ? 1 : 0, total: 1 };
  const vus = vusDeLEntite(v, cle.slice(2));
  const qui = [...new Set([...(recoivent ?? []), ...Object.keys(vus)])];
  const n = qui.filter((f) => vus[f]).length;
  return { etat: n === 0 ? 'pas-vu' : recoivent && n === qui.length ? 'vu' : 'partiel', n, total: qui.length };
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
