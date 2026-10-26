import { lazy, Suspense } from 'react';
import type { TaskModalProps } from './TaskModal';

// Fenêtre d'une tâche, chargée à la demande (préchargée juste après l'ouverture de l'appli, voir App.tsx).
export const chargerFicheTache = () => import('./TaskModal');
const Fiche = lazy(() => chargerFicheTache().then((m) => ({ default: m.TaskModal })));

export function TaskModal(props: TaskModalProps) {
  return (
    <Suspense fallback={null}>
      <Fiche {...props} />
    </Suspense>
  );
}
