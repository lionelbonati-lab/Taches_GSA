import type { AppData, Person, Poll, PollOption } from './types';
import { convoquesDe } from './seances';
import { fmtDate, fullName, uid } from './utils';

export const OUINON: PollOption[] = [
  { id: 'oui', label: 'Oui' },
  { id: 'non', label: 'Non' },
  { id: 'abst', label: 'Abstention' },
];

/** Réponse « Autre » (texte libre), ajoutée en dernier quand le sondage la propose. */
export const AUTRE_ID = 'autre';
export const autreOption = (type: Poll['type']): PollOption => ({ id: AUTRE_ID, label: type === 'dates' ? 'Autre proposition' : 'Autre', autre: true });

export const POLL_TYPES: { id: Poll['type']; label: string }[] = [
  { id: 'ouinon', label: 'Oui / Non / Abstention' },
  { id: 'choix', label: 'Choix parmi des options' },
  { id: 'dates', label: 'Choix de dates (disponibilités)' },
];

/** Moment de la clôture automatique (ms), à la date et l'heure limite (heure locale ; sans heure, à minuit) ; null si aucune. */
export function finSondage(p: Pick<Poll, 'dateLimite' | 'heureLimite' | 'clotureAuto'>): number | null {
  if (!p.dateLimite || p.clotureAuto === false) return null;
  const [y, m, d] = p.dateLimite.split('-').map(Number);
  const [h, mn] = (p.heureLimite || '24:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, mn).getTime();
}

export const isOpen = (p: Poll) => !p.clotureLe && (finSondage(p) ?? Infinity) > Date.now();

/** Date limite lisible : « 22.10.2026 à 18h00 », « 22.10.2026 » sans heure. */
/** Sondages de la page Sondages : ceux où la personne vote, et ceux qu'elle a créés ou qu'elle gère. */
export const sondagesVisibles = (polls: Poll[], moi: string | undefined, gere: boolean) =>
  polls.filter((p) => moi && (p.votants.includes(moi) || p.creePar === moi || gere));

/** La personne vote à ce sondage. */
export const votant = (p: Pick<Poll, 'votants'>, moi?: string) => !!moi && p.votants.includes(moi);

export const echeance = (p: Pick<Poll, 'dateLimite' | 'heureLimite'>) =>
  p.dateLimite ? `${fmtDate(p.dateLimite)}${p.heureLimite ? ` à ${p.heureLimite.replace(':', 'h')}` : ''}` : '';

export function optionLabel(o: PollOption) {
  if (!o.date) return o.label;
  const d = new Date(o.date + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${d}${o.heure ? ` · ${o.heure.replace(':', 'h')}` : ''}${o.label ? ` · ${o.label}` : ''}`;
}

/** Réponses des votants (on ignore celles de personnes retirées de la liste). */
export function results(p: Poll) {
  const voters = Object.keys(p.votes).filter((id) => p.votants.includes(id));
  const counts = p.options.map((o) => ({ option: o, ids: voters.filter((v) => p.votes[v].includes(o.id)) }));
  // « Autre » regroupe des réponses différentes : jamais désignée meilleure réponse.
  const max = Math.max(0, ...counts.filter((c) => !c.option.autre).map((c) => c.ids.length));
  return { voters, counts, max };
}

/** Textes écrits avec « Autre », dans l'ordre des votants. */
export function autreTextes(p: Poll, ids: string[]) {
  return ids.map((id) => ({ id, texte: p.textes?.[id]?.trim() ?? '' })).filter((x) => x.texte);
}

export function pollSection(data: AppData, p: Poll) {
  return p.sectionId ?? data.tasks.find((t) => t.id === p.taskId)?.sectionId;
}

/** Résumé d'une ligne (ordre du jour, texte copié). */
export function pollSummary(p: Poll) {
  const r = results(p);
  const parts =
    p.type === 'dates'
      ? r.max > 0
        ? [`meilleure date : ${r.counts.filter((c) => !c.option.autre && c.ids.length === r.max).map((c) => optionLabel(c.option)).join(' / ')} (${r.max} dispo.)`]
        : ['aucune disponibilité pour l’instant']
      : r.counts.filter((c) => !c.option.autre).map((c) => `${c.option.label} ${c.ids.length}`);
  const autre = r.counts.find((c) => c.option.autre);
  if (autre && (autre.ids.length || p.type !== 'dates')) {
    const textes = autreTextes(p, autre.ids).map((x) => `« ${x.texte} »`);
    parts.push(`${autre.option.label} ${autre.ids.length}${textes.length ? ` (${textes.join(' ; ')})` : ''}`);
  }
  const state = isOpen(p) ? (!p.dateLimite ? 'ouvert' : p.clotureAuto === false ? `ouvert, réponses souhaitées d’ici le ${echeance(p)}` : `ouvert jusqu’au ${echeance(p)}`) : 'clôturé';
  return `${parts.join(' · ')} — ${r.voters.length}/${p.votants.length} réponses, ${state}`;
}

/** Membres du comité (ses convoqués) : votants proposés par défaut, présences du PV. */
export const committeeOf = (data: AppData): Person[] => convoquesDe(data);

/** Nouveau sondage, par `creePar` : ses votants proposés sont le comité. `v` : ce qui a déjà été saisi (question, réponses…). */
export function nouveauSondage(data: AppData, creePar: string, v?: Poll, taskId?: string): Poll {
  const base = v ?? { question: '', type: 'ouinon' as const, multiple: false, options: OUINON, anonyme: false };
  return { ...base, id: uid('poll'), votants: committeeOf(data).map((x) => x.id), taskId, creePar, creeLe: new Date().toISOString(), votes: {}, textes: undefined };
}

/** Réponse de la personne `cle` (sa fiche) : ses choix et son texte « Autre ». */
export function avecVote(p: Poll, cle: string, choix: string[], texte?: string): Pick<Poll, 'votes' | 'textes'> {
  const textes = { ...p.textes };
  if (texte?.trim() && choix.includes(AUTRE_ID)) textes[cle] = texte.trim().slice(0, 300);
  else delete textes[cle];
  return { votes: { ...p.votes, [cle]: choix }, textes };
}

/** Sondage tel qu'il s'enregistre : sans les anciens champs des sondages ouverts à d'autres entités (affichage seulement). */
export function sondageEnregistre(p: Poll): Poll {
  const { electeurs: _e, cleMoi: _c, source: _s, ...rest } = p as Poll & { electeurs?: unknown; cleMoi?: unknown; source?: unknown };
  return rest;
}

/** Nom d'un votant (sa fiche). Ancienne réponse d'une autre entité (« entité:fiche ») : inconnue. */
export const nomVotant = (cle: string, people: Person[]) => people.find((x) => x.id === cle);

export const texteVotant = (p?: Person) => fullName(p) || '?';
