import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { ADMIN_ROLE_ID } from '../data/permissions';
import { nomAppli } from '../data/nomAppli';
import { useChemin, useNavigation } from '../components/Nav';

/** « Comment ça marche ? » : où trouver quoi (selon les droits de chacun) et les gestes courants. */
export function Aide() {
  const { can, cloud, user, sondagesEntites } = useStore();
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
  geste('Ajouter une checklist, un document, une répétition, un email…', 'Dans la fiche de la tâche, la ligne « Ajouter : » en bas. Ce qui est rempli reste affiché.');
  if (chemin('/comite')) geste('M’excuser pour une séance', vers('/comite'), ' : « 🙋 Je serai absent(e) » sous la séance.');
  if (chemin('/comite') && can('meetings.manage'))
    geste('Prévoir les séances de l’année prochaine', vers('/comite'), ' : chaque séance revient le même mois ; coche celles à ajouter dans « 🔁 Séances de l’année prochaine ».');
  if (chemin('/ordre-du-jour')) geste('Préparer une séance', vers('/ordre-du-jour'), ' : choisis la séance, relis, puis imprime ou envoie par email.');
  if (chemin('/pv')) geste('Tenir le PV', vers('/pv'), ' : « Prise de notes » pendant la séance, puis « Valider et archiver » et l’envoyer.');
  geste('Voter ou poser une question au comité', vers('/sondages'), '. Un sondage qui attend ta réponse apparaît aussi à l’accueil.');
  if (sondagesEntites && club && club.units.length > 1 && can('polls.create'))
    geste('Poser une question à d’autres entités (École, groupe, CO…)', vers('/sondages'), ' : « + Nouveau sondage » › « Ouvrir aussi à d’autres entités ». Tous leurs membres votent depuis leur entité ; une personne de plusieurs entités ne vote qu’une fois.');
  if (club && club.units.length > 1)
    geste('Partager une tâche avec d’autres entités (comité central, CO, groupe…)', 'Dans la tâche, « Ajouter : » › « 🤝 Partager », puis choisis les entités : elles la voient dans leurs tâches et leur ordre du jour (sous l’événement, ou la section qui porte ton nom) et la modifient comme les leurs. Elle reste enregistrée chez toi, repérée 🤝.');
  if (club) geste('Passer à une autre entité (sous-comité, groupe, équipe)', 'Le nom de l’entité en haut à gauche ▾ (l’organigramme du club y est aussi). Chaque entité a ses propres tâches, séances et membres.');
  geste('Installer l’appli sur le téléphone ou l’ordinateur', '« 📲 Installer l’application » dans le menu du compte (« ☰ Plus » sur téléphone).');
  geste('Choisir ce qui s’affiche sur mon accueil, et dans quel ordre', vers('/'), ' : le bouton « ⚙ Personnaliser » à côté de « Bonjour » (⚙ seul sur téléphone). Coche les blocs et les compteurs à voir, séparément sur téléphone et sur ordinateur ; ↑ ↓ change leur ordre. Le bloc « À faire » se règle aussi : nombre de jours (directement dans son titre) et, si tu vois toutes les tâches, les tiennes ou toutes.');
  geste('Thème sombre, notifications', vers('/reglages'), '.');
  if (chemin('/propositions')) geste('Proposer une idée pour l’appli, signaler un problème', vers('/propositions'), ' (menu du compte) : le comité central l’étudie et te répond sur la même page, dans « Mes propositions ».');
  // Organigramme : dans le menu des entités (en haut à gauche), pas dans les rubriques.
  const orga = club && <><Link to="/organigramme">Organigramme du club</Link> (menu des entités, en haut à gauche)</>;
  if (orga) geste('Voir qui fait quoi, et ses coordonnées', orga, ' : un clic sur une personne ouvre la fiche de la personne.');
  if (orga && can('people.manage')) geste('Ajouter une personne à l’entité', orga, ' : « ✏️ Modifier l’organigramme », puis « + Ajouter une personne » en bas de la liste des postes de l’entité.');
  if (orga && club?.liens && club.units.length > 1 && user?.roles.includes(ADMIN_ROLE_ID))
    geste('Ajouter toute une entité aux membres de la tienne', orga, ' : « ✏️ Modifier l’organigramme » › « + Ajouter une personne » › « 👥 Tous les membres de … ». Qui rejoint ou quitte cette entité rejoint ou quitte aussi la tienne, automatiquement ; tu peux ajouter d’autres personnes en plus.');
  if (orga && club?.units.some((u) => !u.archive && u.type !== 'central' && (club?.canManage || u.moiAdmin)))
    geste('Désigner le responsable d’une entité', orga, ' : « ✏️ Modifier l’organigramme » › « 🔌 Câbler », puis tire un câble de la personne jusqu’à l’entité (au doigt : depuis la prise ● au bout de sa ligne ; sans glisser : touche-la, puis « ★ Responsable » sous l’entité). Le câble reste affiché, de la personne dans l’entité mère jusqu’à l’entité. Quelqu’un qui n’est dans aucune entité se trouve dans la liste du haut, ou « ＋ Nouvelle personne ».');
  if (orga && club?.units.some((u) => !u.archive && (club?.canManage || u.moiAdmin)))
    geste('Ranger l’organigramme à ta façon', orga, ' : « ✏️ Modifier l’organigramme », puis tire une carte par son nom (au doigt : par sa poignée en haut) et pose-la où tu veux ; traits et câbles suivent. Tout le monde voit la même disposition. Double-clic sur la poignée : la carte revient à sa place ; « ↺ Disposition automatique » sous l’organigramme : toutes les cartes. Sur un écran large seulement.');
  if (orga && can('admin.access')) geste('Donner l’accès à l’appli à quelqu’un', orga, ' : clic sur son nom (sa fiche doit avoir son email), puis « Créer l’accès ».');
  if (chemin('/admin')) geste('Choisir qui peut faire quoi', vers('/admin'), ' › « Rôles et droits ».');
  if (chemin('/admin')) geste('Changer le logo ou la couleur de l’appli', vers('/admin'), ' › « Apparence ».');
  if (chemin('/admin')) geste('Changer l’en-tête de l’ordre du jour, du PV et du bon de paiement', vers('/admin'), ' › « En-tête des documents » : le même pour tous les documents de l’entité.');

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
        {club && (
          <div className="aide-rubrique">
            <h3>🏛️ Entités du club</h3>
            <p className="muted small-note">Le nom de l’entité ouverte, en haut à gauche ▾.</p>
            <ul>
              <li>Passer à une autre de tes entités (sous-comité, groupe, équipe).</li>
              <li><Link to="/organigramme">Organigramme du club</Link> : le comité central, les sous-comités, groupes et équipes, et qui y fait quoi. Un clic sur une personne ouvre sa fiche (coordonnées, rôles, accès à l’appli) ; « ✏️ Modifier l’organigramme » pour ajouter quelqu’un, ranger les cartes ou modifier une entité.</li>
            </ul>
          </div>
        )}
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
