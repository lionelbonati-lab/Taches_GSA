import { useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { COULEUR_DEFAUT, COULEURS_APPLI } from '../data/couleur';
import { ImagePicker } from './ImagePicker';

/** Console admin : logo et couleur de l'appli de l'entité ouverte (comité central : ceux du club), enregistrés dès qu'on les choisit. */
export function LogoPanel() {
  const club = useClubOptional();
  const { update, setToast } = useStore();
  const [perso, setPerso] = useState<string | null>(null);
  if (!club) return null;
  const u = club.current;
  const central = u.type === 'central';
  const allowed = u.moiAdmin || club.canManage;
  const change = async (logo: string | undefined) => {
    await club.updateUnit(u.id, { logo });
    update(() => {}, logo ? `Logo de « ${u.nom} » changé` : `Logo de « ${u.nom} » retiré`);
    setToast(logo ? '🖼 Logo enregistré' : 'Logo retiré');
  };

  // Sans choix : la couleur du club (comité central), sinon le bleu d'origine.
  const heritee = (!central && club.central?.couleurAppli) || COULEUR_DEFAUT;
  const actuelle = u.couleurAppli ?? heritee;
  const choisir = async (c: string | undefined) => {
    try {
      await club.updateUnit(u.id, { couleurAppli: c });
      update(() => {}, c ? `Couleur de l’appli de « ${u.nom} » : ${c}` : `Couleur de l’appli de « ${u.nom} » : ${central ? 'bleu d’origine' : 'celle du club'}`);
      setToast(c ? 'Couleur de l’appli enregistrée' : central ? 'Couleur d’origine rétablie' : 'Couleur du club rétablie');
      setPerso(null);
    } catch (e) {
      setToast(`Couleur non enregistrée : ${(e as Error).message}`);
    }
  };

  return (
    <>
      <section className="panel logo-panel">
        <h2>{central ? 'Logo du club' : `Logo de « ${u.nom} »`}</h2>
        <p className="muted">
          {central
            ? 'Affiché en haut de l’appli, sur l’ordre du jour et le PV, et pour les entités qui n’ont pas leur propre logo.'
            : 'Par exemple le logo de la manifestation, affiché en haut de l’appli, sur les documents et dans l’onglet du navigateur. Sans logo, l’entité affiche celui du club.'}
        </p>
        <ImagePicker kind="logo" value={u.logo} onChange={change} disabled={!allowed} empty={central ? 'Pas de logo : celui du G.S. Ajoie' : 'Pas de logo : celui du club'} />
        <p className="muted small-note">
          PNG, JPEG, WebP, GIF ou SVG ; de préférence carré, sur fond transparent ou blanc. L’image est réduite (256 px) avant d’être enregistrée.
          L’icône de l’appli installée (écran d’accueil, accès rapides) est toujours le logo du G.S. Ajoie.
        </p>
        {!allowed && <p className="muted small-note">Seuls les admins (★) de l’entité et du comité central changent le logo.</p>}
      </section>

      <section className="panel couleur-panel">
        <h2>{central ? 'Couleur de l’appli (tout le club)' : `Couleur de l’appli dans « ${u.nom} »`}</h2>
        <p className="muted">
          Boutons, onglet actif, liens, calendrier…{' '}
          {central
            ? 'pour tout le club ; chaque entité peut choisir la sienne dans sa console admin.'
            : 'quand cette entité est ouverte. Sans choix, l’appli garde la couleur du club (comité central).'}
        </p>
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
              {central ? 'Revenir au bleu d’origine' : 'Reprendre la couleur du club'}
            </button>
          </p>
        )}
        {!allowed && <p className="muted small-note">Seuls les admins (★) de l’entité et du comité central changent la couleur.</p>}
      </section>
    </>
  );
}
