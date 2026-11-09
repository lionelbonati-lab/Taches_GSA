import type { AppData, Meeting, MeetingMinutes, Task, TaskSnapshot, Voix } from './types';
import { initials } from './utils';

// Outils du PV partagés par l'onglet PV et la mise à niveau des données.

export const EMPTY_MINUTES: MeetingMinutes = { presents: [], excuses: [], notes: {} };

export const shortDate = (d: string) => {
  const [y, m, j] = d.split('-');
  return `${j}.${m}.${y.slice(2)}`;
};

export const stateOf = (t: Task): TaskSnapshot => ({
  statusId: t.statusId,
  delai: t.delai,
  responsables: [...t.responsables],
  titre: t.titre,
  sous: Object.fromEntries(t.checklist.map((c) => [c.id, c.done])),
  remarque: t.remarque ?? '',
  sectionId: t.sectionId,
  sousSection: t.sousSection ?? '',
});

/** Description lisible des changements entre deux états d'une tâche. */
export function diffTask(data: AppData, before: TaskSnapshot, after: Task): string[] {
  const label = (id: string) => data.statuses.find((x) => x.id === id)?.label ?? '?';
  const who = (ids: string[]) => ids.map((id) => initials(data.people.find((p) => p.id === id))).join(', ') || '—';
  const out: string[] = [];
  if (before.statusId !== after.statusId) out.push(`statut : ${label(before.statusId)} → ${label(after.statusId)}`);
  if (before.delai !== after.delai) out.push(`délai : ${before.delai ? shortDate(before.delai) : 'libre'} → ${after.delai ? shortDate(after.delai) : 'libre'}`);
  if (before.responsables.join() !== after.responsables.join()) out.push(`responsable : ${who(before.responsables)} → ${who(after.responsables)}`);
  if (before.titre !== after.titre) out.push('intitulé modifié');
  // Ancien état (sans la remarque) : rien à comparer.
  if (before.remarque !== undefined && before.remarque.trim() !== (after.remarque ?? '').trim()) out.push('remarque modifiée');
  if (before.sous)
    for (const c of after.checklist) {
      if (!(c.id in before.sous)) out.push(`sous-point ajouté : ${c.label}`);
      else if (before.sous[c.id] !== c.done) out.push(`sous-point « ${c.label} » ${c.done ? 'fait' : 'rouvert'}`);
    }
  return out;
}

const CHAMP = /^(statut|délai|responsable) : (.*) → (.*)$/;
const COCHE = /^sous-point « (.*) » (fait|rouvert)$/;

/**
 * Changements d'un point au PV, résumés : pour le statut, le délai et les responsables, l'état du départ et celui de la
 * fin (« statut : À faire → Terminé » au lieu de chaque étape ; rien s'il revient au départ) ; une étape de checklist
 * cochée puis décochée ne compte plus ; les autres changements, une fois chacun. Dans l'ordre de leur première fois.
 */
export function resumerChangements(changes: string[]): string[] {
  type Ligne = { champ: string; de: string; a: string } | { etape: string; fois: number; dernier: string } | { texte: string };
  const lignes = new Map<string, Ligne>();
  for (const c of changes) {
    const m = CHAMP.exec(c);
    const k = COCHE.exec(c);
    const l = lignes.get(m ? m[1] : k ? `étape:${k[1]}` : c);
    if (m) {
      if (l && 'champ' in l) l.a = m[3];
      else lignes.set(m[1], { champ: m[1], de: m[2], a: m[3] });
    } else if (k) {
      if (l && 'etape' in l) Object.assign(l, { fois: l.fois + 1, dernier: k[2] });
      else lignes.set(`étape:${k[1]}`, { etape: k[1], fois: 1, dernier: k[2] });
    } else if (!l) lignes.set(c, { texte: c });
  }
  return [...lignes.values()].flatMap((l) =>
    'champ' in l ? (l.de === l.a ? [] : [`${l.champ} : ${l.de} → ${l.a}`]) : 'etape' in l ? (l.fois % 2 ? [`sous-point « ${l.etape} » ${l.dernier}`] : []) : [l.texte],
  );
}

/**
 * Ancien format (état des tâches au début de la séance) → journal des changements.
 * Utilisé une seule fois lors de la mise à niveau des données enregistrées.
 */
export function snapshotToJournal(data: AppData, m: MeetingMinutes) {
  if (!m.snapshot) return;
  const at = m.demarreLe ?? new Date().toISOString();
  m.journal = m.journal ?? [];
  m.nouvelles = m.nouvelles ?? data.tasks.filter((t) => !m.snapshot![t.id]).map((t) => t.id);
  m.supprimees = m.supprimees ?? Object.entries(m.snapshot).filter(([id]) => !data.tasks.some((t) => t.id === id)).map(([, v]) => v.titre);
  for (const t of data.tasks) {
    const before = m.snapshot[t.id];
    const changes = before ? diffTask(data, before, t) : [];
    if (changes.length) m.journal.push({ taskId: t.id, titre: t.titre, changes, at });
  }
  delete m.snapshot;
  if (m.valideLe && !m.version) m.version = 1;
}

/** Note du PV d'une séance sur une tâche, pour la fiche de la tâche. */
export interface NoteSeance {
  meeting: Meeting;
  note: string;
  /** PV pas encore validé, ou rouvert pour correction : la note peut encore changer. */
  enCours: boolean;
  /** Note prise sur une occurrence précédente de la tâche (tâche qui se répète). */
  occurrence?: Task;
}

/** Notes des séances d'avant `seance` (ni la sienne, ni celles d'après) : fiche du PV, onglet « Séances précédentes ». */
export const avantSeance = (notes: NoteSeance[], seance?: Meeting) =>
  seance ? notes.filter((n) => n.meeting.id !== seance.id && n.meeting.date <= seance.date) : notes;

/** Occurrences précédentes d'une tâche qui se répète, de la plus récente à la plus ancienne. */
export function occurrencesAvant(data: AppData, t: Task): Task[] {
  const out: Task[] = [];
  const vues = new Set([t.id]);
  let x = data.tasks.find((y) => y.suivanteId === t.id);
  while (x && !vues.has(x.id)) {
    vues.add(x.id);
    out.push(x);
    const id = x.id;
    x = data.tasks.find((y) => y.suivanteId === id);
  }
  return out;
}

/**
 * Notes des PV sur une tâche (et ses occurrences précédentes), de la séance la plus récente à la plus ancienne.
 * `brouillons` (qui tient le PV) : aussi celles d'un PV pas encore validé ou en correction ; sinon, celles du PV validé
 * seulement (en correction : la dernière version validée).
 */
export function notesSeances(data: AppData, t: Task, brouillons: boolean): NoteSeance[] {
  const taches = [t, ...occurrencesAvant(data, t)];
  const out: NoteSeance[] = [];
  for (const meeting of data.meetings) {
    const mm = meeting.minutes;
    if (!mm) continue;
    const enCours = !mm.valideLe || !!mm.enCorrection;
    const notes = brouillons ? mm.notes : !mm.valideLe ? undefined : mm.enCorrection ? mm.derniereValidee?.notes : mm.notes;
    if (!notes) continue;
    for (const x of taches) {
      const note = notes[`task:${x.id}`];
      if (note?.trim()) out.push({ meeting, note, enCours: brouillons && enCours, occurrence: x.id === t.id ? undefined : x });
    }
  }
  return out.sort((a, b) => b.meeting.date.localeCompare(a.meeting.date));
}

/** Bilan du vote d'un point : les voix des présents (celles des autres ne comptent pas), et le résultat. */
export interface BilanVote {
  pour: number;
  contre: number;
  abstention: number;
  /** Présents qui n'ont pas (encore) voté. */
  sans: number;
  /** Plus de « pour » que de « contre » : accepté ; l'inverse : refusé ; autant : égalité. */
  resultat: 'accepte' | 'refuse' | 'egalite';
  /** Tous les présents ont voté pour. */
  unanimite: boolean;
}

/** Vote d'un point au PV (aucune voix d'un présent : undefined). Majorité des voix exprimées (pour / contre). */
export function bilanVote(votes: Record<string, Voix> | undefined, presents: string[]): BilanVote | undefined {
  const voix = presents.map((id) => votes?.[id]);
  const n = (v: Voix) => voix.filter((x) => x === v).length;
  const [pour, contre, abstention] = [n('pour'), n('contre'), n('abstention')];
  if (!pour && !contre && !abstention) return undefined;
  return {
    pour,
    contre,
    abstention,
    sans: voix.filter((x) => !x).length,
    resultat: pour > contre ? 'accepte' : contre > pour ? 'refuse' : 'egalite',
    unanimite: pour === presents.length,
  };
}

/** « accepté à l'unanimité (7 pour) », « accepté – 5 pour, 1 contre, 1 abstention », « refusé – … », « égalité – … ». */
export function texteVote(b: BilanVote): string {
  if (b.unanimite) return `accepté à l’unanimité (${b.pour} pour)`;
  const voix = [`${b.pour} pour`, `${b.contre} contre`, b.abstention && `${b.abstention} abstention${b.abstention > 1 ? 's' : ''}`].filter(Boolean).join(', ');
  return `${b.resultat === 'accepte' ? 'accepté' : b.resultat === 'refuse' ? 'refusé' : 'égalité'} – ${voix}`;
}
