import type { AppData, ClubEvent, Etiquette, LieuEtiquette, Section, Task } from './types';
import { COULEURS, endOf, today, uid } from './utils';
import { occurrenceDu } from './repetition';

// Étiquettes du club, trois sortes (chacune réglée à un seul endroit) :
//  • l'étiquette d'un événement de l'agenda (case « Étiquette » du formulaire de l'événement) : son nom et ses dates sont
//    ceux de l'événement ; elle a sa sous-section dans « Événements » (créée d'office) ; les points rangés là, ou
//    rattachés à l'événement, la reçoivent ;
//  • l'étiquette d'une section, un groupe (coche « Groupe » de la section, console admin) : les points de la section ;
//  • « Comité » (console admin) : les points qui n'ont ni groupe ni événement.
// Ses membres voient ses points (règle du serveur, 062). Ce que chacun peut ranger et étiqueter : store.tsx
// (peutRanger, peutEtiqueter). Les étiquettes d'avant ce réglage, pas encore reliées, gardent leur place (réglée, ou
// devinée d'après le nom) et se relient en cochant la case de l'événement ou de la section (« Reprendre »).
//
// Événement passé (son dernier jour, ou la dernière occurrence d'une série, est derrière nous) : son étiquette reste sur
// ses points (filtre, recherche, historique) et ses membres les voient encore, le temps de finir ce qui reste (bilan,
// factures) ; elle n'est plus proposée pour de nouveaux points, et elle est rangée à part (« Événements passés »).
// L'édition suivante (« Reprendre », Reprise.tsx) a sa propre étiquette, avec les mêmes membres : les points recopiés
// passent dans sa sous-section et ne portent plus celle de l'édition passée.

type Donnees = Pick<AppData, 'etiquettes' | 'sections'> & Partial<Pick<AppData, 'events'>>;

/** Sorte d'une étiquette : d'un événement, d'une section (groupe), du comité, ou ancienne, pas encore reliée. */
export type SorteEtiquette = 'evenement' | 'groupe' | 'comite' | 'libre';
export const sorteDe = (e: Etiquette): SorteEtiquette => (e.parDefaut ? 'comite' : e.eventId ? 'evenement' : e.sectionId ? 'groupe' : 'libre');

/** Événement passé : son dernier jour est avant `jour` ; un événement qui se répète : plus aucune occurrence à venir. */
export const evenementPasse = (ev: ClubEvent, jour = today()) => (ev.repetition ? !occurrenceDu(ev, jour) : endOf(ev) < jour);

/**
 * Étiquette d'un événement passé (celui de l'agenda, sinon sa date). Groupes, comité, étiquettes sans date : jamais.
 */
export function etiquettePassee(e: Etiquette, events: ClubEvent[] = [], jour = today()): boolean {
  const ev = e.eventId ? events.find((x) => x.id === e.eventId) : undefined;
  if (ev) return evenementPasse(ev, jour);
  return e.type === 'evenement' && !e.parDefaut && !!e.date && endOf({ date: e.date, dateFin: e.dateFin }) < jour;
}

/**
 * Étiquettes rangées pour un choix : les groupes (et le comité), les événements à venir (par date), puis les événements
 * passés (les plus récents d'abord).
 */
export function etiquettesRangees(liste: Etiquette[] = [], events: ClubEvent[] = [], jour = today()) {
  const date = (e: Etiquette) => e.date ?? '';
  const evts = liste.filter((e) => e.type === 'evenement' || !!e.eventId);
  const passees = evts.filter((e) => etiquettePassee(e, events, jour));
  return {
    groupes: liste.filter((e) => !evts.includes(e)),
    aVenir: evts.filter((e) => !passees.includes(e)).sort((a, b) => date(a).localeCompare(date(b))),
    passees: passees.sort((a, b) => date(b).localeCompare(date(a))),
  };
}

/**
 * Sous-sections qui ne sont la place que d'étiquettes d'événements passés (« sectionId␀sous-section ») : proposées à part
 * quand on range un point.
 */
export function placesPassees(data: Donnees, jour = today()): Set<string> {
  const passees = new Set<string>();
  const actives = new Set<string>();
  for (const e of data.etiquettes ?? []) {
    const ici = etiquettePassee(e, data.events, jour) ? passees : actives;
    lieuxDe(e, data.sections).forEach((l) => l.sousSection && ici.add(clePlace(l.sectionId, l.sousSection)));
  }
  actives.forEach((k) => passees.delete(k));
  return passees;
}
export const clePlace = (sectionId: string, sousSection = '') => `${sectionId}\u0000${sousSection}`;

const MOTS_VIDES = new Set(['a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'pour', 'un', 'une']);

/** Mots d'un nom, sans accents ni majuscules, sans petits mots ni nombres (les dates d'une sous-section). */
const mots = (x: string) =>
  new Set(
    x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((m) => m && !MOTS_VIDES.has(m) && !/^\d+$/.test(m)),
  );
const memeNom = (a: string, b: string) => {
  const [x, y] = [mots(a), mots(b)];
  return x.size > 0 && x.size === y.size && [...x].every((m) => y.has(m));
};

/**
 * Place devinée d'après le nom d'une ancienne étiquette : la section ou la sous-section du même nom (aux dates près :
 * « Bruntrutaine 27.02.27 »), sinon celles dont le nom contient tous ses mots (« Compétition » → « Groupe compétition »).
 */
export function lieuxDevines(e: Pick<Etiquette, 'nom'>, sections: Section[]): LieuEtiquette[] {
  const m = mots(e.nom);
  if (!m.size) return [];
  const notes = sections.flatMap((s) =>
    [{ lieu: { sectionId: s.id } as LieuEtiquette, nom: s.nom }, ...s.sousSections.map((ss) => ({ lieu: { sectionId: s.id, sousSection: ss }, nom: ss }))].map((c) => {
      const n = mots(c.nom);
      return { lieu: c.lieu, note: [...m].every((x) => n.has(x)) ? (n.size === m.size ? 2 : 1) : 0 };
    }),
  );
  const meilleure = Math.max(0, ...notes.map((c) => c.note));
  return meilleure ? notes.filter((c) => c.note === meilleure).map((c) => c.lieu) : [];
}

/**
 * Place de l'étiquette : sa section (groupe), sa sous-section (événement) ; une ancienne étiquette : celle réglée, sinon
 * devinée d'après son nom. Le comité n'en a pas (il a le reste).
 */
export const lieuxDe = (e: Etiquette, sections: Section[]): LieuEtiquette[] =>
  e.parDefaut ? [] : e.sectionId ? [{ sectionId: e.sectionId }] : e.eventId ? e.lieux ?? [] : e.lieux ?? lieuxDevines(e, sections);

/** La place couvre le point rangé dans `sectionId` › `sousSection` (une section entière couvre ses sous-sections). */
const couvre = (l: LieuEtiquette, sectionId: string, sousSection: string) => l.sectionId === sectionId && (!l.sousSection || l.sousSection === sousSection);

/** Nom lisible d'une place : « Événements › Week-end VTT ». */
export const nomLieu = (l: LieuEtiquette, sections: Section[]) => {
  const s = sections.find((x) => x.id === l.sectionId)?.nom ?? '?';
  return l.sousSection ? `${s} › ${l.sousSection}` : s;
};

/**
 * Étiquettes d'office d'un point, calculées une fois pour toutes : celles de sa place (sa section, sa sous-section) et
 * celle de l'événement auquel il est rattaché ; sinon, le comité. Rien pour un point sans section.
 */
export function etiquettesDesLieux(data: Donnees) {
  const liste = data.etiquettes ?? [];
  const places = liste.map((e) => ({ id: e.id, lieux: lieuxDe(e, data.sections) }));
  // Événement d'une série modifié seul : celui de la série.
  const serieDe = new Map((data.events ?? []).filter((x) => x.serie).map((x) => [x.id, x.serie!.id]));
  const parEvenement = new Map(liste.filter((e) => e.eventId).map((e) => [e.eventId!, e.id]));
  const autres = liste.find((e) => e.parDefaut)?.id;
  return (sectionId: string, sousSection = '', eventId?: string): string[] => {
    if (!sectionId) return [];
    const ici = places.filter((p) => p.lieux.some((l) => couvre(l, sectionId, sousSection))).map((p) => p.id);
    const ev = eventId ? parEvenement.get(eventId) ?? parEvenement.get(serieDe.get(eventId) ?? '') : undefined;
    if (ev && !ici.includes(ev)) ici.push(ev);
    return ici.length ? ici : autres ? [autres] : [];
  };
}

/** Étiquettes d'office du point (aucune pour un ticket : remboursement ou facture). */
export const etiquettesAuto = (data: Donnees, t: Pick<Task, 'sectionId' | 'sousSection' | 'paiement' | 'eventId'>) =>
  t.paiement ? [] : etiquettesDesLieux(data)(t.sectionId, t.sousSection, t.eventId);

/** Étiquettes d'un point qui change de place : celles d'office de l'ancienne retirées, celles de la nouvelle ajoutées. */
export function recaler(etiquettes: string[] | undefined, avant: string[], apres: string[]): string[] | undefined {
  const l = [...new Set([...(etiquettes ?? []).filter((id) => !avant.includes(id) || apres.includes(id)), ...apres])];
  return l.length ? l : undefined;
}

const memes = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Après une modification (store.tsx, update) : les points dont les étiquettes d'office ont changé (nouveaux, rangés
 * ailleurs, rattachés à un autre événement, étiquettes réglées autrement…) suivent. Les autres ne sont pas touchés.
 */
export function suivreLieux(prev: AppData, next: AppData) {
  const avant = etiquettesDesLieux(prev);
  const apres = etiquettesDesLieux(next);
  const anciennes = new Map(prev.tasks.map((t) => [t.id, t]));
  next.tasks = next.tasks.map((t) => {
    if (t.paiement) return t;
    const a = anciennes.get(t.id);
    const x = a && !a.paiement ? avant(a.sectionId, a.sousSection, a.eventId) : [];
    const y = apres(t.sectionId, t.sousSection, t.eventId);
    if (memes(x, y)) return t;
    const etiquettes = recaler(t.etiquettes, x, y);
    return memes(etiquettes, t.etiquettes) ? t : { ...t, etiquettes };
  });
}

/** Points qui n'ont pas encore toutes leurs étiquettes d'office (points d'avant ce réglage). */
export function sansEtiquetteDeLeurPlace(data: AppData) {
  const auto = etiquettesDesLieux(data);
  return data.tasks.filter((t) => !t.paiement && auto(t.sectionId, t.sousSection, t.eventId).some((id) => !t.etiquettes?.includes(id)));
}

/** Les points de l'étiquette `id` (sa place, son événement) la reçoivent ; ceux qui n'ont plus à être au comité le quittent. */
function completer(d: AppData, id: string) {
  const auto = etiquettesDesLieux(d);
  const comite = d.etiquettes?.find((e) => e.parDefaut)?.id;
  d.tasks.forEach((t) => {
    if (t.paiement) return;
    const a = auto(t.sectionId, t.sousSection, t.eventId);
    if (a.includes(id)) t.etiquettes = recaler(t.etiquettes, comite && !a.includes(comite) ? [comite] : [], a);
  });
}

/** Retire l'étiquette (et la retire des points ; les points restent). */
export function retirerEtiquette(d: AppData, id: string) {
  d.etiquettes = (d.etiquettes ?? []).filter((x) => x.id !== id);
  d.tasks.forEach((t) => {
    if (t.etiquettes?.includes(id)) {
      const l = t.etiquettes.filter((x) => x !== id);
      t.etiquettes = l.length ? l : undefined;
    }
  });
}

/** Section des événements (« Événements »), créée au besoin (`creer`). */
export function sectionEvenements(d: Pick<AppData, 'sections'>, creer = false): Section | undefined {
  const s = d.sections.find((x) => memeNom(x.nom, 'Événements'));
  if (s || !creer) return s;
  const n: Section = { id: uid('sec'), nom: 'Événements', sousSections: [] };
  d.sections.push(n);
  return n;
}

export const etiquetteDeLEvenement = (data: Pick<AppData, 'etiquettes'>, eventId: string) => data.etiquettes?.find((e) => e.eventId === eventId);
export const etiquetteDeLaSection = (data: Pick<AppData, 'etiquettes'>, sectionId: string) => data.etiquettes?.find((e) => e.sectionId === sectionId);
export const etiquetteDuComite = (data: Pick<AppData, 'etiquettes'>) => data.etiquettes?.find((e) => e.parDefaut);

/**
 * Anciennes étiquettes pas encore reliées, à reprendre pour cet événement ou cette section : d'abord celles du même nom
 * (ou, pour un événement, du même jour), puis les autres.
 */
export function etiquettesAReprendre(data: Pick<AppData, 'etiquettes'>, nom: string, date?: string): Etiquette[] {
  const libres = (data.etiquettes ?? []).filter((e) => sorteDe(e) === 'libre');
  const proche = (e: Etiquette) => memeNom(e.nom, nom) || (!!date && e.date === date) || lieuxDevines(e, [{ id: '', nom, sousSections: [] }]).length > 0;
  return [...libres.filter(proche), ...libres.filter((e) => !proche(e))];
}
/** Celle qu'on propose de reprendre d'office : même nom, ou même jour pour un événement. */
export const aReprendre = (data: Pick<AppData, 'etiquettes'>, nom: string, date?: string) =>
  (data.etiquettes ?? []).find((e) => sorteDe(e) === 'libre' && (memeNom(e.nom, nom) || (!!date && e.date === date)));

/** Choix fait dans le formulaire : l'étiquette (avec ses membres), reprise d'une ancienne ou nouvelle ; `null` : sans étiquette. */
export type ChoixEtiquette = { membres: string[]; reprise?: string } | null;

const nouvelle = (d: AppData): Etiquette => ({ id: uid('et'), nom: '', couleur: COULEURS[(d.etiquettes ?? []).length % COULEURS.length], type: 'groupe', membres: [] });
const placer = (d: AppData, e: Etiquette) => {
  const l = d.etiquettes ?? [];
  d.etiquettes = l.some((x) => x.id === e.id) ? l.map((x) => (x.id === e.id ? e : x)) : [...l, e];
};
/** L'étiquette à régler : celle déjà reliée, sinon celle à reprendre, sinon une nouvelle. */
const cible = (d: AppData, deja: Etiquette | undefined, reprise?: string) =>
  deja ?? (reprise ? d.etiquettes?.find((x) => x.id === reprise && sorteDe(x) === 'libre') : undefined) ?? nouvelle(d);

/** Renomme une sous-section : la liste de la section, les points qui y sont et la place des étiquettes suivent. */
export function renommerSousSection(d: AppData, sectionId: string, ancien: string, nouveau: string) {
  const s = d.sections.find((x) => x.id === sectionId);
  if (!s || ancien === nouveau) return;
  s.sousSections = s.sousSections.includes(nouveau) ? s.sousSections.filter((x) => x !== ancien) : s.sousSections.map((x) => (x === ancien ? nouveau : x));
  d.tasks.forEach((t) => {
    if (t.sectionId === sectionId && t.sousSection === ancien) t.sousSection = nouveau;
  });
  d.etiquettes = d.etiquettes?.map((e) => {
    const lieux = e.lieux ?? (sorteDe(e) === 'libre' ? lieuxDevines(e, d.sections) : undefined);
    return lieux?.some((l) => l.sectionId === sectionId && l.sousSection === ancien)
      ? { ...e, lieux: lieux.map((l) => (l.sectionId === sectionId && l.sousSection === ancien ? { ...l, sousSection: nouveau } : l)) }
      : e;
  });
}

/**
 * Case « Étiquette » d'un événement (formulaire de l'événement), dans la modification qui l'enregistre : l'étiquette
 * prend le nom et les dates de l'événement, et sa sous-section dans « Événements » (créée au besoin ; celle d'une ancienne
 * étiquette reprise est gardée) ; ses points la reçoivent. `null` : l'événement n'a plus d'étiquette (retirée des points).
 */
export function reglerEtiquetteEvenement(d: AppData, ev: ClubEvent, choix: ChoixEtiquette) {
  const deja = etiquetteDeLEvenement(d, ev.id);
  if (!choix) {
    if (deja) retirerEtiquette(d, deja.id);
    return;
  }
  const e = cible(d, deja, choix.reprise);
  const evts = sectionEvenements(d, true)!;
  // Sa sous-section : celle qu'elle a déjà (ou, ancienne étiquette, devinée d'après son nom), sinon le nom de l'événement.
  const lieux = e.lieux ?? (sorteDe(e) === 'libre' ? lieuxDevines(e, d.sections) : []);
  let sous = lieux.find((l) => l.sectionId === evts.id && l.sousSection)?.sousSection;
  // Événement renommé : sa sous-section créée d'office (même nom que l'étiquette) suit, sauf si ce nom est déjà la place
  // d'une autre étiquette (on ne mélange pas leurs points).
  if (sous && deja && sous === deja.nom && deja.nom !== ev.nom && !placePrise(d, evts.id, ev.nom, e.id)) {
    renommerSousSection(d, evts.id, sous, ev.nom);
    sous = ev.nom;
  }
  sous ??= sousSectionLibre(d, evts.id, ev, e.id);
  if (!evts.sousSections.includes(sous)) evts.sousSections.push(sous);
  placer(d, {
    ...e,
    nom: ev.nom,
    type: 'evenement',
    date: ev.date,
    dateFin: ev.dateFin && ev.dateFin > ev.date ? ev.dateFin : undefined,
    eventId: ev.id,
    sectionId: undefined,
    parDefaut: undefined,
    lieux: [{ sectionId: evts.id, sousSection: sous }],
    membres: [...new Set(choix.membres)],
  });
  completer(d, e.id);
}

/** La sous-section est déjà la place d'une autre étiquette que `sauf`. */
const placePrise = (d: AppData, sectionId: string, sous: string, sauf?: string) =>
  (d.etiquettes ?? []).some((x) => x.id !== sauf && lieuxDe(x, d.sections).some((l) => l.sectionId === sectionId && l.sousSection === sous));

/**
 * Sous-section d'un événement qui reçoit son étiquette : son nom ; déjà la place d'une autre étiquette (l'édition d'avant,
 * du même nom) : son nom et sa date, « Marche familiale 12.09.27 ».
 */
function sousSectionLibre(d: AppData, sectionId: string, ev: Pick<ClubEvent, 'nom' | 'date'>, sauf?: string) {
  const [a, m, j] = ev.date.split('-');
  const noms = [ev.nom, `${ev.nom} ${j}.${m}.${(a ?? '').slice(2)}`, `${ev.nom} ${ev.date}`];
  return noms.find((x) => !placePrise(d, sectionId, x, sauf)) ?? noms[noms.length - 1];
}

/**
 * Nouvelle édition d'un événement repris (« Reprendre », Reprise.tsx), dans la modification qui l'ajoute avec les copies
 * de ses points (`copies` : leurs identifiants). Si l'édition passée avait son étiquette : les copies quittent sa
 * sous-section pour celle de la nouvelle édition (à son nom, dans « Événements ») et ne portent plus son étiquette ;
 * `garder` : la nouvelle édition a la sienne, avec les mêmes membres, la même couleur et la même icône (ses points la
 * reçoivent). Les points de l'édition passée gardent la leur.
 */
export function suiteEtiquette(d: AppData, ancien: ClubEvent, nouveau: ClubEvent, copies: string[], garder: boolean) {
  const avant = etiquetteDeLEvenement(d, ancien.id);
  if (!avant) return;
  const evts = sectionEvenements(d, true)!;
  const place = lieuxDe(avant, d.sections).find((l) => l.sousSection);
  const sous = sousSectionLibre(d, evts.id, nouveau);
  if (!evts.sousSections.includes(sous)) evts.sousSections.push(sous);
  const ids = new Set(copies);
  d.tasks.forEach((t) => {
    if (!ids.has(t.id)) return;
    if (place && t.sectionId === place.sectionId && t.sousSection === place.sousSection) {
      t.sectionId = evts.id;
      t.sousSection = sous;
    }
    const l = (t.etiquettes ?? []).filter((x) => x !== avant.id);
    t.etiquettes = l.length ? l : undefined;
  });
  if (!garder) return;
  // Reliée d'abord à l'événement, à sa place (la sous-section choisie), avec la couleur et l'icône de l'édition passée ;
  // puis réglée comme depuis le formulaire de l'événement (nom, dates, membres, ses points).
  placer(d, {
    ...nouvelle(d),
    type: 'evenement',
    eventId: nouveau.id,
    couleur: avant.couleur,
    ...(avant.icone ? { icone: avant.icone } : {}),
    lieux: [{ sectionId: evts.id, sousSection: sous }],
  });
  reglerEtiquetteEvenement(d, nouveau, { membres: avant.membres ?? [] });
}

/** Coche « Groupe » d'une section (console admin) : l'étiquette de la section, à son nom ; ses points la reçoivent. */
export function reglerGroupe(d: AppData, sectionId: string, choix: ChoixEtiquette) {
  const s = d.sections.find((x) => x.id === sectionId);
  const deja = etiquetteDeLaSection(d, sectionId);
  if (!choix || !s) {
    if (deja) retirerEtiquette(d, deja.id);
    return;
  }
  const e = cible(d, deja, choix.reprise);
  placer(d, { ...e, nom: s.nom, type: 'groupe', date: undefined, dateFin: undefined, eventId: undefined, sectionId, parDefaut: undefined, lieux: undefined, membres: [...new Set(choix.membres)] });
  completer(d, e.id);
}

/** « Comité » (console admin) : l'étiquette des points qui n'ont ni groupe ni événement. */
export function reglerComite(d: AppData, membres: string[] | null) {
  const deja = etiquetteDuComite(d);
  if (!membres) {
    if (deja) retirerEtiquette(d, deja.id);
    return;
  }
  const e = deja ?? { ...nouvelle(d), nom: 'Comité', couleur: '#1d4ed8' };
  placer(d, { ...e, type: 'groupe', parDefaut: true, eventId: undefined, sectionId: undefined, lieux: undefined, membres: [...new Set(membres)] });
  // Ses points : ceux qui n'ont ni groupe ni événement.
  completer(d, e.id);
}

/**
 * Les étiquettes suivent leur événement ou leur section (à chaque modification, store.tsx) : nom et dates ; événement
 * renommé, sa sous-section aussi. Événement ou section disparus : l'étiquette reste, à relier (ses points la gardent).
 * Ne change rien quand tout est déjà d'accord.
 */
export function synchroniserEtiquettes(d: AppData) {
  for (const e of [...(d.etiquettes ?? [])]) {
    if (e.eventId) {
      const ev = d.events.find((x) => x.id === e.eventId);
      if (!ev) {
        placer(d, { ...e, eventId: undefined });
        continue;
      }
      const fin = ev.dateFin && ev.dateFin > ev.date ? ev.dateFin : undefined;
      if (e.nom !== ev.nom || e.date !== ev.date || e.dateFin !== fin) reglerEtiquetteEvenement(d, ev, { membres: e.membres ?? [] });
    } else if (e.sectionId) {
      const s = d.sections.find((x) => x.id === e.sectionId);
      if (!s) placer(d, { ...e, sectionId: undefined, lieux: [] });
      else if (e.nom !== s.nom) placer(d, { ...e, nom: s.nom });
    }
  }
}
