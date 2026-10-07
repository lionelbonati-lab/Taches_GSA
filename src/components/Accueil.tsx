import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { hasEdition } from './Edition';
import { Modal } from './ui';

/** Écran de téléphone : même limite que la mise en page (styles.css). */
const ETROIT = '(max-width: 767px)';

export function useTelephone() {
  const [tel, setTel] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(ETROIT).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(ETROIT);
    if (!mq) return;
    const maj = () => setTel(mq.matches);
    maj();
    mq.addEventListener?.('change', maj);
    return () => mq.removeEventListener?.('change', maj);
  }, []);
  return tel;
}

export type Appareil = 'telephone' | 'ordinateur';

/** Blocs de l'accueil que la personne peut afficher ou masquer, dans l'ordre de la page. */
export function useBlocsAccueil() {
  const { can, guest } = useStore();
  const club = useClubOptional();
  const central = club?.current.type === 'central';
  return [
    { id: 'edition', label: '📅 Date de l’édition', si: hasEdition(club?.current) },
    { id: 'compteurs', label: '🔢 Compteurs de mes tâches (par statut)', si: true },
    { id: 'retard', label: guest ? '⚠ Tâches en retard' : '⚠ Mes tâches en retard', si: true },
    { id: 'semaine', label: '📅 À faire dans les 7 jours', si: true },
    { id: 'demandes', label: central ? '📨 Demandes reçues' : '📨 Demandes au comité central', si: !!club && (central || !guest) },
    { id: 'emails', label: '📧 Mes emails à envoyer et programmés', si: true },
    { id: 'sondages', label: '📊 Sondages à voter', si: true },
    { id: 'seance', label: club?.current.type === 'equipe' ? '🗓️ Prochaine réunion' : '🗓️ Prochaine séance', si: can('tab.meetings') },
    { id: 'evenements', label: '🎪 Prochains événements', si: can('tab.events') },
  ].filter((b) => b.si);
}

/** Ce que la personne voit sur son accueil, sur cet appareil. */
export function useAccueil() {
  const { prefs } = useStore();
  const tel = useTelephone();
  const appareil: Appareil = tel ? 'telephone' : 'ordinateur';
  const masques = prefs.accueilMasque?.[appareil] ?? [];
  return { appareil, voit: (id: string) => !masques.includes(id) };
}

/** Choix des blocs de l'accueil, séparément sur téléphone et sur ordinateur. */
export function AccueilModal({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs } = useStore();
  const blocs = useBlocsAccueil();
  const { appareil } = useAccueil();
  const m = prefs.accueilMasque ?? {};
  const bascule = (a: Appareil, id: string, voir: boolean) => {
    const l = (m[a] ?? []).filter((x) => x !== id);
    setPrefs({ accueilMasque: { ...m, [a]: voir ? l : [...l, id] } });
  };
  const colonnes: { a: Appareil; label: string }[] = [
    { a: 'telephone', label: '📱 Téléphone' },
    { a: 'ordinateur', label: '💻 Ordinateur, tablette' },
  ];
  const rien = !m.telephone?.length && !m.ordinateur?.length;
  return (
    <Modal title="Mon accueil" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Coche ce que tu veux voir sur ton accueil. Le téléphone et l’ordinateur se règlent séparément ; le réglage te suit sur tous tes appareils.
      </p>
      <div className="table-scroll">
        <table className="table accueil-blocs">
          <thead>
            <tr>
              <th>Bloc</th>
              {colonnes.map((c) => (
                <th key={c.a} className={c.a === appareil ? 'ici' : ''}>{c.label}{c.a === appareil && <small className="muted"> (cet appareil)</small>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blocs.map((b) => (
              <tr key={b.id}>
                <td>{b.label}</td>
                {colonnes.map((c) => (
                  <td key={c.a} className={c.a === appareil ? 'ici' : ''}>
                    <input type="checkbox" checked={!(m[c.a] ?? []).includes(b.id)} onChange={(e) => bascule(c.a, b.id, e.target.checked)} aria-label={`${b.label} — ${c.label}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="modal-foot">
        <button className="btn" disabled={rien} onClick={() => setPrefs({ accueilMasque: undefined })}>Tout afficher</button>
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
