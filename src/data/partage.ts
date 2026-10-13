import { uid } from './utils';
import type { AppData, OrgMember, OrgUnit, PeriodeDependance, Person, Section, Status, TachePartagee, TachesDependance, Task, Unit, UnitType } from './types';

// Tâches partagées entre les entités du club. Une tâche reste dans son entité ; celle-ci peut la partager
// avec d'autres entités (comité central, sous-comités, groupes, équipes) : chacune la voit dans ses tâches et
// son ordre du jour, et la modifie comme les siennes (titre, délai, statut, responsables, remarque, checklist).
// Les modifications sont enregistrées dans l'entité de la tâche (démo : DemoApp ; version réelle : 019).
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
      respPartage: t.respPartage,
      modifiePar: t.modifiePar,
      source: { uniteId: x.uniteId, unite: x.unite, id: t.id, responsables: t.responsables ?? [] },
    });
  }
  return { ...data, sections, tasks: [...data.tasks, ...tasks] };
}

/**
 * Enregistrement depuis une entité du partage : la tâche affichée `t` (fiches de l'entité ouverte) → la tâche de son
 * entité (`orig`). Chaque responsable reste dans l'entité où il a une fiche : celle de la tâche d'abord, sinon
 * l'entité ouverte (respPartage). Ce qui n'est pas modifiable d'ici (documents, liens, répétition, partage) est gardé.
 */
export function versOrigine(
  orig: Task,
  t: Task,
  x: Pick<TachePartagee, 'uniteId' | 'statuts'>,
  ctx: { moi: string; statuses: Status[]; people: Person[]; units: OrgUnit[]; par: string; aujourdhui: string },
): Task {
  const { moi, people, units } = ctx;
  const local = (u: string, id: string) => ici(people, membre(units, u, id));
  const choisis = t.responsables;
  const garde = (u: string, ids: string[]) => ids.filter((id) => {
    const p = local(u, id);
    return !p || choisis.includes(p.id);
  });
  const responsables = garde(x.uniteId, orig.responsables);
  const respPartage: Record<string, string[]> = {};
  for (const [u, ids] of Object.entries(orig.respPartage ?? {})) {
    const g = u === moi ? [] : garde(u, ids);
    if (g.length) respPartage[u] = g;
  }
  const deja = new Set([
    ...responsables.map((id) => local(x.uniteId, id)?.id),
    ...Object.entries(respPartage).flatMap(([u, ids]) => ids.map((id) => local(u, id)?.id)),
  ]);
  const src = units.find((u) => u.id === x.uniteId)?.membres ?? [];
  const miens: string[] = [];
  for (const id of choisis) {
    if (deja.has(id)) continue;
    const p = people.find((y) => y.id === id);
    const m = p && src.find((y) => memePersonne(p, y));
    if (m) responsables.push(m.id);
    else if (p) miens.push(id);
  }
  if (miens.length) respPartage[moi] = miens;

  const avant = x.statuts.find((s) => s.id === orig.statusId);
  const choisi = ctx.statuses.find((s) => s.id === t.statusId);
  const statut = choisi && (statutCorrespondant(x.statuts, choisi) ?? avant);
  const statusId = statut?.id ?? orig.statusId;
  const fini = !!x.statuts.find((s) => s.id === statusId)?.done;
  const placePartage = { ...orig.placePartage };
  if (estPartagee(t.sectionId)) delete placePartage[moi];
  else placePartage[moi] = { sectionId: t.sectionId, sousSection: t.sousSection };
  const delaiChange = (t.delai ?? '') !== (orig.delai ?? '');
  return {
    ...orig,
    titre: t.titre,
    delai: t.delai,
    // Délai changé ici : il ne suit plus l'événement / la séance de l'autre entité.
    delaiRef: delaiChange ? undefined : orig.delaiRef,
    statusId,
    termineeLe: !fini ? undefined : avant?.done ? orig.termineeLe : ctx.aujourdhui,
    remarque: t.remarque,
    checklist: t.checklist,
    responsables,
    respPartage: Object.keys(respPartage).length ? respPartage : undefined,
    placePartage: Object.keys(placePartage).length ? placePartage : undefined,
    modifiePar: ctx.par,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Ce que le serveur garde d'une modification venue d'une entité du partage (même règle côté serveur, 019) :
 * les champs modifiables, le reste de la tâche d'origine.
 */
export function fusionPartagee(old: Task, t: Task, moi: string): Task {
  const placePartage = { ...old.placePartage };
  if (t.placePartage?.[moi]) placePartage[moi] = t.placePartage[moi];
  else delete placePartage[moi];
  return {
    ...old,
    titre: t.titre,
    delai: t.delai,
    delaiRef: t.delai !== old.delai ? undefined : old.delaiRef,
    statusId: t.statusId,
    termineeLe: t.termineeLe,
    remarque: t.remarque,
    checklist: t.checklist,
    responsables: t.responsables,
    respPartage: t.respPartage,
    placePartage: Object.keys(placePartage).length ? placePartage : undefined,
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
