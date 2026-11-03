import { useStore } from './store';
import { commentairesDe, dernierMessage, nonLus } from './commentaires';
import type { Commentaire } from './types';

// Messagerie : les discussions que la personne lit (tâche étiquetée : membres de ses étiquettes seulement, 062), la plus
// récente d'abord, avec le nombre de messages pas encore lus (aussi sur l'onglet « Messages »).

export interface DiscussionVue {
  /** La tâche (lecture, notifications). */
  cle: string;
  titre: string;
  liste: Commentaire[];
  /** Où ouvrir la tâche (page Tâches). */
  lien: string;
  dernier: string;
  nonLus: number;
  terminee: boolean;
}

/** Toutes les discussions possibles (celles que je lis), avec ou sans messages. */
export function useDiscussions() {
  const { data, user, canReadDiscussion, discussionLueLe } = useStore();
  if (!user) return { toutes: [] as DiscussionVue[], nonLus: 0 };
  const fini = new Set(data.statuses.filter((s) => s.done).map((s) => s.id));
  const toutes: DiscussionVue[] = data.tasks
    .filter((t) => canReadDiscussion(t))
    .map((t) => {
      const liste = commentairesDe(data, t);
      return {
        cle: t.id,
        titre: t.titre || '(sans titre)',
        liste,
        lien: `/taches?tache=${t.id}`,
        dernier: dernierMessage(liste),
        nonLus: nonLus(liste, discussionLueLe(t.id), user.id),
        terminee: fini.has(t.statusId),
      };
    });
  return { toutes, nonLus: toutes.reduce((n, d) => n + d.nonLus, 0) };
}
