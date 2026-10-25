import type { AppData } from './types';
import { stable } from './cloud';

// « Annuler » : une action (tâche enregistrée, présences, réglage…) retient l'état d'avant et d'après des éléments
// qu'elle a changés. L'annuler remet l'état d'avant ; un élément modifié depuis (par une autre action ou un autre
// membre) ne revient que pour les champs que l'action avait changés et que personne n'a touchés depuis.

/** Élément changé par une action : une fiche d'une liste (tâche, séance…), ou une donnée entière (réglages…). */
export interface Changement {
  cle: string;
  /** Fiche d'une liste : son identifiant et sa place d'avant. */
  id?: string;
  rang?: number;
  avant?: unknown;
  apres?: unknown;
}

// Jamais annulés : le journal d'activité, les préférences et les notifications lues de chacun.
const HORS = new Set(['log', 'prefs', 'notifLues']);

type Fiche = { id: string };
const enListe = (v: unknown): v is Fiche[] => Array.isArray(v) && v.every((x) => !!x && typeof x === 'object' && 'id' in x);
const objet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const egal = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Éléments qui diffèrent entre deux états des données. */
export function changements(avant: AppData, apres: AppData): Changement[] {
  const a = avant as unknown as Record<string, unknown>;
  const b = apres as unknown as Record<string, unknown>;
  const out: Changement[] = [];
  for (const cle of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[cle];
    const vb = b[cle];
    if (HORS.has(cle) || va === vb) continue;
    if (enListe(va ?? []) && enListe(vb ?? [])) {
      const ia = new Map((va as Fiche[] | undefined ?? []).map((x, i) => [x.id, { x, i }]));
      const ib = new Map((vb as Fiche[] | undefined ?? []).map((x, i) => [x.id, { x, i }]));
      for (const id of new Set([...ia.keys(), ...ib.keys()])) {
        const xa = ia.get(id);
        const xb = ib.get(id);
        if (xa && xb && (xa.x === xb.x || JSON.stringify(xa.x) === JSON.stringify(xb.x))) continue;
        out.push({ cle, id, rang: xa?.i ?? xb?.i, avant: xa?.x, apres: xb?.x });
      }
    } else if (!egal(va, vb)) out.push({ cle, avant: va, apres: vb });
  }
  return out;
}

type TacheDocs = { paiement?: unknown; documents?: { id: string; kind: string }[] };
/**
 * Action qu'« Annuler » ne peut pas défaire : paiements (visa et caisse enregistrés par le serveur, justificatifs) et
 * tâches dont des fichiers joints ont été effacés (supprimées, fichier retiré).
 */
export function horsAnnulation(items: Changement[]): boolean {
  return items.some((c) => {
    if (c.cle !== 'tasks') return false;
    const a = c.avant as TacheDocs | undefined;
    const b = c.apres as TacheDocs | undefined;
    if (a?.paiement || b?.paiement) return true;
    const gardes = new Set((b?.documents ?? []).map((d) => d.id));
    return (a?.documents ?? []).some((d) => d.kind === 'fichier' && !gardes.has(d.id));
  });
}

/** Changements de deux actions successives réunis (la seconde complète la première). */
export function reunir(premiers: Changement[], suivants: Changement[]): Changement[] {
  const out = [...premiers];
  for (const c of suivants) {
    const i = out.findIndex((x) => x.cle === c.cle && x.id === c.id);
    if (i < 0) out.push(c);
    else out[i] = { ...out[i], apres: c.apres };
  }
  return out;
}

// Créés par une action puis retouchés : retirés champ par champ (ce que l'action y avait mis), le reste gardé. PV d'une
// séance : créé par sa première action (souvent « Démarrer ») ; l'annuler laisse les notes prises depuis.
const PARTIELS = new Set(['minutes']);

/**
 * Valeur d'avant une action : remise si rien n'a changé depuis l'action ; sinon champ par champ, seulement là où
 * l'action avait changé quelque chose et que personne n'a retouché. `conflit` : un champ modifié depuis est gardé.
 */
export function revenir(actuel: unknown, avant: unknown, apres: unknown, conflit: () => void, cle?: string): unknown {
  if (egal(actuel, apres) || egal(actuel, avant)) return avant;
  const base = avant === undefined && cle && PARTIELS.has(cle) ? {} : avant;
  if (objet(actuel) && objet(base) && objet(apres)) {
    const r: Record<string, unknown> = { ...actuel };
    for (const k of new Set([...Object.keys(base), ...Object.keys(apres)])) {
      if (egal(base[k], apres[k])) continue;
      const v = revenir(actuel[k], base[k], apres[k], conflit, k);
      if (v === undefined) delete r[k];
      else r[k] = v;
    }
    return avant === undefined && !Object.keys(r).length ? undefined : r;
  }
  conflit();
  return actuel;
}

/** Données remises comme avant les changements ; `conflits` : éléments modifiés depuis, pas entièrement remis. */
export function annulerChangements(d: AppData, items: Changement[]): { data: AppData; conflits: number } {
  const next = structuredClone(d) as unknown as Record<string, unknown>;
  const touches = new Set<string>();
  for (const c of [...items].reverse()) {
    const signaler = () => touches.add(`${c.cle}|${c.id ?? ''}`);
    if (c.id === undefined) {
      const v = revenir(next[c.cle], c.avant, c.apres, signaler);
      if (v === undefined) delete next[c.cle];
      else next[c.cle] = structuredClone(v);
      continue;
    }
    const liste = [...((next[c.cle] as Fiche[] | undefined) ?? [])];
    const i = liste.findIndex((x) => x.id === c.id);
    const v = revenir(i >= 0 ? liste[i] : undefined, c.avant, c.apres, signaler) as Fiche | undefined;
    if (!v) {
      if (i >= 0) liste.splice(i, 1);
    } else if (i >= 0) liste[i] = structuredClone(v);
    else liste.splice(Math.min(c.rang ?? liste.length, liste.length), 0, structuredClone(v));
    next[c.cle] = liste;
  }
  return { data: next as unknown as AppData, conflits: touches.size };
}
