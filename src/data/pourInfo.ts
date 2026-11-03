import type { Person, PourInfo, Task, VuPourInfo } from './types';

// « Pour info » : des personnes voient une tâche sans s'en occuper. Elle leur est lisible (serveur : 037, même sans
// « Voir toutes les tâches »), dans « Mes tâches » avec « 👁 pour info », à l'accueil, et une notification 🔔 quand on les
// ajoute ; chacune la marque « ✓ Vu ». Jamais pour les tickets (remboursements, factures).

/** Pour info nettoyé : sans doublons, sans les responsables ; undefined s'il ne reste personne. */
export function epurerPourInfo(p: PourInfo | undefined, responsables: string[] = []): PourInfo | undefined {
  if (!p) return undefined;
  const personnes = [...new Set(p.personnes ?? [])].filter((id) => !responsables.includes(id));
  return personnes.length ? { personnes } : undefined;
}

/** Tâche où la personne est mentionnée pour info. */
export const pourMoi = (t: Pick<Task, 'pourInfo' | 'paiement'>, userId?: string) => !!userId && !t.paiement && !!t.pourInfo?.personnes?.includes(userId);

type Vus = Record<string, VuPourInfo>;

/** Clé « Pour info » de la personne connectée (même règle que gsa_pour_info_vu, 046). */
export const cleVu = (fiche: string) => `p:${fiche}`;

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

/** Tâche que la personne `fiche` a marquée « ✓ Vu », modifiée depuis. */
export const modifieeDepuisMonVu = (t: Pick<Task, 'contenuLe' | 'pourInfoVus'>, fiche: string) => vuAvantModif(t.pourInfoVus?.[cleVu(fiche)], t);

/**
 * Personnes attendues (052, gsa_pour_info_suivi) : clés « p:fiche » qui attendent un « ✓ Vu » (avec un compte et une fiche
 * active). Les autres personnes mentionnées n'ont pas de compte (ou plus de fiche active) : elles ne reçoivent rien.
 */
export type Attendus = string[];

/** Personnes attendues sur la tâche `t` (démo ; version réelle : gsa_pour_info_attendus, 052) : `compte` dit si une fiche a un compte (et est active). */
export function attendusDe(t: Pick<Task, 'pourInfo' | 'responsables' | 'paiement'>, compte: (fiche: string) => boolean): Attendus {
  const p = t.paiement ? undefined : t.pourInfo;
  return [...new Set((p?.personnes ?? []).filter((id) => !t.responsables.includes(id) && compte(id)).map(cleVu))].sort();
}

/** Ce « ✓ Vu » est le dernier attendu (démo ; version réelle : gsa_pour_info_vu, 052) : l'auteur est prévenu. */
export const dernierAttendu = (avant: Vus | undefined, apres: Vus | undefined, attendus: Attendus) =>
  attendus.length > 0 && attendus.every((k) => apres?.[k]) && attendus.some((k) => !avant?.[k]);

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
}

/** Bilan des « ✓ Vu » d'une tâche. Avec les personnes attendues (052) : celles-là ; sinon chaque personne mentionnée (hors responsables). */
export function bilanVu(t: Pick<Task, 'pourInfo' | 'pourInfoVus' | 'contenuLe' | 'responsables' | 'paiement'>, attendus?: Attendus | null): BilanVu {
  const p = t.paiement ? undefined : t.pourInfo;
  const v = t.pourInfoVus ?? {};
  const personnes = (p?.personnes ?? []).filter((id) => !t.responsables.includes(id)).map(cleVu);
  const cles = attendus ? personnes.filter((k) => attendus.includes(k)) : personnes;
  return {
    n: cles.filter((k) => v[k]).length,
    total: cles.length,
    avantModif: cles.filter((k) => vuAvantModif(v[k], t)).length,
    sansCompte: attendus ? personnes.filter((k) => !attendus.includes(k)).length : 0,
  };
}

/** « vu par tout le monde », « vu par 3 sur 4 », « pas encore vu » ; vide si personne ne doit le voir. */
export function texteVu(b: BilanVu) {
  if (!b.total) return '';
  if (b.n === b.total) return 'vu par tout le monde';
  if (!b.n) return 'pas encore vu';
  return `vu par ${b.n} sur ${b.total}`;
}

/** Tâche « Pour info » que des personnes doivent encore voir. */
export const attendDesVus = (b: BilanVu) => b.n < b.total;

/** Nombre de personnes mentionnées. */
export const nbPourInfo = (p?: PourInfo) => p?.personnes?.length ?? 0;

const nom = (x?: { prenom: string; nom: string }) => (x ? `${x.prenom} ${x.nom}`.trim() : '');

/** Personnes mentionnées, en clair (« Prénom Nom »). */
export function ciblesPourInfo(p: PourInfo | undefined, people: Pick<Person, 'id' | 'prenom' | 'nom'>[]) {
  return (p?.personnes ?? []).map((id) => ({ cle: cleVu(id), texte: nom(people.find((x) => x.id === id)) || '?', id }));
}
