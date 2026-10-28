import type { ActivityNotif, AppData, ClubEvent, Task } from './types';
import { aPrendreOuverte, aPrendreSuivante, sansVolontaires, sansVolontairesPartage } from './aPrendre';
import { addDays, delaiDepuis, diffDays, endOf, finLe, today, uid } from './utils';

// Reprendre une édition : un événement passé (course, camp, soirée…) recopié à une nouvelle date, avec les tâches qui le
// préparaient. Chaque tâche repart « à faire », au même écart de l'événement (« 30 jours avant », « la veille » : le délai
// lié suit la nouvelle date ; un délai fixe est décalé d'autant), checklist décochée, sans discussion ni « ✓ Vu » ni
// séance ; les responsables restent (personnes encore actives) ou sont à attribuer ensuite. Les fichiers joints restent
// communs avec l'original (comme « Dupliquer ») ; emails et sondages ne suivent pas. Une tâche récurrente se reconduit
// déjà toute seule : proposée décochée, et sa copie ne se répète pas.

/** Événement qui peut être repris : pas une série (elle suit déjà ses occurrences). */
export const reprenable = (e: ClubEvent) => !e.repetition;

export interface Candidat {
  t: Task;
  /** Liée à l'événement (sinon : autre tâche de l'entité d'un événement, de la même édition). */
  liee: boolean;
  /** Cochée au départ. */
  coche: boolean;
}

/**
 * Tâches qui peuvent être reprises : celles liées à l'événement, puis, dans l'entité d'un événement (`edition`), ses autres
 * tâches de cette édition (rattachées à aucun événement, délai ou clôture dans l'année qui précède, jusqu'à un mois après).
 * Ni tickets de paiement, ni tâches d'autres entités. `peut` : section où la personne crée des tâches pour d'autres.
 */
export function candidats(data: AppData, e: ClubEvent, edition: boolean, peut: (sectionId: string) => boolean): Candidat[] {
  const propre = (t: Task) => !t.source && !t.paiement && peut(t.sectionId);
  const debut = addDays(e.date, -365);
  const fin = addDays(endOf(e), 30);
  const dansLEdition = (t: Task) => {
    const quand = t.delai || finLe(t);
    return !!quand && quand >= debut && quand <= fin;
  };
  const parDelai = (a: Candidat, b: Candidat) => (a.t.delai || '9999').localeCompare(b.t.delai || '9999');
  const liees = data.tasks.filter((t) => propre(t) && t.eventId === e.id).map((t) => ({ t, liee: true, coche: !t.recurrence }));
  const autres = edition
    ? data.tasks.filter((t) => propre(t) && !t.eventId && !t.evenementEntite && !t.recurrence && dansLEdition(t)).map((t) => ({ t, liee: false, coche: false }))
    : [];
  return [...liees.sort(parDelai), ...autres.sort(parDelai)];
}

/** Nom de la nouvelle édition : années décalées de `ans` (« Bruntrutaine 2026 » → « 2027 », « 2026-27 » → « 2027-28 »). */
export function nomReprise(nom: string, ans: number) {
  if (!ans) return nom;
  return nom.replace(/\b((?:19|20)\d{2})(?:([-–/])(\d{2}))?\b/g, (_, an: string, sep?: string, suite?: string) =>
    `${Number(an) + ans}${sep && suite ? `${sep}${String((Number(suite) + ans) % 100).padStart(2, '0')}` : ''}`,
  );
}

/** Date proposée : un an plus tard, le même jour de la semaine (52 semaines), et pas dans le passé. */
export function dateReprise(e: ClubEvent) {
  let d = addDays(e.date, 364);
  while (d < today()) d = addDays(d, 364);
  return d;
}

/** Délai de la copie d'une tâche, l'événement `e` étant repris au `date` : le délai lié le suit, un délai fixe se décale. */
export function delaiRepris(t: Task, e: ClubEvent, date: string) {
  if (t.eventId === e.id && t.delaiRef?.type === 'event') return delaiDepuis(t.delaiRef, date);
  return t.delai ? addDays(t.delai, diffDays(e.date, date)) : '';
}

export interface ChoixReprise {
  nom: string;
  date: string;
  dateFin?: string;
  /** Tâches à reprendre (identifiants). */
  taches: string[];
  /** Mêmes responsables (encore actifs) ; sinon à attribuer ensuite. */
  responsables: boolean;
}

/**
 * Le nouvel événement et les copies des tâches choisies (dans leur ordre), avec les notifications des responsables et des
 * personnes à qui une tâche à prendre est proposée (`moi` : qui reprend).
 */
export function reprendre(data: AppData, e: ClubEvent, c: ChoixReprise, moi: string): { event: ClubEvent; tasks: Task[]; notifs: ActivityNotif[] } {
  const { sauf: _s, serie: _x, repetition: _r, ...reste } = e;
  const event: ClubEvent = { ...reste, id: uid('e'), nom: c.nom.trim(), date: c.date, dateFin: c.dateFin && c.dateFin > c.date ? c.dateFin : undefined, repriseDe: e.id };
  const ouvert = data.statuses.find((s) => !s.done) ?? data.statuses[0];
  const choisies = data.tasks.filter((t) => c.taches.includes(t.id) && !t.source && !t.paiement);
  const ids = new Map(choisies.map((t) => [t.id, uid('t')]));
  const actifs = new Set(data.people.filter((p) => p.actif).map((p) => p.id));
  const now = new Date().toISOString();
  const tasks = choisies.map((t): Task => {
    const {
      suivanteId: _a, termineeLe: _b, parCentral: _d, copieDe: _e, attribueePar: _f, modifiePar: _g, pieces: _h, pourInfoVus: _i,
      commentaires: _j, recurrence: _k, postesResp: _l, meetingId: _m, seanceComite: _n, evenementEntite: _o, contenuLe: _p, ...x
    } = t;
    const liee = t.eventId === e.id;
    const ref = liee && t.delaiRef?.type === 'event' ? (({ occurrence: _, ...r }) => r)(t.delaiRef) : undefined;
    return {
      ...x,
      id: ids.get(t.id)!,
      statusId: ouvert.id,
      eventId: liee ? event.id : undefined,
      delaiRef: ref,
      delai: delaiRepris(t, e, c.date),
      responsables: c.responsables ? sansVolontaires(t.responsables.filter((id) => actifs.has(id)), t.aPrendre) : [],
      respPartage: c.responsables ? sansVolontairesPartage(t.respPartage, t.aPrendre) : undefined,
      aPrendre: aPrendreSuivante(t.aPrendre),
      checklist: t.checklist.map((i) => ({ ...i, id: uid('c'), done: false })),
      // Tâche principale reprise aussi : sa copie ; sinon la même.
      parentId: t.parentId && ids.has(t.parentId) ? ids.get(t.parentId) : t.parentId && data.tasks.some((y) => y.id === t.parentId) ? t.parentId : undefined,
      createdBy: moi,
      updatedAt: now,
    };
  });
  const notifs: ActivityNotif[] = [];
  const prevenir = (userId: string, type: ActivityNotif['type'], taskId: string) => userId !== moi && notifs.push({ id: uid('n'), userId, type, taskId, by: moi, at: now });
  for (const t of tasks) {
    t.responsables.forEach((id) => prevenir(id, 'assign', t.id));
    if (aPrendreOuverte(t)) t.aPrendre!.personnes.filter((id) => !t.responsables.includes(id)).forEach((id) => prevenir(id, 'propose', t.id));
  }
  return { event, tasks, notifs };
}
