import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './data/store';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Message } from './pages/Real';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Events, Meetings } from './pages/Agenda';
import { People } from './pages/People';
import { Settings } from './pages/Settings';
import { Admin } from './pages/Admin';
import { Pv } from './pages/Pv';
import { Polls } from './pages/Polls';
import { Minutes } from './pages/Minutes';
import { Calendar } from './pages/Calendar';

export function App() {
  const { user, can, cloud } = useStore();
  if (!user && cloud)
    return (
      <Message title="Accès désactivé" onSignOut={cloud.signOut}>
        <p>Ta fiche de responsable a été désactivée ou retirée dans ce comité. Renseigne-toi auprès du président.</p>
      </Message>
    );
  if (!user) return <Login />;
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          {/* La clé force la remise à zéro des filtres quand on arrive via un lien ?event=… */}
          <Route path="taches" element={<TasksRoute />} />
          <Route path="agenda" element={<Calendar />} />
          {can('tab.meetings') && <Route path="comite" element={<Meetings />} />}
          {can('tab.events') && <Route path="evenements" element={<Events />} />}
          {can('tab.people') && <Route path="responsables" element={<People />} />}
          {can('tab.pv') && <Route path="ordre-du-jour" element={<Pv />} />}
          {can('tab.minutes') && <Route path="pv" element={<Minutes />} />}
          <Route path="sondages" element={<Polls />} />
          <Route path="reglages" element={<Settings />} />
          {can('admin.access') && <Route path="admin" element={<Admin />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

function TasksRoute() {
  const { user } = useStore();
  const { search } = useLocation();
  const key = `${user?.id}-${search}`;
  return <Tasks key={key} />;
}
