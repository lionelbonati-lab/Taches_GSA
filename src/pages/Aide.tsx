import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { nomAppli } from '../data/nomAppli';
import { useChemin, useNavigation } from '../components/Nav';

/** « Comment ça marche ? » : où trouver quoi (selon les droits de chacun) et les gestes courants. */
export function Aide() {
  const { can, cloud } = useStore();
  const club = useClubOptional();
  const { rubriques, compte } = useNavigation();
  const chemin = useChemin();
  // Lien vers une page accessible, sous son nom de rubrique (« Comité › PV ») ; rien si la personne n'y a pas accès.
  const vers = (to: string) => {
    const c = chemin(to);
    return c ? <Link to={to}>{c}</Link> : null;
  };
  const gestes: [string, ReactNode][] = [];
  const geste = (titre: string, ...texte: ReactNode[]) => gestes.push([titre, texte.map((t, i) => <Fragment key={i}>{t}</Fragment>)]);

  geste('Voir ce que j’ai à faire', vers('/'), ' : mes tâches en retard et celles de la semaine. La cloche 🔔 en haut signale ce qui m’attend.');
  geste('Ajouter une tâche, demander un remboursement, payer une facture', 'Le bouton rond « + » en bas à droite, depuis n’importe quelle page.');
  geste('Modifier une tâche ou changer son statut', vers('/taches'), ' : clique sur la tâche. « Mes tâches » / « Toutes » choisit la liste.');
  if (chemin('/comite')) geste('M’excuser pour une séance', vers('/comite'), ' : « 🙋 Je serai absent(e) » sous la séance.');
  if (chemin('/ordre-du-jour')) geste('Préparer une séance', vers('/ordre-du-jour'), ' : choisis la séance, relis, puis imprime ou envoie par email.');
  if (chemin('/pv')) geste('Tenir le PV', vers('/pv'), ' : « Prise de notes » pendant la séance, puis « Valider et archiver » et l’envoyer.');
  geste('Voter ou poser une question au comité', vers('/sondages'), '. Un sondage qui attend ta réponse apparaît aussi à l’accueil.');
  if (club) geste('Passer à une autre entité (sous-comité, groupe, équipe)', 'Le nom de l’entité en haut à gauche ▾. Chaque entité a ses propres tâches, séances et membres.');
  geste('Installer l’appli sur le téléphone ou l’ordinateur', '« 📲 Installer l’application » dans le menu du compte (« ☰ Plus » sur téléphone).');
  geste('Thème sombre, notifications', vers('/reglages'), '.');
  if (chemin('/responsables') && can('admin.access'))
    geste('Donner l’accès à l’appli à quelqu’un', vers('/responsables'), ' : « + Ajouter une personne » avec son email, puis « Créer l’accès ».');
  if (chemin('/admin')) geste('Choisir qui peut faire quoi', vers('/admin'), ' › « Rôles et droits ».');
  if (chemin('/admin')) geste('Changer le logo ou la couleur de l’appli', vers('/admin'), ' › « Apparence ».');

  return (
    <div className="narrow aide-page">
      <h1>Comment ça marche ?</h1>
      <p className="page-intro">
        {nomAppli()} réunit les tâches, les séances et l’agenda {club ? 'de chaque entité du club' : 'du comité'}. Tout se trouve dans les
        rubriques en haut de l’écran (en bas sur téléphone) ; certaines ont plusieurs pages, choisies juste sous la rubrique.
      </p>

      <section className="panel">
        <h2>Où trouver quoi</h2>
        {rubriques.map((r) => (
          <div key={r.id} className="aide-rubrique">
            <h3>{r.icon} {r.label}</h3>
            <ul>
              {r.pages.map((p) => (
                <li key={p.to}>
                  {r.pages.length > 1 && <><Link to={p.to}>{p.label}</Link> : </>}
                  {p.aide}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="aide-rubrique">
          <h3>👤 Mon compte</h3>
          <p className="muted small-note">Ta pastille en haut à droite (« ☰ Plus » sur téléphone).</p>
          <ul>
            {compte.filter((p) => p.to !== '/aide').map((p) => (
              <li key={p.to}><Link to={p.to}>{p.label}</Link> : {p.aide}</li>
            ))}
            <li>{cloud ? 'Se déconnecter' : 'Changer d’utilisateur'}.</li>
          </ul>
        </div>
      </section>

      <section className="panel">
        <h2>Les gestes courants</h2>
        <dl className="aide-gestes">
          {gestes.map(([titre, texte]) => (
            <div key={titre}>
              <dt>{titre}</dt>
              <dd>{texte}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="muted small-note">
        Une phrase en haut de chaque page rappelle à quoi elle sert ; on peut la masquer dans {vers('/reglages')}.
      </p>
    </div>
  );
}
