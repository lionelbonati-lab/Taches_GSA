import { avecPartagees, idPartagee, statutCorrespondant } from './partage';
import type { AppData, OrgUnit, Status, TachePartagee, Task, UnitType } from './types';

// Vue « moi » : les tâches de toutes mes entités au même endroit. Celles de mes autres entités (ouvertes en arrière-plan,
// entites.tsx) s'ajoutent à celles de l'entité ouverte comme des tâches partagées (rangées sous le nom de leur entité,
// avec sa pastille) ; elles s'ouvrent et s'enregistrent dans leur entité.

/** L'une de mes autres entités : ses données, ce que j'y vois, ma fiche chez elle. */
export interface AutreEntite {
  id: string;
  nom: string;
  type: UnitType;
  data: AppData;
  voit: (t: Task) => boolean;
  fiche?: string;
}

const avecMoi = (ids: string[] | undefined, moi: string) => (ids?.includes(moi) ? ids : [...(ids ?? []), moi]);

/**
 * Données de l'entité ouverte (`moi`, ma fiche `user`) avec les tâches que je vois dans mes autres entités (sauf celles
 * déjà partagées avec elle), tickets de paiement compris (ceux que j'y vois : caisse, demande, visa), qui s'ouvrent chez
 * elles. Ma fiche chez elles est remplacée par celle d'ici (pour info, à prendre, « ✓ Vu », demande d'un ticket) ; les
 * responsables, eux, le sont déjà (même personne).
 */
export function avecMesEntites(vue: AppData, autres: AutreEntite[], moi: string, units: OrgUnit[], user?: string): AppData {
  const deja = new Set(vue.tasks.map((t) => t.id));
  const liste: TachePartagee[] = [];
  const fiches: (string | undefined)[] = [];
  for (const e of autres) {
    const statuts = e.data.statuses.map((s) => ({ id: s.id, label: s.label, done: s.done }));
    for (const task of e.data.tasks) {
      if (deja.has(idPartagee(e.id, task.id)) || !e.voit(task)) continue;
      liste.push({ uniteId: e.id, unite: e.nom, type: e.type, task, statuts, v: 41 });
      fiches.push(e.fiche);
    }
  }
  if (!liste.length) return vue;
  const avec = avecPartagees(vue, liste, moi, units);
  const n = vue.tasks.length;
  return {
    ...avec,
    tasks: avec.tasks.map((t, i) => {
      if (i < n || !t.source) return t;
      const orig = liste[i - n].task;
      const fiche = fiches[i - n];
      const x: Task = { ...t, source: { ...t.source, chezMoi: true } };
      // Ticket : le même circuit (caisse → visa → virement), affiché ici et traité chez lui.
      if (orig.paiement) x.paiement = fiche && user && orig.paiement.demandePar === fiche ? { ...orig.paiement, demandePar: user } : orig.paiement;
      if (!fiche || !user) return x;
      if (orig.createdBy === fiche) x.createdBy = user;
      if (orig.pourInfo?.personnes?.includes(fiche)) x.pourInfo = { ...x.pourInfo, personnes: avecMoi(x.pourInfo?.personnes, user) };
      if (orig.aPrendre?.personnes.includes(fiche) && x.aPrendre) {
        x.aPrendre = { ...x.aPrendre, personnes: avecMoi(x.aPrendre.personnes, user) };
        if (orig.aPrendre.refus?.includes(fiche)) x.aPrendre.refus = avecMoi(x.aPrendre.refus, user);
      }
      const vu = orig.pourInfoVus?.[`p:${fiche}`];
      if (vu) x.pourInfoVus = { ...x.pourInfoVus, [`p:${user}`]: vu };
      return x;
    }),
  };
}

/**
 * Tâche de l'une de mes autres entités modifiée depuis une liste d'ici (`avant` → `t`, vues d'ici) : la même modification
 * sur la tâche chez elle (`orig`) ; statut retrouvé par son nom.
 */
export function modifDepuisIci(orig: Task, avant: Task, t: Task, statutsIci: Status[], statuts: Status[]): Task {
  const next = { ...orig };
  if (t.statusId !== avant.statusId) next.statusId = statutCorrespondant(statuts, statutsIci.find((s) => s.id === t.statusId))?.id ?? orig.statusId;
  if (t.delai !== avant.delai) {
    next.delai = t.delai;
    next.delaiRef = undefined;
  }
  if (t.titre !== avant.titre) next.titre = t.titre;
  if (t.remarque !== avant.remarque) next.remarque = t.remarque;
  if (JSON.stringify(t.checklist) !== JSON.stringify(avant.checklist)) next.checklist = t.checklist;
  return next;
}

/** Tâche vue d'ici « x:<entité>:<tâche> » : son entité et son identifiant chez elle. */
export function tacheAilleurs(cle: string) {
  const m = /^x:([^:]+):(.+)$/.exec(cle);
  return m ? { uniteId: m[1], id: m[2] } : null;
}

/**
 * Lien d'une notification de l'une de mes autres entités (`uniteId`), vu de l'entité ouverte (`moi`) : une tâche et les
 * tâches de la semaine s'ouvrent d'ici (vue « moi ») ; le reste (séance, sondage, pour info reçu…) dans son entité
 * (`ici` faux).
 */
export function lienDepuisEntite(lien: string, uniteId: string, moi: string): { lien: string; ici: boolean } {
  if (lien.startsWith('/taches?delai=')) return { lien, ici: true };
  const m = /^\/taches\?tache=([^&]+)$/.exec(lien);
  if (!m) return { lien, ici: false };
  const x = tacheAilleurs(m[1]);
  return { lien: `/taches?tache=${!x ? idPartagee(uniteId, m[1]) : x.uniteId === moi ? x.id : m[1]}`, ici: true };
}
