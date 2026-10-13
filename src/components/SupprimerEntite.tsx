import { useEffect, useState } from 'react';
import { useClub, type ApercuSuppression } from '../data/club';
import { useStore } from '../data/store';
import { Modal } from './ui';

// Suppression définitive d'une entité archivée (fiche ⚙️ de l'entité, admins du comité central) : ce qui sera effacé,
// puis son nom à retaper. Sans retour possible ; pour la garder sans l'afficher, elle reste archivée.

const nb = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

export function SupprimerEntite({ id, nom, onClose, onFait }: { id: string; nom: string; onClose: () => void; onFait: () => void }) {
  const club = useClub();
  const { setToast } = useStore();
  const [apercu, setApercu] = useState<ApercuSuppression | null>(null);
  const [err, setErr] = useState('');
  const [tape, setTape] = useState('');
  const [busy, setBusy] = useState(false);
  const ouverte = id === club.current.id;
  useEffect(() => {
    let actif = true;
    club
      .apercuSuppression(id)
      .then((a) => actif && setApercu(a))
      .catch((e) => actif && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const pret = !!apercu && !ouverte && tape.trim() === nom.trim();
  const supprimer = async () => {
    setBusy(true);
    setErr('');
    try {
      const avertissement = await club.supprimerUnite(id, tape);
      setToast(`🗑 « ${nom} » supprimée définitivement${avertissement ? ` (${avertissement})` : ''}`);
      onFait();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title={`🗑 Supprimer « ${nom} »`} onClose={onClose}>
      <p>
        <b>Suppression définitive</b> : l’entité et toutes ses données sont effacées, <b>sans retour possible</b>. Pour la garder sans l’afficher, laisse-la
        archivée.
      </p>
      {!apercu && !err && <p className="muted">Lecture de ce qui sera supprimé…</p>}
      {apercu && (
        <>
          <ul className="suppression-liste">
            <li>
              {nb(apercu.taches, 'tâche', 'tâches')}
              {apercu.tickets > 0 && <> et <b>{nb(apercu.tickets, 'ticket', 'tickets')}</b> (remboursements, factures, avec leurs justificatifs)</>}
            </li>
            <li>
              {nb(apercu.seances, 'séance', 'séances')} (ordres du jour et PV) · {nb(apercu.evenements, 'événement', 'événements')} · {nb(apercu.sondages, 'sondage', 'sondages')}
            </li>
            <li>
              {nb(apercu.personnes, 'fiche', 'fiches')} de membre
              {apercu.acces !== undefined && <> · {nb(apercu.acces, 'accès', 'accès')} à l’entité (les comptes restent, pour leurs autres entités)</>}
            </li>
            <li>{nb(apercu.fichiers, 'fichier joint', 'fichiers joints')}</li>
          </ul>
          {apercu.dependantes.length > 0 && (
            <p className="small-note">
              Dépend{apercu.dependantes.length > 1 ? 'ent' : ''} d’elle : {apercu.dependantes.map((n) => `« ${n} »`).join(', ')} — {apercu.dependantes.length > 1 ? 'elles dépendront' : 'elle dépendra'} du comité central.
            </p>
          )}
          {apercu.postesLies > 0 && (
            <p className="small-note">
              {nb(apercu.postesLies, 'poste lié', 'postes liés')} ⛓ à elle dans d’autres entités : {apercu.postesLies > 1 ? 'ils restent' : 'il reste'}, sans le lien.
            </p>
          )}
          <p className="muted small-note">
            Restent : les tickets qu’elle a envoyés à une autre caisse, les copies de ses tâches faites ailleurs et les organigrammes des années passées. Le journal du
            comité central note la suppression.
          </p>
        </>
      )}
      {ouverte ? (
        <p className="error">C’est l’entité ouverte : ouvre une autre entité (le comité central) pour la supprimer.</p>
      ) : (
        apercu && (
          <label className="full">
            Pour confirmer, tape son nom : <b>{nom}</b>
            <input value={tape} onChange={(e) => setTape(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Nom de l’entité, pour confirmer" />
          </label>
        )
      )}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button className="btn danger" disabled={!pret || busy} onClick={supprimer}>
          {busy ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
      </div>
    </Modal>
  );
}
