import type { AppData, EtatPoint, Meeting, MeetingMinutes, Task, TaskSnapshot } from './types';
import { FULL_AGENDA, selectAgenda } from './agenda';
import { TROP_LONG, type EntreeHistorique, type HistoriqueTache } from './historique';
import { stateOf } from './minutes';

// PV repris après la séance : ses points restent tels qu'ils étaient à la fin de la séance (statut, délai, responsables,
// intitulé, remarque, checklist, section et sous-section, échéance). Figés le lendemain d'après l'historique des tâches (050) : les changements notés
// depuis sont défaits, sauf ceux faits depuis le PV (son journal). Ensuite, les changements faits depuis le PV s'y
// reportent ; ceux faits ailleurs n'y apparaissent plus.

/** Fin de la séance pour le PV : la fin de son jour (heure locale), en millisecondes. */
export const finSeance = (date: string) => new Date(`${date}T23:59:59.999`).getTime();

/** PV à figer : séance passée (depuis hier au moins), points pas encore figés. */
export const aFiger = (s1: Meeting | undefined, jour: string) => !!s1 && s1.date < jour && !s1.minutes?.etats;

/** Champs remis comme à la fin de la séance (ceux du PV, et ceux qui décident de son échéance). */
const CHAMPS = ['statusId', 'delai', 'responsables', 'titre', 'remarque', 'checklist', 'meetingId', 'sectionId', 'sousSection'] as const;
type Champ = (typeof CHAMPS)[number];
/** Écart toléré entre une modification faite depuis le PV (journal) et sa ligne d'historique (regroupée sur 10 min). */
const MARGE_MS = 15 * 60 * 1000;

/**
 * Tâche telle qu'elle était au moment `a` (ms) d'après son historique (du plus récent au plus ancien) : les changements
 * notés après sont défaits, sauf ceux à `garder` (faits depuis le PV), qui l'emportent sur les plus anciens. null : elle
 * n'existait pas encore.
 */
export function tacheAuMoment(
  t: Task,
  entrees: EntreeHistorique[],
  a: number,
  garder: (e: EntreeHistorique) => boolean,
  champs: readonly Champ[] = CHAMPS,
): Task | null {
  const x = structuredClone(t) as unknown as Record<string, unknown>;
  const gardes = new Set<string>();
  let defait = false;
  for (const e of entrees) {
    if (Date.parse(e.le) <= a) break;
    if (garder(e)) {
      Object.keys(e.champs).forEach((k) => gardes.add(k));
      continue;
    }
    if (e.quoi === 'creee') return null;
    if (e.quoi) continue;
    for (const k of champs) {
      if (!(k in e.champs) || gardes.has(k)) continue;
      const avant = e.champs[k][0];
      if (avant === TROP_LONG) continue;
      x[k] = avant === null ? (k === 'responsables' || k === 'checklist' ? [] : k === 'meetingId' ? undefined : '') : structuredClone(avant);
      defait = true;
    }
  }
  // Date de modification ramenée à la séance : le bilan (terminées depuis la séance précédente) la prend à défaut de clôture.
  if (defait) x.updatedAt = new Date(a).toISOString();
  return x as unknown as Task;
}

/** Changement d'une tâche fait depuis le PV : une ligne du journal à la même heure (ou sa création « décidée » au PV). */
export const faitDepuisLePv = (m: MeetingMinutes, tacheId: string) => (e: EntreeHistorique) =>
  (e.quoi === 'creee' && !!m.nouvelles?.includes(tacheId)) ||
  (!e.quoi && (m.journal ?? []).some((j) => j.taskId === tacheId && Math.abs(Date.parse(j.at) - Date.parse(e.le)) <= MARGE_MS));

/** Lit l'historique de plusieurs tâches, quelques-unes à la fois. */
async function lireTout(ids: string[], lire: (id: string) => Promise<HistoriqueTache>, parLot = 6) {
  const out = new Map<string, EntreeHistorique[]>();
  for (let i = 0; i < ids.length; i += parLot) {
    const lot = ids.slice(i, i + parLot);
    const lus = await Promise.all(lot.map((id) => lire(id)));
    lot.forEach((id, k) => out.set(id, lus[k].entrees));
  }
  return out;
}

/**
 * Points du PV figés à la fin de la séance `s1` : ceux de l'ordre du jour ce jour-là (retards comptés au jour de la
 * séance), ceux présents au début de la séance (pointIds), modifiés ou créés depuis le PV.
 */
export async function figerPoints(
  data: AppData,
  seances: { s0?: Meeting; s1: Meeting; s2?: Meeting },
  m: MeetingMinutes,
  lire: (id: string) => Promise<HistoriqueTache>,
  joursApres?: number,
): Promise<Record<string, EtatPoint>> {
  const { s0, s1, s2 } = seances;
  const a = finSeance(s1.date);
  const options = { ...FULL_AGENDA, joursApres, jour: s1.date };
  const duPv = new Set([...(m.pointIds ?? []), ...(m.journal ?? []).map((j) => j.taskId), ...(m.nouvelles ?? [])]);
  // À relire : les points d'aujourd'hui et ceux du PV, et tout ce qui a changé depuis (un point a pu sortir de la liste).
  const sel = selectAgenda(data, s0, s1, s2, options);
  const actuels = new Set([...sel.late, ...sel.avant1, ...sel.avant2, ...sel.bilan].map((t) => t.id));
  const aRelire = data.tasks.filter((t) => actuels.has(t.id) || duPv.has(t.id) || Date.parse(t.updatedAt) > a).map((t) => t.id);
  const historiques = await lireTout(aRelire, lire);
  const alors = data.tasks.flatMap((t) => {
    const h = historiques.get(t.id);
    const x = h ? tacheAuMoment(t, h, a, faitDepuisLePv(m, t.id)) : t;
    return x ? [x] : [];
  });
  const s = selectAgenda({ ...data, tasks: alors }, s0, s1, s2, options);
  const rang = new Map<string, EtatPoint['rang']>();
  s.late.forEach((t) => rang.set(t.id, 'late'));
  s.avant1.forEach((t) => rang.set(t.id, 'p1'));
  s.avant2.forEach((t) => rang.set(t.id, 'p2'));
  s.bilan.forEach((t) => rang.set(t.id, 'bilan'));
  const etats: Record<string, EtatPoint> = {};
  for (const t of alors) {
    const r = rang.get(t.id) ?? (duPv.has(t.id) ? 'p1' : undefined);
    if (r) etats[t.id] = { ...stateOf(t), rang: r };
  }
  return etats;
}

/** Champs des points gardés après coup (remarque le 05.11.2026, section et sous-section le 09.11.2026). */
const CHAMPS_AJOUTES = ['remarque', 'sectionId', 'sousSection'] as const;
type Ajoute = (typeof CHAMPS_AJOUTES)[number];
const manquants = (m: MeetingMinutes): Ajoute[] => CHAMPS_AJOUTES.filter((k) => Object.values(m.etats ?? {}).some((e) => e[k] === undefined));

/** PV figé avant qu'on y garde certains champs des points (remarque, section…) : à compléter (`completerEtats`). */
export const etatsACompleter = (m: MeetingMinutes) => manquants(m).length > 0;

/**
 * PV figé avant qu'on y garde certains champs des points : ceux de la fin de la séance, d'après l'historique des tâches
 * (une remarque écrite ou une sous-section renommée après la séance n'y apparaît plus, sauf depuis le PV). Point supprimé
 * depuis : rien de plus.
 */
export async function completerEtats(
  data: AppData,
  s1: Meeting,
  m: MeetingMinutes,
  lire: (id: string) => Promise<HistoriqueTache>,
): Promise<Record<string, Partial<EtatPoint>>> {
  const a = finSeance(s1.date);
  const champs = manquants(m);
  const ids = Object.entries(m.etats ?? {}).filter(([, e]) => champs.some((k) => e[k] === undefined)).map(([id]) => id);
  const taches = new Map(data.tasks.filter((t) => ids.includes(t.id)).map((t) => [t.id, t]));
  const historiques = await lireTout([...taches.keys()], lire);
  return Object.fromEntries(
    ids.map((id) => {
      const t = taches.get(id);
      const e = m.etats![id];
      const alors = t && tacheAuMoment(t, historiques.get(id) ?? [], a, faitDepuisLePv(m, id), champs);
      const x: Partial<EtatPoint> = {};
      if (e.remarque === undefined) x.remarque = alors?.remarque ?? t?.remarque ?? '';
      if (e.sectionId === undefined && (alors ?? t)) x.sectionId = (alors ?? t)!.sectionId;
      if (e.sousSection === undefined) x.sousSection = (alors ?? t)?.sousSection ?? '';
      return [id, x];
    }),
  );
}

/**
 * PV figé avant que certains de ses points n'arrivent dans le club (reprise des anciennes entités le 03.11.2026, point
 * rétabli) : ceux que l'ordre du jour de la séance retenait à la fin de celle-ci d'après leur historique (recopié avec
 * eux), absents du PV, et « rétablis » dans le club après la séance. Un point créé après la séance n'en est pas.
 */
export async function pointsArrives(
  data: AppData,
  seances: { s0?: Meeting; s1: Meeting; s2?: Meeting },
  m: MeetingMinutes,
  lire: (id: string) => Promise<HistoriqueTache>,
  joursApres?: number,
): Promise<Record<string, EtatPoint>> {
  const tous = await figerPoints(data, seances, m, lire, joursApres);
  const fin = finSeance(seances.s1.date);
  const absents = Object.keys(tous).filter((id) => !m.etats?.[id]);
  const historiques = await lireTout(absents, lire);
  const arrives = absents.filter((id) => (historiques.get(id) ?? []).some((e) => e.quoi === 'retablie' && Date.parse(e.le) > fin));
  return Object.fromEntries(arrives.map((id) => [id, tous[id]]));
}

/** Point affiché dans le PV figé : ses champs de la fin de la séance, le reste tel qu'aujourd'hui. */
export function vueFigee(t: Task, e?: EtatPoint): Task {
  if (!e) return t;
  return {
    ...t,
    statusId: e.statusId,
    delai: e.delai,
    responsables: [...e.responsables],
    titre: e.titre,
    // État noté avant qu'on garde la remarque, la section : celles d'aujourd'hui (le temps de les retrouver, voir
    // completerEtats).
    remarque: e.remarque ?? t.remarque,
    sectionId: e.sectionId ?? t.sectionId,
    sousSection: e.sousSection ?? t.sousSection,
    // Étapes ajoutées depuis ailleurs : pas encore là à la fin de la séance.
    checklist: t.checklist.filter((c) => !e.sous || c.id in e.sous).map((c) => ({ ...c, done: e.sous?.[c.id] ?? c.done })),
  };
}

/** Changement fait depuis le PV : les champs modifiés (entre `avant` et `apres`) passent dans le point figé. */
export function reporterChangement(e: EtatPoint, avant: TaskSnapshot, apres: Task): EtatPoint {
  const n = stateOf(apres);
  const x: EtatPoint = { ...e, sous: { ...e.sous } };
  if (avant.statusId !== n.statusId) x.statusId = n.statusId;
  if (avant.delai !== n.delai) x.delai = n.delai;
  if (avant.responsables.join() !== n.responsables.join()) x.responsables = n.responsables;
  if (avant.titre !== n.titre) x.titre = n.titre;
  if (avant.remarque !== undefined && avant.remarque !== n.remarque) x.remarque = n.remarque;
  // Rangé ailleurs depuis le PV (sa fiche ouverte depuis le PV).
  if (avant.sectionId !== undefined && avant.sectionId !== n.sectionId) x.sectionId = n.sectionId;
  if (avant.sousSection !== undefined && avant.sousSection !== n.sousSection) x.sousSection = n.sousSection;
  for (const [id, fait] of Object.entries(n.sous ?? {})) if (avant.sous?.[id] !== fait) x.sous![id] = fait;
  return x;
}
