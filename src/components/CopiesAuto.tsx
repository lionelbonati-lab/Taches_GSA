import { useCallback, useEffect, useState } from 'react';
import { copieAuto, copierMaintenant, copiesAuto, type CopieAuto } from '../data/cloud';
import { downloadBackup } from '../data/backup';
import { fmtDateTime } from '../data/utils';
import type { AppData } from '../data/types';

const taille = (o: number) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);

/**
 * Copies des données de l'entité gardées par le serveur (036) : chaque nuit si quelque chose a changé, pendant 30 jours.
 * Admins de l'entité : téléchargement (fichier de sauvegarde habituel), restauration, copie tout de suite.
 */
export function CopiesAuto({ unite, nom, restore }: { unite: string; nom: string; restore: (d: AppData, label: string) => void }) {
  // undefined : chargement ; null : le serveur ne fait pas encore de copies (migration 036).
  const [copies, setCopies] = useState<CopieAuto[] | null | undefined>(undefined);
  const [tout, setTout] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const charger = useCallback(async () => {
    try {
      setCopies(await copiesAuto(unite));
    } catch (e) {
      setCopies([]);
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, [unite]);
  useEffect(() => {
    charger();
  }, [charger]);

  const action = async (f: () => Promise<string | void>) => {
    setOccupe(true);
    setMsg(null);
    try {
      const text = await f();
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setOccupe(false);
      charger();
    }
  };

  const telecharger = (c: CopieAuto) =>
    action(async () => {
      const data = await copieAuto(unite, c.id);
      downloadBackup({ app: 'taches-gsa', version: 1, exportedAt: c.faiteLe, exportedBy: 'Copie automatique du serveur', schema: data.schema ?? 0, data, files: {} });
    });
  const restaurer = (c: CopieAuto) => {
    if (!confirm(`Remplacer toutes les données de « ${nom} » (pour tous ses membres) par la copie du ${fmtDateTime(c.faiteLe)} ?\n\nLes fichiers joints ne changent pas. L’état actuel est d’abord copié : tu pourras revenir en arrière depuis cette liste.`)) return;
    action(async () => {
      const data = await copieAuto(unite, c.id);
      await copierMaintenant(unite);
      restore(data, `la copie du serveur du ${fmtDateTime(c.faiteLe)}`);
      return `✅ Données restaurées depuis la copie du ${fmtDateTime(c.faiteLe)} (${data.tasks.length} tâches, ${data.meetings.length} séances).`;
    });
  };
  const copier = () => action(async () => ((await copierMaintenant(unite)) ? '✅ Copie faite.' : 'Rien n’a changé depuis la dernière copie : elle est à jour.'));

  if (copies === undefined) return <p className="muted copies-auto">Chargement des copies automatiques…</p>;
  if (copies === null)
    return (
      <div className="copies-auto">
        <h3>🕑 Copies automatiques</h3>
        <p className="muted">Le serveur ne fait pas encore de copie automatique chaque nuit (mise à jour 036 à appliquer).</p>
      </div>
    );
  const liste = tout ? copies : copies.slice(0, 7);
  return (
    <div className="copies-auto">
      <h3>🕑 Copies automatiques</h3>
      <p className="muted">
        Chaque nuit, le serveur garde une copie complète des données de « {nom} », si quelque chose a changé depuis la veille, pendant <b>30 jours</b>. Les
        fichiers joints n’y sont pas : ils restent rangés sur le serveur et la restauration n’y touche pas.
      </p>
      {copies.length === 0 ? (
        <p className="muted">Pas encore de copie.</p>
      ) : (
        <ul className="copies-liste">
          {liste.map((c) => (
            <li key={c.id}>
              <span>
                <b>{fmtDateTime(c.faiteLe)}</b> <small className="muted">· {c.manuelle ? 'manuelle' : 'de la nuit'} · {c.lignes} éléments · {taille(c.taille)}</small>
              </span>
              <span className="row">
                <button className="btn small" disabled={occupe} onClick={() => telecharger(c)} title="Télécharger cette copie (fichier de sauvegarde)">⬇</button>
                <button className="btn small" disabled={occupe} onClick={() => restaurer(c)}>↩ Restaurer</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row wrap">
        <button className="btn" disabled={occupe} onClick={copier}>📸 Copier maintenant</button>
        {copies.length > 7 && (
          <button className="btn link" onClick={() => setTout(!tout)}>
            {tout ? 'Seulement les plus récentes' : `Toutes les copies (${copies.length})`}
          </button>
        )}
      </div>
      {msg && <p className={msg.ok ? 'backup-ok' : 'error'}>{msg.text}</p>}
    </div>
  );
}
