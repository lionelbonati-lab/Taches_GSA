import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './data/store';
import { Layout } from './components/Layout';
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
import { Org } from './pages/Org';
import { useClubOptional } from './data/club';

export function App() {
  const { user, can, cloud, login } = useStore();
  const club = useClubOptional();
  if (!user) {
    const others = club?.mine.filter((u) => u.id !== club.current.id) ?? [];
    return (
      <Message title="Accès désactivé" onSignOut={() => login(null)}>
        <p>Ta fiche a été désactivée ou retirée dans « {club?.current.nom ?? 'ce comité'} ». Renseigne-toi auprès de son président ou responsable.</p>
        {others.length > 0 && (
          <p className="row wrap">
            {others.map((u) => <button key={u.id} className="btn" onClick={() => club!.switchUnit(u.id)}>Ouvrir « {u.nom} »</button>)}
          </p>
        )}
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
          <Route path="agenda" element={<Calendar />} />
          {can('tab.meetings') && <Route path="comite" element={<Meetings />} />}
          {can('tab.events') && <Route path="evenements" element={<Events />} />}
          {can('tab.people') && <Route path="responsables" element={<People />} />}
          {can('tab.pv') && <Route path="ordre-du-jour" element={<Pv />} />}
          {can('tab.minutes') && <Route path="pv" element={<Minutes />} />}
          <Route path="sondages" element={<Polls />} />
          {club && <Route path="organigramme" element={<Org />} />}
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
