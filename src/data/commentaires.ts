import type { ActivityNotif, Commentaire, Task } from './types';
import { uid } from './utils';

// Discussion sur une tâche (049). Version réelle : le serveur écrit les commentaires et prévient les personnes concernées
// (gsa_commenter) ; démo : les mêmes règles, ici.

export const COMMENTAIRE_MAX = 2000;
export const COMMENTAIRES_MAX = 200;

/** Ajout (texte seul), correction (cle + texte) ou retrait (cle + supprimer). */
export interface ActionCommentaire {
  texte?: string;
  cle?: string;
  supprimer?: boolean;
}

/**
 * Contexte : la fiche de l'auteur et son entité (`depuis`), l'entité de la tâche, admin de celle-ci, la date ; ses fiches
 * dans ses autres entités (`mesFiches`), pour corriger ou retirer de là les messages écrits d'ailleurs.
 */
export interface ContexteCommentaire {
  moi: string;
  nom: string;
  depuis: string;
  unite: string;
  admin: boolean;
  le: string;
  mesFiches?: Record<string, string>;
}

/** Le commentaire est-il de la personne `moi` de l'entité `depuis` (tâche de l'entité `unite`) ? */
export const deMoi = (c: Commentaire, moi: string, depuis: string, unite: string) => c.par === moi && (c.u ?? unite) === depuis;

/**
 * Écrit par moi, depuis l'entité ouverte ou une autre des miennes (`mesFiches` : entité → ma fiche) : il se corrige ou se
 * retire d'ici (version réelle : migration 053 ; avant, seulement depuis l'entité d'où il a été écrit).
 */
export const parMoi = (c: Commentaire, moi: string, depuis: string, unite: string, mesFiches: Record<string, string> = {}) =>
  deMoi(c, moi, depuis, unite) || mesFiches[c.u ?? unite] === c.par;

/** Messages pas encore lus : ceux des autres, arrivés après le dernier vu (`lu`, sa date). */
export const nonLus = (liste: Commentaire[] = [], lu: string | undefined, moi: string, depuis: string, unite: string, mesFiches?: Record<string, string>) =>
  liste.filter((c) => !parMoi(c, moi, depuis, unite, mesFiches) && (!lu || c.le > lu)).length;

/** Date du dernier message de la discussion. */
export const dernierMessage = (liste: Commentaire[] = []) => liste.reduce((m, c) => (c.le > m ? c.le : m), '');

/** Applique l'action à la discussion (démo) ; mêmes refus que le serveur. */
export function appliquerCommentaire(liste: Commentaire[] = [], a: ActionCommentaire, o: ContexteCommentaire): Commentaire[] {
  const texte = (a.texte ?? '').trim();
  const verifier = () => {
    if (!texte || texte.length > COMMENTAIRE_MAX) throw new Error(`Le commentaire doit faire entre 1 et ${COMMENTAIRE_MAX} caractères`);
  };
  if (!a.cle) {
    if (a.supprimer) throw new Error('Commentaire introuvable');
    verifier();
    if (liste.length >= COMMENTAIRES_MAX) throw new Error(`Cette discussion a atteint ${COMMENTAIRES_MAX} commentaires`);
    return [...liste, { id: uid('c'), par: o.moi, ...(o.depuis !== o.unite ? { u: o.depuis } : {}), nom: o.nom || '?', le: o.le, texte }];
  }
  const c = liste.find((x) => x.id === a.cle);
  if (!c) throw new Error('Commentaire introuvable');
  if (!parMoi(c, o.moi, o.depuis, o.unite, o.mesFiches) && !(a.supprimer && o.admin)) throw new Error('Ce commentaire n’est pas le tien');
  if (a.supprimer) return liste.filter((x) => x !== c);
  verifier();
  return c.texte === texte ? liste : liste.map((x) => (x === c ? { ...c, texte, modifieLe: o.le } : x));
}

/**
 * Personnes à prévenir d'un nouveau commentaire, par entité : responsables, auteur de la tâche et ceux qui ont déjà
 * commenté (entité de la tâche, `unite`) ; personnes d'autres entités choisies comme responsables (respPartage) ou qui
 * ont déjà commenté. Sans l'auteur du commentaire (`moi`, de l'entité `depuis`). `t` : la tâche dans son entité.
 */
export function destinatairesCommentaire(t: Pick<Task, 'responsables' | 'createdBy' | 'respPartage' | 'commentaires'>, unite: string, moi: string, depuis: string) {
  const r: Record<string, string[]> = {};
  const ajouter = (e: string, fiche?: string) => {
    if (!fiche || (e === depuis && fiche === moi)) return;
    if (!(r[e] ??= []).includes(fiche)) r[e].push(fiche);
  };
  (t.responsables ?? []).forEach((f) => ajouter(unite, f));
  ajouter(unite, t.createdBy);
  Object.entries(t.respPartage ?? {}).forEach(([e, l]) => l.forEach((f) => ajouter(e, f)));
  (t.commentaires ?? []).forEach((c) => ajouter(c.u ?? unite, c.par));
  return r;
}

/**
 * Une notification par personne (comme le serveur, 053) : une personne concernée dans plusieurs de ses entités n'est
 * prévenue qu'une fois, dans l'entité de la tâche (`unite`) si elle y est concernée, sinon dans celle d'où le message a
 * été écrit (`depuis`), sinon dans la première. `r` : fiches à prévenir par entité (actives) ; `qui` : la personne d'une
 * fiche (rien : la fiche compte pour elle-même).
 */
export function unParPersonne(r: Record<string, string[]>, unite: string, depuis: string, qui: (entite: string, fiche: string) => string | undefined) {
  const rang = (e: string) => (e === unite ? 0 : e === depuis ? 1 : 2);
  const vues = new Set<string>();
  const res: Record<string, string[]> = {};
  for (const e of Object.keys(r).sort((a, b) => rang(a) - rang(b) || (a < b ? -1 : a > b ? 1 : 0)))
    res[e] = r[e].filter((f) => {
      const k = qui(e, f) ?? `${e}:${f}`;
      if (vues.has(k)) return false;
      vues.add(k);
      return true;
    });
  return res;
}

/** Aperçu du commentaire dans la notification. */
export const apercu = (texte: string) => (texte.length > 140 ? `${texte.slice(0, 139)}…` : texte);

/**
 * Notifications d'un nouveau commentaire pour les personnes `fiches` de l'entité `entite` (comme le serveur) : la tâche
 * vue d'ici (« x:<entité>:<tâche> » si elle est d'une autre entité), l'auteur nommé s'il est d'ailleurs (sans son entité).
 */
export function notifsCommentaire(fiches: string[], o: { entite: string; unite: string; tache: string; titre: string; moi: string; depuis: string; nom: string; texte: string; le: string }): ActivityNotif[] {
  return fiches.map((userId) => ({
    id: uid('n'),
    userId,
    type: 'comment' as const,
    taskId: o.entite === o.unite ? o.tache : `x:${o.unite}:${o.tache}`,
    by: o.entite === o.depuis ? o.moi : `x:${o.depuis}:${o.moi}`,
    ...(o.entite !== o.depuis ? { byName: o.nom || '?' } : {}),
    at: o.le,
    titre: o.titre,
    detail: apercu(o.texte.trim()),
  }));
}
