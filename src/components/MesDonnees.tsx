import { useEffect, useState } from 'react';
import { useClub } from '../data/club';
import { useStore } from '../data/store';
import { compactIban, formatIban, ibanValide } from '../data/membres';
import type { MonRegistre } from '../data/types';

// Réglages › Mes données au club : mon IBAN (moi seul l'enregistre ; seuls les caissiers le voient) et la confidentialité
// de mes données personnelles dans la liste des membres du club.

const PAS_INSCRIT = 'Tu n’es pas encore dans « Personnes du club » : demande à quelqu’un qui gère les personnes de t’y inscrire.';

export function MesDonnees() {
  const club = useClub();
  const { setToast } = useStore();
  const [mien, setMien] = useState<MonRegistre | null | undefined>(undefined);
  const [saisie, setSaisie] = useState('');
  const [modifier, setModifier] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    club
      .monRegistre()
      .then(setMien)
      .catch((e: Error) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const ok = await fn();
      setMsg(ok);
      setToast(ok);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const enregistrerIban = (v: string) => {
    const c = compactIban(v);
    if (c && !ibanValide(c)) return setErr('IBAN invalide : vérifie-le (longueur et chiffres de contrôle).');
    void run(async () => {
      const r = await club.enregistrerMonIban(c);
      setMien((m) => m && { ...m, iban: r });
      setModifier(false);
      setSaisie('');
      return r ? '✅ Ton IBAN est enregistré : il sera proposé pour tes remboursements.' : '✅ Ton IBAN est effacé.';
    });
  };
  const masquer = (prive: boolean) =>
    void run(async () => {
      await club.setConfidentialite(prive);
      setMien((m) => m && { ...m, prive });
      return prive ? '✅ Tes données personnelles sont masquées dans la liste des membres du club.' : '✅ Tes données personnelles sont de nouveau visibles dans la liste des membres du club.';
    });

  return (
    <section className="panel mes-donnees">
      <h2>Mes données au club</h2>
      {mien === undefined && !err && <p className="muted">Chargement…</p>}
      {mien === null && <p className="muted">{PAS_INSCRIT}</p>}
      {mien && (
        <>
          <div>
            <span className="field-label">Mon IBAN</span>
            {mien.iban && !modifier ? (
              <div className="row wrap">
                <span className="mono">{formatIban(mien.iban)}</span>
                <button className="btn small" disabled={busy} onClick={() => setModifier(true)}>Modifier</button>
                <button className="btn small danger" disabled={busy} onClick={() => confirm('Effacer ton IBAN ?') && enregistrerIban('')}>Effacer</button>
              </div>
            ) : (
              <div className="row wrap">
                <input
                  className="mono"
                  value={saisie}
                  placeholder="CH00 0000 0000 0000 0000 0"
                  aria-label="Mon IBAN"
                  onChange={(e) => setSaisie(e.target.value)}
                  onBlur={() => setSaisie(formatIban(saisie))}
                />
                <button className="btn primary small" disabled={busy || !compactIban(saisie)} onClick={() => enregistrerIban(saisie)}>
                  {mien.iban ? 'Enregistrer' : 'Enregistrer mon IBAN'}
                </button>
                {modifier && <button className="btn small" onClick={() => setModifier(false)}>Annuler</button>}
              </div>
            )}
            <small className="muted">Pour tes remboursements. Toi seul peux l’enregistrer ou le modifier (personne d’autre, pas même un admin) ; dans la liste des membres, seuls les caissiers du club le voient.</small>
          </div>
          <label className="inline">
            <input type="checkbox" checked={mien.prive} disabled={busy} onChange={(e) => masquer(e.target.checked)} />
            Masquer mes données personnelles (email, téléphone, IBAN) dans la liste des membres du club
          </label>
          <small className="muted">Elles restent sur ta fiche dans les entités dont tu fais partie (pour leurs admins), et tes demandes de remboursement gardent l’IBAN que tu y indiques.</small>
        </>
      )}
      {msg && <p className="backup-ok">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </section>
  );
}
