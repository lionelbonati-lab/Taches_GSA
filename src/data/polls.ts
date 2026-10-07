import type { AppData, OrgUnit, Person, Poll, PollOption, SondagePartage } from './types';
import { hasPermission, userRoles } from './permissions';
import { emailKey } from './membres';
import { idPartagee } from './partage';
import { fmtDate, fullName, today } from './utils';

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

export const isOpen = (p: Poll) => !p.clotureLe && (!p.dateLimite || p.dateLimite >= today());

export function optionLabel(o: PollOption) {
  if (!o.date) return o.label;
  const d = new Date(o.date + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${d}${o.heure ? ` · ${o.heure.replace(':', 'h')}` : ''}${o.label ? ` · ${o.label}` : ''}`;
}

/** Clés de vote de tous les votants (ceux des autres entités compris, quand le sondage leur est ouvert). */
export const electeursDe = (p: Poll) => p.electeurs ?? p.votants;

/** Réponses des votants (on ignore celles de personnes retirées de la liste). */
export function results(p: Poll) {
  const electeurs = electeursDe(p);
  const voters = Object.keys(p.votes).filter((id) => electeurs.includes(id));
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
  const state = isOpen(p) ? (p.dateLimite ? `ouvert jusqu’au ${fmtDate(p.dateLimite)}` : 'ouvert') : 'clôturé';
  return `${parts.join(' · ')} — ${r.voters.length}/${electeursDe(p).length} réponses, ${state}`;
}

/** Membres du comité (rôles ayant l'onglet Comité) : votants proposés par défaut. */
export const committeeOf = (data: AppData): Person[] =>
  data.people.filter((p) => p.actif && hasPermission(userRoles(data.roles, p), 'tab.meetings'));

// Sondage ouvert à d'autres entités du club (Poll.entites) : tous leurs membres votent aussi, en plus des votants
// choisis dans l'entité du sondage. Une même personne ne vote qu'une fois (même fiche du registre, même email, ou
// fiche liée par « Tous les membres de … ») ; sa réponse est rangée sous sa clé de vote : sa fiche dans l'entité du
// sondage si elle en est votante, sinon `entité:fiche` (la première entité ajoutée dont elle est membre).
// Même règle côté serveur (gsa_cle_vote, migration 021).

type Fiche = Pick<Person, 'id' | 'email' | 'membreId' | 'viaEntite' | 'viaFiche'>;

/** Ce qui reconnaît une personne d'une entité à l'autre, dans cet ordre (fiche du registre, email, fiche, fiche d'origine). */
export const identites = (uniteId: string, f: Fiche) =>
  [f.membreId ?? '', emailKey(f.email) && `e:${emailKey(f.email)}`, `f:${uniteId}:${f.id}`, f.viaEntite && f.viaFiche ? `f:${f.viaEntite}:${f.viaFiche}` : ''].filter(
    (x): x is string => !!x,
  );

export interface Electorat {
  cles: string[];
  /** Identité → clé de vote. */
  de: Map<string, string>;
}

/** Votants d'un sondage de l'entité `source` (`fiches` : ses fiches actives), ceux des entités ajoutées compris. */
export function electorat(p: Pick<Poll, 'votants' | 'entites'>, source: string, fiches: Fiche[], units: Pick<OrgUnit, 'id' | 'archive' | 'membres'>[]): Electorat {
  const cles: string[] = [];
  const de = new Map<string, string>();
  const range = (ks: string[], cle: string) => ks.forEach((k) => !de.has(k) && de.set(k, cle));
  for (const id of p.votants) {
    if (cles.includes(id)) continue;
    cles.push(id);
    const f = fiches.find((x) => x.id === id);
    range(f ? identites(source, f) : [`f:${source}:${id}`], id);
  }
  for (const e of new Set(p.entites ?? [])) {
    const u = units.find((x) => x.id === e);
    if (!u || u.archive || e === source) continue;
    for (const m of u.membres) {
      const ks = identites(e, m);
      const deja = ks.map((k) => de.get(k)).find((x) => x);
      const cle = deja ?? `${e}:${m.id}`;
      if (!deja) cles.push(cle);
      range(ks, cle);
    }
  }
  return { cles, de };
}

/** Clé de vote d'une fiche de l'entité `uniteId` ; undefined si elle ne vote pas. */
export const cleVote = (el: Electorat, uniteId: string, f: Fiche) => identites(uniteId, f).map((k) => el.de.get(k)).find((x) => x);

/** Réponse enregistrée sous la clé `cle` (le texte « Autre » seulement avec la réponse « Autre »). */
export function avecVote(p: Poll, cle: string, choix: string[], texte?: string): Pick<Poll, 'votes' | 'textes'> {
  const textes = { ...p.textes };
  if (texte?.trim() && choix.includes(AUTRE_ID)) textes[cle] = texte.trim().slice(0, 300);
  else delete textes[cle];
  return { votes: { ...p.votes, [cle]: choix }, textes };
}

/** Sondage tel qu'il s'enregistre : sans ce qui ne sert qu'à l'affichage. */
export function sondageEnregistre(p: Poll): Poll {
  const { electeurs: _e, cleMoi: _c, source: _s, ...rest } = p;
  return rest;
}

/**
 * Sondages affichés dans l'entité `moi` : les siens, avec leurs votants et la clé de vote de la personne connectée,
 * puis ceux des autres entités qui lui sont ouverts (jamais enregistrés ici).
 */
export function avecSondages(data: AppData, list: SondagePartage[], moi: string, units: OrgUnit[], userId: string | null): AppData {
  const fiches = data.people.filter((x) => x.actif);
  const me = userId ? fiches.find((x) => x.id === userId) : undefined;
  const locaux = (data.polls ?? []).map((p): Poll => {
    if (!p.entites?.length) return { ...p, cleMoi: me && p.votants.includes(me.id) ? me.id : undefined };
    const el = electorat(p, moi, fiches, units);
    return { ...p, electeurs: el.cles, cleMoi: me && cleVote(el, moi, me) };
  });
  const recus = list.map(({ uniteId, unite, poll }): Poll => {
    const el = electorat(poll, uniteId, units.find((u) => u.id === uniteId)?.membres ?? [], units);
    // Rangé dans le bloc « Sondages » (sa section et sa tâche sont celles de l'autre entité).
    return { ...poll, id: idPartagee(uniteId, poll.id), taskId: undefined, sectionId: undefined, electeurs: el.cles, cleMoi: me && cleVote(el, moi, me), source: { uniteId, unite, id: poll.id } };
  });
  return locaux.length || recus.length ? { ...data, polls: [...locaux, ...recus] } : data;
}

/** Nom d'un votant (clé de vote), avec son entité si ce n'est pas l'entité ouverte. */
export function nomVotant(p: Pick<Poll, 'source'>, cle: string, people: Person[], units: OrgUnit[] | undefined, moi: string | undefined) {
  const i = cle.indexOf(':');
  const [u, id] = i > 0 ? [cle.slice(0, i), cle.slice(i + 1)] : [p.source?.uniteId ?? moi, cle];
  if (!u || u === moi) return { personne: people.find((x) => x.id === id), unite: undefined };
  const unite = units?.find((x) => x.id === u);
  return { personne: unite?.membres.find((m) => m.id === id), unite: unite?.nom };
}

export const texteVotant = (v: ReturnType<typeof nomVotant>) => `${fullName(v.personne)}${v.unite ? ` (${v.unite})` : ''}`;
