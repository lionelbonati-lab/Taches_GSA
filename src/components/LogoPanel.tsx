import { useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { COULEUR_DEFAUT, COULEURS_APPLI } from '../data/couleur';
import { ImagePicker } from './ImagePicker';
import { IconePanel } from './IconePanel';

/** Console admin : logo du club (en-tête de l'appli, documents), couleur de l'appli et icône de l'appli installée. */
export function LogoPanel() {
  const club = useClubOptional();
  const { can, update, setToast } = useStore();
  const [perso, setPerso] = useState<string | null>(null);
  if (!club) return null;
  const u = club.espace;
  const allowed = can('admin.access');
  const change = async (logo: string | undefined) => {
    try {
      await club.modifierEspace({ logo });
      update(() => {}, logo ? 'Logo du club changé' : 'Logo du club retiré');
      setToast(logo ? '🖼 Logo enregistré' : 'Logo retiré');
    } catch (e) {
      setToast(`Logo non enregistré : ${(e as Error).message}`);
    }
  };

  // Sans choix : le bleu d'origine.
  const heritee = COULEUR_DEFAUT;
  const actuelle = u.couleurAppli ?? heritee;
  const choisir = async (c: string | undefined) => {
    try {
      await club.modifierEspace({ couleurAppli: c });
      update(() => {}, c ? `Couleur de l’appli : ${c}` : 'Couleur de l’appli : bleu d’origine');
      setToast(c ? 'Couleur de l’appli enregistrée' : 'Couleur d’origine rétablie');
      setPerso(null);
    } catch (e) {
      setToast(`Couleur non enregistrée : ${(e as Error).message}`);
    }
  };

  return (
    <>
      <section className="panel logo-panel">
        <h2>Logo du club</h2>
        <p className="muted">Affiché en haut de l’appli, sur l’ordre du jour, le PV et le bon de paiement.</p>
        <ImagePicker kind="logo" value={u.logo} onChange={change} disabled={!allowed} empty="Pas de logo : celui du G.S. Ajoie" />
        <p className="muted small-note">
          PNG, JPEG, WebP, GIF ou SVG ; de préférence carré, sur fond transparent ou blanc. L’image est réduite (256 px) avant d’être enregistrée.
          L’icône de l’appli installée se règle plus bas.
        </p>
      </section>

      <section className="panel couleur-panel">
        <h2>Couleur de l’appli</h2>
        <p className="muted">Boutons, onglet actif, liens, calendrier… : la même pour tout le monde.</p>
        <div className="swatches" role="radiogroup" aria-label="Couleur de l’appli">
          {COULEURS_APPLI.map(({ c, nom }) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={actuelle.toLowerCase() === c}
              className={`swatch ${actuelle.toLowerCase() === c ? 'on' : ''}`}
              style={{ background: c }}
              title={nom}
              aria-label={nom}
              disabled={!allowed}
              onClick={() => void choisir(c === heritee.toLowerCase() ? undefined : c)}
            />
          ))}
          <label className="swatch-perso" title="Autre couleur">
            <input type="color" value={perso ?? actuelle} disabled={!allowed} onChange={(e) => setPerso(e.target.value)} aria-label="Autre couleur" />
            Autre…
          </label>
        </div>
        {perso && perso.toLowerCase() !== actuelle.toLowerCase() && (
          <div className="row wrap couleur-apercu">
            <span className="swatch on" style={{ background: perso }} aria-hidden />
            <span className="mono">{perso}</span>
            <button className="btn primary" style={{ background: perso, borderColor: perso }} onClick={() => void choisir(perso)}>Appliquer cette couleur</button>
            <button className="btn link" onClick={() => setPerso(null)}>Annuler</button>
          </div>
        )}
        {u.couleurAppli && (
          <p>
            <button className="btn link" disabled={!allowed} onClick={() => void choisir(undefined)}>
              Revenir au bleu d’origine
            </button>
          </p>
        )}
      </section>

      <IconePanel espace={u} peut={allowed} />
    </>
  );
}
