import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './data/store';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Events, Meetings } from './pages/Agenda';
import { People } from './pages/People';
import { Settings } from './pages/Settings';
import { Admin } from './pages/Admin';

export function App() {
  const { user, can } = useStore();
  if (!user) return <Login />;
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          {/* La clé force la remise à zéro des filtres quand on arrive via un lien ?event=… */}
          <Route path="taches" element={<TasksRoute />} />
          <Route path="comite" element={<Meetings />} />
          <Route path="evenements" element={<Events />} />
          <Route path="responsables" element={<People />} />
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
