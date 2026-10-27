import type { AppData, ChecklistItem, Paiement, Task, TaskDoc } from './types';
import { fmtDate, fullName, recurrenceLabel } from './utils';

/**
 * Historique d'une tâche (050) : qui a changé quoi et quand. Version réelle : noté par le serveur à chaque écriture de la
 * tâche ; démo : par l'appli, à l'enregistrement des données d'une entité. Les deux suivent les mêmes règles (ce module) :
 * champs suivis, valeurs « vides » confondues, changements d'une même personne regroupés pendant 10 minutes, 100 entrées
 * par tâche au plus.
 */
export interface EntreeHistorique {
  /** Date ISO. */
  le: string;
  /** Qui (compte en version réelle, email en démo) : regroupe ses changements rapprochés. */
  par: string;
  /** Nom affiché : « Prénom Nom », ou « Prénom Nom (Entité) » depuis une autre entité. */
  nom: string;
  /** Création, suppression ou rétablissement ; absent : modification. */
  quoi?: 'creee' | 'supprimee' | 'retablie';
  /** Champ de la tâche → [avant, après] (null : vide). */
  champs: Record<string, [unknown, unknown]>;
}

/** Champs non suivis : notés ailleurs (discussion, « Vu »), techniques, ou recalculés par l'appli. */
export const CHAMPS_IGNORES = [
  'updatedAt', 'commentaires', 'pourInfoVus', 'modifiePar', 'source', 'pieces', 'suivanteId', 'termineeLe', 'postesResp',
  'createdBy', 'placePartage', 'parCentral', 'copieDe', 'attribueePar', 'proposee', 'id', 'contenuLe',
];
/** Valeur trop longue pour l'historique : seul le changement est noté. */
export const TROP_LONG = '(trop long)';
export const HISTORIQUE_MAX = 100;
const REGROUPER_MS = 10 * 60 * 1000;

const vide = (v: unknown) =>
  v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length);

/** Valeur gardée dans l'historique (null : vide) ; pour un paiement, son état et son montant seulement. */
export function valeurSuivie(cle: string, v: unknown): unknown {
  if (vide(v)) return null;
  if (cle === 'paiement' && typeof v === 'object') {
    const p = v as Partial<Paiement>;
    v = { etat: p.etat ?? null, montant: p.montant ?? null };
  } else if ((cle === 'seanceComite' || cle === 'evenementEntite') && typeof v === 'object') {
    const x = v as { uniteId?: string; id?: string };
    v = { uniteId: x.uniteId ?? null, id: x.id ?? null };
  }
  return JSON.stringify(v).length > 4000 ? TROP_LONG : v;
}

/** Même valeur (ordre des clés d'un objet indifférent, comme jsonb). */
export function pareil(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => pareil(x, (b as unknown[])[i]));
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => pareil((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Changements entre deux versions d'une tâche (absente : pas encore créée, ou supprimée) ; null : rien de suivi. */
export function changementsTache(avant: Task | undefined, apres: Task | undefined): Pick<EntreeHistorique, 'quoi' | 'champs'> | null {
  if (!apres) return avant ? { quoi: 'supprimee', champs: {} } : null;
  if (!avant) return { quoi: 'creee', champs: {} };
  const champs: EntreeHistorique['champs'] = {};
  const a = avant as unknown as Record<string, unknown>;
  const b = apres as unknown as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (CHAMPS_IGNORES.includes(k)) continue;
    const x = valeurSuivie(k, a[k]);
    const y = valeurSuivie(k, b[k]);
    if (!pareil(x, y)) champs[k] = [x, y];
  }
  return Object.keys(champs).length ? { champs } : null;
}

/**
 * Ajoute une entrée en tête de l'historique (du plus récent au plus ancien). Une modification qui suit de moins de
 * 10 minutes une modification de la même personne s'y ajoute (première valeur « avant », dernière « après » ; un champ
 * revenu à sa valeur de départ disparaît, et l'entrée aussi s'il n'en reste aucun).
 */
export function ajouterHistorique(liste: EntreeHistorique[], e: EntreeHistorique): EntreeHistorique[] {
  const [der, ...reste] = liste;
  if (der && !der.quoi && !e.quoi && der.par === e.par && Date.parse(e.le) - Date.parse(der.le) < REGROUPER_MS) {
    const champs = { ...der.champs };
    for (const [k, [, apres]] of Object.entries(e.champs)) {
      const avant = k in champs ? champs[k][0] : e.champs[k][0];
      if (pareil(avant, apres)) delete champs[k];
      else champs[k] = [avant, apres];
    }
    return Object.keys(champs).length ? [{ ...der, le: e.le, champs }, ...reste] : reste;
  }
  return [e, ...liste].slice(0, HISTORIQUE_MAX);
}

/**
 * Historique lu pour une tâche, avec les noms pris dans son entité (« p:fiche », « s:statut », « sec:section ») des
 * personnes, statuts et sections qu'il cite : une tâche d'une autre entité s'affiche avec ses propres noms.
 */
export interface HistoriqueTache {
  entrees: EntreeHistorique[];
  noms: Record<string, string>;
}

/** Noms cités par l'historique, pris dans les données de l'entité de la tâche (démo ; version réelle : le serveur). */
export function nomsCites(d: AppData, entrees: EntreeHistorique[]): Record<string, string> {
  const noms: Record<string, string> = {};
  const ids = (cle: string) => entrees.flatMap((e) => (e.champs[cle] ?? []).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v): v is string => typeof v === 'string'));
  for (const id of ids('responsables')) {
    const p = d.people.find((x) => x.id === id);
    if (p) noms[`p:${id}`] = fullName(p);
  }
  for (const id of ids('statusId')) {
    const st = d.statuses.find((x) => x.id === id);
    if (st) noms[`s:${id}`] = st.label;
  }
  for (const id of ids('sectionId')) {
    const se = d.sections.find((x) => x.id === id);
    if (se) noms[`sec:${id}`] = se.nom;
  }
  return noms;
}

/** Ce qu'il faut pour nommer statuts, sections, personnes, entités… */
export interface ContexteHistorique {
  data: AppData;
  noms: Record<string, string>;
  entite: (id: string) => string | undefined;
}

const LIBELLES: Record<string, string> = {
  documents: 'Documents', delaiRef: 'Délai calé sur un événement ou une séance', respPartage: 'Responsables des entités du partage',
  pourInfo: 'Pour info', aPrendre: 'À prendre', seanceComite: 'Séance du comité', evenementEntite: 'Événement d’une entité',
  auCentral: 'Partage avec le comité central',
};
const ETATS: Record<string, string> = { recu: 'reçu', visa: 'visa demandé', valide: 'visé', paye: 'payé', refuse: 'refusé' };

const guillemets = (s: unknown, max = 80) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return `« ${t.length > max ? `${t.slice(0, max - 1)}…` : t} »`;
};
const liste = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);

/** « + A, B ; − C » : ce qui a été ajouté et retiré d'une liste (noms). */
function plusMoins(a: unknown, b: unknown, nom: (x: string) => string) {
  const x = liste(a).map(String);
  const y = liste(b).map(String);
  const plus = y.filter((v) => !x.includes(v)).map(nom);
  const moins = x.filter((v) => !y.includes(v)).map(nom);
  return [plus.length ? `+ ${plus.join(', ')}` : '', moins.length ? `− ${moins.join(', ')}` : ''].filter(Boolean).join(' ; ') || 'ordre changé';
}

function checklist(a: unknown, b: unknown) {
  const x = liste(a) as ChecklistItem[];
  const y = liste(b) as ChecklistItem[];
  const out: string[] = [];
  for (const i of y) {
    const j = x.find((k) => k.id === i.id);
    if (!j) out.push(`+ ${guillemets(i.label, 50)}`);
    else {
      if (j.label !== i.label) out.push(`${guillemets(j.label, 40)} → ${guillemets(i.label, 40)}`);
      if (!!j.done !== !!i.done) out.push(`${i.done ? '☑' : '☐'} ${guillemets(i.label, 50)}`);
    }
  }
  for (const j of x) if (!y.some((i) => i.id === j.id)) out.push(`− ${guillemets(j.label, 50)}`);
  return out.join(' ; ') || 'ordre changé';
}

/** Une ligne lisible par champ changé. */
export function decrireChamp(cle: string, [a, b]: [unknown, unknown], ctx: ContexteHistorique): string {
  const { data, noms } = ctx;
  if (a === TROP_LONG || b === TROP_LONG) return `${LIBELLES[cle] ?? 'Détail'} modifié`;
  const fleche = (f: (v: unknown) => string) => `${f(a)} → ${f(b)}`;
  const personne = (id: string) => {
    const p = data.people.find((x) => x.id === id);
    return noms[`p:${id}`] ?? (p ? fullName(p) : 'une personne');
  };
  switch (cle) {
    case 'titre':
      return `Titre : ${fleche((v) => guillemets(v))}`;
    case 'statusId':
      return `Statut : ${fleche((v) => noms[`s:${String(v)}`] ?? data.statuses.find((s) => s.id === v)?.label ?? '—')}`;
    case 'delai':
      return `Délai : ${fleche((v) => (v ? fmtDate(String(v)) : 'sans délai'))}`;
    case 'responsables':
      return `Responsables : ${plusMoins(a, b, personne)}`;
    case 'remarque':
      return b ? `Remarque : ${guillemets(b, 120)}` : 'Remarque effacée';
    case 'sectionId':
      return `Section : ${fleche((v) => noms[`sec:${String(v)}`] ?? data.sections.find((s) => s.id === v)?.nom ?? '—')}`;
    case 'sousSection':
      return `Sous-section : ${fleche((v) => (v ? String(v) : '—'))}`;
    case 'checklist':
      return `Checklist : ${checklist(a, b)}`;
    case 'documents':
      return `Documents : ${plusMoins(liste(a).map((d) => (d as TaskDoc).nom), liste(b).map((d) => (d as TaskDoc).nom), (n) => n)}`;
    case 'recurrence':
      return `Répétition : ${fleche((v) => (v ? recurrenceLabel(v as Task['recurrence']) || String(v) : 'aucune'))}`;
    case 'eventId':
      return `Événement : ${fleche((v) => (v ? (data.events.find((e) => e.id === v)?.nom ?? 'un événement') : 'aucun'))}`;
    case 'meetingId':
      return `Séance : ${fleche((v) => (v ? (data.meetings.find((m) => m.id === v)?.titre ?? 'une séance') : 'aucune'))}`;
    case 'parentId':
      return `Tâche principale : ${fleche((v) => (v ? guillemets(data.tasks.find((t) => t.id === v)?.titre ?? 'une tâche', 50) : 'aucune'))}`;
    case 'partage':
      return `Partagée avec : ${plusMoins(a, b, (id) => ctx.entite(id) ?? 'une entité')}`;
    case 'paiement': {
      const p = (a ?? {}) as Partial<Paiement>;
      const q = (b ?? {}) as Partial<Paiement>;
      const out: string[] = [];
      if (p.etat !== q.etat) out.push(`Paiement : ${ETATS[p.etat ?? ''] ?? '—'} → ${ETATS[q.etat ?? ''] ?? '—'}`);
      if (p.montant !== q.montant) out.push(`Montant : ${p.montant ?? '—'} → ${q.montant ?? '—'}`);
      return out.join(' ; ') || 'Paiement modifié';
    }
    case 'auCentral':
      return b ? 'Partagée avec le comité central' : 'Plus partagée avec le comité central';
    default:
      return `${LIBELLES[cle] ?? 'Autre détail'} ${a === null ? 'ajouté' : b === null ? 'retiré' : 'modifié'}`;
  }
}

/** Ce que dit une entrée : « a créé la tâche », ou une ligne par champ changé. */
export function decrireEntree(e: EntreeHistorique, ctx: ContexteHistorique): string[] {
  if (e.quoi === 'creee') return ['a créé la tâche'];
  if (e.quoi === 'supprimee') return ['a supprimé la tâche'];
  if (e.quoi === 'retablie') return ['a rétabli la tâche'];
  // Date de modification du contenu (052) : notée par le serveur avec le reste, pas un changement en soi.
  return Object.entries(e.champs).filter(([k]) => !CHAMPS_IGNORES.includes(k)).map(([k, v]) => decrireChamp(k, v, ctx));
}
