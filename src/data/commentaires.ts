import type { ActivityNotif, AppData, Commentaire, Etiquette, Task } from './types';
import { etiquettesDe } from './permissions';
import { uid } from './utils';

// Discussion sur une tâche (049, à part de la tâche depuis 062). Version réelle : le serveur écrit les commentaires et
// prévient les personnes concernées (gsa_commenter) ; démo : les mêmes règles, ici.

/** Messages de la discussion de la tâche : sa discussion à part (062), sinon ceux restés dans la tâche (avant 062). */
export const commentairesDe = (d: Pick<AppData, 'discussions'>, t: Pick<Task, 'id' | 'commentaires'>): Commentaire[] =>
  d.discussions?.[t.id]?.commentaires ?? t.commentaires ?? [];

/** Personnes ajoutées à la discussion de la tâche (063, fiches). */
export const ajouteesDe = (d: Pick<AppData, 'discussions'>, t: Pick<Task, 'id'>): string[] => d.discussions?.[t.id]?.participants ?? [];

export const COMMENTAIRE_MAX = 2000;
export const COMMENTAIRES_MAX = 200;

/** Ajout (texte seul), correction (cle + texte) ou retrait (cle + supprimer). */
export interface ActionCommentaire {
  texte?: string;
  cle?: string;
  supprimer?: boolean;
}

/** Contexte : la fiche de l'auteur, son nom, admin ou non, la date. */
export interface ContexteCommentaire {
  moi: string;
  nom: string;
  admin: boolean;
  le: string;
}

/** Le commentaire est-il de la personne `moi` ? */
export const parMoi = (c: Commentaire, moi: string) => c.par === moi;

/** Messages pas encore lus : ceux des autres, arrivés après le dernier vu (`lu`, sa date). */
export const nonLus = (liste: Commentaire[] = [], lu: string | undefined, moi: string) => liste.filter((c) => !parMoi(c, moi) && (!lu || c.le > lu)).length;

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
    return [...liste, { id: uid('c'), par: o.moi, nom: o.nom || '?', le: o.le, texte }];
  }
  const c = liste.find((x) => x.id === a.cle);
  if (!c) throw new Error('Commentaire introuvable');
  if (!parMoi(c, o.moi) && !(a.supprimer && o.admin)) throw new Error('Ce commentaire n’est pas le tien');
  if (a.supprimer) return liste.filter((x) => x !== c);
  verifier();
  return c.texte === texte ? liste : liste.map((x) => (x === c ? { ...c, texte, modifieLe: o.le } : x));
}

/**
 * Personnes à prévenir d'un nouveau commentaire : responsables, auteur de la tâche, ceux qui ont déjà commenté (`liste`)
 * et les personnes ajoutées à la discussion (`ajoutees`, 063), sans l'auteur du commentaire (`moi`) ; tâche étiquetée
 * (062) : seulement ceux qui lisent la discussion (membres de ses étiquettes, personnes ajoutées).
 */
export function destinatairesCommentaire(
  t: Pick<Task, 'responsables' | 'createdBy' | 'etiquettes'>,
  liste: Commentaire[],
  moi: string,
  etiquettes?: Etiquette[],
  ajoutees: string[] = [],
) {
  const r = new Set<string>([...(t.responsables ?? []), t.createdBy, ...liste.map((c) => c.par), ...ajoutees].filter(Boolean));
  r.delete(moi);
  const siennes = etiquettesDe(t, etiquettes);
  return [...r].filter((id) => !siennes.length || ajoutees.includes(id) || siennes.some((x) => x.membres.includes(id)));
}

/** Aperçu du commentaire dans la notification. */
export const apercu = (texte: string) => (texte.length > 140 ? `${texte.slice(0, 139)}…` : texte);

/** Notifications d'un nouveau commentaire pour les personnes `fiches` (comme le serveur). */
export function notifsCommentaire(fiches: string[], o: { tache: string; titre: string; moi: string; texte: string; le: string }): ActivityNotif[] {
  return fiches.map((userId) => ({
    id: uid('n'),
    userId,
    type: 'comment' as const,
    taskId: o.tache,
    by: o.moi,
    at: o.le,
    titre: o.titre,
    detail: apercu(o.texte.trim()),
  }));
}
