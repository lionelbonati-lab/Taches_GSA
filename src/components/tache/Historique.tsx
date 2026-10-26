import { useEffect, useState } from 'react';
import { useStore } from '../../data/store';
import { useClubOptional } from '../../data/club';
import { decrireEntree, type HistoriqueTache } from '../../data/historique';
import { fmtDateTime } from '../../data/utils';

/**
 * Historique d'une tâche (050) : qui a changé quoi et quand, du plus récent au plus ancien. Replié ; lu à l'ouverture, puis
 * relu quand la tâche change (`version` : sa date de modification). `uniteId` : entité de la tâche quand ce n'est pas
 * l'entité ouverte (`tacheId` : son identifiant là-bas).
 */
export function Historique({ tacheId, uniteId, version, className = '' }: { tacheId: string; uniteId?: string; version?: string; className?: string }) {
  const { data } = useStore();
  const club = useClubOptional();
  const [ouvert, setOuvert] = useState(false);
  const [h, setH] = useState<HistoriqueTache | null>(null);
  const [err, setErr] = useState('');
  const unite = uniteId ?? club?.current.id ?? '';
  const lire = club?.historique;

  useEffect(() => {
    if (!ouvert || !lire) return;
    let fini = false;
    lire(unite, tacheId).then(
      (x) => {
        if (fini) return;
        setH(x);
        setErr('');
      },
      (e: unknown) => !fini && setErr(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      fini = true;
    };
  }, [ouvert, lire, unite, tacheId, version]);

  if (!lire) return null;
  const ctx = { data, noms: h?.noms ?? {}, entite: (id: string) => club?.units.find((u) => u.id === id)?.nom };
  return (
    <details className={`historique ${className}`} onToggle={(e) => setOuvert(e.currentTarget.open)}>
      <summary>🕘 Historique des changements</summary>
      {err ? (
        <p className="error">{err}</p>
      ) : !h ? (
        <p className="muted">Chargement…</p>
      ) : !h.entrees.length ? (
        <p className="muted">Aucun changement noté pour l’instant.</p>
      ) : (
        <ol className="historique-liste">
          {h.entrees.map((e) => (
            <li key={`${e.le}-${e.par}`}>
              <div>
                <strong>{e.nom}</strong> <small className="muted">· {fmtDateTime(e.le)}</small>
              </div>
              <ul>
                {decrireEntree(e, ctx).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
