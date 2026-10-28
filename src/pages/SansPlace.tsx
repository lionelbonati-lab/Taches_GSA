import type { ClubMembre, OrgUnit, Status, Task } from '../data/types';
import { AppLogo, Empty } from '../components/ui';
import { nomAppli } from '../data/nomAppli';
import { fmtDate } from '../data/utils';
import { PastilleEntite } from '../components/IconesEntite';
import { Deroulante } from '../components/Deroulante';

/** Une tâche confiée à la personne, dans son entité, avec les statuts de celle-ci. */
export interface TacheConfiee {
  unite: OrgUnit;
  tache: Task;
  statuts: Status[];
}

/**
 * Personne du club sans place dans l'organigramme, avec un accès à l'appli (PERSONNES_DU_CLUB.md, étape 3) : seulement
 * les tâches qui lui sont confiées (son nom sur la tâche), dans toutes les entités ; elle en change le statut et coche
 * leur checklist, enregistrés dans leur entité. Démo ; version réelle : avec le serveur à jour (étape 5).
 */
export function SansPlace({ membre, logo, taches, modifier, sortir, onSortir }: {
  membre: ClubMembre;
  logo?: string;
  taches: TacheConfiee[];
  modifier: (uniteId: string, tacheId: string, patch: Partial<Pick<Task, 'statusId' | 'checklist'>>) => void;
  sortir: string;
  onSortir: () => void;
}) {
  const fini = (x: TacheConfiee) => !!x.statuts.find((s) => s.id === x.tache.statusId)?.done;
  const liste = [...taches].sort((a, b) => Number(fini(a)) - Number(fini(b)) || (a.tache.delai || '9999').localeCompare(b.tache.delai || '9999'));
  return (
    <div className="sans-place">
      <header className="sans-place-tete">
        <AppLogo src={logo ?? null} size={34} />
        <strong>{nomAppli()}</strong>
        <span className="grow" />
        <span className="muted">{membre.prenom} {membre.nom}</span>
        <button className="btn small" onClick={onSortir}>{sortir}</button>
      </header>
      <main className="narrow">
        <h1>Mes tâches</h1>
        <p className="muted">
          Tu n’as pas de place dans l’organigramme du club : tu vois ici les tâches qui te sont confiées, dans toutes ses entités. Change leur statut et
          coche leur checklist au fur et à mesure.
        </p>
        {!liste.length && <Empty>Aucune tâche ne t’est confiée pour l’instant.</Empty>}
        {liste.map(({ unite, tache: t, statuts }) => (
          <section key={`${unite.id}:${t.id}`} className={`panel tache-confiee${fini({ unite, tache: t, statuts }) ? ' finie' : ''}`}>
            <small className="muted tache-confiee-entite">
              <PastilleEntite u={unite} /> {unite.nom}
            </small>
            <h2>{t.titre}</h2>
            {t.delai && <p className="muted">Pour le {fmtDate(t.delai)}</p>}
            {t.remarque && <p className="tache-confiee-remarque">{t.remarque}</p>}
            <label className="tache-confiee-statut">
              Statut
              <Deroulante
                aria-label={`Statut de « ${t.titre} »`}
                value={t.statusId}
                onChange={(v) => modifier(unite.id, t.id, { statusId: v })}
                options={statuts.map((s) => ({ value: s.id, label: s.label, icone: <span className="statut-jeton" style={{ background: s.couleur }} /> }))}
              />
            </label>
            {t.checklist.length > 0 && (
              <ul className="tache-confiee-liste">
                {t.checklist.map((c) => (
                  <li key={c.id}>
                    <label className="inline">
                      <input type="checkbox" checked={c.done} onChange={() => modifier(unite.id, t.id, { checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />
                      {c.label}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
