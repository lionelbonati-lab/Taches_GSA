import type { ClubMembre, Status, Task } from '../data/types';
import type { EspaceConfie } from '../data/cloud';
import { AppLogo, Empty } from '../components/ui';
import { nomAppli } from '../data/nomAppli';
import { fmtDate } from '../data/utils';
import { Deroulante } from '../components/Deroulante';

/** Une tâche confiée à la personne, dans son espace, avec ses statuts. */
export interface TacheConfiee {
  unite: EspaceConfie;
  tache: Task;
  statuts: Status[];
}

/**
 * Version réelle, en attendant la reprise (PLAN_APPLI_SIMPLE.md, D3) : personne du club avec un compte, mais sans fiche
 * dans l'appli (056) : seulement les tâches qui lui sont confiées (son nom sur la tâche) ; elle en change le statut et
 * coche leur checklist, enregistrés sur le serveur. Version réelle seulement (CloudApp).
 */
export function SansPlace({ membre, logo, taches, erreur, modifier, sortir, onSortir }: {
  membre: Pick<ClubMembre, 'prenom' | 'nom'>;
  logo?: string;
  taches: TacheConfiee[];
  /** Dernière modification refusée (version réelle). */
  erreur?: string;
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
          Tu n’as pas encore de fiche dans l’appli : tu vois ici les tâches qui te sont confiées. Change leur statut et coche leur checklist au fur et à
          mesure.
        </p>
        {erreur && <p className="error">{erreur}</p>}
        {!liste.length && <Empty>Aucune tâche ne t’est confiée pour l’instant.</Empty>}
        {liste.map(({ unite, tache: t, statuts }) => (
          <section key={`${unite.id}:${t.id}`} className={`panel tache-confiee${fini({ unite, tache: t, statuts }) ? ' finie' : ''}`}>
            <small className="muted tache-confiee-entite">
              <span className="role-pill" style={{ background: unite.couleur ?? '#475569' }}>{unite.nom}</span>
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
