import { lazy, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { useStore } from './data/store';
import { Layout } from './components/Layout';
import { Message } from './pages/Real';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Comptes } from './pages/Comptes';
import { PageIntro } from './components/Nav';
import { chargerFicheTache } from './components/FicheTache';
import { useClubOptional } from './data/club';

// Pages chargées à la demande : l'ouverture ne charge que l'accueil et la liste des tâches. Les autres pages et la fiche
// d'une tâche suivent en arrière-plan une fois l'appli affichée (prêtes au premier clic, et gardées par le service worker
// pour le hors-ligne).
const charger = {
  ficheTache: chargerFicheTache,
  messages: () => import('./pages/Messages'),
  agenda: () => import('./pages/Agenda'),
  calendrier: () => import('./pages/Calendar'),
  chronologie: () => import('./pages/ChronologieClub'),
  reglages: () => import('./pages/Settings'),
  admin: () => import('./pages/Admin'),
  odj: () => import('./pages/Pv'),
  sondages: () => import('./pages/Polls'),
  pv: () => import('./pages/Minutes'),
  ag: () => import('./pages/OrdreDuJourAg'),
  membres: () => import('./pages/MembresClub'),
  etiquettes: () => import('./pages/Etiquettes'),
  aide: () => import('./pages/Aide'),
  propositions: () => import('./pages/Propositions'),
  motsDePasse: () => import('./pages/MotsDePasse'),
};
const Messages = lazy(() => charger.messages().then((m) => ({ default: m.Messages })));
const Meetings = lazy(() => charger.agenda().then((m) => ({ default: m.Meetings })));
const Events = lazy(() => charger.agenda().then((m) => ({ default: m.Events })));
const Calendar = lazy(() => charger.calendrier().then((m) => ({ default: m.Calendar })));
const ChronologieClub = lazy(() => charger.chronologie().then((m) => ({ default: m.ChronologieClub })));
const Settings = lazy(() => charger.reglages().then((m) => ({ default: m.Settings })));
const Admin = lazy(() => charger.admin().then((m) => ({ default: m.Admin })));
const Pv = lazy(() => charger.odj().then((m) => ({ default: m.Pv })));
const Polls = lazy(() => charger.sondages().then((m) => ({ default: m.Polls })));
const Minutes = lazy(() => charger.pv().then((m) => ({ default: m.Minutes })));
const OrdreDuJourAg = lazy(() => charger.ag().then((m) => ({ default: m.OrdreDuJourAg })));
const MembresClub = lazy(() => charger.membres().then((m) => ({ default: m.MembresClub })));
const EtiquettesPage = lazy(() => charger.etiquettes().then((m) => ({ default: m.EtiquettesPage })));
const Aide = lazy(() => charger.aide().then((m) => ({ default: m.Aide })));
const Propositions = lazy(() => charger.propositions().then((m) => ({ default: m.Propositions })));
const MotsDePasse = lazy(() => charger.motsDePasse().then((m) => ({ default: m.MotsDePasse })));

/** Les autres pages, une à une, quand le navigateur a le temps (hors connexion : à la prochaine ouverture). */
function usePrechargement() {
  useEffect(() => {
    const suite = Object.values(charger);
    let fin = false;
    const attendre = (f: () => void) =>
      typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(f, { timeout: 3000 }) : window.setTimeout(f, 200);
    const suivante = () => {
      const c = suite.shift();
      if (!fin && c && navigator.onLine !== false) void c().catch(() => undefined).then(() => attendre(suivante));
    };
    const t = window.setTimeout(() => attendre(suivante), 1500);
    return () => {
      fin = true;
      clearTimeout(t);
    };
  }, []);
}

export function App() {
  const { user, cloud, login, can } = useStore();
  const club = useClubOptional();
  usePrechargement();
  if (!user) {
    return (
      <Message title="Accès désactivé" onSignOut={() => login(null)}>
        <p>Ta fiche a été désactivée ou retirée. Renseigne-toi auprès d’un admin du club.</p>
        {!cloud && <p className="muted">Démo : « Se déconnecter » ramène à la liste des personnes.</p>}
      </Message>
    );
  }
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          {/* La clé force la remise à zéro des filtres quand on arrive via un lien ?event=… */}
          <Route path="taches" element={<TasksRoute />} />
          <Route path="messages" element={<Messages />} />
          <Route path="agenda" element={<Calendar />} />
          <Route path="chronologie" element={<ChronologieClub />} />
          {can('tab.meetings') && <Route path="comite" element={<Meetings />} />}
          {can('tab.events') && <Route path="evenements" element={<Events />} />}
          {/* Anciennes pages des responsables et de l'organigramme : les personnes du club. */}
          <Route path="responsables" element={<Navigate to="/membres-club" replace />} />
          <Route path="organigramme" element={<Navigate to="/membres-club" replace />} />
          {can('tab.pv') && <Route path="ordre-du-jour" element={<Pv />} />}
          {can('tab.minutes') && <Route path="pv" element={<Minutes />} />}
          {can('tab.ag') && <Route path="ag" element={<OrdreDuJourAg />} />}
          <Route path="sondages" element={<Polls />} />
          <Route path="paiements" element={<PaiementsRedirect />} />
          {club?.personnes.voir && <Route path="membres-club" element={<MembresClub />} />}
          <Route path="etiquettes" element={<EtiquettesPage />} />
          <Route path="reglages" element={<Settings />} />
          {can('admin.access') && <Route path="admin" element={<Admin />} />}
          {can('admin.access') && <Route path="admin/:partie" element={<Admin />} />}
          {club && <Route path="propositions" element={<Propositions />} />}
          {club && can('admin.access') && <Route path="mots-de-passe" element={<MotsDePasse />} />}
          {club?.superAdmin && <Route path="comptes" element={<Comptes intro={<PageIntro />} />} />}
          <Route path="aide" element={<Aide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

/** Ancien onglet Paiements (liens déjà envoyés, raccourcis installés) : tout est maintenant dans les tâches. */
function PaiementsRedirect() {
  const [params] = useSearchParams();
  const p = params.get('p');
  const to = p ? `/taches?tache=${encodeURIComponent(p)}` : params.has('nouveau') ? '/taches?nouveau=remboursement' : '/taches?type=tickets';
  return <Navigate to={to} replace />;
}

function TasksRoute() {
  const { user } = useStore();
  const { search } = useLocation();
  const key = `${user?.id}-${search}`;
  return <Tasks key={key} />;
}
