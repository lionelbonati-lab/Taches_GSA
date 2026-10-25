import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore, useSyncStatus } from '../data/store';
import { TaskModal, newTask } from './TaskModal';
import { versProchaineSeance } from '../data/seances';
import { TicketForm } from './Tickets';
import { GENRES, type GenreTicket } from '../data/paiements';
import { AppLogo, Avatar, Toast, UnitMark } from './ui';
import { InstallButton } from './InstallButton';
import { Bell } from './Bell';
import { showSystemNotification, useNotifications } from '../notifications';
import { useClubOptional } from '../data/club';
import { nomAppli } from '../data/nomAppli';
import { UNIT_TYPES } from '../data/units';
import { SousOnglets, useNavigation } from './Nav';
import { ErrorBoundary } from './ErrorBoundary';
import { applyTabIcon, cacheLogo } from '../data/logo';
import { applyAppColor, cacheColor } from '../data/couleur';
import { Icone, type IconeNom } from './icones';

export function Layout() {
  const { data, user, myRoles, login, prefs, setToast, cloud, creatableSections } = useStore();
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
  const ajouts = [
    ...(canCreate ? [{ label: 'Nouvelle tâche', icone: 'taches' as IconeNom, title: 'Ajout rapide d’une tâche', run: () => setQuick(true) }] : []),
    ...(['remboursement', 'facture'] as const).map((g) => ({
      label: GENRES[g].nouveau,
      icone: g as IconeNom,
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
  const sortirLabel = <><Icone n={cloud ? 'sortir' : 'changer'} /> {cloud ? 'Se déconnecter' : 'Changer d’utilisateur'}</>;

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
        <BoutonAnnuler />
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
                  <NavLink key={p.to} to={p.to} state={{ depuis: loc.pathname }} className="unit-item" role="menuitem"><Icone n={p.icon} /> {p.label}</NavLink>
                ))}
                <button className="unit-item" role="menuitem" onClick={sortir}>{sortirLabel}</button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="content">
        <SousOnglets />
        <ErrorBoundary page={loc.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      {!menu && ajouts.length > 0 && (
        <>
          {fab && <div className="fab-back" onClick={() => setFab(false)} />}
          {fab && (
            <div className="fab-menu" role="menu">
              {ajouts.map((a) => (
                <button key={a.label} role="menuitem" title={a.title} onClick={() => { setFab(false); a.run(); }}><Icone n={a.icone} /> {a.label}</button>
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
            <span><Icone n={r.icon} /></span>
            {r.label}
          </NavLink>
        ))}
        <button className={menu || dansPlus ? 'active' : ''} onClick={() => setMenu(!menu)}>
          <span><Icone n="menu" /></span>Plus
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
                  <NavLink key={p.to} to={p.to} className="sheet-link"><Icone n={p.icon} /> {p.label}</NavLink>
                ))}
              </div>
            ))}
            <div className="sheet-group">
              <small className="sheet-titre">Mon compte</small>
              {pagesCompte.map((p) => (
                <NavLink key={p.to} to={p.to} state={{ depuis: loc.pathname }} className="sheet-link"><Icone n={p.icon} /> {p.label}</NavLink>
              ))}
              <InstallButton variant="sheet" />
              <button className="sheet-link" onClick={sortir}>{sortirLabel}</button>
            </div>
          </div>
        </div>
      )}

      <Toast />
      {quick && canCreate && <TaskModal isNew task={newTask(user.id, versProchaineSeance(data.meetings))} onClose={() => setQuick(false)} />}
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
  return (
    <div className="unit-switch">
      <button className="unit-btn" onClick={() => setOpen(!open)} aria-expanded={open} title={`${UNIT_TYPES[current.type].label} · changer d’entité`} style={{ borderColor: current.couleur }}>
        <UnitMark className="unit-dot" logo={current.logo} couleur={current.couleur} icone={UNIT_TYPES[current.type].trait} />
        <span className="unit-name">{current.nom}</span>
        <span className="unit-caret">▾</span>
      </button>
      {open && (
        <>
          <div className="unit-back" onClick={() => setOpen(false)} />
          <div className="unit-menu" role="menu">
            <small className="muted">Entité ouverte</small>
            <div className="unit-item on">
              <UnitMark className="unit-dot" logo={current.logo} couleur={current.couleur} icone={UNIT_TYPES[current.type].trait} />
              <span><b>{current.nom}</b><small className="muted">{UNIT_TYPES[current.type].label}</small></span>
            </div>
            {others.length > 0 && <small className="muted">Mes autres entités</small>}
            {others.map((u) => (
              <button key={u.id} className="unit-item" role="menuitem" onClick={() => { setOpen(false); club.switchUnit(u.id); }}>
                <UnitMark className="unit-dot" logo={u.logo} couleur={u.couleur} icone={UNIT_TYPES[u.type].trait} />
                <span><b>{u.nom}</b><small className="muted">{UNIT_TYPES[u.type].label}{u.moiAdmin ? ' · ★ admin' : ''}</small></span>
              </button>
            ))}
            <NavLink to="/organigramme" className="unit-item link" onClick={() => setOpen(false)}><Icone n="organigramme" /> Organigramme du club</NavLink>
          </div>
        </>
      )}
    </div>
  );
}

/** Version réelle : état de l'enregistrement sur le serveur. */
/**
 * « Annuler » : défait la dernière action faite ici (tâche enregistrée, présences, réglage…), aussi avec Ctrl+Z (⌘Z)
 * hors d'un champ de saisie, où le navigateur annule la frappe. « Refaire » (après une annulation) : Ctrl+Y, Ctrl+Maj+Z.
 */
function BoutonAnnuler() {
  const { annulable, annuler, refaisable, refaire } = useStore();
  const ref = useRef({ annuler, refaire });
  ref.current = { annuler, refaire };
  const actif = !!annulable || !!refaisable;
  useEffect(() => {
    if (!actif) return;
    const touche = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const sens = k === 'z' && !e.shiftKey ? 'annuler' : k === 'y' || (k === 'z' && e.shiftKey) ? 'refaire' : null;
      if (!sens) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.modal-back')) return; // fenêtre ouverte : rien en arrière-plan
      e.preventDefault();
      ref.current[sens]();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [actif]);
  if (!actif) return null;
  return (
    <span className="annuler-btns">
      {annulable && (
        <button className="annuler-btn" onClick={annuler} title={`Annuler : ${annulable.action} (Ctrl+Z)`} aria-label={`Annuler : ${annulable.action}`}>
          <Icone n="annuler" /><span className="annuler-text"> Annuler</span>
        </button>
      )}
      {refaisable && (
        <button className="annuler-btn" onClick={refaire} title={`Refaire : ${refaisable.action} (Ctrl+Y)`} aria-label={`Refaire : ${refaisable.action}`}>
          <Icone n="refaire" />
        </button>
      )}
    </span>
  );
}

function SyncBadge() {
  const { status, pending } = useSyncStatus();
  if (status === 'horsLigne')
    return <span className="sync-tag off" title="Les modifications seront envoyées dès le retour de la connexion">⚠<span className="sync-text"> Hors ligne{pending ? ` · ${pending} en attente` : ''}</span></span>;
  if (status === 'envoi') return <span className="sync-tag busy" title="Envoi au serveur">⏳<span className="sync-text"> Envoi…</span></span>;
  return <span className="sync-tag" title="Tout est enregistré sur le serveur">☁<span className="sync-text"> À jour</span></span>;
}
