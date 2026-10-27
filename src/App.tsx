import { lazy, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { useStore } from './data/store';
import { Layout } from './components/Layout';
import { Message } from './pages/Real';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Comptes } from './pages/Comptes';
import { PageIntro } from './components/Nav';
import { ComitesCtx, useComitesEtat } from './data/comites';
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
  reglages: () => import('./pages/Settings'),
  admin: () => import('./pages/Admin'),
  odj: () => import('./pages/Pv'),
  sondages: () => import('./pages/Polls'),
  pv: () => import('./pages/Minutes'),
  organigramme: () => import('./pages/Org'),
  membres: () => import('./pages/MembresClub'),
  aide: () => import('./pages/Aide'),
  propositions: () => import('./pages/Propositions'),
  motsDePasse: () => import('./pages/MotsDePasse'),
};
const Messages = lazy(() => charger.messages().then((m) => ({ default: m.Messages })));
const Meetings = lazy(() => charger.agenda().then((m) => ({ default: m.Meetings })));
const Events = lazy(() => charger.agenda().then((m) => ({ default: m.Events })));
const Calendar = lazy(() => charger.calendrier().then((m) => ({ default: m.Calendar })));
const Settings = lazy(() => charger.reglages().then((m) => ({ default: m.Settings })));
const Admin = lazy(() => charger.admin().then((m) => ({ default: m.Admin })));
const Pv = lazy(() => charger.odj().then((m) => ({ default: m.Pv })));
const Polls = lazy(() => charger.sondages().then((m) => ({ default: m.Polls })));
const Minutes = lazy(() => charger.pv().then((m) => ({ default: m.Minutes })));
const Org = lazy(() => charger.organigramme().then((m) => ({ default: m.Org })));
const MembresClub = lazy(() => charger.membres().then((m) => ({ default: m.MembresClub })));
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
  const { user, cloud, login } = useStore();
  const club = useClubOptional();
  // Pages Comité, console admin : sur l'entité choisie parmi les miennes (vue « moi »), avec mes droits chez elle.
  const comites = useComitesEtat();
  usePrechargement();
  // Un compte, pas une entité : l'appli s'appuie d'elle-même sur une autre de mes entités si ma fiche a été retirée de
  // celle-ci, ou si elle a été archivée.
  const autre = club && (!user || club.current.archive) ? club.mine.find((u) => u.id !== club.current.id && !u.archive) : undefined;
  useEffect(() => {
    if (autre) club?.switchUnit(autre.id, window.location.hash || '#/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autre?.id]);
  if (autre) return null;
  if (!user) {
    return (
      <Message title="Accès désactivé" onSignOut={() => login(null)}>
        <p>Ta fiche a été désactivée ou retirée{club ? ` dans « ${club.current.nom} »` : ''}. Renseigne-toi auprès de son président ou responsable.</p>
        {!cloud && <p className="muted">Démo : « Se déconnecter » ramène à la liste des personnes.</p>}
      </Message>
    );
  }
  return (
    <ComitesCtx.Provider value={comites}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            {/* La clé force la remise à zéro des filtres quand on arrive via un lien ?event=… */}
            <Route path="taches" element={<TasksRoute />} />
            <Route path="messages" element={<Messages />} />
            <Route path="agenda" element={<Calendar />} />
            {comites.canUn('tab.meetings') && <Route path="comite" element={<Meetings />} />}
            {comites.canUn('tab.events') && <Route path="evenements" element={<Events />} />}
            {/* Ancienne page des responsables / membres : tout se fait dans l'organigramme. */}
            <Route path="responsables" element={<Navigate to="/organigramme" replace />} />
            {comites.canUn('tab.pv') && <Route path="ordre-du-jour" element={<Pv />} />}
            {comites.canUn('tab.minutes') && <Route path="pv" element={<Minutes />} />}
            <Route path="sondages" element={<Polls />} />
            <Route path="paiements" element={<PaiementsRedirect />} />
            {club && <Route path="organigramme" element={<Org />} />}
            {(club?.membresAcces || club?.caissier) && <Route path="membres-club" element={<MembresClub />} />}
            <Route path="reglages" element={<Settings />} />
            {comites.canUn('admin.access') && <Route path="admin" element={<Admin />} />}
            {comites.canUn('admin.access') && <Route path="admin/:partie" element={<Admin />} />}
            {club && <Route path="propositions" element={<Propositions />} />}
            {club && comites.canUn('admin.access') && <Route path="mots-de-passe" element={<MotsDePasse />} />}
            {club?.superAdmin && <Route path="comptes" element={<Comptes intro={<PageIntro />} />} />}
            <Route path="aide" element={<Aide />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ComitesCtx.Provider>
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
