import type { Excuse, Meeting, MeetingMinutes, Person, RetardAnnonce } from './types';
import { fullName, initials, today } from './utils';

// Excusés et retards d'une séance : annoncés avant (liste des séances, ordre du jour), puis notés dans le PV, avec leur
// motif. Une personne n'a qu'une annonce à la fois : absente (excusée) ou en retard.

/** « 20:15 » → « 20h15 ». */
export const enHeures = (h?: string) => (h ? h.replace(':', 'h') : '');

export type SorteAnnonce = 'excuse' | 'retard';

export interface Annonce {
  sorte: SorteAnnonce;
  motif?: string;
  /** Retard : heure d'arrivée prévue (« 20:15 »). */
  vers?: string;
}

/** Annonce d'une personne pour une séance : excusée, en retard, ou rien. */
export function annonceDe(m: Meeting | undefined, personId: string): Annonce | undefined {
  const e = m?.excuses?.find((x) => x.personId === personId);
  if (e) return { sorte: 'excuse', motif: e.motif };
  const r = m?.retards?.find((x) => x.personId === personId);
  return r ? { sorte: 'retard', motif: r.motif, vers: r.vers } : undefined;
}

/** La liste avec l'entrée de la personne remplacée (à sa place), ajoutée (à la fin) ou retirée (`v` absent). */
function remplacer<T extends { personId: string }>(l: T[] | undefined, personId: string, v: T | undefined): T[] {
  const out = l ?? [];
  const i = out.findIndex((x) => x.personId === personId);
  if (i < 0) return v ? [...out, v] : out;
  return v ? out.map((x, j) => (j === i ? v : x)) : out.filter((_, j) => j !== i);
}

/**
 * Pose l'annonce d'une personne pour la séance `m` (modifiée sur place), ou la retire (`null`). Excusée ou en retard :
 * l'une remplace l'autre ; la même sorte est mise à jour à sa place (date de l'annonce gardée).
 */
export function annoncer(m: Meeting, personId: string, a: Annonce | null) {
  const motif = a?.motif?.trim() || undefined;
  const le = (l?: { personId: string; le: string }[]) => l?.find((x) => x.personId === personId)?.le ?? today();
  const excuse: Excuse | undefined = a?.sorte === 'excuse' ? { personId, le: le(m.excuses), ...(motif ? { motif } : {}) } : undefined;
  const retard: RetardAnnonce | undefined =
    a?.sorte === 'retard' ? { personId, le: le(m.retards), ...(a.vers ? { vers: a.vers } : {}), ...(motif ? { motif } : {}) } : undefined;
  const excuses = remplacer(m.excuses, personId, excuse);
  const retards = remplacer(m.retards, personId, retard);
  if (excuses.length) m.excuses = excuses;
  else delete m.excuses;
  if (retards.length) m.retards = retards;
  else delete m.retards;
}

const personnes = <T extends { personId: string }>(people: Person[], l: T[] = []) =>
  l.flatMap((x) => {
    const p = people.find((y) => y.id === x.personId);
    return p ? [{ p, x }] : [];
  });

/** Ligne « Excusés » de l'ordre du jour : « Nom (initiales) – motif », dans l'ordre des annonces. */
export const texteExcusesOdj = (people: Person[], m?: Meeting) =>
  personnes(people, m?.excuses)
    .map(({ p, x }) => `${fullName(p)} (${initials(p)})${x.motif ? ` – ${x.motif}` : ''}`)
    .join(', ');

/** Ligne « Retards annoncés » de l'ordre du jour : « Nom (initiales) – arrivée vers 20h15 – motif ». */
export const texteRetardsOdj = (people: Person[], m?: Meeting) =>
  personnes(people, m?.retards)
    .map(({ p, x }) => [`${fullName(p)} (${initials(p)})`, x.vers && `arrivée vers ${enHeures(x.vers)}`, x.motif].filter(Boolean).join(' – '))
    .join(', ');

/**
 * Le PV avec les annonces de la séance, tant qu'il n'est pas validé (validé, il est figé) : les excusés annoncés (sauf
 * ceux notés présents) et les motifs annoncés (excuses et retards ; l'annonce fait foi, même sans motif).
 */
export function avecAnnonces(mm: MeetingMinutes, m?: Meeting): MeetingMinutes {
  if (mm.valideLe && !mm.enCorrection) return mm;
  const excuses = [...new Set([...mm.excuses, ...(m?.excuses ?? []).map((e) => e.personId).filter((id) => !mm.presents.includes(id))])];
  const motifs = { ...mm.motifs };
  for (const a of [...(m?.excuses ?? []), ...(m?.retards ?? [])]) {
    if (a.motif) motifs[a.personId] = a.motif;
    else delete motifs[a.personId];
  }
  const { motifs: _anciens, ...reste } = mm;
  void _anciens;
  return { ...reste, excuses, ...(Object.keys(motifs).length ? { motifs } : {}) };
}

/**
 * Après un changement du PV (`avant` → `mm`) : les annonces de la séance `m` suivent. Excusé retiré (ou finalement
 * présent) : l'excuse annoncée tombe ; excusé : le retard annoncé aussi ; motif changé : celui de l'annonce aussi.
 */
export function reporterSurAnnonces(m: Meeting, avant: MeetingMinutes, mm: MeetingMinutes) {
  const change = (id: string) => (avant.motifs?.[id] ?? '') !== (mm.motifs?.[id] ?? '');
  const suivre = <T extends { personId: string; motif?: string }>(x: T): T => {
    if (!change(x.personId)) return x;
    const { motif: _ancien, ...reste } = x;
    void _ancien;
    const v = mm.motifs?.[x.personId]?.trim();
    return (v ? { ...reste, motif: v } : reste) as T;
  };
  if (m.excuses) m.excuses = m.excuses.filter((e) => mm.excuses.includes(e.personId)).map(suivre);
  if (m.retards) {
    const retards = m.retards.filter((r) => !mm.excuses.includes(r.personId)).map(suivre);
    if (retards.length) m.retards = retards;
    else delete m.retards;
  }
}
