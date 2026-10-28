import { emailKey } from './membres';
import { idPartagee, memeStatut } from './partage';
import { statutsReunis } from './vueMoi';
import type { APrendre, AppData, OrgUnit, Paiement, Person, PourInfo, ScheduledEmail, Task, UnitType, VuPourInfo } from './types';

// Vue du club (PLAN_CLUB_SANS_ENTITE.md, étape 1) : sans entité ouverte, toutes mes entités à égalité. Leurs tâches (et
// celles que d'autres entités partagent avec elles) réunies, chacune sous « x:<son entité>:<son identifiant> », avec sa
// section, sa séance et son événement de chez elle (« x:<entité>:<id> ») ; les places dans les entités (fiches) ramenées
// aux personnes du club (personnes.ts : leur fiche « Personnes du club »). Une tâche s'ouvre et s'enregistre dans son
// entité (ou dans celle des miennes avec qui elle est partagée : `source.via`).

/** L'une de mes entités, telle que je la vois chez elle. */
export interface EntiteVue {
  id: string;
  nom: string;
  type: UnitType;
  /** Ses données vues par moi (tâches partagées avec elle comprises). */
  data: AppData;
  voit: (t: Task) => boolean;
  /** Ma place (fiche) chez elle. */
  fiche: string;
}

/** Où se trouve une tâche de la vue du club : l'entité de mes entités qui l'enregistre, et son identifiant chez elle. */
export interface OuTache {
  entite: string;
  id: string;
}

export interface VueClub {
  data: AppData;
  ou: Map<string, OuTache>;
  /** Personne du club d'une place : `uniteId` → fiche → identifiant. */
  personneDe: (uniteId: string, fiche: string) => string;
}

/**
 * Tâche de l'entité ouverte, ou (vue du club) de l'une de mes entités : pas une tâche qu'une autre entité partage avec
 * elle (« Pour info » que j'ai demandés, relances…).
 */
export const tacheDeMesEntites = (t: Pick<Task, 'source'>, club?: { vueClub?: boolean } | null) => !t.source || (!!club?.vueClub && !!t.source.chezMoi && !t.source.via);

/** Identifiant d'une section, d'une séance ou d'un événement de l'entité `u` dans la vue du club. */
export const idDans = (u: string, id: string) => `x:${u}:${id}`;

/** Personne du club d'une fiche : sa fiche « Personnes du club », sinon son adresse, sinon la place elle-même. */
const idPersonne = (u: string, p: { id: string; membreId?: string; email?: string }) =>
  p.membreId || (emailKey(p.email) ? `e:${emailKey(p.email)}` : idDans(u, p.id));

/**
 * Vue du club : mes entités (`entites`, dans l'ordre du club), moi (`moi` : ma fiche du club), toutes les entités du club
 * (`units`, pour les personnes des autres) ; `prefs` : mes réglages (au club).
 */
export function vueClub(entites: EntiteVue[], moi: Person, units: OrgUnit[], prefs: AppData['prefs'][string]): VueClub {
  // Personnes : mes places sont moi ; les autres, leur fiche du club (une personne pour toutes ses places).
  const index = new Map<string, string>();
  const people = new Map<string, Person>([[moi.id, moi]]);
  const ajouter = (u: string, p: Pick<Person, 'id' | 'prenom' | 'nom' | 'email' | 'couleur'> & Partial<Person>, actif: boolean) => {
    const id = idPersonne(u, p);
    index.set(`${u}:${p.id}`, id);
    const avant = people.get(id);
    if (!avant || (actif && !avant.actif))
      people.set(id, { id, prenom: p.prenom, nom: p.nom, email: p.email, telephone: p.telephone ?? '', couleur: p.couleur, poste: p.poste ?? '', roles: [], actif, membreId: p.membreId });
  };
  for (const e of entites) for (const p of e.data.people) ajouter(e.id, p, p.actif);
  for (const u of units) for (const m of u.membres) if (!index.has(`${u.id}:${m.id}`)) ajouter(u.id, m, true);
  for (const e of entites) index.set(`${e.id}:${e.fiche}`, moi.id);
  const personneDe = (u: string, f: string) => index.get(`${u}:${f}`) ?? idDans(u, f);

  const statuses = statutsReunis(entites[0]?.data.statuses ?? [], entites.slice(1).map((e) => ({ id: e.id, statuses: e.data.statuses })));
  const statut = (e: EntiteVue, id: string) => {
    const s = e.data.statuses.find((x) => x.id === id);
    return (s && statuses.find((x) => memeStatut(x, s))?.id) ?? id;
  };
  const statutsDe = new Map(entites.map((e) => [e.id, e.data.statuses.map((s) => statut(e, s.id))]));

  // Sections : celles de chacune de mes entités ; un nom porté par plusieurs, avec celui de l'entité.
  const toutes = entites.flatMap((e) => e.data.sections.map((s) => ({ e, s })));
  const sections = toutes.map(({ e, s }) => ({
    ...s,
    id: idDans(e.id, s.id),
    nom: toutes.some((x) => x.e !== e && x.s.nom.trim().toLowerCase() === s.nom.trim().toLowerCase()) ? `${s.nom} (${e.nom})` : s.nom,
    sousSections: [...s.sousSections],
  }));

  const ou = new Map<string, OuTache>();
  const tasks: Task[] = [];
  const mes = new Set(entites.map((e) => e.id));
  for (const e of entites) {
    const P = (f: string) => personneDe(e.id, f);
    for (const t of e.data.tasks) {
      const u = t.source?.uniteId ?? e.id;
      const orig = t.source?.id ?? t.id;
      // Tâche de l'une de mes entités : prise chez elle ; partagée avec plusieurs des miennes : une fois.
      if ((u !== e.id && mes.has(u)) || !e.voit(t)) continue;
      const id = idPartagee(u, orig);
      if (ou.has(id)) continue;
      ou.set(id, { entite: e.id, id: t.id });
      const nomU = t.source?.unite ?? e.nom;
      const responsables = [
        ...t.responsables.map(P),
        ...(t.source?.responsables ?? []).map((f) => personneDe(u, f)),
        ...Object.entries(t.respPartage ?? {}).flatMap(([x, l]) => l.map((f) => personneDe(x, f))),
      ];
      tasks.push({
        ...t,
        id,
        sectionId: idDans(e.id, t.sectionId),
        statusId: statut(e, t.statusId),
        responsables: [...new Set(responsables)],
        createdBy: t.createdBy && P(t.createdBy),
        meetingId: t.meetingId && idDans(e.id, t.meetingId),
        eventId: t.eventId && idDans(e.id, t.eventId),
        parentId: t.parentId && (estPartagee(t.parentId) ? t.parentId : idPartagee(e.id, t.parentId)),
        pourInfo: pourInfoClub(t.pourInfo, e.id, personneDe),
        pourInfoVus: vusClub(t.pourInfoVus, e.id, personneDe),
        aPrendre: aPrendreClub(t.aPrendre, e.id, personneDe),
        paiement: t.paiement && paiementClub(t.paiement, P),
        source: {
          uniteId: u,
          unite: nomU,
          id: orig,
          responsables: [],
          complet: true,
          chezMoi: true,
          statuts: statutsDe.get(e.id),
          eventId: u === e.id ? t.eventId : t.source?.eventId,
          ...(u !== e.id ? { via: e.id } : {}),
        },
      });
    }
  }
  const tachesVues = new Set(tasks.map((t) => t.id));
  const emails: ScheduledEmail[] = entites.flatMap((e) =>
    (e.data.emails ?? [])
      .map((m) => ({ ...m, id: idDans(e.id, m.id), taskId: estPartagee(m.taskId) ? m.taskId : idPartagee(e.id, m.taskId), creePar: personneDe(e.id, m.creePar) }))
      .filter((m) => tachesVues.has(m.taskId)),
  );
  const meetings = entites.flatMap((e) => e.data.meetings.map((m) => ({ ...m, id: idDans(e.id, m.id) })));
  const events = entites.flatMap((e) => e.data.events.map((x) => ({ ...x, id: idDans(e.id, x.id) })));
  return {
    data: {
      people: [...people.values()],
      statuses,
      sections,
      tasks,
      meetings,
      events,
      roles: [],
      log: [],
      prefs: { [moi.id]: prefs },
      notifications: [],
      polls: [],
      emails,
      notifLues: {},
      discussionsLues: {},
    },
    ou,
    personneDe,
  };
}

const estPartagee = (id: string) => id.startsWith('x:');

/** « Pour info » vu du club : toutes les personnes mentionnées (de l'entité de la tâche et des autres), ensemble. */
function pourInfoClub(p: PourInfo | undefined, u: string, personneDe: (u: string, f: string) => string): PourInfo | undefined {
  if (!p) return undefined;
  const personnes = [...(p.personnes ?? []).map((f) => personneDe(u, f)), ...Object.entries(p.autres ?? {}).flatMap(([x, l]) => l.map((f) => personneDe(x, f)))];
  return { ...(personnes.length ? { personnes: [...new Set(personnes)] } : {}), ...(p.unites?.length ? { unites: p.unites } : {}) };
}

/** « ✓ Vu » vus du club : ceux des personnes (`p:`, `a:`), sous leur identifiant au club ; ceux des entités, tels quels. */
function vusClub(v: Record<string, VuPourInfo> | undefined, u: string, personneDe: (u: string, f: string) => string) {
  if (!v) return undefined;
  const out: Record<string, VuPourInfo> = {};
  for (const [k, x] of Object.entries(v)) {
    const [g, a, b] = k.split(':');
    const cle = g === 'p' ? `p:${personneDe(u, a)}` : g === 'a' ? `p:${personneDe(a, b)}` : k;
    if (!out[cle]) out[cle] = x;
  }
  return out;
}

/** À prendre vu du club : proposée à toutes ces personnes (de l'entité de la tâche et des entités du partage). */
function aPrendreClub(a: APrendre | undefined, u: string, personneDe: (u: string, f: string) => string): APrendre | undefined {
  if (!a) return undefined;
  const ailleurs = Object.entries(a.partage ?? {});
  const personnes = [...a.personnes.map((f) => personneDe(u, f)), ...ailleurs.flatMap(([x, p]) => p.personnes.map((f) => personneDe(x, f)))];
  const refus = [...(a.refus ?? []).map((f) => personneDe(u, f)), ...ailleurs.flatMap(([x, p]) => (p.refus ?? []).map((f) => personneDe(x, f)))];
  return {
    personnes: [...new Set(personnes)],
    ...(a.nombre ? { nombre: a.nombre } : {}),
    ...(refus.length ? { refus: [...new Set(refus)] } : {}),
    ...(a.par ? { par: personneDe(u, a.par) } : {}),
  };
}

/** Ticket vu du club : demandeur, visa, validation, refus et paiement, sous leur identifiant au club. */
function paiementClub(p: Paiement, P: (f: string) => string): Paiement {
  return {
    ...p,
    demandePar: p.demandePar && P(p.demandePar),
    ...(p.visa ? { visa: { ...p.visa, a: P(p.visa.a), par: p.visa.par && P(p.visa.par) } } : {}),
    ...(p.validation ? { validation: { ...p.validation, par: P(p.validation.par) } } : {}),
    ...(p.refus ? { refus: { ...p.refus, par: P(p.refus.par) } } : {}),
    ...(p.paye ? { paye: { ...p.paye, par: P(p.paye.par) } } : {}),
  };
}
