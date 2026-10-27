import { lazy, Suspense, useState } from 'react';
import type { ChoixEntite, TaskModalProps } from './TaskModal';
import { DansEntite, useAutres, useRegistre } from '../data/entites';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { applyDelaiRef, newTask } from '../data/utils';
import { versProchaineSeance } from '../data/seances';
import type { AppData, OrgUnit, Task } from '../data/types';

// Fenêtre d'une tâche, chargée à la demande (préchargée juste après l'ouverture de l'appli, voir App.tsx).
export const chargerFicheTache = () => import('./TaskModal');
const Fiche = lazy(() => chargerFicheTache().then((m) => ({ default: m.TaskModal })));

/** `choixEntite` : nouvelle tâche, à créer dans l'entité ouverte ou dans l'une de mes autres entités (vue « moi »). */
export function TaskModal(props: TaskModalProps & { choixEntite?: boolean }) {
  const { choixEntite, ...p } = props;
  // Vue « moi » : tâche de l'une de mes autres entités, ouverte dans la sienne (ses personnes, ses statuts, ses droits).
  const src = p.task.source;
  if (src?.chezMoi) {
    return (
      <DansEntite id={src.uniteId}>
        <FicheChezElle {...p} id={src.id} />
      </DansEntite>
    );
  }
  if (choixEntite && p.isNew) return <NouvelleTache {...p} />;
  return (
    <Suspense fallback={null}>
      <Fiche {...p} />
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

/** Mes autres entités (vue « moi ») où je peux créer une tâche. */
export function useAutresCreation(): OrgUnit[] {
  const club = useClubOptional();
  return useAutres(!club?.arrierePlan)
    .filter((e) => e.store.user && e.store.creatableSections().length > 0)
    .map((e) => e.club.current);
}

/** Nouvelle tâche dans une entité (ses séances pour le délai proposé), avec ce qui a déjà été écrit. */
function tacheDans(d: AppData, userId: string, u: OrgUnit, t: Task): Task {
  const delai = t.delaiRef ? versProchaineSeance(d.meetings, undefined, u.type) : { delai: t.delai };
  return applyDelaiRef(d, newTask(userId, { ...delai, titre: t.titre, remarque: t.remarque, checklist: t.checklist }));
}

/** Nouvelle tâche : dans l'entité ouverte ou dans l'une de mes autres entités, choisie dans la fenêtre (« Entité »). */
function NouvelleTache(props: TaskModalProps) {
  const { data, user, creatableSections } = useStore();
  const club = useClubOptional();
  const registre = useRegistre();
  const autres = useAutresCreation();
  const ici = club?.current;
  const liste = [...(ici && creatableSections().length ? [ici] : []), ...autres];
  const [chez, setChez] = useState<{ id: string; task: Task; n: number } | null>(() => {
    const e = !ici || creatableSections().length || !autres.length ? undefined : registre?.get(autres[0].id);
    return e?.store.user ? { id: e.id, task: tacheDans(e.store.data, e.store.user.id, e.club.current, props.task), n: 0 } : null;
  });
  const changer = (id: string, t: Task) => {
    const e = id === ici?.id ? null : registre?.get(id);
    const moi = e ? e.store.user : user;
    if (!moi || (!e && id !== ici?.id)) return;
    setChez((c) => ({ id, task: e ? tacheDans(e.store.data, moi.id, e.club.current, t) : tacheDans(data, moi.id, ici!, t), n: (c?.n ?? 0) + 1 }));
  };
  const entite: ChoixEntite | undefined = ici && liste.length > 1 ? { liste, valeur: chez?.id ?? ici.id, changer } : undefined;
  const fiche = (
    <Suspense fallback={null}>
      <Fiche {...props} key={chez?.n ?? 0} task={chez?.task ?? props.task} entite={entite} />
    </Suspense>
  );
  return !chez || chez.id === ici?.id ? fiche : <DansEntite id={chez.id}>{fiche}</DansEntite>;
}
