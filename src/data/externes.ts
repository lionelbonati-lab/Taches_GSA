import type { AgendaClubEvent, EvenementEntite, OrgUnit, SeanceComite, SeancesDuComite, Task } from './types';
import { estEvenement } from './partage';
import { parentDans } from './units';
import { endOf } from './utils';

// Tâches liées à une autre entité du club, dans les deux sens de « Dépend de » :
// - une entité (ex. une équipe d'événement) lie une tâche à une séance du comité dont elle dépend (seanceComite) ;
// - un comité lie une tâche à un événement d'une entité qui dépend de lui (evenementEntite) : sa prochaine édition, ou
//   l'un de ses propres événements de l'agenda.
// La tâche garde une copie du nom et de la date (délai lié : utils.delaiTarget) ; suivreExternes la met à jour quand la
// séance ou l'événement change.

/** Événements du club (sous-comités, équipes d'événement) qui dépendent de `moi` (« Dépend de »), hors archivés. */
export function evenementsDependants(units: OrgUnit[], moi: OrgUnit): OrgUnit[] {
  const actives = units.filter((u) => !u.archive);
  return actives
    .filter((u) => u.id !== moi.id && estEvenement(u.type) && parentDans(actives, u)?.id === moi.id)
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.nom.localeCompare(b.nom, 'fr'));
}

/** Tâche qui concerne l'événement `uniteId` (qui dépend du comité ouvert) : partagée par lui, ou liée à lui. */
export const tacheDeLEvenement = (t: Task, uniteId: string) => t.source?.uniteId === uniteId || (!t.source && t.evenementEntite?.uniteId === uniteId);

export const memeSeance = (a?: SeanceComite, b?: SeanceComite) => !!a && !!b && a.uniteId === b.uniteId && a.id === b.id;
/** Même événement ; une édition : de la même date (l'édition passée n'est pas la suivante). */
export const memeEvenement = (a?: EvenementEntite, b?: EvenementEntite) =>
  !!a && !!b && a.uniteId === b.uniteId && (a.id ?? '') === (b.id ?? '') && (!!a.id || a.date === b.date);

/** Prochaine édition d'un événement du club (date de l'organigramme ; '' si pas encore fixée). */
export const editionDe = (u: OrgUnit): EvenementEntite => ({ uniteId: u.id, nom: u.nom, date: u.date ?? '', ...(u.dateFin ? { dateFin: u.dateFin } : {}) });

/** Séances proposées du comité : celles à venir, et celle déjà liée (même passée ou retirée). */
export function choixSeances(lu: SeancesDuComite | null | undefined, comite: string, lie: SeanceComite | undefined, jour: string): SeanceComite[] {
  const choix: SeanceComite[] = (lu?.seances ?? [])
    .filter((s) => s.date >= jour || (lie?.uniteId === comite && s.id === lie.id))
    .map((s) => ({ uniteId: comite, id: s.id, titre: s.titre, date: s.date }));
  if (lie && !choix.some((s) => memeSeance(s, lie))) choix.push(lie);
  return choix;
}

/**
 * Événements proposés au comité : pour chaque entité qui dépend de lui, sa prochaine édition (sauf passée) puis ses
 * propres événements à venir (agenda du club) ; et celui déjà lié.
 */
export function choixEvenements(dependants: OrgUnit[], agenda: AgendaClubEvent[], lie: EvenementEntite | undefined, jour: string): EvenementEntite[] {
  const choix: EvenementEntite[] = [];
  for (const u of dependants) {
    const ed = editionDe(u);
    if (!ed.date || endOf(ed) >= jour || memeEvenement(ed, lie)) choix.push(ed);
    for (const e of agenda) {
      if (e.uniteId !== u.id || (e.date === ed.date && (e.dateFin ?? '') === (ed.dateFin ?? ''))) continue;
      const x: EvenementEntite = { uniteId: u.id, id: e.id, nom: e.nom, date: e.date, ...(e.dateFin ? { dateFin: e.dateFin } : {}) };
      if (endOf(e) >= jour || memeEvenement(x, lie)) choix.push(x);
    }
  }
  if (lie && !choix.some((x) => memeEvenement(x, lie))) choix.push(lie);
  return choix;
}

/** Ce que l'entité ouverte sait des autres : séances du comité dont elle dépend, agenda du club, entités. */
export interface Externes {
  /** undefined : pas encore lues ; null : le serveur ne les donne pas encore (migration 032). */
  seances?: SeancesDuComite | null;
  /** undefined : pas encore lu (ou aucune entité ne dépend de l'entité ouverte). */
  agenda?: AgendaClubEvent[];
}

/**
 * Tâches dont la séance ou l'événement lié d'une autre entité a changé de nom ou de date : leur copie à jour (le délai
 * lié est recalculé à l'enregistrement). Une séance ou un événement introuvable (retiré, ou plus lu) ne change rien ;
 * une édition passée non plus (la date de l'entité est alors celle de l'édition suivante).
 */
export function suivreExternes(tasks: Task[], ext: Externes, units: OrgUnit[], jour: string): Map<string, Pick<Task, 'seanceComite' | 'evenementEntite'>> {
  const out = new Map<string, Pick<Task, 'seanceComite' | 'evenementEntite'>>();
  for (const t of tasks) {
    if (t.source) continue;
    const s = t.seanceComite;
    if (s && ext.seances?.comite === s.uniteId) {
      const lu = ext.seances.seances.find((x) => x.id === s.id);
      if (lu && (lu.titre !== s.titre || lu.date !== s.date)) out.set(t.id, { ...out.get(t.id), seanceComite: { ...s, titre: lu.titre, date: lu.date } });
    }
    const e = t.evenementEntite;
    if (!e) continue;
    let a: EvenementEntite | undefined;
    if (!e.id) {
      if (e.date && endOf(e) < jour) continue;
      const u = units.find((x) => x.id === e.uniteId);
      // Date de l'édition effacée (édition passée, la suivante pas encore fixée) : on garde la dernière connue.
      a = u && (u.date || !e.date) ? editionDe(u) : u ? { ...e, nom: u.nom } : undefined;
    } else {
      const lu = ext.agenda?.find((x) => x.uniteId === e.uniteId && x.id === e.id);
      a = lu && { uniteId: e.uniteId, id: e.id, nom: lu.nom, date: lu.date, ...(lu.dateFin ? { dateFin: lu.dateFin } : {}) };
    }
    if (a && (a.nom !== e.nom || a.date !== e.date || (a.dateFin ?? '') !== (e.dateFin ?? ''))) out.set(t.id, { ...out.get(t.id), evenementEntite: a });
  }
  return out;
}
