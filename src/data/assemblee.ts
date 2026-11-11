import type { AppData, Assemblee, ClubEvent, DetailAg, MajoriteAg, Meeting, OptionsOdjAg, PointAg, Task, TaskDoc, VoteAg } from './types';
import { newTask, today, uid } from './utils';
import { occurrencesEntre } from './repetition';
import { decalerAns } from './chronologieClub';

// Assemblée générale (PLAN_ASSEMBLEE_GENERALE.md) : onglet à part, visible des seuls rôles qui ont le droit
// « Assemblée générale » (tab.ag, console admin). Une AG est celle de l'agenda : un événement de type « Assemblée
// générale » (s'il se répète chaque année, chacune de ses dates), ou une séance cochée « Assemblée générale ». Sa fiche
// (`AppData.assemblees`) garde son ordre du jour : des points à elle, sans statut ni délai, avec leur texte, leurs
// sous-points, leurs documents et leurs votes ; la date, l'heure et le lieu restent ceux de l'agenda.

/** Une AG de l'agenda. `cle` : l'événement (« id », « id@date » s'il se répète) ou la séance (« m:id »). */
export interface AgAgenda {
  cle: string;
  date: string;
  nom: string;
  heure?: string;
  lieu: string;
  event?: ClubEvent;
  meeting?: Meeting;
}

/** Les AG de l'agenda (événements de type AG, séances cochées), par date. */
export function agDuClub(data: Pick<AppData, 'events' | 'meetings'>, jour = today()): AgAgenda[] {
  const out: AgAgenda[] = [];
  for (const e of data.events) {
    if (!e.ag || !e.date) continue;
    const dates = e.repetition ? occurrencesEntre(e, decalerAns(jour, -20), decalerAns(jour, 20), 100) : [e.date];
    for (const date of dates) out.push({ cle: e.repetition ? `${e.id}@${date}` : e.id, date, nom: e.nom, heure: e.heure, lieu: e.lieu, event: e });
  }
  for (const m of data.meetings) if (m.ag && m.date) out.push({ cle: `m:${m.id}`, date: m.date, nom: m.titre, heure: m.heure, lieu: m.lieu, meeting: m });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.nom.localeCompare(b.nom));
}

/** AG proposée en ouvrant la page : la prochaine (aujourd'hui compris), sinon la dernière passée. */
export const agParDefaut = (ags: AgAgenda[], jour = today()) => ags.find((a) => a.date >= jour) ?? ags[ags.length - 1];

/** Fiche (ordre du jour) d'une AG de l'agenda ; aucune tant que rien n'y a été préparé. */
export function ficheDe(data: Pick<AppData, 'assemblees'>, ag: AgAgenda | undefined): Assemblee | undefined {
  if (!ag) return undefined;
  return (data.assemblees ?? []).find((f) =>
    ag.meeting ? f.meetingId === ag.meeting.id : !!ag.event && f.eventId === ag.event.id && (!ag.event.repetition || f.date === ag.date),
  );
}

/** Nouvelle fiche, vide, d'une AG de l'agenda. */
export const nouvelleFiche = (ag: AgAgenda, par: string): Assemblee => ({
  id: uid('ag'),
  ...(ag.meeting ? { meetingId: ag.meeting.id } : { eventId: ag.event?.id }),
  date: ag.date,
  points: [],
  creeLe: new Date().toISOString(),
  creePar: par,
});

/** AG précédente qui a un ordre du jour, pour le reprendre. */
export function agPrecedente(data: Pick<AppData, 'events' | 'meetings' | 'assemblees'>, ag: AgAgenda): { ag: AgAgenda; fiche: Assemblee } | undefined {
  const avant = agDuClub(data).filter((a) => a.date < ag.date || (a.date === ag.date && a.cle !== ag.cle));
  for (let i = avant.length - 1; i >= 0; i--) {
    const fiche = ficheDe(data, avant[i]);
    if (fiche?.points.length) return { ag: avant[i], fiche };
  }
  return undefined;
}

/**
 * Années d'un intitulé avancées de `ecart` (« Comptes 2026 » → « Comptes 2027 » d'une AG à la suivante) : seulement
 * celles proches de l'AG d'origine (deux ans avant, un an après), pas « fondé en 1952 ».
 */
export function avancerAnnees(texte: string, anOrigine: number, ecart: number): string {
  if (!ecart) return texte;
  // Sans « lookbehind » (pas compris des anciens iPhone) : le caractère d'avant est repris tel quel.
  return texte.replace(/(^|[^\d.])((?:19|20)\d{2})(?![\d.])/g, (tout, avant: string, annee: string) => {
    const an = Number(annee);
    return an >= anOrigine - 2 && an <= anOrigine + 1 ? `${avant}${an + ecart}` : tout;
  });
}

/**
 * Points repris d'une AG précédente (nouveaux identifiants, années avancées) : intitulés, textes, sous-points et votes,
 * sans les documents (ceux de l'an dernier ne valent plus) ; `repriseDe` : le point d'origine.
 */
export function reprendrePoints(points: PointAg[], deLa: string, versLa: string): PointAg[] {
  const an = Number(deLa.slice(0, 4));
  const ecart = Number(versLa.slice(0, 4)) - an;
  const av = (t: string) => avancerAnnees(t, an, ecart);
  const copie = (p: PointAg, sous: boolean): PointAg => ({
    id: uid('pa'),
    titre: av(p.titre),
    ...(p.texte ? { texte: av(p.texte) } : {}),
    ...(p.votes?.length ? { votes: p.votes.map((v) => ({ ...v, id: uid('va'), objet: av(v.objet) })) } : {}),
    ...(sous && p.sous?.length ? { sous: p.sous.map((x) => copie(x, false)) } : {}),
    repriseDe: p.id,
  });
  return points.map((p) => copie(p, true));
}

export const nouveauVote = (objet: string, majorite: MajoriteAg = 'exprimees'): VoteAg => ({ id: uid('va'), objet, majorite });

/**
 * Modèle d'ordre du jour, celui des AG du club (PV 2024 à 2026 : mêmes points, dans le même ordre, avec leurs votes ; les
 * points propres à une année, comme une modification des statuts, s'ajoutent à la main) ; `an` : l'année de l'AG.
 */
export function modeleAg(an: number): PointAg[] {
  const p = (titre: string, o: Partial<Pick<PointAg, 'texte' | 'sous'>> & { vote?: string | true | string[] } = {}): PointAg => ({
    id: uid('pa'),
    titre,
    ...(o.texte ? { texte: o.texte } : {}),
    ...(o.sous ? { sous: o.sous } : {}),
    ...(o.vote ? { votes: (Array.isArray(o.vote) ? o.vote : [o.vote === true ? titre : o.vote]).map((v) => nouveauVote(v)) } : {}),
  });
  const passe = an - 1;
  return [
    p('Ouverture de l’assemblée', { vote: 'Approbation de l’ordre du jour' }),
    p('Nomination des scrutateurs'),
    p(`Approbation du PV ${passe}`, { vote: true }),
    p('Rapport du président'),
    p('Rapport des différents responsables', {
      sous: [p('École de cyclisme'), p('Groupe compétition'), p('Bruntrutaine'), p('Course de préparation'), p('Critérium de Porrentruy'), p('Col de Montvoie')],
    }),
    p(`Comptes exercices ${passe}`),
    p('Rapport des vérificateurs', { vote: `Approbation des comptes ${passe}` }),
    p('Renouvellement du comité'),
    p('Élection du/de la président/e et du comité', { vote: ['Élection du/de la président/e', 'Élection du comité', `Vérificateurs des comptes ${an}`] }),
    p(`Budget ${an}`, { vote: true }),
    p('Admissions / démissions', { vote: 'Admission des nouveaux membres' }),
    p('Divers', { sous: [p(`Programme ${an}`), p('Remerciements'), p('Remise des prix du championnat d’hiver VTT'), p('Naissances / mariages / décès')] }),
  ];
}

export const MAJORITES: { id: MajoriteAg; label: string; court: string }[] = [
  { id: 'exprimees', label: 'Majorité des voix exprimées (abstentions non comptées)', court: 'majorité des voix exprimées' },
  { id: 'absolue', label: 'Majorité absolue des votants présents', court: 'majorité absolue' },
  { id: 'deuxTiers', label: 'Deux tiers des voix exprimées (statuts…)', court: 'deux tiers' },
];

export const DETAILS_AG: { id: DetailAg; label: string }[] = [
  { id: 'complet', label: 'Complet (sous-points, textes, votes et leur majorité, documents)' },
  { id: 'sousPoints', label: 'Points et sous-points' },
  { id: 'points', label: 'Points seulement' },
];

/** Majorité d'un vote, en clair (« majorité absolue »). */
export const majoriteTexte = (m: MajoriteAg) => MAJORITES.find((x) => x.id === m)?.court ?? '';

/** « Vote : Approbation des comptes 2025 – majorité absolue » (détail d'un point, ordre du jour complet). */
export const ligneVote = (v: VoteAg) => `Vote : ${v.objet.trim()} – ${majoriteTexte(v.majorite)}`;

/** « (vote) », « (vote : Élection de X) », « (2 votes : … ; …) » à côté d'un point de la convocation. */
export function texteVotes(p: Pick<PointAg, 'titre' | 'votes'>): string {
  const v = p.votes ?? [];
  if (!v.length) return '';
  const maj = (x: VoteAg) => (x.majorite === 'exprimees' ? '' : `, ${MAJORITES.find((m) => m.id === x.majorite)?.court}`);
  if (v.length === 1) return v[0].objet.trim() === p.titre.trim() ? `(vote${maj(v[0])})` : `(vote : ${v[0].objet.trim()}${maj(v[0])})`;
  return `(${v.length} votes : ${v.map((x) => `${x.objet.trim()}${maj(x)}`).join(' ; ')})`;
}

/** Options de la convocation, celles non réglées par défaut. */
export const optionsOdjAg = (o?: OptionsOdjAg): Required<OptionsOdjAg> => ({
  entete: true,
  textes: true,
  votes: true,
  documents: true,
  annexes: false,
  orientation: 'portrait',
  taille: 'normale',
  ...o,
});

/** Lettre d'un sous-point : a, b… z, aa… */
export const lettre = (i: number) => {
  let r = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) r = String.fromCharCode(97 + ((n - 1) % 26)) + r;
  return r;
};

/** Tous les points et sous-points, dans l'ordre. */
export const tousLesPoints = (points: PointAg[]) => points.flatMap((p) => [p, ...(p.sous ?? [])]);

/** Fichiers et liens des points de toutes les AG (sauvegarde, rangement du stockage). */
export const documentsDesAg = (data: Pick<AppData, 'assemblees'>): TaskDoc[] =>
  (data.assemblees ?? []).flatMap((f) => tousLesPoints(f.points).flatMap((p) => p.documents ?? []));

/**
 * Point vu comme une tâche, pour les annexes communes aux documents du club (Annexes.tsx : numéros, liste, pages des
 * fichiers joints). Seuls son identifiant, son intitulé et ses documents comptent.
 */
export const tacheDuPoint = (p: PointAg): Task => newTask('', { id: p.id, titre: p.titre, documents: p.documents ?? [] });

/**
 * Fichier encore joint ailleurs (point de la liste, ou point d'une AG autre que ceux de `sauf`) : à garder quand on le
 * retire d'ici.
 */
export const fichierUtilise = (data: Pick<AppData, 'tasks' | 'assemblees'>, id: string, sauf: string[]) =>
  data.tasks.some((t) => t.documents?.some((d) => d.id === id)) ||
  (data.assemblees ?? []).some((f) => tousLesPoints(f.points).some((p) => !sauf.includes(p.id) && p.documents?.some((d) => d.id === id)));

/** Version texte de la convocation (copier, email). */
export function texteConvocation(ag: AgAgenda, fiche: Assemblee | undefined, o: Required<OptionsOdjAg>, longDate: (d: string) => string, detail: DetailAg = 'complet'): string {
  const lignes: string[] = [ag.nom, [longDate(ag.date), ag.heure && ag.heure.replace(':', 'h')].filter(Boolean).join(', ')];
  if (ag.lieu) lignes.push(`Lieu : ${ag.lieu}`);
  if (fiche?.intro?.trim()) lignes.push('', fiche.intro.trim());
  lignes.push('', 'ORDRE DU JOUR');
  const pts = fiche?.points ?? [];
  if (!pts.length) lignes.push('(aucun point pour l’instant)');
  const complet = detail === 'complet';
  // Complet : chaque vote sur sa ligne, avec sa majorité ; sinon « (vote) » à côté de l'intitulé.
  const marque = (p: PointAg) => (o.votes && !complet ? texteVotes(p) : '');
  const details = (p: PointAg, retrait: string) =>
    !complet
      ? []
      : [
          ...(o.textes && p.texte?.trim() ? p.texte.trim().split('\n').map((l) => `${retrait}${l}`) : []),
          ...(o.votes ? (p.votes ?? []).map((v) => `${retrait}◦ ${ligneVote(v)}`) : []),
          ...(o.documents && p.documents?.length ? [`${retrait}📎 ${p.documents.map((d) => d.nom).join(', ')}`] : []),
        ];
  pts.forEach((p, i) => {
    const v = marque(p);
    lignes.push(`${i + 1}. ${p.titre}${v ? ` ${v}` : ''}`);
    lignes.push(...details(p, '   '));
    if (detail === 'points') return;
    (p.sous ?? []).forEach((s, j) => {
      const vs = marque(s);
      lignes.push(`   ${lettre(j)}. ${s.titre}${vs ? ` ${vs}` : ''}`);
      lignes.push(...details(s, '      '));
    });
  });
  if (fiche?.fin?.trim()) lignes.push('', fiche.fin.trim());
  return lignes.join('\n');
}
