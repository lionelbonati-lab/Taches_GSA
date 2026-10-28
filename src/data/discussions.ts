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
  /** Vue du club : celle de mes entités où elle s'ouvre, quand ce n'est pas la sienne (partagée avec elle, reçue pour info). */
  via?: string;
  /** Où ouvrir la tâche (page Tâches). */
  lien: string;
  dernier: string;
  nonLus: number;
  terminee: boolean;
}

/** Toutes les discussions possibles (tâches vues d'ici, pour info reçues), avec ou sans messages. */
export function useDiscussions() {
  // Vue « moi » : avec les tâches de mes autres entités.
  const { dataMoi: data, user, canSeeTask, pourInfo, discussionLueLe } = useStore();
  const club = useClubOptional();
  if (!user) return { toutes: [] as DiscussionVue[], nonLus: 0 };
  const ici = club?.current.id ?? '';
  const fini = new Set(data.statuses.filter((s) => s.done).map((s) => s.id));
  const vue = (cle: string, t: Pick<Task, 'titre' | 'commentaires'>, o: { tacheId: string; uniteId?: string; entite?: string; via?: string; lien: string; terminee: boolean }): DiscussionVue => {
    const liste = t.commentaires ?? [];
    return { cle, titre: t.titre || '(sans titre)', liste, ...o, dernier: dernierMessage(liste), nonLus: nonLus(liste, discussionLueLe(cle), user.id, ici, o.uniteId ?? ici, club?.mesFiches) };
  };
  const toutes = [
    ...data.tasks
      .filter((t) => !t.paiement && canSeeTask(t))
      .map((t) => vue(t.id, t, { tacheId: t.source?.id ?? t.id, uniteId: t.source?.uniteId, entite: t.source?.unite, via: t.source?.via, lien: `/taches?tache=${t.id}`, terminee: fini.has(t.statusId) })),
    // Une tâche de l'une de mes autres entités y est déjà (vue « moi ») : une seule fois.
    ...pourInfo.filter((x) => !data.tasks.some((t) => t.id === `x:${x.uniteId}:${x.task.id}`)).map((x) =>
      vue(`x:${x.uniteId}:${x.task.id}`, x.task, {
        tacheId: x.task.id,
        uniteId: x.uniteId,
        entite: x.unite,
        via: x.chez,
        lien: `/taches?pourinfo=${x.uniteId}:${x.task.id}`,
        terminee: !!x.statuts.find((s) => s.id === x.task.statusId)?.done,
      }),
    ),
  ];
  return { toutes, nonLus: toutes.reduce((n, d) => n + d.nonLus, 0) };
}
