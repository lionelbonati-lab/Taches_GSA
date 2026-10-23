import { uid } from './utils';
import { aPrendreVersOrigine, aPrendreVu } from './aPrendre';
import { pourInfoVersOrigine, pourInfoVu } from './pourInfo';
import type { AppData, Meeting, OrgMember, OrgUnit, PeriodeDependance, Person, Section, Status, TachePartagee, TachesDependance, Task, TaskDoc, Unit, UnitType } from './types';

// Tâches partagées entre les entités du club. Une tâche reste dans son entité ; celle-ci peut la partager
// avec d'autres entités (comité central, sous-comités, groupes, équipes) : chacune la voit dans ses tâches et
// son ordre du jour, et la modifie comme les siennes (titre, délai, statut, responsables, remarque, checklist ; depuis 040
// « À prendre » et « Pour info » ; depuis 041 documents, répétition, séance de l'entité qui la voit et partage).
// Les modifications sont enregistrées dans l'entité de la tâche (démo : DemoApp ; version réelle : 019, 030, 040, 041).
// Dans l'entité qui la reçoit, la tâche est rangée :
//   - d'un événement (sous-comité, équipe) : sous « Événements », dans la sous-section de l'événement ;
//   - sinon : sous la section qui porte le nom de l'entité (« École de cyclisme »…) ;
//   - à défaut : sous une section au nom de l'entité, ajoutée à l'affichage (rien n'est enregistré) ;
// sauf si l'entité lui choisit une autre section.
// Le comité dont une autre entité dépend (« Dépend de ») affiche de ses tâches ce que celle-ci a choisi
// (tachesDependance) : toutes, seulement celles partagées avec lui, ou aucune (même partagées) ; un événement dont tout
// le comité est responsable (aucun poste ne lui est lié ⛓) : toutes. Les autres entités : celles partagées avec elles.

/** Identifiants affichés des tâches partagées et des sections ajoutées pour elles (jamais enregistrés). */
export const estPartagee = (id: string) => id.startsWith('x:');
export const idPartagee = (uniteId: string, id: string) => `x:${uniteId}:${id}`;
const idSection = (nom: string) => `x:s:${norm(nom)}`;

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

/** Section des événements (« Événements », « Manifestations ») : les tâches partagées par un événement y sont rangées. */
export const estSectionEvenements = (nom: string) => /evenement|manifestation/.test(norm(nom));
/** Sous-section de l'événement `u` dans la section des événements (« Bruntrutaine 27.02.27 » pour « CO Bruntrutaine »), sinon son nom. */
export const sousSectionDe = (sousSections: string[], u: { nom: string }) => sousSections.find((x) => contientTout(x, u.nom)) ?? u.nom;
/** Entité dont la section `nom` porte le nom (même règle que placeAuto) : même nom, sinon tous les mots de son nom. */
export const entiteDeSection = <U extends { nom: string }>(nom: string, units: U[]): U | undefined =>
  units.find((u) => norm(u.nom) === norm(nom)) ?? units.find((u) => contientTout(nom, u.nom));

/** Entités avec qui la tâche est partagée (l'ancienne case « Transmettre au comité central » compte pour le comité central). */
export function partageDe(t: Pick<Task, 'partage' | 'auCentral'>, centralId?: string | null): string[] {
  const l = [...(t.partage ?? [])];
  if (t.auCentral && centralId && !l.includes(centralId)) l.push(centralId);
  return l;
}

/**
 * Tâche partagée (oui) ou plus partagée (non) avec l'entité `id`. Plus partagée : ses responsables et sa place dans cette
 * entité, et la séance de cette entité, sont retirés (le délai lié est à recalculer : applyDelaiRef).
 */
export function avecPartage<T extends Pick<Task, 'partage' | 'auCentral' | 'respPartage' | 'placePartage' | 'seanceComite'>>(x: T, id: string, oui: boolean, centralId?: string | null): T {
  const l = partageDe(x, centralId);
  const next = oui ? (l.includes(id) ? l : [...l, id]) : l.filter((y) => y !== id);
  const respPartage = { ...x.respPartage };
  const placePartage = { ...x.placePartage };
  if (!oui) {
    delete respPartage[id];
    delete placePartage[id];
  }
  return {
    ...x,
    seanceComite: !oui && x.seanceComite?.uniteId === id ? undefined : x.seanceComite,
    partage: next.length ? next : undefined,
    auCentral: undefined,
    respPartage: Object.keys(respPartage).length ? respPartage : undefined,
    placePartage: Object.keys(placePartage).length ? placePartage : undefined,
  };
}

/** Les trois choix de tachesDependance (sans choix : « partagees »). */
export const TACHES_DEPENDANCE: Record<TachesDependance, { label: string; aide: (parent: string) => string }> = {
  toutes: { label: 'Afficher les tâches', aide: (p) => `Toutes ses tâches s’affichent aussi dans « ${p} » (liste des tâches, ordre du jour, PV), qui peut les modifier.` },
  partagees: { label: 'Afficher uniquement les tâches partagées', aide: (p) => `Seules les tâches partagées avec « ${p} » s’y affichent.` },
  rien: { label: 'Ne rien afficher', aide: (p) => `Aucune de ses tâches ne s’affiche dans « ${p} », même partagée avec lui.` },
};

/**
 * Ce que l'entité `moi` voit de la tâche `t` de l'entité `u` (même règle que le serveur : gsa_tache_dans, 030) :
 *   'modifiable' : dans sa liste des tâches, son ordre du jour et son PV, modifiable comme une tâche partagée ;
 *   'ancienne'   : ancienne tâche (d'avant que `u` dépende de `moi`) : lecture et copie seulement ;
 *   null         : rien.
 * `parent` : l'entité dont `u` dépend (parentDans) ; `reglage` : ce qu'elle y affiche (reglageTaches). Une tâche de la
 * période où `u` dépendait d'un autre comité reste à ce comité, selon le réglage d'alors (historiqueDependance).
 * Jamais les tickets (remboursements, factures).
 */
export function tacheDans(
  t: Pick<Task, 'id' | 'partage' | 'auCentral' | 'paiement'>,
  u: Pick<Unit, 'parentId' | 'historiqueDependance'>,
  parent: string | undefined,
  moi: string,
  reglage: TachesDependance,
): 'modifiable' | 'ancienne' | null {
  if (t.paiement) return null;
  const partagee = partageDe(t, u.parentId).includes(moi);
  const h: PeriodeDependance[] = u.historiqueDependance ?? [];
  const selon = (r: TachesDependance) => (r === 'toutes' || (r === 'partagees' && partagee) ? 'modifiable' : null);
  for (let k = h.length - 1; k >= 0; k--)
    if (h[k].comite === moi && h[k].taches.includes(t.id) && !(k > 0 && h[k - 1].taches.includes(t.id))) return selon(h[k].reglage);
  if (parent === moi) {
    const derniere = h[h.length - 1];
    if (derniere?.taches.includes(t.id)) {
      if (partagee && reglage !== 'rien') return 'modifiable';
      return derniere.copie ? 'ancienne' : null;
    }
    return selon(reglage);
  }
  return partagee ? 'modifiable' : null;
}

/** La tâche `t` de l'entité `u` s'affiche-t-elle (modifiable) dans l'entité `moi` ? Voir tacheDans. */
export const visibleDans = (...a: Parameters<typeof tacheDans>) => tacheDans(...a) === 'modifiable';

/** Ancienne période de dépendance : « jusqu'au jj.mm.aaaa ». */
export const dateCourte = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

/**
 * Copie d'une ancienne tâche dans l'entité ouverte : une tâche à elle, indépendante (titre, remarque, checklist, délai,
 * statut et responsables retrouvés ici), sans pièces jointes ni liens, avec la mention de son origine.
 */
export function copieAncienne(x: TachePartagee, d: Pick<AppData, 'statuses' | 'people'>, ctx: { units: OrgUnit[]; moi: string; sectionId: string; sousSection: string; par: string; aujourdhui: string }): Task {
  const t = x.task;
  const st = statutCorrespondant(d.statuses, x.statuts.find((s) => s.id === t.statusId)) ?? d.statuses[0];
  const responsables = [...new Set((t.responsables ?? []).map((id) => ici(d.people, membre(ctx.units, x.uniteId, id))?.id).filter((y): y is string => !!y))];
  return {
    id: uid('t'),
    sectionId: ctx.sectionId,
    sousSection: ctx.sousSection,
    titre: t.titre ?? '',
    responsables,
    statusId: st?.id ?? '',
    delai: t.delai ?? '',
    remarque: t.remarque ?? '',
    checklist: Array.isArray(t.checklist) ? t.checklist.map((c) => ({ ...c })) : [],
    termineeLe: st?.done ? (t.termineeLe ?? ctx.aujourdhui) : undefined,
    createdBy: ctx.par,
    updatedAt: new Date().toISOString(),
    copieDe: { comite: x.ancienne?.comite ?? '', entite: x.unite, le: ctx.aujourdhui, uniteId: x.uniteId, tache: t.id },
  };
}

type SectionLue = Pick<Section, 'id' | 'nom'> & { sousSections?: string[] };
/** Place automatique d'une tâche partagée dans les sections de l'entité qui la reçoit. */
export function placeAuto<S extends SectionLue>(sections: S[], u: { nom: string; type: UnitType }): { section?: S; nomSection: string; sousSection: string } {
  if (estEvenement(u.type)) {
    const ev = sections.find((s) => estSectionEvenements(s.nom));
    if (ev) return { section: ev, nomSection: ev.nom, sousSection: sousSectionDe(ev.sousSections ?? [], u) };
  }
  const section = sections.find((s) => norm(s.nom) === norm(u.nom)) ?? sections.find((s) => contientTout(s.nom, u.nom));
  return { section, nomSection: section?.nom ?? u.nom, sousSection: '' };
}

/** Où la tâche apparaîtra dans le comité central (seule entité dont les sections sont connues des autres, sans leurs sous-sections). */
export function libellePlace(sections: SectionLue[], u: { nom: string; type: UnitType }) {
  const p = placeAuto(sections, u);
  return p.sousSection ? `sous « ${p.nomSection} » (${u.nom})` : `sous « ${p.nomSection} »`;
}

/** Statut correspondant dans une autre entité : même nom, sinon même état (terminé ou non). */
export function statutCorrespondant<S extends Pick<Status, 'id' | 'label' | 'done'>>(list: S[], s?: Pick<Status, 'label' | 'done'>): S | undefined {
  if (!s) return undefined;
  return list.find((x) => norm(x.label) === norm(s.label) && x.done === s.done) ?? list.find((x) => x.done === s.done);
}

/** Même personne dans deux entités : même fiche du registre « Membres du club », ou même adresse email. */
export const memePersonne = (a: { membreId?: string; email: string }, b: { membreId?: string; email: string }) =>
  (!!a.membreId && a.membreId === b.membreId) || (!!a.email.trim() && a.email.trim().toLowerCase() === b.email.trim().toLowerCase());
const membre = (units: OrgUnit[], uniteId: string, id: string) => units.find((u) => u.id === uniteId)?.membres.find((m) => m.id === id);
/** Fiche de l'entité ouverte d'une personne d'une autre entité. */
const ici = (people: Person[], m?: OrgMember) => (m ? people.find((p) => p.actif && memePersonne(p, m)) : undefined);

/** Responsables de toutes les entités, ramenés aux fiches de l'entité ouverte (ceux qui en ont une). */
function responsablesIci(t: Task, uniteId: string, moi: string, people: Person[], units: OrgUnit[]) {
  const ids = [
    ...t.responsables.map((id) => ici(people, membre(units, uniteId, id))?.id),
    ...(t.respPartage?.[moi] ?? []).filter((id) => people.some((p) => p.id === id)),
    ...Object.entries(t.respPartage ?? {})
      .filter(([u]) => u !== moi)
      .flatMap(([u, l]) => l.map((id) => ici(people, membre(units, u, id))?.id)),
  ];
  return [...new Set(ids.filter((x): x is string => !!x))];
}

/** Fichier d'une autre entité vu d'ici : « <entité>/<fichier> » (ceux déposés depuis une entité du partage le sont déjà). */
const idFichierVu = (src: string, id: string) => (id.includes('/') ? id : `${src}/${id}`);
const idVu = (src: string, d: TaskDoc) => (d.kind === 'fichier' ? idFichierVu(src, d.id) : d.id);

/** Documents d'une tâche partagée vus de l'entité ouverte : fichiers avec leur dossier, auteur nommé (« Prénom Nom (Entité) »). */
function docsVus(docs: TaskDoc[] | undefined, x: Pick<TachePartagee, 'uniteId' | 'unite'>, units: OrgUnit[]): TaskDoc[] | undefined {
  if (!Array.isArray(docs) || !docs.length) return undefined;
  return docs.map((d) => {
    const m = d.par ? membre(units, x.uniteId, d.par) : undefined;
    return { ...d, id: idVu(x.uniteId, d), par: '', parNom: d.parNom ?? (m ? `${`${m.prenom} ${m.nom}`.trim()} (${x.unite})` : undefined) };
  });
}

/**
 * Documents enregistrés depuis l'entité ouverte (même règle côté serveur : gsa_docs_partagee, 041) : ceux de la tâche
 * restent tels quels (ou sont retirés) ; les nouveaux (liens, fichiers « <entité>/pt-… ») sont au nom de `par`.
 */
export function docsVersOrigine(orig: TaskDoc[] | undefined, vus: TaskDoc[] | undefined, src: string, par: string): TaskDoc[] {
  const out: TaskDoc[] = [];
  for (const d of vus ?? []) {
    const o = (orig ?? []).find((y) => idVu(src, y) === d.id);
    if (out.some((y) => y.id === (o ?? d).id)) continue;
    out.push(o ?? { ...d, par: '', parNom: par });
  }
  return out;
}

/** Séance à laquelle la tâche de l'entité `x` est liée, hors de l'entité `moi` (pas modifiable d'ici). */
function seanceAilleurs(t: Task, x: Pick<TachePartagee, 'unite'>, moi: string, units: OrgUnit[]) {
  if (t.meetingId) return `une séance de « ${x.unite} »`;
  const s = t.seanceComite;
  if (!s || s.uniteId === moi) return undefined;
  return `« ${s.titre} »${s.date ? ` (${dateCourte(s.date)})` : ''} de « ${units.find((u) => u.id === s.uniteId)?.nom ?? '?'} »`;
}

/** Données affichées de l'entité `moi` avec les tâches que d'autres entités lui partagent (et les sections ajoutées pour elles). */
export function avecPartagees(data: AppData, list: TachePartagee[], moi: string, units: OrgUnit[]): AppData {
  if (!list.length) return data;
  const sections = data.sections.map((s) => ({ ...s, sousSections: [...s.sousSections] }));
  const tasks: Task[] = [];
  for (const x of list) {
    const t = x.task;
    const choisie = t.placePartage?.[moi];
    let sec = choisie && sections.find((s) => s.id === choisie.sectionId);
    let sous = sec ? choisie!.sousSection : '';
    if (!sec) {
      const p = placeAuto(data.sections, { nom: x.unite, type: x.type });
      sec = sections.find((s) => s.id === (p.section?.id ?? idSection(p.nomSection)));
      if (!sec) {
        sec = { id: idSection(p.nomSection), nom: p.nomSection, sousSections: [] };
        sections.push(sec);
      }
      sous = p.sousSection;
    }
    if (sous && !sec.sousSections.includes(sous)) sec.sousSections.push(sous);
    const st = statutCorrespondant(data.statuses, x.statuts.find((s) => s.id === t.statusId)) ?? data.statuses[0];
    tasks.push({
      id: idPartagee(x.uniteId, t.id),
      sectionId: sec.id,
      sousSection: sous,
      titre: t.titre ?? '',
      responsables: responsablesIci({ ...t, responsables: t.responsables ?? [] }, x.uniteId, moi, data.people, units),
      statusId: st?.id ?? '',
      delai: t.delai ?? '',
      remarque: t.remarque ?? '',
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
      termineeLe: t.termineeLe,
      // Liée à une séance de l'entité ouverte (comité dont son entité dépend) : à l'ordre du jour et au PV de celle-ci.
      meetingId: t.seanceComite?.uniteId === moi ? t.seanceComite.id : undefined,
      createdBy: '',
      updatedAt: t.updatedAt ?? '',
      partage: t.partage,
      auCentral: t.auCentral,
      respPartage: t.respPartage,
      modifiePar: t.modifiePar,
      // À prendre et Pour info (040) : ceux de l'entité ouverte comme les siens ; les autres, à part.
      aPrendre: aPrendreVu(t.aPrendre, x.uniteId, moi),
      pourInfo: pourInfoVu(t.pourInfo, x.uniteId, moi),
      // Documents et répétition (041).
      documents: docsVus(t.documents, x, units),
      recurrence: t.recurrence,
      source: {
        uniteId: x.uniteId,
        unite: x.unite,
        id: t.id,
        responsables: t.responsables ?? [],
        complet: (x.v ?? 0) >= 41,
        seanceAilleurs: seanceAilleurs(t, x, moi, units),
      },
    });
  }
  return { ...data, sections, tasks: [...data.tasks, ...tasks] };
}

/**
 * Enregistrement depuis une entité du partage : la tâche affichée `t` (fiches de l'entité ouverte) → la tâche de son
 * entité (`orig`). Chaque responsable reste dans l'entité où il a une fiche : celle de la tâche d'abord, sinon
 * l'entité ouverte (respPartage). À prendre : les propositions de l'entité ouverte ; Pour info : la liste (040).
 * Serveur à jour (041) : documents, répétition, séance de l'entité ouverte (`meetingId` ici ↔ seanceComite) et partage
 * avec d'autres entités (l'entité ouverte reste comme elle était) ; sinon, gardés. Le reste (événement, tâche principale)
 * est gardé.
 */
export function versOrigine(
  orig: Task,
  t: Task,
  x: Pick<TachePartagee, 'uniteId' | 'statuts' | 'v'>,
  ctx: { moi: string; statuses: Status[]; people: Person[]; units: OrgUnit[]; par: string; aujourdhui: string; meetings?: Meeting[]; centralId?: string },
): Task {
  const { moi, people, units } = ctx;
  const local = (u: string, id: string) => ici(people, membre(units, u, id));
  const choisis = t.responsables;
  const garde = (u: string, ids: string[]) => ids.filter((id) => {
    const p = local(u, id);
    return !p || choisis.includes(p.id);
  });
  const src = units.find((u) => u.id === x.uniteId)?.membres ?? [];
  // Personnes de l'entité de la tâche sans fiche ici : choisies d'ici aussi (t.source.responsables, ses fiches à elle).
  const leurs = t.source?.responsables;
  const responsables = garde(x.uniteId, orig.responsables).filter((id) => !leurs || !!local(x.uniteId, id) || leurs.includes(id));
  for (const id of leurs ?? []) if (!responsables.includes(id) && !local(x.uniteId, id) && src.some((m) => m.id === id)) responsables.push(id);
  const respPartage: Record<string, string[]> = {};
  for (const [u, ids] of Object.entries(orig.respPartage ?? {})) {
    // Ceux d'ici restent ici (une place « à prendre » prise ici se compte ici : 040).
    const g = u === moi ? ids.filter((id) => choisis.includes(id)) : garde(u, ids);
    if (g.length) respPartage[u] = g;
  }
  const deja = new Set([
    ...responsables.map((id) => local(x.uniteId, id)?.id),
    ...Object.entries(respPartage).flatMap(([u, ids]) => ids.map((id) => (u === moi ? id : local(u, id)?.id))),
  ]);
  const miens: string[] = [];
  for (const id of choisis) {
    if (deja.has(id)) continue;
    const p = people.find((y) => y.id === id);
    const m = p && src.find((y) => memePersonne(p, y));
    if (m) responsables.push(m.id);
    else if (p) miens.push(id);
  }
  if (miens.length) respPartage[moi] = [...(respPartage[moi] ?? []), ...miens];

  const avant = x.statuts.find((s) => s.id === orig.statusId);
  const choisi = ctx.statuses.find((s) => s.id === t.statusId);
  const statut = choisi && (statutCorrespondant(x.statuts, choisi) ?? avant);
  const statusId = statut?.id ?? orig.statusId;
  const fini = !!x.statuts.find((s) => s.id === statusId)?.done;
  const placePartage = { ...orig.placePartage };
  if (estPartagee(t.sectionId)) delete placePartage[moi];
  else placePartage[moi] = { sectionId: t.sectionId, sousSection: t.sousSection };
  const delaiChange = (t.delai ?? '') !== (orig.delai ?? '');
  // Délai changé ici : il ne suit plus l'événement / la séance de l'autre entité.
  let delaiRef = delaiChange ? undefined : orig.delaiRef;
  let plus: Partial<Task> = {};
  if ((x.v ?? 0) >= 41) {
    // Partage (041) : avec d'autres entités ; l'entité ouverte reste comme elle était. Une entité retirée : ses responsables,
    // sa place et sa séance aussi.
    const avant = partageDe(orig, ctx.centralId);
    const partage = partageDe(t, ctx.centralId).filter((id) => id !== moi && id !== x.uniteId);
    if (avant.includes(moi)) partage.push(moi);
    const retirees = avant.filter((id) => !partage.includes(id));
    for (const id of retirees) {
      delete respPartage[id];
      delete placePartage[id];
    }
    // Séance (041) : une séance d'ici, si la tâche n'est liée ni à une séance de son entité ni à celle d'une autre.
    let seanceComite = orig.seanceComite && retirees.includes(orig.seanceComite.uniteId) ? undefined : orig.seanceComite;
    if (!orig.meetingId && (!orig.seanceComite || orig.seanceComite.uniteId === moi)) {
      const m = t.meetingId ? ctx.meetings?.find((y) => y.id === t.meetingId) : undefined;
      seanceComite = m ? { uniteId: moi, id: m.id, titre: m.titre, date: m.date } : undefined;
    }
    if (orig.seanceComite && !seanceComite && !orig.meetingId && delaiRef?.type === 'meeting') delaiRef = undefined;
    plus = {
      documents: docsVersOrigine(orig.documents, t.documents, x.uniteId, ctx.par),
      // « À chaque séance » : les séances de son entité ; seulement si elle l'était déjà.
      recurrence: t.recurrence === 'seance' && orig.recurrence !== 'seance' ? orig.recurrence : t.recurrence,
      partage: partage.length ? partage : undefined,
      auCentral: undefined,
      seanceComite,
    };
  }
  return {
    ...orig,
    ...plus,
    titre: t.titre,
    delai: t.delai,
    delaiRef,
    statusId,
    termineeLe: !fini ? undefined : avant?.done ? orig.termineeLe : ctx.aujourdhui,
    remarque: t.remarque,
    checklist: t.checklist,
    responsables,
    respPartage: Object.keys(respPartage).length ? respPartage : undefined,
    placePartage: Object.keys(placePartage).length ? placePartage : undefined,
    aPrendre: aPrendreVersOrigine(orig.aPrendre, t.aPrendre, moi, respPartage[moi]),
    pourInfo: pourInfoVersOrigine(orig.pourInfo, t.pourInfo, x.uniteId, moi),
    modifiePar: ctx.par,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Ce que le serveur garde d'une modification venue d'une entité du partage (même règle côté serveur : 019, 030, 040, 041) :
 * les champs modifiables, le reste de la tâche d'origine. `ctx` (démo) : entités du club, comité central, séances de
 * l'entité `moi`.
 */
export function fusionPartagee(
  old: Task,
  t: Task,
  moi: string,
  src = '',
  ctx: { entites?: Pick<Unit, 'id' | 'archive'>[]; centralId?: string; meetings?: Meeting[] } = {},
): Task {
  const placePartage = { ...old.placePartage };
  if (t.placePartage?.[moi]) placePartage[moi] = t.placePartage[moi];
  else delete placePartage[moi];
  // À prendre (040) : d'ici, les propositions d'ici et le nombre ; leurs « Pas dispo » restent ceux d'avant.
  const ici = t.aPrendre?.partage?.[moi];
  const aPrendre = aPrendreVersOrigine(old.aPrendre, t.aPrendre && { ...t.aPrendre, personnes: ici?.personnes ?? [], par: ici?.par }, moi, t.respPartage?.[moi]);
  // Pour info (040) : la liste, sans l'entité de la tâche elle-même.
  const p = t.pourInfo;
  const pourInfo = p && {
    ...p,
    unites: p.unites?.filter((u) => u !== src),
    autres: p.autres && Object.fromEntries(Object.entries(p.autres).filter(([u]) => u !== src)),
  };
  // Documents (041) : ceux de la tâche tels quels ; d'ici, des liens http(s) et des fichiers « <entité>/pt-… ».
  let documents = old.documents;
  if (Array.isArray(t.documents)) {
    const out: TaskDoc[] = [];
    for (const d of t.documents) {
      if (out.some((y) => y.id === d.id)) continue;
      const o = old.documents?.find((y) => y.id === d.id);
      if (o) out.push(o);
      else if (d.kind === 'lien' && /^https?:\/\/\S+$/i.test(d.url ?? '')) out.push({ ...d, par: '', parNom: t.modifiePar ?? '?' });
      else if (d.kind === 'fichier' && d.id.startsWith(`${src}/pt-`)) out.push({ ...d, par: '', parNom: t.modifiePar ?? '?' });
      else throw new Error(d.kind === 'lien' ? `Lien invalide : « ${d.nom || d.url} »` : `Fichier introuvable : « ${d.nom} » ; ajoute-le à nouveau`);
    }
    documents = out.length ? out : undefined;
  }
  // Répétition (041) : « à chaque séance » (les séances de son entité) seulement si elle l'était.
  const recurrence = t.recurrence === 'seance' && old.recurrence !== 'seance' ? undefined : t.recurrence;
  // Partage (041) : entités du club (pas l'entité de la tâche ; une archivée si elle y était) ; `moi` reste comme avant.
  const avant = partageDe(old, ctx.centralId);
  const partage = [...new Set(partageDe(t, ctx.centralId))].filter(
    (id) => id !== moi && id !== src && ctx.entites?.some((u) => u.id === id && (!u.archive || avant.includes(id))),
  );
  if (avant.includes(moi)) partage.push(moi);
  let seanceComite = old.seanceComite && avant.includes(old.seanceComite.uniteId) && !partage.includes(old.seanceComite.uniteId) ? undefined : old.seanceComite;
  let delaiRef = t.delai !== old.delai ? undefined : old.delaiRef;
  if (old.seanceComite && !seanceComite && !old.meetingId && delaiRef?.type === 'meeting') delaiRef = undefined;
  // Séance (041) : une séance de `moi`, si la tâche n'est liée ni à une séance de son entité ni à celle d'une autre.
  if (!old.meetingId && (!old.seanceComite || old.seanceComite.uniteId === moi)) {
    const m = t.seanceComite?.uniteId === moi ? ctx.meetings?.find((y) => y.id === t.seanceComite!.id) : undefined;
    seanceComite = m ? { uniteId: moi, id: m.id, titre: m.titre, date: m.date } : undefined;
    if (old.seanceComite && !m && delaiRef?.type === 'meeting') delaiRef = undefined;
  }
  return {
    ...old,
    titre: t.titre,
    delai: t.delai,
    delaiRef,
    statusId: t.statusId,
    termineeLe: t.termineeLe,
    remarque: t.remarque,
    checklist: t.checklist,
    responsables: t.responsables,
    respPartage: t.respPartage,
    placePartage: Object.keys(placePartage).length ? placePartage : undefined,
    aPrendre: old.paiement ? old.aPrendre : aPrendre,
    pourInfo: old.paiement ? old.pourInfo : pourInfo,
    documents,
    recurrence,
    partage: partage.length ? partage : undefined,
    auCentral: undefined,
    seanceComite,
    modifiePar: t.modifiePar,
    updatedAt: t.updatedAt,
  };
}

/** Responsables hors de l'entité ouverte (sans fiche ici), par entité : « Prénom Nom (Entité) ». */
export function autresResponsables(t: Task, moi: string, people: Person[], units: OrgUnit[]): { unite: string; noms: string[] }[] {
  const groupes: { unite: string; noms: string[] }[] = [];
  const ajoute = (uniteId: string, ids: string[]) => {
    const u = units.find((x) => x.id === uniteId);
    const noms = ids
      .map((id) => u?.membres.find((m) => m.id === id))
      .filter((m): m is OrgMember => !!m && !ici(people, m))
      .map((m) => `${m.prenom} ${m.nom}`.trim());
    if (u && noms.length) groupes.push({ unite: u.nom, noms });
  };
  if (t.source) ajoute(t.source.uniteId, t.source.responsables);
  for (const [u, ids] of Object.entries(t.respPartage ?? {})) if (u !== moi) ajoute(u, ids);
  return groupes;
}

export const texteAutres = (l: { unite: string; noms: string[] }[]) => l.map((g) => `${g.noms.join(', ')} (${g.unite})`).join(' · ');
