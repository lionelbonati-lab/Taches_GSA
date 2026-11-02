import { useStore } from '../data/store';
import { BARRE_MAX, barreDuBas } from '../data/navigation';
import { useNavigation } from './Nav';
import { Modal } from './ui';
import { Icone } from './icones';

/**
 * Téléphone : choix des rubriques de la barre du bas (jusqu'à BARRE_MAX, à côté de « Plus ») et de leur ordre. Les
 * autres restent dans « Plus ». Le réglage suit la personne sur tous ses appareils.
 */
export function BarreBasModal({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs } = useStore();
  const { rubriques } = useNavigation();
  const choisies = barreDuBas(rubriques, prefs.barreBas).map((r) => r.id);
  const lignes = [...choisies.map((id) => rubriques.find((r) => r.id === id)!), ...rubriques.filter((r) => !choisies.includes(r.id))];
  const garder = (ids: string[]) => setPrefs({ barreBas: ids });
  const deplacer = (i: number, d: number) => {
    const l = [...choisies];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    garder(l);
  };
  const plein = choisies.length >= BARRE_MAX;
  return (
    <Modal title="Barre du bas" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Sur téléphone : coche jusqu’à {BARRE_MAX} onglets à garder en bas de l’écran, ↑ ↓ change leur ordre. Les autres sont dans « Plus ». Le réglage te suit sur tous tes appareils.
      </p>
      <ul className="barre-choix">
        {lignes.map((r) => {
          const i = choisies.indexOf(r.id);
          const dedans = i >= 0;
          return (
            <li key={r.id} className={dedans ? 'on' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={dedans}
                  disabled={dedans ? choisies.length <= 1 : plein}
                  onChange={(e) => garder(e.target.checked ? [...choisies, r.id] : choisies.filter((x) => x !== r.id))}
                />
                <Icone n={r.icon} /> {r.label}
              </label>
              {dedans && (
                <span className="barre-ordre">
                  <button type="button" className="icon-btn" disabled={i === 0} aria-label={`Monter « ${r.label} »`} title="Monter" onClick={() => deplacer(i, -1)}><Icone n="monter" /></button>
                  <button type="button" className="icon-btn" disabled={i === choisies.length - 1} aria-label={`Descendre « ${r.label} »`} title="Descendre" onClick={() => deplacer(i, 1)}><Icone n="descendre" /></button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small-note">{choisies.length} / {BARRE_MAX} onglets{plein ? ' : décoche-en un pour en mettre un autre.' : '.'}</p>
      <div className="modal-foot">
        <button className="btn" disabled={!prefs.barreBas} onClick={() => setPrefs({ barreBas: undefined })}>Barre d’origine</button>
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
