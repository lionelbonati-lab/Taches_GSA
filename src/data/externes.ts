import type { AgendaClubEvent, AppData, EvenementEntite, Meeting, OrgUnit, Person, SeanceComite, SeancesDuComite, Section, SectionsDependantes, Task } from './types';
import { entiteDeSection, estEvenement, estSectionEvenements, memePersonne, partageDe, placeAuto, sousSectionDe, statutCorrespondant } from './partage';
import { parentDans } from './units';
import { endOf } from './utils';
import { aLaDate, estOccurrence, occurrenceDu, occurrenceProche } from './repetition';
import { epurerPourInfo } from './pourInfo';
import { epurerAPrendre } from './aPrendre';

// Tâches liées à une autre entité du club, dans les deux sens de « Dépend de » :
// - une entité (ex. une équipe d'événement) lie une tâche à une séance du comité dont elle dépend (seanceComite) ;
// - un comité lie une tâche à un événement d'une entité qui dépend de lui (evenementEntite) : sa prochaine édition, ou
//   l'un de ses propres événements de l'agenda.
// La tâche garde une copie du nom et de la date (délai lié : utils.delaiTarget) ; suivreExternes la met à jour quand la
// séance ou l'événement change.

/** Entités du club (groupes, sous-comités, équipes d'événement) qui dépendent de `moi` (« Dépend de »), hors archivées. */
export function entitesDependantes(units: OrgUnit[], moi: OrgUnit): OrgUnit[] {
  const actives = units.filter((u) => !u.archive);
  return actives
    .filter((u) => u.id !== moi.id && parentDans(actives, u)?.id === moi.id)
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.nom.localeCompare(b.nom, 'fr'));
}

/** Événements du club (sous-comités, équipes d'événement) qui dépendent de `moi` (« Dépend de »), hors archivés. */
export const evenementsDependants = (units: OrgUnit[], moi: OrgUnit) => entitesDependantes(units, moi).filter((u) => estEvenement(u.type));

/**
 * Tâche qui concerne l'événement `uniteId` (qui dépend du comité ouvert) : partagée par lui, ou du comité liée à lui ou
 * partagée avec lui (attribuée à lui : section des événements › l'événement). Vue « moi » : aussi une tâche de l'une de
 * mes autres entités liée à lui ou partagée avec lui.
 */
export const tacheDeLEvenement = (t: Task, uniteId: string) =>
  t.source?.uniteId === uniteId || ((!t.source || !!t.source.chezMoi) && (t.evenementEntite?.uniteId === uniteId || !!t.partage?.includes(uniteId)));

/**
 * Tâche du comité attribuée à une entité qui dépend de lui, depuis sa sous-section : la tâche lui est partagée et
 * apparaît dans ses tâches.
 *   - sous la section des événements (« Événements ») : l'un des événements qui dépendent du comité ; chez lui, la tâche
 *     est rangée comme toute tâche partagée (placeAuto) ;
 *   - sous la section au nom d'une entité qui dépend du comité (« École de cyclisme ») : l'une des sections de cette
 *     entité, où la tâche est rangée chez elle (placePartage).
 */
export interface Attribution {
  /** Valeur du choix : `u:<entité>` (événement), `g:<entité>:<section>` (section de l'entité). */
  cle: string;
  unite: OrgUnit;
  /** Section de l'entité où ranger la tâche ; sans : rangement automatique chez elle. */
  sectionId?: string;
  /** Sous-section de la tâche dans le comité. */
  sousSection: string;
}

/**
 * Choix d'attribution sous la section `section` du comité. `unite` : l'entité dont la section porte le nom ; `lues` :
 * ses sections sont connues (sinon : pas encore lues, ou serveur sans la migration 033).
 */
export function attributions(
  section: Pick<Section, 'nom' | 'sousSections'> | undefined,
  dependantes: OrgUnit[],
  sections: SectionsDependantes | null | undefined,
): { choix: Attribution[]; unite?: OrgUnit; lues: boolean } {
  if (!section) return { choix: [], lues: true };
  if (estSectionEvenements(section.nom))
    return { choix: dependantes.filter((u) => estEvenement(u.type)).map((u) => ({ cle: `u:${u.id}`, unite: u, sousSection: sousSectionDe(section.sousSections, u) })), lues: true };
  const unite = entiteDeSection(section.nom, dependantes);
  if (!unite) return { choix: [], lues: true };
  const l = sections?.[unite.id];
  return { unite, lues: !!l, choix: (l || []).map((s) => ({ cle: `g:${unite.id}:${s.id}`, unite, sectionId: s.id, sousSection: s.nom })) };
}

/** Choix d'attribution de la tâche : partagée avec l'entité, à la sous-section du choix (et, chez elle, dans sa section). */
export const attributionDe = (t: Pick<Task, 'sousSection' | 'placePartage'>, choix: Attribution[], partage: string[]) =>
  choix.find((c) => partage.includes(c.unite.id) && t.sousSection === c.sousSection && (!c.sectionId || t.placePartage?.[c.unite.id]?.sectionId === c.sectionId));

/**
 * Section de l'entité où ranger la tâche qui lui est attribuée : celle du choix (section d'un groupe), sinon celle
 * choisie dans le formulaire, sinon la section au nom du comité (« Comité central »), sinon sa première section.
 */
export function sectionChez(a: Attribution, t: Pick<Task, 'placePartage'>, sections: SectionsDependantes | null | undefined, comite: { nom: string; type: OrgUnit['type'] }) {
  if (a.sectionId) return a.sectionId;
  const l = sections?.[a.unite.id] ?? [];
  const choisie = t.placePartage?.[a.unite.id]?.sectionId;
  if (choisie && l.some((s) => s.id === choisie)) return choisie;
  return placeAuto(l, comite).section?.id ?? l[0]?.id ?? '';
}

/**
 * La tâche `t` du comité, telle qu'enregistrée dans l'entité `cible` qui dépend de lui (attribuée depuis sa sous-section ;
 * même règle côté serveur : gsa_attribuer_tache, 035) :
 *   - dans la section `sectionId` de l'entité, partagée avec le comité, rangée chez lui là où elle était (placePartage) ;
 *   - responsables : leur fiche de l'entité (même fiche du registre ou même email) ; sans fiche chez elle, ils restent ceux
 *     du comité (respPartage) ;
 *   - à prendre : les personnes du comité à qui elle est proposée le restent, depuis le comité (aPrendre.partage, 040) ;
 *     celles qui s'en chargent restent ses responsables ;
 *   - la séance du comité liée reste à son ordre du jour (seanceComite) ; les liens à ses événements et à ses autres
 *     tâches, les fichiers (rangés chez lui) et ce qui concerne ses postes ne suivent pas ;
 *   - le statut est retrouvé chez elle (serveur, ou nettoyerAttribuee en démo).
 */
export function versEntite(
  t: Task,
  ctx: { comite: Pick<OrgUnit, 'id' | 'nom'>; cible: OrgUnit; sectionId: string; people: Person[]; meetings: Meeting[]; moi: Person | null; par: string; aujourdhui: string; centralId?: string | null },
): Task {
  const { comite, cible } = ctx;
  const responsables: string[] = [];
  const restent: string[] = [];
  const proposees = t.aPrendre?.personnes ?? [];
  for (const id of t.responsables) {
    const p = ctx.people.find((x) => x.id === id);
    // Volontaire du comité : sa place se compte au comité, où la tâche lui est proposée.
    const m = p && !proposees.includes(id) && cible.membres.find((x) => memePersonne(p, x));
    if (m) {
      if (!responsables.includes(m.id)) responsables.push(m.id);
    } else restent.push(id);
  }
  // Choisis par l'entité quand la tâche lui était seulement partagée : ses propres fiches.
  for (const id of t.respPartage?.[cible.id] ?? []) if (!responsables.includes(id)) responsables.push(id);
  const respPartage = { ...t.respPartage };
  delete respPartage[cible.id];
  delete respPartage[comite.id];
  if (restent.length) respPartage[comite.id] = restent;
  const placePartage = { ...t.placePartage };
  delete placePartage[cible.id];
  placePartage[comite.id] = { sectionId: t.sectionId, sousSection: t.sousSection };
  const m = t.meetingId ? ctx.meetings.find((x) => x.id === t.meetingId) : undefined;
  const seanceComite: SeanceComite | undefined = m && { uniteId: comite.id, id: m.id, titre: m.titre, date: m.date };
  const createur = ctx.moi && cible.membres.find((x) => memePersonne(ctx.moi!, x));
  // Personnes du comité (fiches d'ici) : leur fiche chez l'entité, si elles en ont une.
  const chez = (ids: string[]) =>
    ids.flatMap((id) => { const p = ctx.people.find((x) => x.id === id); const m = p && cible.membres.find((x) => memePersonne(p, x)); return m ? [m.id] : []; });
  // Pour info : les personnes d'ici sans fiche chez elle restent au courant comme personnes du comité ; l'entité ne se
  // met pas pour info d'elle-même.
  const info = t.pourInfo;
  const infoIci = (info?.personnes ?? []).filter((id) => !chez([id]).length);
  const pourInfo = epurerPourInfo(
    info && {
      personnes: [...chez(info.personnes ?? []), ...(info.autres?.[cible.id] ?? [])],
      unites: (info.unites ?? []).filter((id) => id !== cible.id),
      autres: { ...Object.fromEntries(Object.entries(info.autres ?? {}).filter(([u]) => u !== cible.id)), ...(infoIci.length ? { [comite.id]: infoIci } : {}) },
    },
    responsables,
  );
  // À prendre : proposée aux personnes du comité depuis le comité ; celles de l'entité (proposée depuis chez elle quand la
  // tâche lui était partagée) deviennent les siennes.
  const a = t.aPrendre;
  const ici = a?.partage?.[cible.id];
  const ailleurs = { ...a?.partage };
  delete ailleurs[cible.id];
  delete ailleurs[comite.id];
  if (a?.personnes.length) ailleurs[comite.id] = { personnes: a.personnes, refus: a.refus, par: a.par || t.createdBy || undefined };
  const aPrendre = a && epurerAPrendre({ personnes: ici?.personnes ?? [], nombre: a.nombre, refus: ici?.refus, par: ici?.par, partage: ailleurs }, responsables, respPartage);
  const { meetingId, eventId, parentId, suivanteId, postesResp, parCentral, auCentral, evenementEntite, modifiePar, source, pieces, ...reste } = t;
  return {
    ...reste,
    sectionId: ctx.sectionId,
    sousSection: '',
    responsables,
    respPartage: Object.keys(respPartage).length ? respPartage : undefined,
    partage: [...partageDe(t, ctx.centralId).filter((id) => id !== cible.id && id !== comite.id), comite.id],
    placePartage,
    seanceComite,
    delaiRef: seanceComite && t.delaiRef?.type === 'meeting' ? t.delaiRef : undefined,
    documents: t.documents?.filter((d) => d.kind !== 'fichier'),
    createdBy: createur?.id ?? '',
    pourInfo,
    // Les « ✓ Vu » (clés d'ici) ne suivent pas : la tâche repart chez l'entité.
    pourInfoVus: undefined,
    contenuLe: undefined,
    commentaires: undefined,
    aPrendre,
    attribueePar: { uniteId: comite.id, unite: comite.nom, par: ctx.par, le: ctx.aujourdhui },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Démo : contrôles et nettoyage du serveur (gsa_attribuer_tache) sur la tâche préparée par versEntite, avec les données
 * de l'entité qui la reçoit. Erreur si elle n'y entre pas (section inconnue, identifiant déjà pris, ticket).
 */
export function nettoyerAttribuee(t: Task, d: Pick<AppData, 'statuses' | 'people' | 'sections' | 'tasks'>, statut: { label: string; done: boolean }, cible: { nom: string }): Task {
  if (t.paiement || !t.titre.trim()) throw new Error('Tâche invalide');
  if (d.tasks.some((x) => x.id === t.id)) throw new Error(`Cette tâche est déjà enregistrée dans « ${cible.nom} »`);
  if (!d.sections.some((s) => s.id === t.sectionId)) throw new Error(`Section introuvable dans « ${cible.nom} »`);
  const st = statutCorrespondant(d.statuses, statut) ?? d.statuses[0];
  return {
    ...t,
    titre: t.titre.trim().slice(0, 500),
    statusId: st?.id ?? '',
    responsables: t.responsables.filter((id) => d.people.some((p) => p.id === id)),
    createdBy: d.people.some((p) => p.id === t.createdBy) ? t.createdBy : '',
  };
}

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
    for (const a of agenda) {
      // Qui se répète : sa prochaine occurrence (celle que suivra la tâche).
      const o = a.repetition ? occurrenceDu(a, jour) : a.date;
      const e = o ? aLaDate(a, o) : a;
      if (e.uniteId !== u.id || (e.date === ed.date && (e.dateFin ?? '') === (ed.dateFin ?? ''))) continue;
      const x: EvenementEntite = { uniteId: u.id, id: e.id, nom: e.nom, date: e.date, ...(e.dateFin ? { dateFin: e.dateFin } : {}) };
      if ((o && endOf(e) >= jour) || memeEvenement(x, lie)) choix.push(x);
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
  /** Sections des entités qui dépendent de l'entité ouverte ; undefined : pas encore lues ; null : serveur sans la migration 033. */
  sections?: SectionsDependantes | null;
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
      // Qui se répète : la même occurrence (la plus proche, si la série a changé).
      const o = lu?.repetition ? (estOccurrence(lu, e.date) ? e.date : occurrenceProche(lu, e.date)) : lu?.date;
      const x = lu && o ? aLaDate(lu, o) : undefined;
      a = x && { uniteId: e.uniteId, id: e.id, nom: x.nom, date: x.date, ...(x.dateFin ? { dateFin: x.dateFin } : {}) };
    }
    if (a && (a.nom !== e.nom || a.date !== e.date || (a.dateFin ?? '') !== (e.dateFin ?? ''))) out.set(t.id, { ...out.get(t.id), evenementEntite: a });
  }
  return out;
}
