import type { AppData, Section, Status, TacheTransmise, Task, UnitType } from './types';
import { fullName } from './utils';

// Tâches transmises au comité central : une entité coche « Transmettre au comité central » dans une tâche ;
// la tâche reste la sienne et figure dans l'ordre du jour du comité central :
//   - sous-comité ou équipe d'événement (un événement) : section « Événements », sous l'événement ;
//   - groupe : sous la section du comité central qui porte son nom (« École de cyclisme »…).
// Sans section qui convienne, l'ordre du jour en ajoute une pour l'occasion (rien n'est enregistré).

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').trim();
const VIDES = new Set(['co', 'comite', 'organisation', 'equipe', 'groupe', 'sous', 'les', 'des', 'and', 'et']);
/** Mots qui désignent l'entité (« CO Bruntrutaine » → bruntrutaine). */
const mots = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !VIDES.has(w));
const contientTout = (texte: string, nom: string) => {
  const m = mots(nom);
  const t = new Set(mots(texte));
  return m.length > 0 && m.every((w) => t.has(w));
};

export const estEvenement = (type: UnitType) => type === 'sous-comite' || type === 'equipe';

/** Place d'une entité dans l'ordre du jour du comité central : section (si elle existe) et sous-section. */
type SectionLue = Pick<Section, 'id' | 'nom'> & { sousSections?: string[] };
export function placeTransmise<S extends SectionLue>(sections: S[], u: { nom: string; type: UnitType }): { section?: S; nomSection: string; sousSection: string } {
  if (estEvenement(u.type)) {
    const section = sections.find((s) => /evenement|manifestation/.test(norm(s.nom)));
    const sous = section?.sousSections?.find((x) => contientTout(x, u.nom));
    return { section, nomSection: section?.nom ?? 'Événements', sousSection: sous ?? u.nom };
  }
  const section = sections.find((s) => norm(s.nom) === norm(u.nom)) ?? sections.find((s) => contientTout(s.nom, u.nom));
  return { section, nomSection: section?.nom ?? u.nom, sousSection: '' };
}

/** Où la tâche apparaîtra, vu de l'entité (qui ne connaît pas les sous-sections du comité central). */
export function libellePlace(sections: SectionLue[], u: { nom: string; type: UnitType }) {
  const p = placeTransmise(sections, u);
  return estEvenement(u.type) ? `sous « ${p.nomSection} » (${u.nom})` : `sous « ${p.nomSection} »`;
}

const statutDe = (statuses: Status[], x: TacheTransmise) =>
  statuses.find((s) => norm(s.label) === norm(x.statut) && s.done === x.termine) ?? statuses.find((s) => s.done === x.termine) ?? statuses[0];

/**
 * Données de l'ordre du jour du comité central avec les tâches transmises : chacune devient une tâche
 * (identifiant « tr:… ») rangée à sa place, avec les sections et sous-sections ajoutées pour l'occasion.
 */
export function avecTransmises(data: AppData, list: TacheTransmise[]): { data: AppData; responsables: Map<string, string[]> } {
  const responsables = new Map<string, string[]>();
  if (!list.length) return { data, responsables };
  const sections = data.sections.map((s) => ({ ...s, sousSections: [...s.sousSections] }));
  const tasks: Task[] = [];
  for (const x of list) {
    const p = placeTransmise(data.sections, { nom: x.unite, type: x.type });
    let sec = p.section ? sections.find((s) => s.id === p.section!.id) : sections.find((s) => s.id === `tr:${norm(p.nomSection)}`);
    if (!sec) {
      sec = { id: `tr:${norm(p.nomSection)}`, nom: p.nomSection, sousSections: [] };
      sections.push(sec);
    }
    if (p.sousSection && !sec.sousSections.includes(p.sousSection)) sec.sousSections.push(p.sousSection);
    const id = `tr:${x.uniteId}:${x.id}`;
    responsables.set(id, x.responsables);
    tasks.push({
      id,
      sectionId: sec.id,
      sousSection: p.sousSection,
      titre: x.titre,
      responsables: [],
      statusId: statutDe(data.statuses, x)?.id ?? '',
      delai: x.delai,
      remarque: x.remarque,
      checklist: x.checklist ?? [],
      termineeLe: x.termineeLe,
      createdBy: '',
      updatedAt: '',
    });
  }
  return { data: { ...data, sections, tasks: [...data.tasks, ...tasks] }, responsables };
}

/** Démo et serveur : une tâche de l'entité telle que la lit le comité central. */
export function versTransmise(u: { id: string; nom: string; type: UnitType }, d: Pick<AppData, 'statuses' | 'people'>, t: Task): TacheTransmise {
  const st = d.statuses.find((s) => s.id === t.statusId);
  return {
    uniteId: u.id,
    unite: u.nom,
    type: u.type,
    id: t.id,
    titre: t.titre,
    delai: t.delai,
    remarque: t.remarque,
    statut: st?.label ?? '?',
    termine: !!st?.done,
    termineeLe: t.termineeLe,
    responsables: t.responsables.map((id) => d.people.find((p) => p.id === id)).filter((p) => !!p).map((p) => fullName(p)),
    checklist: t.checklist,
  };
}
