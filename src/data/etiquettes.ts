import type { AppData, Etiquette, LieuEtiquette, Section, Task } from './types';

// Étiquettes et sections : chaque étiquette a sa place (une section, ou une sous-section) ; un point rangé là la reçoit
// d'office, et la perd s'il en sort. Les points rangés ailleurs reçoivent l'étiquette des autres points (le comité), si
// elle existe. Ce que chacun peut ranger et étiqueter : store.tsx (peutRanger, peutEtiqueter).

type Donnees = Pick<AppData, 'etiquettes' | 'sections'>;

const MOTS_VIDES = new Set(['a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'pour', 'un', 'une']);

/** Mots d'un nom, sans accents ni majuscules, sans petits mots ni nombres (les dates d'une sous-section). */
const mots = (x: string) =>
  new Set(
    x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((m) => m && !MOTS_VIDES.has(m) && !/^\d+$/.test(m)),
  );

/**
 * Place devinée d'après le nom de l'étiquette : la section ou la sous-section du même nom (aux dates près : « Bruntrutaine
 * 27.02.27 »), sinon celles dont le nom contient tous ses mots (« Compétition » → « Groupe compétition »).
 */
export function lieuxDevines(e: Pick<Etiquette, 'nom'>, sections: Section[]): LieuEtiquette[] {
  const m = mots(e.nom);
  if (!m.size) return [];
  const notes = sections.flatMap((s) =>
    [{ lieu: { sectionId: s.id } as LieuEtiquette, nom: s.nom }, ...s.sousSections.map((ss) => ({ lieu: { sectionId: s.id, sousSection: ss }, nom: ss }))].map((c) => {
      const n = mots(c.nom);
      return { lieu: c.lieu, note: [...m].every((x) => n.has(x)) ? (n.size === m.size ? 2 : 1) : 0 };
    }),
  );
  const meilleure = Math.max(0, ...notes.map((c) => c.note));
  return meilleure ? notes.filter((c) => c.note === meilleure).map((c) => c.lieu) : [];
}

/** Place de l'étiquette : celle réglée, sinon devinée d'après son nom. L'étiquette des autres points n'en a pas. */
export const lieuxDe = (e: Etiquette, sections: Section[]): LieuEtiquette[] => (e.parDefaut ? [] : e.lieux ?? lieuxDevines(e, sections));

/** La place couvre le point rangé dans `sectionId` › `sousSection` (une section entière couvre ses sous-sections). */
const couvre = (l: LieuEtiquette, sectionId: string, sousSection: string) => l.sectionId === sectionId && (!l.sousSection || l.sousSection === sousSection);

/** Nom lisible d'une place : « Événements › Week-end VTT ». */
export const nomLieu = (l: LieuEtiquette, sections: Section[]) => {
  const s = sections.find((x) => x.id === l.sectionId)?.nom ?? '?';
  return l.sousSection ? `${s} › ${l.sousSection}` : s;
};

/**
 * Étiquettes d'office selon la place d'un point, calculées une fois pour toutes les places : celles dont c'est la place ;
 * ailleurs, l'étiquette des autres points (comité). Rien pour un point sans section.
 */
export function etiquettesDesLieux(data: Donnees) {
  const liste = data.etiquettes ?? [];
  const places = liste.map((e) => ({ id: e.id, lieux: lieuxDe(e, data.sections) }));
  const autres = liste.find((e) => e.parDefaut)?.id;
  return (sectionId: string, sousSection = ''): string[] => {
    if (!sectionId) return [];
    const ici = places.filter((p) => p.lieux.some((l) => couvre(l, sectionId, sousSection))).map((p) => p.id);
    return ici.length ? ici : autres ? [autres] : [];
  };
}

/** Étiquettes d'office du point, selon sa place (aucune pour un ticket : remboursement ou facture). */
export const etiquettesAuto = (data: Donnees, t: Pick<Task, 'sectionId' | 'sousSection' | 'paiement'>) =>
  t.paiement ? [] : etiquettesDesLieux(data)(t.sectionId, t.sousSection);

/** Étiquettes d'un point qui change de place : celles d'office de l'ancienne retirées, celles de la nouvelle ajoutées. */
export function recaler(etiquettes: string[] | undefined, avant: string[], apres: string[]): string[] | undefined {
  const l = [...new Set([...(etiquettes ?? []).filter((id) => !avant.includes(id) || apres.includes(id)), ...apres])];
  return l.length ? l : undefined;
}

const memes = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Après une modification (store.tsx, update) : les points dont les étiquettes d'office ont changé (nouveaux, rangés
 * ailleurs, places des étiquettes réglées autrement, étiquette des autres points créée…) suivent. Les autres ne sont pas
 * touchés : un point d'avant ce réglage reçoit l'étiquette de sa place quand on l'enregistre (ou par la fenêtre des
 * étiquettes, « Ajouter l'étiquette de leur place »).
 */
export function suivreLieux(prev: AppData, next: AppData) {
  const avant = etiquettesDesLieux(prev);
  const apres = etiquettesDesLieux(next);
  const anciennes = new Map(prev.tasks.map((t) => [t.id, t]));
  next.tasks = next.tasks.map((t) => {
    if (t.paiement) return t;
    const a = anciennes.get(t.id);
    const x = a && !a.paiement ? avant(a.sectionId, a.sousSection) : [];
    const y = apres(t.sectionId, t.sousSection);
    if (memes(x, y)) return t;
    const etiquettes = recaler(t.etiquettes, x, y);
    return memes(etiquettes, t.etiquettes) ? t : { ...t, etiquettes };
  });
}

/** Points qui n'ont pas encore toutes les étiquettes de leur place (points d'avant ce réglage). */
export function sansEtiquetteDeLeurPlace(data: AppData) {
  const auto = etiquettesDesLieux(data);
  return data.tasks.filter((t) => !t.paiement && auto(t.sectionId, t.sousSection).some((id) => !t.etiquettes?.includes(id)));
}

/** Toutes les places : chaque section entière, puis chacune de ses sous-sections. */
export const toutesLesPlaces = (sections: Section[]): LieuEtiquette[] =>
  sections.flatMap((s) => [{ sectionId: s.id }, ...s.sousSections.map((ss) => ({ sectionId: s.id, sousSection: ss }))]);

/** Clé d'une place (listes de choix). */
export const cleLieu = (l: LieuEtiquette) => `${l.sectionId}\u0001${l.sousSection ?? ''}`;
export const lieuDeCle = (c: string): LieuEtiquette => {
  const [sectionId, sousSection] = c.split('\u0001');
  return sousSection ? { sectionId, sousSection } : { sectionId };
};
