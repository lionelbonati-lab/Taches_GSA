import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore, useSyncStatus } from '../data/store';
import { TaskModal, newTask } from './TaskModal';
import { TicketForm } from './Tickets';
import { GENRES, type GenreTicket } from '../data/paiements';
import { AppLogo, Avatar, Toast, UnitMark } from './ui';
import { InstallButton } from './InstallButton';
import { Bell } from './Bell';
import { showSystemNotification, useNotifications } from '../notifications';
import { useClubOptional } from '../data/club';
import { nomAppli } from '../data/nomAppli';
import { CENTRAL_ACCESS, centralAccess, UNIT_TYPES } from '../data/units';
import { SousOnglets, useNavigation } from './Nav';
import { applyTabIcon, cacheLogo } from '../data/logo';
import { applyAppColor, cacheColor } from '../data/couleur';

export function Layout() {
  const { user, myRoles, login, prefs, setToast, cloud, guest, creatableSections } = useStore();
  const club = useClubOptional();
  const [quick, setQuick] = useState(false);
  const [ticket, setTicket] = useState<GenreTicket | null>(null);
  const [fab, setFab] = useState(false);
  const [menu, setMenu] = useState(false);
  const [compte, setCompte] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const { rubriques, compte: pagesCompte, ouverte } = useNavigation();
  useEffect(() => {
    setMenu(false);
    setCompte(false);
  }, [loc.pathname]);
  // Raccourcis de l'application installée (appui long sur l'icône) : « Nouvelle tâche », « Remboursement », « Paiement ».
  useEffect(() => {
    const q = new URLSearchParams(loc.search);
    const n = q.get('nouveau');
    if (!q.has('ajout') && !n) return;
    if (q.has('ajout')) setQuick(true);
    else if (n === 'paiement' || n === 'remboursement') setTicket(n === 'paiement' ? 'facture' : 'remboursement');
    navigate(loc.pathname, { replace: true });
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
      `${nomAppli()} · ${unread.length} notification${unread.length > 1 ? 's' : ''}`,
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
    if (notifPrefs.systeme) showSystemNotification(`${nomAppli()} · email à envoyer`, fresh.map((n) => n.text).join('\n'), fresh[0].link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dueEmails.map((n) => n.key).join('|')]);

  // Logo de l'entité ouverte, sinon celui du club : en-tête. Logo propre de l'entité : icône de l'onglet.
  const logo = club?.current.logo ?? club?.central?.logo;
  const logoReady = !!logo || !club?.loading;
  const ownLogo = club?.current.logo !== club?.central?.logo ? club?.current.logo : undefined;
  useEffect(() => {
    if (!logoReady) return;
    cacheLogo(logo);
    void applyTabIcon(ownLogo);
  }, [logo, ownLogo, logoReady]);

  // Couleur de l'appli : celle de l'entité ouverte, sinon celle du club (comité central).
  const couleur = club?.current.couleurAppli ?? club?.central?.couleurAppli;
  const couleurReady = !!couleur || !club?.loading;
  useEffect(() => {
    if (!couleurReady) return;
    cacheColor(couleur);
    applyAppColor(couleur);
  }, [couleur, couleurReady]);

  if (!user) return null;
  const rolesText = myRoles.map((r) => r.label).join(' + ') || 'Aucun rôle';
  const canCreate = creatableSections().length > 0;
  // Bouton flottant « + » : tâche (ajout rapide), remboursement, paiement de facture.
  // (Un visiteur du comité central y choisit la caisse de l'une de ses entités.)
  const ajouts = [
    ...(canCreate ? [{ label: '✅ Nouvelle tâche', title: 'Ajout rapide d’une tâche', run: () => setQuick(true) }] : []),
    ...(['remboursement', 'facture'] as const).map((g) => ({
      label: `${GENRES[g].icon} ${GENRES[g].nouveau}`,
      title: g === 'facture' ? 'Payer une facture directement à qui l’a envoyée' : 'Rembourser une personne qui a avancé de l’argent',
      run: () => setTicket(g),
    })),
  ];
  // Rubrique ouverte (sous-onglets) ; sur téléphone, « Plus » regroupe les rubriques hors de la barre du bas et le compte.
  const rubriqueOuverte = ouverte?.rubrique?.id;
  const barre = rubriques.filter((r) => r.mobile);
  const horsBarre = rubriques.filter((r) => !r.mobile);
  const dansPlus = !!ouverte && !barre.some((r) => r.id === rubriqueOuverte);
  const sortir = () => login(null);
  const sortirLabel = cloud ? '🚪 Se déconnecter' : '🔄 Changer d’utilisateur';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <AppLogo src={logoReady ? logo ?? null : undefined} size={30} />
          <span className="brand-name">{nomAppli()}</span>
          {cloud ? <SyncBadge /> : <span className="demo-tag">DÉMO</span>}
        </div>
        {club && <UnitSwitch />}
        <nav className="tabs">
          {rubriques.map((r) => (
            <NavLink key={r.id} to={r.pages[0].to} end className={() => (r.id === rubriqueOuverte ? 'active' : '')} title={r.pages.map((p) => p.label).join(' · ')}>
              {r.label}
            </NavLink>
          ))}
        </nav>
        <Bell />
        <div className="who">
          <InstallButton variant="compact" hideWhenUnavailable />
          <button
            className={`who-btn ${compte || (ouverte && !ouverte.rubrique) ? 'on' : ''}`}
            onClick={() => setCompte(!compte)}
            aria-expanded={compte}
            aria-haspopup="menu"
            title="Mon compte : réglages, console admin, aide"
          >
            <Avatar id={user.id} size={32} />
            <span className="who-text">
              <strong>{user.prenom} {user.nom}</strong>
              <small>{user.poste} · {rolesText}</small>
            </span>
            <span className="unit-caret">▾</span>
          </button>
          {!cloud && <button className="btn small" onClick={sortir} title="Changer d'utilisateur">Changer</button>}
          {compte && (
            <>
              <div className="unit-back" onClick={() => setCompte(false)} />
              <div className="unit-menu compte-menu" role="menu">
                <div className="compte-moi">
                  <strong>{user.prenom} {user.nom}</strong>
                  <small className="muted">{user.poste} · {rolesText}</small>
                </div>
                {pagesCompte.map((p) => (
                  <NavLink key={p.to} to={p.to} className="unit-item" role="menuitem">{p.icon} {p.label}</NavLink>
                ))}
                <button className="unit-item" role="menuitem" onClick={sortir}>{sortirLabel}</button>
              </div>
            </>
          )}
        </div>
      </header>

      {guest && <GuestBanner />}
      <main className="content">
        <SousOnglets />
        <Outlet />
      </main>

      {!menu && ajouts.length > 0 && (
        <>
          {fab && <div className="fab-back" onClick={() => setFab(false)} />}
          {fab && (
            <div className="fab-menu" role="menu">
              {ajouts.map((a) => (
                <button key={a.label} role="menuitem" title={a.title} onClick={() => { setFab(false); a.run(); }}>{a.label}</button>
              ))}
            </div>
          )}
          <button
            className={`fab ${fab ? 'open' : ''}`}
            onClick={() => (ajouts.length === 1 ? ajouts[0].run() : setFab(!fab))}
            aria-label={ajouts.length === 1 ? 'Ajout rapide de tâche' : 'Ajouter'}
            aria-expanded={ajouts.length > 1 ? fab : undefined}
          >
            +
          </button>
        </>
      )}

      <nav className="bottomnav">
        {barre.map((r) => (
          <NavLink key={r.id} to={r.pages[0].to} end className={() => (r.id === rubriqueOuverte ? 'active' : '')}>
            <span>{r.icon}</span>
            {r.label}
          </NavLink>
        ))}
        <button className={menu || dansPlus ? 'active' : ''} onClick={() => setMenu(!menu)}>
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
            {horsBarre.map((r) => (
              <div key={r.id} className="sheet-group">
                <small className="sheet-titre">{r.label}</small>
                {r.pages.map((p) => (
                  <NavLink key={p.to} to={p.to} className="sheet-link">{p.icon} {p.label}</NavLink>
                ))}
              </div>
            ))}
            <div className="sheet-group">
              <small className="sheet-titre">Mon compte</small>
              {pagesCompte.map((p) => (
                <NavLink key={p.to} to={p.to} className="sheet-link">{p.icon} {p.label}</NavLink>
              ))}
              <InstallButton variant="sheet" />
              <button className="sheet-link" onClick={sortir}>{sortirLabel}</button>
            </div>
          </div>
        </div>
      )}

      <Toast />
      {quick && canCreate && <TaskModal quick isNew task={newTask(user.id)} onClose={() => setQuick(false)} />}
      {ticket && <TicketForm type={ticket} onClose={() => setTicket(null)} />}
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
