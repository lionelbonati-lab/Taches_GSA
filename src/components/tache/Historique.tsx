import { useEffect, useState } from 'react';
import { useStore } from '../../data/store';
import { useClubOptional } from '../../data/club';
import { decrireEntree, type HistoriqueTache } from '../../data/historique';
import { fmtDateTime } from '../../data/utils';

/**
 * Historique d'une tâche (050) : qui a changé quoi et quand, du plus récent au plus ancien. Replié ; lu à l'ouverture, puis
 * relu quand la tâche change (`version` : sa date de modification).
 */
export function Historique({ tacheId, version, className = '' }: { tacheId: string; version?: string; className?: string }) {
  const { data } = useStore();
  const club = useClubOptional();
  const [ouvert, setOuvert] = useState(false);
  const [h, setH] = useState<HistoriqueTache | null>(null);
  const [err, setErr] = useState('');
  const lire = club?.historique;

  useEffect(() => {
    if (!ouvert || !lire) return;
    let fini = false;
    lire(tacheId).then(
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
  }, [ouvert, lire, tacheId, version]);

  if (!lire) return null;
  // Anciennes entités (partage d'avant l'espace unique) : sans nom.
  const ctx = { data, noms: h?.noms ?? {}, entite: () => undefined };
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
