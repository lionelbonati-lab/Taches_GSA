import { lazy, Suspense } from 'react';
import type { TaskModalProps } from './TaskModal';
import { DansEntite } from '../data/entites';
import { useStore } from '../data/store';

// Fenêtre d'une tâche, chargée à la demande (préchargée juste après l'ouverture de l'appli, voir App.tsx).
export const chargerFicheTache = () => import('./TaskModal');
const Fiche = lazy(() => chargerFicheTache().then((m) => ({ default: m.TaskModal })));

export function TaskModal(props: TaskModalProps) {
  // Vue « moi » : tâche de l'une de mes autres entités, ouverte dans la sienne (ses personnes, ses statuts, ses droits).
  const src = props.task.source;
  if (src?.chezMoi) {
    return (
      <DansEntite id={src.uniteId}>
        <FicheChezElle {...props} id={src.id} />
      </DansEntite>
    );
  }
  return (
    <Suspense fallback={null}>
      <Fiche {...props} />
    </Suspense>
  );
}

/** La tâche telle qu'enregistrée dans son entité (fermée si elle n'y est plus). */
function FicheChezElle({ id, ...props }: TaskModalProps & { id: string }) {
  const { dataLocale } = useStore();
  const task = dataLocale.tasks.find((t) => t.id === id);
  if (!task) return null;
  return (
    <Suspense fallback={null}>
      <Fiche {...props} task={task} isNew={false} />
    </Suspense>
  );
}
