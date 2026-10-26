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

/** Contexte : la fiche de l'auteur et son entité (`depuis`), l'entité de la tâche, admin de celle-ci, la date. */
export interface ContexteCommentaire {
  moi: string;
  nom: string;
  depuis: string;
  unite: string;
  admin: boolean;
  le: string;
}

/** Le commentaire est-il de la personne `moi` de l'entité `depuis` (tâche de l'entité `unite`) ? */
export const deMoi = (c: Commentaire, moi: string, depuis: string, unite: string) => c.par === moi && (c.u ?? unite) === depuis;

/** Messages pas encore lus : ceux des autres, arrivés après le dernier vu (`lu`, sa date). */
export const nonLus = (liste: Commentaire[] = [], lu: string | undefined, moi: string, depuis: string, unite: string) =>
  liste.filter((c) => !deMoi(c, moi, depuis, unite) && (!lu || c.le > lu)).length;

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
  if (!deMoi(c, o.moi, o.depuis, o.unite) && !(a.supprimer && o.admin)) throw new Error('Ce commentaire n’est pas le tien');
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

/** Aperçu du commentaire dans la notification. */
export const apercu = (texte: string) => (texte.length > 140 ? `${texte.slice(0, 139)}…` : texte);

/**
 * Notifications d'un nouveau commentaire pour les personnes `fiches` de l'entité `entite` (comme le serveur) : la tâche
 * vue d'ici (« x:<entité>:<tâche> » si elle est d'une autre entité), l'auteur nommé s'il est d'ailleurs.
 */
export function notifsCommentaire(fiches: string[], o: { entite: string; unite: string; tache: string; titre: string; moi: string; depuis: string; nom: string; nomDepuis: string; texte: string; le: string }): ActivityNotif[] {
  return fiches.map((userId) => ({
    id: uid('n'),
    userId,
    type: 'comment' as const,
    taskId: o.entite === o.unite ? o.tache : `x:${o.unite}:${o.tache}`,
    by: o.entite === o.depuis ? o.moi : `x:${o.depuis}:${o.moi}`,
    ...(o.entite !== o.depuis ? { byName: `${o.nom || '?'} (${o.nomDepuis || '?'})` } : {}),
    at: o.le,
    titre: o.titre,
    detail: apercu(o.texte.trim()),
  }));
}
