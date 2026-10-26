import { useStore } from './store';
import { useClubOptional } from './club';
import { dernierMessage, nonLus } from './commentaires';
import type { Commentaire, Task } from './types';

// Messagerie : les discussions des tâches que la personne voit (d'ici, partagées avec l'entité, reçues pour info), la
// plus récente d'abord, avec le nombre de messages pas encore lus (aussi sur l'onglet « Messages »).

export interface DiscussionVue {
  /** La tâche vue d'ici (lecture, notifications) : son identifiant, « x:<entité>:<tâche> » si elle est d'ailleurs. */
  cle: string;
  titre: string;
  liste: Commentaire[];
  /** Identifiant de la tâche dans son entité, et cette entité si ce n'est pas celle ouverte. */
  tacheId: string;
  uniteId?: string;
  /** Nom de l'entité de la tâche, quand elle est d'ailleurs. */
  entite?: string;
  /** Où ouvrir la tâche (page Tâches). */
  lien: string;
  dernier: string;
  nonLus: number;
  terminee: boolean;
}

/** Toutes les discussions possibles (tâches vues d'ici, pour info reçues), avec ou sans messages. */
export function useDiscussions() {
  const { data, user, canSeeTask, pourInfo } = useStore();
  const club = useClubOptional();
  if (!user) return { toutes: [] as DiscussionVue[], nonLus: 0 };
  const ici = club?.current.id ?? '';
  const lues = data.discussionsLues?.[user.id] ?? {};
  const fini = new Set(data.statuses.filter((s) => s.done).map((s) => s.id));
  const vue = (cle: string, t: Pick<Task, 'titre' | 'commentaires'>, o: { tacheId: string; uniteId?: string; entite?: string; lien: string; terminee: boolean }): DiscussionVue => {
    const liste = t.commentaires ?? [];
    return { cle, titre: t.titre || '(sans titre)', liste, ...o, dernier: dernierMessage(liste), nonLus: nonLus(liste, lues[cle], user.id, ici, o.uniteId ?? ici) };
  };
  const toutes = [
    ...data.tasks
      .filter((t) => !t.paiement && canSeeTask(t))
      .map((t) => vue(t.id, t, { tacheId: t.source?.id ?? t.id, uniteId: t.source?.uniteId, entite: t.source?.unite, lien: `/taches?tache=${t.id}`, terminee: fini.has(t.statusId) })),
    ...pourInfo.map((x) =>
      vue(`x:${x.uniteId}:${x.task.id}`, x.task, {
        tacheId: x.task.id,
        uniteId: x.uniteId,
        entite: x.unite,
        lien: `/taches?pourinfo=${x.uniteId}:${x.task.id}`,
        terminee: !!x.statuts.find((s) => s.id === x.task.statusId)?.done,
      }),
    ),
  ];
  return { toutes, nonLus: toutes.reduce((n, d) => n + d.nonLus, 0) };
}
