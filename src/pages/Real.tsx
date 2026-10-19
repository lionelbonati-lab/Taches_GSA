import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { switchMode } from '../data/mode';
import { InstallButton } from '../components/InstallButton';
import { AppLogo } from '../components/ui';
import { backupSummary, readBackup, restoreFiles, type Backup } from '../data/backup';
import { demanderMdp, linkMyPerson, type CloudSync, type Membership } from '../data/cloud';
import { lienInvalide } from '../data/recuperation';
import { makeSeed } from '../data/seed';
import { migrate, SCHEMA } from '../data/store';
import { ADMIN_ROLE_ID } from '../data/permissions';
import { fmtDateTime, fullName, posteBesideName, uid } from '../data/utils';
import type { AppData, Person } from '../data/types';
import { nomAppli } from '../data/nomAppli';
import { sortUnits, UNIT_TYPES } from '../data/units';

// Écrans de la version réelle (avant d'entrer dans l'appli) et écran d'accueil (choix démo / version réelle).

function Card({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="login">
      <div className={`login-card ${wide ? 'wide' : ''}`}>
        <AppLogo size={56} />
        <h1>{nomAppli()}</h1>
        {children}
      </div>
    </div>
  );
}

/** Première ouverture : version réelle (membres du comité) ou démo (pour essayer). */
export function Welcome() {
  return (
    <Card wide>
      <p className="muted">Gestion des tâches du comité du G.S. Ajoie</p>
      <div className="mode-choice">
        <button className="mode-card" onClick={() => switchMode('reel')}>
          <span className="mode-icon">🔐</span>
          <strong>Version réelle</strong>
          <small>Pour les membres du comité : connexion avec ton email et ton mot de passe. Les données sont partagées en direct entre tous les membres.</small>
        </button>
        <button className="mode-card" onClick={() => switchMode('demo')}>
          <span className="mode-icon">🧪</span>
          <strong>Démo</strong>
          <small>Pour découvrir l’appli : données fictives, aucun mot de passe. Ce que tu saisis reste dans ce navigateur et n’est partagé avec personne.</small>
        </button>
      </div>
      <InstallButton variant="compact" hideWhenUnavailable />
    </Card>
  );
}

const authError = (msg: string) =>
  /invalid login credentials/i.test(msg) ? 'Email ou mot de passe incorrect.'
  : /banned/i.test(msg) ? 'Ce compte est bloqué. Renseigne-toi auprès du président.'
  : /rate limit|too many/i.test(msg) ? 'Trop de tentatives : patiente quelques minutes.'
  : /fetch|network/i.test(msg) ? 'Pas de connexion au serveur. Vérifie ta connexion Internet.'
  : msg;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function RealLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Arrivée par un lien « mot de passe oublié » expiré ou déjà utilisé : le panneau s'ouvre avec le message.
  const [invalide] = useState(lienInvalide);
  const [forgot, setForgot] = useState(invalide);
  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(authError(error.message));
  };
  return (
    <Card>
      <p className="muted">Version réelle – connexion des membres du comité</p>
      <form className="login-form" onSubmit={signIn}>
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Mot de passe
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
      <button className="btn link" onClick={() => setForgot(!forgot)} aria-expanded={forgot}>Mot de passe oublié ou pas encore de compte ?</button>
      {forgot && <MotDePasseOublie email={email} setEmail={setEmail} invalide={invalide} />}
      <div className="login-foot">
        <button className="btn link" onClick={() => switchMode('demo')}>🧪 Essayer la démo</button>
        <InstallButton variant="compact" hideWhenUnavailable />
      </div>
    </Card>
  );
}

/**
 * Mot de passe oublié : lien par e-mail (valable 1 heure, une seule fois), ou demande aux admins des entités du compte
 * (l'un d'eux donne un mot de passe provisoire, à changer à la connexion).
 */
function MotDePasseOublie({ email, setEmail, invalide }: { email: string; setEmail: (v: string) => void; invalide: boolean }) {
  const [busy, setBusy] = useState<'' | 'lien' | 'admins'>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(
    invalide ? { ok: false, text: 'Ce lien a expiré (il est valable 1 heure) ou a déjà servi. Demande-en un nouveau ci-dessous.' } : null,
  );
  const adresse = email.trim();
  const valide = EMAIL.test(adresse);
  const lien = async () => {
    setBusy('lien');
    setMsg(null);
    const { error } = await supabase!.auth.resetPasswordForEmail(adresse, { redirectTo: `${location.origin}${location.pathname}?reel` });
    setBusy('');
    if (!error) return setMsg({ ok: true, text: `Si un compte existe pour ${adresse}, un e-mail vient de partir avec un lien valable 1 heure, utilisable une seule fois. Regarde aussi dans les indésirables.` });
    setMsg({
      ok: false,
      text: /security purposes|only request this|seconds/i.test(error.message)
        ? 'Un e-mail vient déjà d’être demandé : patiente une minute avant de recommencer.'
        : /rate limit|too many/i.test(error.message)
          ? 'Trop d’e-mails demandés pour l’instant : réessaie plus tard, ou demande aux admins de tes entités.'
          : /fetch|network/i.test(error.message)
            ? 'Pas de connexion au serveur. Vérifie ta connexion Internet.'
            : 'L’envoi d’e-mails ne fonctionne pas pour l’instant : demande plutôt aux admins de tes entités (bouton ci-dessous).',
    });
  };
  const admins = async () => {
    setBusy('admins');
    setMsg(null);
    try {
      await demanderMdp(adresse);
      setMsg({ ok: true, text: `Demande envoyée aux admins de tes entités (si un compte existe pour ${adresse}). L’un d’eux te transmettra un mot de passe provisoire, de vive voix ou par message : tu choisiras le tien à la connexion.` });
    } catch (e) {
      setMsg({ ok: false, text: /fetch|network/i.test((e as Error).message) ? 'Pas de connexion au serveur. Vérifie ta connexion Internet.' : 'Demande impossible pour l’instant : contacte directement le président ou un admin de ton entité.' });
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="mdp-oublie">
      <label>
        Ton adresse email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <div className="mdp-oublie-actions">
        <button className="btn" disabled={!valide || !!busy} onClick={lien}>{busy === 'lien' ? 'Envoi…' : '📧 Recevoir un lien par email'}</button>
        <button className="btn" disabled={!valide || !!busy} onClick={admins}>{busy === 'admins' ? 'Envoi…' : '🙋 Demander aux admins de mes entités'}</button>
      </div>
      {msg && <p className={msg.ok ? 'ok-note' : 'error'} role="status">{msg.text}</p>}
      <p className="muted small-note">
        Pas encore de compte ? Les accès sont créés par le président (ou un admin) depuis l’organigramme, dans la fiche de chaque personne : demande-lui un accès.
      </p>
    </div>
  );
}

/** Choix du mot de passe (obligatoire après un mot de passe provisoire ou un lien « mot de passe oublié », ou depuis les réglages). */
export function PasswordForm({ onDone, submitLabel = 'Enregistrer le mot de passe' }: { onDone: () => void; submitLabel?: string }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (p1.length < 8) return setError('Au moins 8 caractères.');
    if (p1 !== p2) return setError('Les deux mots de passe ne sont pas identiques.');
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password: p1, data: { doit_changer_mdp: false } });
    if (error) {
      setBusy(false);
      return setError(/different from the old/i.test(error.message) ? 'Choisis un mot de passe différent de l’ancien.' : authError(error.message));
    }
    // Le serveur a retiré l'obligation de changer le mot de passe (migration 025) : nouveau jeton, sans elle.
    const { error: e2 } = await supabase!.auth.refreshSession();
    setBusy(false);
    if (e2) {
      alert('Mot de passe enregistré. Reconnecte-toi avec ton nouveau mot de passe.');
      await supabase!.auth.signOut();
      return window.location.reload();
    }
    setP1('');
    setP2('');
    setError('');
    onDone();
  };
  return (
    <form className="login-form" onSubmit={save}>
      <label>
        Nouveau mot de passe
        <input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
      </label>
      <label>
        Confirmer
        <input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy || !p1}>{busy ? 'Enregistrement…' : submitLabel}</button>
    </form>
  );
}

export function FirstPassword({ email, onDone, onSignOut }: { email: string; onDone: () => void; onSignOut: () => void }) {
  return (
    <Card>
      <p>Bienvenue <b>{email}</b> !</p>
      <p className="muted">Tu t’es connecté avec un mot de passe provisoire. Choisis ton propre mot de passe (8 caractères au moins).</p>
      <PasswordForm onDone={onDone} submitLabel="Continuer" />
      <button className="btn link" onClick={onSignOut}>Se déconnecter</button>
    </Card>
  );
}

/** Arrivée par le lien « mot de passe oublié » : choix d'un nouveau mot de passe. */
export function NewPassword({ email, onDone, onSignOut }: { email: string; onDone: () => void; onSignOut: () => void }) {
  return (
    <Card>
      <p>Nouveau mot de passe pour <b>{email}</b></p>
      <p className="muted">Choisis ton nouveau mot de passe (8 caractères au moins). L’ancien ne fonctionnera plus.</p>
      <PasswordForm onDone={onDone} submitLabel="Enregistrer et continuer" />
      <button className="btn link" onClick={onSignOut}>Annuler</button>
    </Card>
  );
}

export function Message({ title, children, onSignOut }: { title: string; children: ReactNode; onSignOut?: () => void }) {
  return (
    <Card>
      <h2>{title}</h2>
      <div className="muted">{children}</div>
      <div className="login-foot">
        {onSignOut && <button className="btn" onClick={onSignOut}>Se déconnecter</button>}
        <button className="btn link" onClick={() => switchMode('demo')}>🧪 Ouvrir la démo</button>
      </div>
    </Card>
  );
}

export function ChooseCommittee({ list, onChoose, onSignOut }: { list: Membership[]; onChoose: (m: Membership) => void; onSignOut: () => void }) {
  return (
    <Card>
      <p className="muted">Ton compte a accès à plusieurs entités du club. Laquelle ouvrir ? (Tu passeras de l’une à l’autre depuis le menu en haut.)</p>
      <div className="login-list">
        {sortUnits(list.map((m) => ({ ...m, nom: m.committeeName, date: m.info.date }))).map((m) => (
          <button key={m.committeeId} className="login-user" onClick={() => onChoose(m)}>
            <span className="unit-dot" style={{ background: m.info.couleur ?? '#1d4ed8' }}>{UNIT_TYPES[m.type].icon}</span>
            <span><strong>{m.committeeName}</strong><small>{UNIT_TYPES[m.type].label}{m.owner ? ' · propriétaire' : ''}</small></span>
          </button>
        ))}
      </div>
      <button className="btn link" onClick={onSignOut}>Se déconnecter</button>
    </Card>
  );
}

const newPerson = (p: Partial<Person>): Person => ({
  id: uid('p'),
  poste: 'Président',
  nom: '',
  prenom: '',
  email: '',
  telephone: '',
  roles: [ADMIN_ROLE_ID],
  actif: true,
  couleur: '#b45309',
  ...p,
});

function PersonForm({ email, onSubmit, busy }: { email: string; onSubmit: (p: Person) => void; busy: boolean }) {
  const [p, setP] = useState({ prenom: '', nom: '', poste: 'Président', email });
  const ok = p.prenom.trim() && p.nom.trim();
  return (
    <form className="login-form" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(newPerson({ prenom: p.prenom.trim(), nom: p.nom.trim(), poste: p.poste.trim(), email: p.email.trim() })); }}>
      <div className="two">
        <label>Prénom<input required value={p.prenom} onChange={(e) => setP({ ...p, prenom: e.target.value })} /></label>
        <label>Nom<input required value={p.nom} onChange={(e) => setP({ ...p, nom: e.target.value })} /></label>
      </div>
      <label>Poste<input value={p.poste} onChange={(e) => setP({ ...p, poste: e.target.value })} /></label>
      <label>Email<input type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} /></label>
      <button className="btn primary" disabled={!ok || busy}>{busy ? 'Enregistrement…' : 'Continuer'}</button>
    </form>
  );
}

/** Base vide : statuts, sections et rôles du club, et la fiche du président. */
function emptyBase(me: Person): AppData {
  const s = makeSeed();
  return {
    ...s,
    people: [me],
    tasks: [],
    meetings: [],
    events: [],
    polls: [],
    emails: [],
    notifications: [],
    notifLues: {},
    prefs: {},
    schema: SCHEMA,
    log: [{ id: uid('l'), at: new Date().toISOString(), userId: me.id, action: 'Mise en route (base vide)' }],
  };
}

/** Première ouverture du comité par son propriétaire : reprise d'une sauvegarde de la démo, ou base vide. */
export function Setup({ membership, userId, email, sync, onDone, onSignOut }: {
  membership: Membership;
  userId: string;
  email: string;
  sync: CloudSync;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [step, setStep] = useState<'choix' | 'vide' | 'import'>('choix');
  const [backup, setBackup] = useState<Backup | null>(null);
  const [me, setMe] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const write = async (d: AppData, personId: string, files?: Backup['files']) => {
    setError('');
    try {
      if (files && Object.keys(files).length) {
        setBusy('Envoi des fichiers joints…');
        await restoreFiles(files);
      }
      setBusy('Envoi des données…');
      await sync.flushNow(d);
      await linkMyPerson(membership.committeeId, userId, personId);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  };

  const pick = async (file?: File) => {
    if (!file) return;
    try {
      const b = await readBackup(file);
      setBackup(b);
      const admins = b.data.people.filter((p) => p.actif && p.roles.includes(ADMIN_ROLE_ID));
      setMe(admins[0]?.id ?? b.data.people[0]?.id ?? '');
      setStep('import');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doImport = () => {
    if (!backup || !me) return;
    const d = migrate(structuredClone(backup.data));
    d.log.unshift({ id: uid('l'), at: new Date().toISOString(), userId: me, action: `Mise en route : données reprises de la sauvegarde du ${fmtDateTime(backup.exportedAt)}` });
    void write(d, me, backup.files);
  };

  return (
    <Card wide>
      <h2>Mise en route · {membership.committeeName}</h2>
      {step === 'choix' && (
        <>
          <p className="muted">Le comité n’a encore aucune donnée sur le serveur. Comment veux-tu commencer ?</p>
          <div className="mode-choice">
            <button className="mode-card" onClick={() => fileRef.current?.click()}>
              <span className="mode-icon">⬆</span>
              <strong>Reprendre une sauvegarde</strong>
              <small>Une sauvegarde téléchargée (Réglages › Sauvegarde des données) : tâches, séances, PV, responsables, fichiers joints…</small>
            </button>
            <button className="mode-card" onClick={() => setStep('vide')}>
              <span className="mode-icon">✨</span>
              <strong>Commencer avec une base vide</strong>
              <small>Statuts, sections et rôles du club, et ta fiche. Tu ajoutes ensuite les responsables, séances et tâches.</small>
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </>
      )}
      {step === 'vide' && (
        <>
          <p className="muted">Ta fiche de responsable (rôle Admin) :</p>
          <PersonForm email={email} busy={!!busy} onSubmit={(p) => void write(emptyBase(p), p.id)} />
          {!busy && <button className="btn link" onClick={() => setStep('choix')}>← Retour</button>}
        </>
      )}
      {step === 'import' && backup && (
        <>
          <p>Sauvegarde du <b>{fmtDateTime(backup.exportedAt)}</b>{backup.exportedBy ? ` (${backup.exportedBy})` : ''}</p>
          <p className="muted">{backupSummary(backup)}</p>
          <label className="login-form">
            Qui es-tu dans cette liste ?
            <select value={me} onChange={(e) => setMe(e.target.value)}>
              {backup.data.people.filter((p) => p.actif).map((p) => <option key={p.id} value={p.id}>{fullName(p)}{posteBesideName(fullName(p), p.poste) && ` – ${p.poste}`}</option>)}
            </select>
          </label>
          <p className="muted small-note">Pense à corriger ensuite les noms et les adresses email dans l’organigramme (clic sur chaque personne) : ce sont elles qui serviront à créer les accès des membres.</p>
          <button className="btn primary" disabled={!!busy || !me} onClick={doImport}>Importer</button>
          {!busy && <button className="btn link" onClick={() => { setBackup(null); setStep('choix'); }}>← Retour</button>}
        </>
      )}
      {busy && <p className="muted">{busy}</p>}
      {error && <p className="error">{error}</p>}
      <div className="login-foot">
        <button className="btn link" onClick={onSignOut}>Se déconnecter</button>
      </div>
    </Card>
  );
}

/** Le propriétaire n'est encore lié à aucune fiche : il choisit la sienne (ou la crée). */
export function WhoAreYou({ data, email, onChoose, onSignOut }: { data: AppData; email: string; onChoose: (personId: string, created?: Person) => Promise<void>; onSignOut: () => void }) {
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async (id: string, created?: Person) => {
    setBusy(true);
    try {
      await onChoose(id, created);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const active = data.people.filter((p) => p.actif);
  return (
    <Card>
      <p className="muted">Quelle fiche de responsable est la tienne ?</p>
      {!create && (
        <div className="login-list">
          {active.map((p) => (
            <button key={p.id} className="login-user" disabled={busy} onClick={() => go(p.id)}>
              <span><strong>{p.prenom} {p.nom}</strong><small>{p.poste}</small></span>
            </button>
          ))}
          <button className="btn" onClick={() => setCreate(true)}>Je ne suis pas dans la liste</button>
        </div>
      )}
      {create && <PersonForm email={email} busy={busy} onSubmit={(p) => go(p.id, p)} />}
      {error && <p className="error">{error}</p>}
      <button className="btn link" onClick={onSignOut}>Se déconnecter</button>
    </Card>
  );
}
