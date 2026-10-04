import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore, useSyncStatus } from '../data/store';
import { rolesLabel } from '../data/permissions';
import type { Permission } from '../data/types';
import { TaskModal, newTask } from './TaskModal';
import { Avatar, Toast } from './ui';
import { InstallButton } from './InstallButton';
import { Bell } from './Bell';
import { showSystemNotification, useNotifications } from '../notifications';

export const TABS: { to: string; label: string; short?: string; icon: string; perm?: Permission; mobile?: boolean }[] = [
  { to: '/', label: 'Accueil', icon: '🏠', mobile: true },
  { to: '/taches', label: 'Tâches', icon: '✅', mobile: true },
  { to: '/agenda', label: 'Agenda', icon: '📅', mobile: true },
  { to: '/comite', label: 'Comité', icon: '🗓️', perm: 'tab.meetings', mobile: true },
  { to: '/evenements', label: 'Événements', icon: '🎉', perm: 'tab.events' },
  { to: '/sondages', label: 'Sondages', icon: '📊' },
  { to: '/responsables', label: 'Responsables', icon: '👥', perm: 'tab.people' },
  { to: '/ordre-du-jour', label: 'Ordre du jour', icon: '📝', perm: 'tab.pv' },
  { to: '/pv', label: 'PV', icon: '🖊️', perm: 'tab.minutes' },
  { to: '/reglages', label: 'Réglages', icon: '⚙️' },
  { to: '/admin', label: 'Console admin', short: 'Admin', icon: '🛡️', perm: 'admin.access' },
];

export function Layout() {
  const { data, user, can, login, prefs, setToast, cloud } = useStore();
  const [quick, setQuick] = useState(false);
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => setMenu(false), [loc.pathname]);
  // Raccourci de l'application installée (appui long sur l'icône) : « Nouvelle tâche ».
  useEffect(() => {
    if (new URLSearchParams(loc.search).has('ajout')) {
      setQuick(true);
      navigate(loc.pathname, { replace: true });
    }
  }, [loc.search, loc.pathname, navigate]);

  useEffect(() => {
    const dark = prefs.theme === 'sombre' || (prefs.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [prefs.theme]);

  // Démo : à l'ouverture (ou au changement d'utilisateur), résumé envoyé en notification de l'appareil.
  const { unread, prefs: notifPrefs } = useNotifications();
  useEffect(() => {
    if (!user || !notifPrefs.systeme || !unread.length) return;
    const flag = `taches-gsa-notif-${user.id}`;
    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, '1');
    } catch {
      /* ignore */
    }
    showSystemNotification(
      `Tâches GSA · ${unread.length} notification${unread.length > 1 ? 's' : ''}`,
      unread.slice(0, 3).map((n) => `${n.icon} ${n.text}`).join('\n'),
      unread[0].link,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Un email programmé arrive à son heure pendant que l'appli est ouverte : message + notification de l'appareil.
  const emailKeys = useRef<{ user?: string; keys: Set<string> }>({ keys: new Set() });
  const dueEmails = unread.filter((n) => n.key.startsWith('email:'));
  useEffect(() => {
    const ref = emailKeys.current;
    if (ref.user !== user?.id) {
      emailKeys.current = { user: user?.id, keys: new Set(dueEmails.map((n) => n.key)) };
      return;
    }
    const fresh = dueEmails.filter((n) => !ref.keys.has(n.key));
    if (!fresh.length) return;
    fresh.forEach((n) => ref.keys.add(n.key));
    setToast(`📧 ${fresh[0].text}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ''} — voir la cloche 🔔`);
    if (notifPrefs.systeme) showSystemNotification('Tâches GSA · email à envoyer', fresh.map((n) => n.text).join('\n'), fresh[0].link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dueEmails.map((n) => n.key).join('|')]);

  if (!user) return null;
  const tabs = TABS.filter((t) => !t.perm || can(t.perm));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="./icon.svg" alt="" width={28} height={28} />
          <span className="brand-name">Tâches GSA</span>
          {cloud ? <SyncBadge /> : <span className="demo-tag">DÉMO</span>}
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'} title={t.label}>{t.short ?? t.label}</NavLink>
          ))}
        </nav>
        <Bell />
        <div className="who">
          <InstallButton variant="compact" hideWhenUnavailable />
          <Avatar id={user.id} size={32} />
          <div className="who-text">
            <strong>{user.prenom} {user.nom}</strong>
            <small>{user.poste} · {rolesLabel(data.roles, user)}</small>
          </div>
          {!cloud && <button className="btn small" onClick={() => login(null)} title="Changer d'utilisateur">Changer</button>}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      {!menu && <button className="fab" onClick={() => setQuick(true)} aria-label="Ajout rapide de tâche">+</button>}

      <nav className="bottomnav">
        {tabs.filter((t) => t.mobile).map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}>
            <span>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
        <button className={menu ? 'active' : ''} onClick={() => setMenu(!menu)}>
          <span>☰</span>Plus
        </button>
      </nav>
      {menu && (
        <div className="sheet-back" onClick={() => setMenu(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-user">
              <Avatar id={user.id} size={40} />
              <div>
                <strong>{user.prenom} {user.nom}</strong>
                <br />
                <small>{user.poste} · {rolesLabel(data.roles, user)}</small>
              </div>
            </div>
            {tabs.filter((t) => !t.mobile).map((t) => (
              <NavLink key={t.to} to={t.to} className="sheet-link">{t.icon} {t.label}</NavLink>
            ))}
            <InstallButton variant="sheet" />
            <button className="sheet-link" onClick={() => login(null)}>{cloud ? '🚪 Se déconnecter' : '🔄 Changer d\'utilisateur'}</button>
          </div>
        </div>
      )}

      <Toast />
      {quick && <TaskModal quick isNew task={newTask(user.id)} onClose={() => setQuick(false)} />}
    </div>
  );
}

/** Version réelle : état de l'enregistrement sur le serveur. */
function SyncBadge() {
  const { status, pending } = useSyncStatus();
  if (status === 'horsLigne')
    return <span className="sync-tag off" title="Les modifications seront envoyées dès le retour de la connexion">⚠<span className="sync-text"> Hors ligne{pending ? ` · ${pending} en attente` : ''}</span></span>;
  if (status === 'envoi') return <span className="sync-tag busy" title="Envoi au serveur">⏳<span className="sync-text"> Envoi…</span></span>;
  return <span className="sync-tag" title="Tout est enregistré sur le serveur">☁<span className="sync-text"> À jour</span></span>;
}
