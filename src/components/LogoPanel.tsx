import { useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { COULEUR_DEFAUT, COULEURS_APPLI } from '../data/couleur';
import { ImagePicker } from './ImagePicker';
import { IconePanel } from './IconePanel';
import { ChoixIconeEntite, ICONES_ENTITE } from './IconesEntite';

/**
 * Console admin : logo et icône de l'entité réglée (ses documents, sa pastille) ; comité central : aussi la couleur de l'appli
 * et l'icône de l'appli installée, pour tout le club (une seule appli).
 */
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

  const changerIcone = async (icone: string | undefined) => {
    try {
      await club.updateUnit(u.id, { icone });
      update(() => {}, icone ? `Icône de « ${u.nom} » : ${ICONES_ENTITE[icone][0]}` : `Icône de « ${u.nom} » : celle de son type`);
      setToast(icone ? 'Icône enregistrée' : 'Icône du type rétablie');
    } catch (e) {
      setToast(`Icône non enregistrée : ${(e as Error).message}`);
    }
  };

  // Sans choix : le bleu d'origine.
  const heritee = COULEUR_DEFAUT;
  const actuelle = u.couleurAppli ?? heritee;
  const choisir = async (c: string | undefined) => {
    try {
      await club.updateUnit(u.id, { couleurAppli: c });
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
        <h2>{central ? 'Logo du club' : `Logo de « ${u.nom} »`}</h2>
        <p className="muted">
          {central
            ? 'Affiché en haut de l’appli, sur l’ordre du jour et le PV, et pour les entités qui n’ont pas leur propre logo.'
            : 'Par exemple le logo de la manifestation : sur ses documents (ordre du jour, PV, bon de paiement) et sur sa pastille. Sans logo, ses documents prennent celui du club ; l’appli garde celui du club.'}
        </p>
        <ImagePicker kind="logo" value={u.logo} onChange={change} disabled={!allowed} empty={central ? 'Pas de logo : celui du G.S. Ajoie' : 'Pas de logo : celui du club'} />
        <p className="muted small-note">
          PNG, JPEG, WebP, GIF ou SVG ; de préférence carré, sur fond transparent ou blanc. L’image est réduite (256 px) avant d’être enregistrée.{' '}
          {central ? 'L’icône de l’appli installée se règle plus bas.' : 'L’icône de l’appli installée (écran d’accueil, accès rapides) est celle du club.'}
        </p>
        {!allowed && <p className="muted small-note">Seuls les admins (★) de l’entité et du comité central changent le logo.</p>}
      </section>

      <section className="panel icone-entite-panel">
        <h2>{`Icône de « ${u.nom} »`}</h2>
        <p className="muted">
          À choisir dans la bibliothèque de l’appli : la pastille de l’entité (en-tête, organigramme, tâches){u.logo ? ' quand elle n’a pas de logo' : ''}, et
          son repère dans l’agenda, les événements et l’accueil. Sans choix : l’icône de son type.
        </p>
        <ChoixIconeEntite type={u.type} value={u.icone} couleur={u.couleur} disabled={!allowed} onChange={(i) => void changerIcone(i)} />
        {!allowed && <p className="muted small-note">Seuls les admins (★) de l’entité et du comité central changent l’icône.</p>}
      </section>

      {central && (
        <section className="panel couleur-panel">
          <h2>Couleur de l’appli (tout le club)</h2>
          <p className="muted">Boutons, onglet actif, liens, calendrier… : la même pour tout le monde, quelle que soit l’entité.</p>
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
          {!allowed && <p className="muted small-note">Seuls les admins (★) du comité central changent la couleur.</p>}
        </section>
      )}

      {central && <IconePanel club={u} />}
    </>
  );
}
