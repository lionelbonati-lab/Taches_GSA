import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore, useSyncStatus } from '../data/store';
import { TaskModal, useAutresCreation } from './FicheTache';
import { versProchaineSeance } from '../data/seances';
import { TicketForm } from './Tickets';
import { GENRES, type GenreTicket } from '../data/paiements';
import { AppLogo, Avatar, Toast } from './ui';
import { InstallButton } from './InstallButton';
import { Bell } from './Bell';
import { LienRecu } from './LienRecu';
import { Recherche } from './Recherche';
import { showSystemNotification, useNotifications } from '../notifications';
import { rafraichirPush } from '../data/push';
import { useClubOptional } from '../data/club';
import { brancherRapport } from '../data/rapportErreurs';
import { nomAppli } from '../data/nomAppli';
import { SousOnglets, useNavigation } from './Nav';
import { BarreBasModal } from './BarreBas';
import { barreDuBas } from '../data/navigation';
import { useDiscussions } from '../data/discussions';
import { ErrorBoundary } from './ErrorBoundary';
import { cacheLogo } from '../data/logo';
import { applyAppColor, cacheColor } from '../data/couleur';
import { Icone, type IconeNom } from './icones';
import { newTask } from '../data/utils';
import { Chez, DansEntite } from '../data/entites';
import type { OrgUnit } from '../data/types';
import { pageParEntite, useComites } from '../data/comites';

export function Layout() {
  const { data, user, myRoles, login, prefs, setToast, cloud, creatableSections } = useStore();
  const club = useClubOptional();
  const [quick, setQuick] = useState(false);
  const [ticket, setTicket] = useState<GenreTicket | null>(null);
  const [fab, setFab] = useState(false);
  const [menu, setMenu] = useState(false);
  const [compte, setCompte] = useState(false);
  const [reglerBarre, setReglerBarre] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const nav = useNavigation();
  const { rubriques, ouverte } = nav;
  // Pages qui s'ouvrent depuis une autre (`dans`) : pas dans les menus.
  const pagesCompte = nav.compte.filter((p) => !p.dans);
  const { nonLus } = useDiscussions();
  useEffect(() => {
    setMenu(false);
    setCompte(false);
  }, [loc.pathname]);
  // Rapport d'erreurs : les erreurs de l'appli partent aux admins du comité central, au nom de l'entité ouverte.
  const signalerErreur = club?.signalerErreur;
  useEffect(() => (signalerErreur ? brancherRapport(signalerErreur) : undefined), [signalerErreur]);
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
    if (cloud || !user || !notifPrefs.systeme || !unread.length) return;
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

  // Version réelle : si cet appareil reçoit les notifications appli fermée, son inscription est tenue à jour.
  useEffect(() => {
    if (cloud) void rafraichirPush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud?.email]);

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
    // Version réelle : le serveur l'envoie aux appareils inscrits (gsa-push).
    if (notifPrefs.systeme && !cloud) showSystemNotification(`${nomAppli()} · email à envoyer`, fresh.map((n) => n.text).join('\n'), fresh[0].link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dueEmails.map((n) => n.key).join('|')]);

  // Une seule appli pour tout le club : en-tête au logo et à la couleur du club (comité central), quelle que soit l'entité
  // sur laquelle elle s'appuie. Le logo d'une entité va sur ses documents (ordre du jour, PV, bon de paiement).
  const logo = club ? (club.central ?? club.current).logo : undefined;
  const logoReady = !!logo || !club?.loading;
  useEffect(() => {
    if (logoReady) cacheLogo(logo);
  }, [logo, logoReady]);

  const couleur = club ? (club.central ?? club.current).couleurAppli : undefined;
  const couleurReady = !!couleur || !club?.loading;
  useEffect(() => {
    if (!couleurReady) return;
    cacheColor(couleur);
    applyAppColor(couleur);
  }, [couleur, couleurReady]);

  // Vue « moi » : nouvelle tâche aussi dans l'une de mes autres entités (choisie dans la fenêtre).
  const autresCreation = useAutresCreation();

  if (!user) return null;
  const rolesText = myRoles.map((r) => r.label).join(' + ') || 'Aucun rôle';
  const canCreate = creatableSections().length > 0 || autresCreation.length > 0;
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
  const barre = barreDuBas(rubriques, prefs.barreBas);
  const horsBarre = rubriques.filter((r) => !barre.includes(r));
  // Messages pas encore lus : pastille sur l'onglet « Messages ».
  const pastille = (id: string) =>
    id === 'messages' && nonLus > 0 ? <span className="onglet-nb" aria-label={`${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''}`}>{nonLus > 99 ? '99+' : nonLus}</span> : null;
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
        <nav className="tabs">
          {rubriques.map((r) => (
            <NavLink key={r.id} to={r.pages[0].to} end className={() => (r.id === rubriqueOuverte ? 'active' : '')} title={r.pages.length > 1 ? `${r.label} : ${r.pages.map((p) => p.label).join(' · ')}` : r.label}>
              <Icone n={r.icon} />
              <span className="onglet-nom">{r.court ?? r.label}</span>
              {pastille(r.id)}
            </NavLink>
          ))}
        </nav>
        <BoutonAnnuler />
        <Recherche />
        <Bell />
        <LienRecu />
        <div className="who">
          <InstallButton variant="compact" hideWhenUnavailable />
          <button
            className={`who-btn ${compte || (ouverte && !ouverte.rubrique) ? 'on' : ''}`}
            onClick={() => setCompte(!compte)}
            aria-expanded={compte}
            aria-haspopup="menu"
            title="Mon compte : réglages, aide"
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
          <Suspense fallback={<ChargementPage />}>
            <DansComite>
              <Outlet />
            </DansComite>
          </Suspense>
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
            <span className="onglet-icone"><Icone n={r.icon} />{pastille(r.id)}</span>
            <span className="onglet-nom">{r.label}</span>
          </NavLink>
        ))}
        <button className={menu || dansPlus ? 'active' : ''} onClick={() => setMenu(!menu)}>
          <span className="onglet-icone"><Icone n="menu" />{!barre.some((r) => r.id === 'messages') && pastille('messages')}</span>
          <span className="onglet-nom">Plus</span>
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
                  <NavLink key={p.to} to={p.to} className="sheet-link"><Icone n={p.icon} /> {p.label}{pastille(r.id)}</NavLink>
                ))}
              </div>
            ))}
            <button className="sheet-link sheet-discret" onClick={() => { setMenu(false); setReglerBarre(true); }}><Icone n="reglages" /> Modifier la barre du bas</button>
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
      {quick && canCreate && <TaskModal isNew choixEntite task={newTask(user.id, versProchaineSeance(data.meetings, undefined, club?.current.type))} onClose={() => setQuick(false)} />}
      {ticket && (
        // Vue du club : le formulaire dans l'une de mes entités (sa caisse, ou celle qui reçoit ses tickets) ; une autre
        // caisse se choisit dans la fenêtre.
        <Chez id={club?.vueClub ? entiteDuTicket(club.mine)?.id : undefined}>
          <TicketForm type={ticket} onClose={() => setTicket(null)} />
        </Chez>
      )}
      {reglerBarre && <BarreBasModal onClose={() => setReglerBarre(false)} />}
    </div>
  );
}

/** Remboursement, paiement (vue du club) : la première de mes entités qui a une caisse, sinon la première. */
const entiteDuTicket = (mine: OrgUnit[]) => {
  const l = mine.filter((u) => !u.archive);
  return l.find((u) => u.membres.some((m) => m.caisse)) ?? l[0] ?? mine[0];
};

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

/**
 * Ordre du jour et PV d'un autre de mes comités que l'entité ouverte, console admin d'une autre de mes entités : affichés
 * dans la sienne (ses séances, ses tâches, mes droits chez elle), sans changer d'entité.
 */
function DansComite({ children }: { children: ReactNode }) {
  const comites = useComites();
  const club = useClubOptional();
  const { pathname } = useLocation();
  const perm = pageParEntite(pathname)?.perm;
  const choisi = perm ? comites?.choisi(perm) : undefined;
  if (!choisi || choisi.id === club?.current.id) return <>{children}</>;
  return (
    <DansEntite key={choisi.id} id={choisi.id} sinon={<ChargementPage />}>
      {children}
    </DansEntite>
  );
}

/** Page pas encore chargée (premier clic juste après l'ouverture) : rien pendant un instant, puis un mot d'attente. */
function ChargementPage() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);
  return visible ? <p className="muted chargement-page">Chargement de la page…</p> : null;
}
