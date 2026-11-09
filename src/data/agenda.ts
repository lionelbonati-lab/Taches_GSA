import type { AppData, ContenuOdj, Meeting, PvSettings, Section, Task } from './types';
import { addDays, finLe, isDone, today } from './utils';
import { shortDate } from './minutes';

// Sélection des points de l'ordre du jour d'une séance, partagée par les onglets Ordre du jour et PV.

export interface AgendaOptions {
  retards: boolean;
  avantProchaine: boolean;
  avantSuivante: boolean;
  bilan: boolean;
  statutsExclus: string[];
  sectionsExclues: string[];
  /** Aussi les tâches dont l'échéance tombe jusqu'à N jours après la séance suivante. */
  joursApres?: number;
  /** Jour de référence des retards (le jour de la séance, pour un PV figé) ; défaut : aujourd'hui. */
  jour?: string;
  /** Points retirés de l'ordre du jour de la séance (`Meeting.odjRetires`) : laissés de côté. */
  retires?: string[];
}

/** Points (tâches, sondages) retirés de l'ordre du jour d'une séance : ni dans l'ordre du jour, ni dans le PV. */
export const retiresDe = (s1?: Meeting) => new Set(s1?.odjRetires ?? []);

export const FULL_AGENDA: AgendaOptions = {
  retards: true,
  avantProchaine: true,
  avantSuivante: true,
  bilan: true,
  statutsExclus: [],
  sectionsExclues: [],
};

/** Réglages de l'ordre du jour qui décident de ses points et de leur ordre, à l'origine : tout, par délai, sous-sections. */
export const CONTENU_ODJ: ContenuOdj = {
  parts: { retards: true, avantProchaine: true, avantSuivante: true, bilan: true, sondages: true },
  statutsExclus: [],
  sectionsExclues: [],
  tri: 'delai',
  colonnes: { sousSection: true, checklist: true, pourInfo: true },
};

/** Les réglages d'ordre du jour (ceux d'une personne, d'un profil, ou communs) qui décident de ses points. */
export function contenuDe(p?: Partial<PvSettings> | Partial<ContenuOdj>): ContenuOdj {
  const parts = { ...CONTENU_ODJ.parts, ...p?.parts };
  const colonnes = { ...CONTENU_ODJ.colonnes, ...p?.colonnes };
  return {
    parts: { retards: parts.retards, avantProchaine: parts.avantProchaine, avantSuivante: parts.avantSuivante, bilan: parts.bilan, sondages: parts.sondages },
    statutsExclus: [...(p?.statutsExclus ?? [])],
    sectionsExclues: [...(p?.sectionsExclues ?? [])],
    tri: p?.tri ?? CONTENU_ODJ.tri,
    colonnes: { sousSection: colonnes.sousSection, checklist: colonnes.checklist, pourInfo: colonnes.pourInfo ?? true },
  };
}

/**
 * Réglages de l'ordre du jour communs au club (ReglagesOdj.contenu), que le PV reprend. Pas encore enregistrés : ceux de
 * la personne qui prépare l'ordre du jour (la première qui a la page Ordre du jour et l'a réglé), sinon ceux d'origine.
 */
export function reglagesCommunsOdj(data: AppData): ContenuOdj {
  if (data.reglagesOdj?.contenu) return contenuDe(data.reglagesOdj.contenu);
  const prepare = data.people.find(
    (p) => p.actif && !!data.prefs[p.id]?.pv && p.roles.some((r) => data.roles.find((x) => x.id === r)?.permissions.includes('tab.pv')),
  );
  return contenuDe(prepare ? data.prefs[prepare.id]?.pv : undefined);
}

/** Options de sélection des points selon ces réglages. */
export const optionsDuContenu = (c: ContenuOdj, o?: Pick<AgendaOptions, 'joursApres' | 'jour' | 'retires'>): AgendaOptions => ({
  retards: c.parts.retards,
  avantProchaine: c.parts.avantProchaine,
  avantSuivante: c.parts.avantSuivante,
  bilan: c.parts.bilan,
  statutsExclus: c.statutsExclus,
  sectionsExclues: c.sectionsExclues,
  ...o,
});

/** Où en est un point de l'ordre du jour : en retard, pour la séance, pour la suivante, terminé depuis la précédente. */
export type Echeance = 'late' | 'p1' | 'p2' | 'bilan';
const RANG: Record<Echeance, number> = { late: 0, p1: 1, p2: 2, bilan: 3 };

/**
 * Ordre des points d'une section, le même dans l'ordre du jour et le PV : sous-sections dans l'ordre de la section (les
 * points sans sous-section d'abord), puis en retard → séance → suivante → terminés, puis le tri choisi pour l'ordre du
 * jour (délai, statut ou titre). À égalité, l'ordre de la liste reçue.
 */
export function ordreSection(data: AppData, list: Task[], sec: Section, echeance: (t: Task) => Echeance | undefined, tri: PvSettings['tri'] = 'delai'): Task[] {
  const statut = (t: Task) => data.statuses.findIndex((x) => x.id === t.statusId);
  const delai = (a: Task, b: Task) => (a.delai || '9999').localeCompare(b.delai || '9999');
  const parTri = (a: Task, b: Task) => (tri === 'statut' ? statut(a) - statut(b) || delai(a, b) : tri === 'titre' ? a.titre.localeCompare(b.titre, 'fr') : delai(a, b));
  const rang = (t: Task) => RANG[echeance(t) ?? 'p1'];
  return [...list].sort((a, b) => sec.sousSections.indexOf(a.sousSection) - sec.sousSections.indexOf(b.sousSection) || rang(a) - rang(b) || parTri(a, b));
}

/** Bloc d'une section du PV : une sous-section et ses points, ou un point seul (`label` vide). */
export interface BlocPv {
  key: string;
  label: string;
  tasks: Task[];
}

/**
 * Points d'une section (déjà dans l'ordre de `ordreSection`) groupés comme dans l'ordre du jour : un point sans
 * sous-section forme son propre bloc, ceux d'une sous-section se suivent sous elle (bloc placé au premier d'entre eux) ;
 * le point qui porte le nom de sa sous-section vient en tête du bloc (c'est la ligne de la sous-section dans l'ordre du
 * jour) ; un point rattaché dont le point principal est dans la section suit celui-ci, même s'il est rangé ailleurs.
 * `sousSections` : faux si l'ordre du jour n'affiche pas les sous-sections (chaque point seul, dans l'ordre).
 */
export function blocsSection(ordonnes: Task[], sousSections = true): BlocPv[] {
  const ids = new Set(ordonnes.map((t) => t.id));
  const sousParent = (t: Task) => !!t.parentId && t.parentId !== t.id && ids.has(t.parentId);
  const blocs: BlocPv[] = [];
  const tetes = new Set<string>();
  for (const t of ordonnes) {
    if (sousParent(t)) continue;
    const sub = sousSections ? t.sousSection : '';
    if (!sub) {
      blocs.push({ key: `__${t.id}`, label: '', tasks: [t] });
      continue;
    }
    let b = blocs.find((x) => x.key === sub);
    if (!b) blocs.push((b = { key: sub, label: sub, tasks: [] }));
    if (!tetes.has(sub) && t.titre.trim().toLowerCase() === sub.trim().toLowerCase()) {
      tetes.add(sub);
      b.tasks.unshift(t);
    } else b.tasks.push(t);
  }
  // Rattachés : après leur point principal et ceux déjà placés sous lui ; sous le point en tête d'une sous-section, à la
  // fin du bloc (dans l'ordre du jour, ils suivent les autres points de la sous-section).
  for (const t of ordonnes.filter(sousParent)) {
    const b = blocs.find((x) => x.tasks.some((y) => y.id === t.parentId));
    if (!b) continue;
    if (b.label && b.tasks[0].id === t.parentId && tetes.has(b.label)) {
      b.tasks.push(t);
      continue;
    }
    let i = b.tasks.findIndex((y) => y.id === t.parentId) + 1;
    while (i < b.tasks.length && b.tasks[i].parentId === t.parentId) i++;
    b.tasks.splice(i, 0, t);
  }
  return blocs;
}

export const sortedMeetings = (data: AppData) => [...data.meetings].sort((a, b) => a.date.localeCompare(b.date));

/** Séance précédente (s0) et suivante (s2) d'une séance. */
export function meetingContext(data: AppData, s1?: Meeting) {
  const meetings = sortedMeetings(data);
  const after = meetings.filter((m) => s1 && m.date > s1.date);
  const s0 = s1 ? [...meetings].reverse().find((m) => m.date < s1.date) : undefined;
  return { meetings, after, s0, s2: after[0] as Meeting | undefined };
}

/** Marges proposées après la séance suivante (jours). */
export const JOURS_APRES = [0, 3, 7, 14, 21, 30];
export const joursApresTexte = (n: number) => (n === 0 ? 'non' : n % 7 === 0 ? `${n / 7} semaine${n > 7 ? 's' : ''}` : n === 30 ? '1 mois' : `${n} jours`);

/**
 * Échéance d'une tâche retenue pour la séance suivante s2 : « pour le … » à sa date, « après le … » peu après (marge
 * « joursApres »). Avant elle (entre les deux séances), rien : seulement la date, la séance suivante serait trop tard.
 */
export const echeanceSuivante = (t: Task, s2: Meeting) =>
  !t.delai || t.delai === s2.date ? `pour le ${s2.titre}` : t.delai > s2.date ? `après le ${s2.titre}` : '';

/**
 * Tâches de l'ordre du jour de la séance s1 :
 * en retard, à faire d'ici s1, d'ici la séance suivante s2 (et peu après : « joursApres »), terminées depuis la séance précédente s0.
 */
export function selectAgenda(data: AppData, s0: Meeting | undefined, s1: Meeting | undefined, s2: Meeting | undefined, o: AgendaOptions) {
  const eligible = (t: Task) => !o.sectionsExclues.includes(t.sectionId) && !o.retires?.includes(t.id);
  const open = data.tasks.filter((t) => !isDone(data, t) && eligible(t) && !o.statutsExclus.includes(t.statusId));
  const jour = o.jour ?? today();
  const late = o.retards ? open.filter((t) => !!t.delai && t.delai < jour) : [];
  const rest = open.filter((t) => !late.includes(t));
  const avant1 = s1 && o.avantProchaine ? rest.filter((t) => t.meetingId === s1.id || !t.delai || t.delai <= s1.date) : [];
  const avant2 =
    s2 && o.avantSuivante
      ? rest.filter((t) => !avant1.includes(t) && (t.meetingId === s2.id || (!!t.delai && t.delai <= addDays(s2.date, o.joursApres ?? 0))))
      : [];
  const since = s0?.date ?? addDays(jour, -60);
  const bilan = o.bilan
    ? data.tasks.filter(
        (t) => isDone(data, t) && eligible(t) && finLe(t) >= since && data.statuses.find((x) => x.id === t.statusId)?.label !== 'Info',
      )
    : [];
  return { late, avant1, avant2, bilan, since };
}

/**
 * Tâche terminée de l'ordre du jour et du PV : « ✓ fait (le …) » pour le premier statut terminé (« Terminé »), sinon le
 * nom de son statut (« A discuter », « Information », « Annulé »…). Elle part aux archives le lendemain de la séance.
 */
export function etatTerminee(data: AppData, t: Task, avecDate = true): string {
  const st = data.statuses.find((x) => x.id === t.statusId);
  if (st && st.id !== data.statuses.find((x) => x.done)?.id) return st.label;
  return `✓ fait${avecDate && t.termineeLe ? ` le ${shortDate(t.termineeLe)}` : ''}`;
}
