import { useEffect, useState } from 'react';
import { activerPush, desactiverPush, essaiPush, etatPush, pushImpossible, type EtatPush } from '../data/push';
import { fmtDateTime } from '../data/utils';

/** Réglages › Notifications (version réelle) : notifications sur cet appareil, même l'appli fermée (migration 047). */
export function NotifsPush() {
  const impossible = pushImpossible();
  const [etat, setEtat] = useState<EtatPush | null>(null);
  const [erreur, setErreur] = useState('');
  const [msg, setMsg] = useState('');
  const [occupe, setOccupe] = useState(false);

  const relire = () =>
    etatPush()
      .then((e) => {
        setEtat(e);
        setErreur('');
      })
      .catch((e: Error) => setErreur(e.message));
  useEffect(() => {
    void relire();
  }, []);

  const changer = async (on: boolean) => {
    setOccupe(true);
    setMsg('');
    try {
      if (on) {
        await activerPush();
        setMsg('✅ Cet appareil reçoit maintenant les notifications, même l’appli fermée.');
      } else {
        await desactiverPush();
        setMsg('Cet appareil ne reçoit plus les notifications.');
      }
      await relire();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };
  const essai = async () => {
    setOccupe(true);
    setMsg('');
    try {
      const r = await essaiPush();
      setMsg(r.envois ? `✅ Notification d’essai envoyée (${r.envois} appareil${r.envois > 1 ? 's' : ''}). Elle arrive en quelques secondes.` : 'L’envoi n’a pas abouti : désactive puis réactive les notifications sur cet appareil.');
      await relire();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  const autres = etat ? etat.appareils - (etat.inscrit ? 1 : 0) : 0;
  return (
    <div className="full notif-device">
      <label className="inline">
        <input type="checkbox" checked={!!etat?.inscrit} disabled={!!impossible || !etat || occupe} onChange={(e) => void changer(e.target.checked)} />
        📲 Recevoir ces notifications sur cet appareil, même l’appli fermée
      </label>
      {impossible && <small className="muted">{impossible}</small>}
      {erreur && <small className="muted">{erreur}</small>}
      {etat && (etat.inscrit || autres > 0) && (
        <small className="muted">
          {etat.inscrit ? 'Cet appareil est inscrit' : 'Cet appareil n’est pas inscrit'}
          {autres > 0 && ` · ${autres} autre${autres > 1 ? 's' : ''} appareil${autres > 1 ? 's' : ''} inscrit${autres > 1 ? 's' : ''}`}
          {etat.envoye && ` · dernier envoi le ${fmtDateTime(etat.envoye)}`}
        </small>
      )}
      {etat?.inscrit && <button className="btn small" disabled={occupe} onClick={() => void essai()}>Envoyer une notification d’essai</button>}
      {msg && <small>{msg}</small>}
      <small className="muted">
        Toutes les 5 minutes, le serveur envoie ce qui est nouveau dans la cloche 🔔 (selon les choix ci-dessus), pour toutes tes entités.
        Ce que tu as déjà vu dans l’appli n’est pas envoyé. Rien entre 22 h et 7 h : ce qui arrive la nuit part le matin. À activer sur chaque appareil.
      </small>
    </div>
  );
}
