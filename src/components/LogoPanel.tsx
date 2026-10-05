import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { ImagePicker } from './ImagePicker';

/** Console admin : logo de l'entité ouverte (comité central : logo du club), enregistré dès qu'on le choisit. */
export function LogoPanel() {
  const club = useClubOptional();
  const { update, setToast } = useStore();
  if (!club) return null;
  const u = club.current;
  const central = u.type === 'central';
  const allowed = u.moiAdmin || club.canManage;
  const change = async (logo: string | undefined) => {
    await club.updateUnit(u.id, { logo });
    update(() => {}, logo ? `Logo de « ${u.nom} » changé` : `Logo de « ${u.nom} » retiré`);
    setToast(logo ? '🖼 Logo enregistré' : 'Logo retiré');
  };
  return (
    <section className="panel logo-panel">
      <h2>{central ? 'Logo du club' : `Logo de « ${u.nom} »`}</h2>
      <p className="muted">
        {central
          ? 'Affiché en haut de l’appli, sur l’ordre du jour et le PV, et pour les entités qui n’ont pas leur propre logo.'
          : 'Par exemple le logo de la manifestation. Sans logo, l’entité affiche celui du club.'}{' '}
        Il devient aussi l’icône de l’appli (onglet du navigateur, écran d’accueil).
      </p>
      <ImagePicker kind="logo" value={u.logo} onChange={change} disabled={!allowed} empty={central ? 'Pas de logo : icône de l’appli' : 'Pas de logo : celui du club'} />
      <p className="muted small-note">
        PNG, JPEG, WebP, GIF ou SVG ; de préférence carré, sur fond transparent ou blanc. L’image est réduite (256 px) avant d’être enregistrée.
        Une appli déjà installée garde son ancienne icône : la réinstaller (ou la rajouter à l’écran d’accueil) pour prendre le nouveau logo.
      </p>
      {!allowed && <p className="muted small-note">Seuls les admins (★) de l’entité et du comité central changent le logo.</p>}
    </section>
  );
}
