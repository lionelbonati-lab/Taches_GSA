import { useState } from 'react';
import { useStore } from '../data/store';
import { accessAction, type AccessInfo } from '../data/cloud';
import type { Person } from '../data/types';
import { fmtDateTime, fullName } from '../data/utils';
import { Modal } from './ui';
import { nomAppli } from '../data/nomAppli';

// Accès à la version réelle d'une fiche (compte, mot de passe provisoire), réglé par les admins de l'entité.

export interface Shown {
  person: Pick<Person, 'prenom' | 'nom'>;
  email: string;
  password?: string;
  existant?: boolean;
}

export function AccessCell({ person, access, onChange, onShow }: { person: Person; access: AccessInfo[] | null; onChange: () => void; onShow: (s: Shown) => void }) {
  const { cloud } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!cloud) return null;
  if (!access) return <small className="muted">…</small>;
  const info = access.find((a) => a.personId === person.id);
  const act = async (action: 'creer' | 'reinitialiser' | 'retirer') => {
    setBusy(true);
    setErr('');
    try {
      // La fiche doit être enregistrée sur le serveur avant de créer l'accès.
      if (action === 'creer') await cloud.sync.flushNow();
      const r = await accessAction<{ email?: string; password?: string; existant?: boolean }>({ action, committeeId: cloud.membership.committeeId, personId: person.id });
      if (action !== 'retirer') onShow({ person, email: r.email ?? person.email, password: r.password, existant: r.existant });
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (info?.owner)
    return <span className="access"><span>👑 Propriétaire</span><small className="muted">{info.email}</small></span>;
  if (info)
    return (
      <span className="access">
        <span>✅ {info.email}</span>
        <small className="muted">
          {info.provisoire ? 'Mot de passe provisoire pas encore changé' : info.derniereConnexion ? `Dernière connexion : ${fmtDateTime(info.derniereConnexion)}` : 'Jamais connecté'}
        </small>
        <span className="row wrap">
          <button className="btn small" disabled={busy} onClick={() => confirm(`Donner un nouveau mot de passe provisoire à ${fullName(person)} ? L’actuel ne fonctionnera plus.`) && act('reinitialiser')}>Nouveau mot de passe</button>
          {person.id !== cloud.personId && (
            <button className="btn small danger" disabled={busy} onClick={() => confirm(`Retirer l’accès de ${fullName(person)} à la version réelle ?`) && act('retirer')}>Retirer l’accès</button>
          )}
        </span>
        {err && <small className="error">{err}</small>}
      </span>
    );
  if (!person.actif) return <small className="muted">—</small>;
  return (
    <span className="access">
      <button className="btn small primary" disabled={busy || !person.email} title={person.email ? '' : 'Ajoute d’abord son adresse email à sa fiche'} onClick={() => act('creer')}>
        {busy ? 'Création…' : 'Créer l’accès'}
      </button>
      {!person.email && <small className="muted">Adresse email manquante sur sa fiche</small>}
      {err && <small className="error">{err}</small>}
    </span>
  );
}

export function CredentialsModal({ person, email, password, existant, intro, onClose }: Shown & { intro?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}${location.pathname}`;
  const text = password
    ? `Bonjour ${person.prenom},\n\nVoici ton accès à ${nomAppli()} (version réelle) :\n- Adresse : ${url}\n- Email : ${email}\n- Mot de passe provisoire : ${password}\n\nÀ la première connexion, choisis « Version réelle », puis ton propre mot de passe.\n`
    : `Bonjour ${person.prenom},\n\nTu as maintenant accès à ${nomAppli()} (version réelle) : ${url}\nConnecte-toi avec ton adresse ${email} et ton mot de passe habituel.\n`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Modal title={`Accès de ${person.prenom} ${person.nom}`.trim()} onClose={onClose}>
      {intro && <p>{intro}</p>}
      {existant ? (
        <p>Ce compte existait déjà : {person.prenom} se connecte avec son mot de passe habituel.</p>
      ) : (
        <p>
          Mot de passe provisoire : <code className="password">{password}</code>
          <br />
          <small className="muted">Il ne sera plus affiché : transmets-le maintenant (de vive voix, par message ou par email).</small>
        </p>
      )}
      <textarea className="full" readOnly rows={8} value={text} />
      <div className="modal-foot">
        <a className="btn" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Ton accès à ${nomAppli()}`)}&body=${encodeURIComponent(text)}`}>📧 Préparer l’email</a>
        <button className="btn" onClick={copy}>{copied ? '✅ Copié' : '📋 Copier le message'}</button>
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
