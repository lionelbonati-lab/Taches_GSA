import { useStore } from './store';
import { cleEtiquette, commentairesDe, commentairesEtiquette, dernierMessage, nonLus } from './commentaires';
import type { Commentaire, Etiquette } from './types';
import { etiquettesDe } from './permissions';

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
  /** Discussion d'une étiquette (066) : l'étiquette. */
  etiquette?: Etiquette;
  /** Étiquettes du point (des points de même nom, dans des événements différents, se distinguent ainsi). */
  etiquettes: Etiquette[];
}

/** Titre d'une discussion avec les étiquettes du point : « Commander les maillots · Week-end VTT ». */
export const titreAvecEtiquettes = (d: Pick<DiscussionVue, 'titre' | 'etiquettes'>) =>
  d.etiquettes.length ? `${d.titre} · ${d.etiquettes.map((e) => e.nom).join(', ')}` : d.titre;

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
        etiquettes: etiquettesDe(t, data.etiquettes),
      };
    });
  // Discussions des étiquettes dont je suis membre (066).
  for (const e of data.etiquettes ?? []) {
    if (!e.membres?.includes(user.id)) continue;
    const cle = cleEtiquette(e.id);
    const liste = commentairesEtiquette(data, e.id);
    toutes.push({
      cle,
      titre: e.nom,
      liste,
      lien: `/taches?etiquette=${encodeURIComponent(e.id)}`,
      dernier: dernierMessage(liste),
      nonLus: nonLus(liste, discussionLueLe(cle), user.id),
      terminee: false,
      etiquette: e,
      etiquettes: [],
    });
  }
  return { toutes, nonLus: toutes.reduce((n, d) => n + d.nonLus, 0) };
}
