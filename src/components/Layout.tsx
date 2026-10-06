import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore, useSyncStatus } from '../data/store';
import type { Permission } from '../data/types';
import { TaskModal, newTask } from './TaskModal';
import { AppLogo, Avatar, Toast, UnitMark } from './ui';
import { InstallButton } from './InstallButton';
import { Bell } from './Bell';
import { showSystemNotification, useNotifications } from '../notifications';
import { useClubOptional } from '../data/club';
import { CENTRAL_ACCESS, centralAccess, UNIT_TYPES } from '../data/units';
import { applyAppIcon, cacheLogo } from '../data/logo';

export const TABS: { to: string; label: string; short?: string; icon: string; perm?: Permission; mobile?: boolean; club?: boolean }[] = [
  { to: '/', label: 'Accueil', icon: '🏠', mobile: true },
  { to: '/taches', label: 'Tâches', icon: '✅', mobile: true },
  { to: '/agenda', label: 'Agenda', icon: '📅', mobile: true },
  { to: '/comite', label: 'Comité', icon: '🗓️', perm: 'tab.meetings', mobile: true },
  { to: '/evenements', label: 'Événements', icon: '🎉', perm: 'tab.events' },
  { to: '/sondages', label: 'Sondages', icon: '📊' },
  { to: '/responsables', label: 'Responsables', icon: '👥', perm: 'tab.people' },
  { to: '/ordre-du-jour', label: 'Ordre du jour', icon: '📝', perm: 'tab.pv' },
  { to: '/pv', label: 'PV', icon: '🖊️', perm: 'tab.minutes' },
  { to: '/organigramme', label: 'Organigramme', short: 'Club', icon: '🏛️', club: true },
  { to: '/reglages', label: 'Réglages', icon: '⚙️' },
  { to: '/admin', label: 'Console admin', short: 'Admin', icon: '🛡️', perm: 'admin.access' },
];

export function Layout() {
  const { user, myRoles, can, login, prefs, setToast, cloud, guest, creatableSections } = useStore();
  const club = useClubOptional();
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

  // Logo de l'entité ouverte, sinon celui du club : en-tête et icône de l'appli.
  const logo = club?.current.logo ?? club?.central?.logo;
  const logoReady = !!logo || !club?.loading;
  useEffect(() => {
    if (!logoReady) return;
    cacheLogo(logo);
    void applyAppIcon(logo);
  }, [logo, logoReady]);

  if (!user) return null;
  const rolesText = myRoles.map((r) => r.label).join(' + ') || 'Aucun rôle';
  const canCreate = creatableSections().length > 0;
  // Libellés selon l'entité ouverte : « Séances » pour un groupe, « Membres » hors comité central…
  const unitType = club?.current.type ?? 'central';
  const tabs = TABS.filter((t) => (!t.perm || can(t.perm)) && (!t.club || club)).map((t) =>
    t.to === '/comite' ? { ...t, label: UNIT_TYPES[unitType].seances } : t.to === '/responsables' && unitType !== 'central' ? { ...t, label: 'Membres' } : t,
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <AppLogo src={logoReady ? logo ?? null : undefined} size={30} />
          <span className="brand-name">Tâches GSA</span>
          {cloud ? <SyncBadge /> : <span className="demo-tag">DÉMO</span>}
        </div>
        {club && <UnitSwitch />}
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
            <small>{user.poste} · {rolesText}</small>
          </div>
          {!cloud && <button className="btn small" onClick={() => login(null)} title="Changer d'utilisateur">Changer</button>}
        </div>
      </header>

      {guest && <GuestBanner />}
      <main className="content">
        <Outlet />
      </main>

      {!menu && canCreate && <button className="fab" onClick={() => setQuick(true)} aria-label="Ajout rapide de tâche">+</button>}

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
                <small>{user.poste} · {rolesText}</small>
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
      {quick && canCreate && <TaskModal quick isNew task={newTask(user.id)} onClose={() => setQuick(false)} />}
    </div>
  );
}

/** Entité ouverte (comité central, sous-comité, groupe, équipe) et passage à une autre. */
function UnitSwitch() {
  const club = useClubOptional();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  if (!club) return null;
  const { current } = club;
  const others = club.mine.filter((u) => u.id !== current.id);
  const visits = club.visitable.filter((u) => u.id !== current.id);
  const visiting = !current.moi;
  return (
    <div className="unit-switch">
      <button className="unit-btn" onClick={() => setOpen(!open)} aria-expanded={open} title={`${UNIT_TYPES[current.type].label} · changer d’entité`} style={{ borderColor: current.couleur }}>
        <UnitMark className="unit-dot" logo={current.logo} couleur={current.couleur} icon={UNIT_TYPES[current.type].icon} />
        <span className="unit-name">{current.nom}</span>
        <span className="unit-caret">▾</span>
      </button>
      {open && (
        <>
          <div className="unit-back" onClick={() => setOpen(false)} />
          <div className="unit-menu" role="menu">
            <small className="muted">Entité ouverte</small>
            <div className="unit-item on">
              <UnitMark className="unit-dot" logo={current.logo} couleur={current.couleur} icon={UNIT_TYPES[current.type].icon} />
              <span><b>{current.nom}</b><small className="muted">{UNIT_TYPES[current.type].label}{visiting ? ` · ${CENTRAL_ACCESS[centralAccess(current)].icon} ouverte au comité central` : ''}</small></span>
            </div>
            {others.length > 0 && <small className="muted">Mes autres entités</small>}
            {others.map((u) => (
              <button key={u.id} className="unit-item" role="menuitem" onClick={() => { setOpen(false); club.switchUnit(u.id); }}>
                <UnitMark className="unit-dot" logo={u.logo} couleur={u.couleur} icon={UNIT_TYPES[u.type].icon} />
                <span><b>{u.nom}</b><small className="muted">{UNIT_TYPES[u.type].label}{u.moiAdmin ? ' · ★ admin' : ''}</small></span>
              </button>
            ))}
            {visits.length > 0 && <small className="muted">Ouvertes au comité central</small>}
            {visits.map((u) => {
              const a = CENTRAL_ACCESS[centralAccess(u)];
              return (
                <button key={u.id} className="unit-item" role="menuitem" onClick={() => { setOpen(false); club.switchUnit(u.id); }}>
                  <UnitMark className="unit-dot" logo={u.logo} couleur={u.couleur} icon={UNIT_TYPES[u.type].icon} />
                  <span><b>{u.nom}</b><small className="muted">{a.icon} {a.label}</small></span>
                </button>
              );
            })}
            <NavLink to="/organigramme" className="unit-item link" onClick={() => setOpen(false)}>🏛️ Organigramme du club</NavLink>
          </div>
        </>
      )}
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

/** Entité ouverte en visiteur par un membre du comité central : ce qu'il peut y faire, et le retour à ses entités. */
function GuestBanner() {
  const { guest } = useStore();
  const club = useClubOptional();
  if (!guest || !club) return null;
  const back = club.mine.find((u) => u.type === 'central') ?? club.mine[0];
  return (
    <div className={`guest-banner ${guest.niveau}`} role="status">
      <span>
        {CENTRAL_ACCESS[guest.niveau].icon} <b>{club.current.nom}</b> · tu l’ouvres en tant que membre du comité central :{' '}
        {guest.niveau === 'ecriture' ? 'tu peux ajouter et modifier des tâches, sans rien supprimer.' : 'consultation seule.'}
      </span>
      {back && <button className="btn small" onClick={() => club.switchUnit(back.id)}>↩ {back.nom}</button>}
    </div>
  );
}
