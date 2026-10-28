import { useCallback, useEffect, useState } from 'react';
import { actionPersonne, comptePersonne, type ComptePersonne } from '../data/cloud';
import { nomMembre } from '../data/membres';
import type { ClubMembre, Person } from '../data/types';
import { fmtDateTime } from '../data/utils';
import { Modal } from './ui';
import { nomAppli } from '../data/nomAppli';
import { lienMailto } from '../data/lienPartage';
import { Icone } from './icones';

// Accès à la version réelle : un compte par personne du club, donné une fois (PERSONNES_DU_CLUB.md) ; ses places dans
// l'organigramme lui ouvrent leurs entités, sans place elle voit les tâches qui lui sont confiées. Mot de passe provisoire
// à transmettre, à changer à la première connexion.

export interface Shown {
  person: Pick<Person, 'prenom' | 'nom'>;
  email: string;
  password?: string;
  existant?: boolean;
}

/**
 * Son compte (fiche « Personnes du club », ou sa fiche dans une entité) : donner l'accès, nouveau mot de passe, retirer
 * l'accès. Pour qui gère les personnes du club ; les places ★ se règlent par les admins (serveur : gsa_compte_club_etat).
 */
export function CompteDuClub({ clubId, membre }: { clubId: string; membre: ClubMembre }) {
  const [etat, setEtat] = useState<ComptePersonne | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const charger = useCallback(() => {
    comptePersonne(clubId, membre.id)
      .then(setEtat)
      .catch((e: Error) => {
        setEtat(null);
        setErr(e.message);
      });
  }, [clubId, membre.id]);
  useEffect(charger, [charger]);
  if (etat === undefined) return <p className="muted small-note">Accès à l’appli…</p>;
  if (!etat) return err ? <p className="error small-note">Accès à l’appli : {err}</p> : null;
  const act = async (action: 'compteClub' | 'mdpCompteClub' | 'retirerCompteClub') => {
    setBusy(true);
    setErr('');
    try {
      const r = await actionPersonne<{ email?: string; password?: string; existant?: boolean }>(action, clubId, membre.id);
      if (action !== 'retirerCompteClub') setShown({ person: membre, email: r.email ?? etat.email ?? membre.email, password: r.password, existant: r.existant });
      charger();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const nom = nomMembre(membre);
  const effet = etat.places ? 'ses places dans l’organigramme lui ouvrent leurs entités' : 'sans place dans l’organigramme, elle y voit les tâches qui lui sont confiées';
  return (
    <section className="compte-club">
      <span className="field-label">Accès à l’appli</span>
      {etat.compte ? (
        <p className="access">
          <span>✅ {etat.email}</span>
          <small className="muted">
            {etat.provisoire ? 'Mot de passe provisoire pas encore changé' : etat.derniereConnexion ? `Dernière connexion : ${fmtDateTime(etat.derniereConnexion)}` : 'Jamais connecté'} · {effet}
          </small>
        </p>
      ) : (
        <p className="muted small-note">
          Pas encore d’accès. Un seul compte par personne : {effet}.{!membre.email && !membre.masque && ' Indique d’abord son adresse email.'}
        </p>
      )}
      {!etat.peutDonner && !etat.moi && (
        <small className="muted">
          {etat.etoiles.length ? `★ de ${etat.etoiles.join(', ')} : son accès se règle par un admin de cette entité ou du comité central.` : 'Compte du propriétaire ou d’un super-admin : réservé aux super-admins.'}
        </small>
      )}
      <span className="row wrap">
        {!etat.compte && etat.peutDonner && (
          <button className="btn small primary" disabled={busy || (!membre.email && !membre.masque)} onClick={() => act('compteClub')}>
            {busy ? 'Création…' : 'Donner l’accès'}
          </button>
        )}
        {etat.compte && etat.peutMdp && (
          <button className="btn small" disabled={busy} onClick={() => confirm(`Donner un nouveau mot de passe provisoire à ${nom} ? L’actuel ne fonctionnera plus.`) && act('mdpCompteClub')}>
            Nouveau mot de passe
          </button>
        )}
        {etat.compte && etat.peutDonner && !etat.moi && (
          <button className="btn small danger" disabled={busy} onClick={() => confirm(`Retirer l’accès de ${nom} à l’appli ? Ses places restent dans l’organigramme.`) && act('retirerCompteClub')}>
            Retirer l’accès
          </button>
        )}
      </span>
      {err && <small className="error">{err}</small>}
      {shown && <CredentialsModal {...shown} onClose={() => setShown(null)} />}
    </section>
  );
}

export function CredentialsModal({ person, email, password, existant, intro, onClose }: Shown & { intro?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  // ?reel : le lien ouvre directement l'appli du club (sans l'écran de choix avec la démo).
  const url = `${location.origin}${location.pathname}?reel`;
  const text = password
    ? `Bonjour ${person.prenom},\n\nVoici ton accès à ${nomAppli()} :\n- Adresse : ${url}\n- Email : ${email}\n- Mot de passe provisoire : ${password}\n\nÀ la première connexion, choisis ton propre mot de passe.\n`
    : `Bonjour ${person.prenom},\n\nTu as maintenant accès à ${nomAppli()} : ${url}\nConnecte-toi avec ton adresse ${email} et ton mot de passe habituel.\n`;
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
      <textarea className="cred-texte" readOnly rows={8} value={text} />
      <div className="modal-foot wrap">
        <a className="btn" href={lienMailto(encodeURIComponent(email), `Ton accès à ${nomAppli()}`, text)}><Icone n="email" /> Préparer l’email</a>
        <button className="btn" onClick={copy}>{copied ? <><Icone n="ok" /> Copié</> : <><Icone n="copier" /> Copier le message</>}</button>
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
