import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { CENTRAL_ACCESS, centralAccess } from '../data/units';
import type { CentralAccess } from '../data/types';

// Réglage d'une entité (sous-comité, groupe, équipe) : ce que le comité central peut faire de ses données.
// Seuls les admins de l'entité le changent ; le serveur applique la règle (migration 006).

const LEVELS: CentralAccess[] = ['aucun', 'lecture', 'ecriture'];

export function CentralAccessChoice({ value, onChange, disabled, name }: { value: CentralAccess; onChange: (v: CentralAccess) => void; disabled?: boolean; name: string }) {
  return (
    <div className="access-choice" role="radiogroup" aria-label="Accès du comité central">
      {LEVELS.map((k) => (
        <label key={k} className={`access-option ${value === k ? 'on' : ''} ${disabled ? 'off' : ''}`}>
          <input type="radio" name={name} checked={value === k} disabled={disabled} onChange={() => onChange(k)} />
          <span>
            <b>{CENTRAL_ACCESS[k].icon} {CENTRAL_ACCESS[k].label}</b>
            <small>{CENTRAL_ACCESS[k].aide}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

/** Console admin d'une entité : le réglage, enregistré dès qu'on le change. */
export function CentralAccessPanel() {
  const club = useClubOptional();
  const { update, setToast } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const saved = club ? centralAccess(club.current) : 'aucun';
  // Choix affiché tout de suite (la version réelle relit ensuite l'organigramme du serveur).
  const [value, setValue] = useState<CentralAccess>(saved);
  useEffect(() => setValue(saved), [saved]);
  if (!club || club.current.type === 'central') return null;
  const u = club.current;
  const change = async (v: CentralAccess) => {
    setBusy(true);
    setErr('');
    setValue(v);
    try {
      await club.updateUnit(u.id, { central: v });
      update(() => {}, `Accès du comité central : ${CENTRAL_ACCESS[v].label}`);
      setToast(`${CENTRAL_ACCESS[v].icon} Comité central : ${CENTRAL_ACCESS[v].label.toLowerCase()}`);
    } catch (e) {
      setValue(saved);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel access-panel">
      <h2>Accès du comité central</h2>
      <p className="muted">
        Par défaut, les données de « {u.nom} » (tâches, séances, membres, fichiers) ne sont visibles que de ses membres. Choisis ce que les membres
        du comité central peuvent en faire : ils ouvrent alors l’entité depuis leur menu des entités ou l’organigramme.
      </p>
      <CentralAccessChoice name="central-admin" value={value} onChange={change} disabled={busy || !u.moiAdmin} />
      {!u.moiAdmin && <p className="muted small-note">Seuls les admins (★) de l’entité changent ce réglage.</p>}
      {err && <p className="error">{err}</p>}
    </section>
  );
}
