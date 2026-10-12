import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Mot de passe oublié : le lien reçu par e-mail (valable 1 heure, une seule fois) ouvre l'appli connectée, sur le choix
// d'un nouveau mot de passe.
// • Modèle d'e-mail du club (SUPABASE_SETUP.md) : …/?reel&mdp=<jeton> ; le jeton est vérifié ici (verifyOtp), il marche
//   aussi sur un autre appareil que celui de la demande.
// • Modèle par défaut de Supabase : …#access_token=…&type=recovery, lu par supabase-js à sa création ; noté avant,
//   sous la même clé (lib/supabase.ts, noterLienRecuperation).
// L'état est gardé dans sessionStorage : il survit au rechargement de la page (choix « Version réelle »), pas à l'onglet.

const CLE = 'taches-gsa-recuperation';
type Etat = 'nouveauMdp' | 'lienInvalide';

function lire(): Etat | null {
  try {
    const v = sessionStorage.getItem(CLE);
    return v === 'nouveauMdp' || v === 'lienInvalide' ? v : null;
  } catch {
    return null;
  }
}

function ecrire(v: Etat | null) {
  try {
    if (v) sessionStorage.setItem(CLE, v);
    else sessionStorage.removeItem(CLE);
  } catch {
    /* ignore */
  }
}

let verification: Promise<void> | null = null;

/** Lien du modèle d'e-mail du club (?mdp=…) : vérifié une seule fois (le jeton ne sert qu'une fois), puis retiré de l'adresse. */
export function verifierLienRecuperation(): Promise<void> {
  if (verification) return verification;
  const params = new URLSearchParams(location.search);
  const jeton = params.get('mdp');
  if (!jeton || !supabase) return (verification = Promise.resolve());
  params.delete('mdp');
  const q = params.toString();
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
  verification = supabase.auth
    .verifyOtp({ token_hash: jeton, type: 'recovery' })
    .then(({ data, error }) => ecrire(error || !data.session ? 'lienInvalide' : 'nouveauMdp'))
    .catch(() => ecrire('lienInvalide'));
  return verification;
}

/** Arrivée par le lien : choisir un nouveau mot de passe. */
export const doitChoisirMdp = () => lire() === 'nouveauMdp';

/** Lien expiré ou déjà utilisé : message affiché une fois sur l'écran de connexion. */
export function lienInvalide() {
  if (lire() !== 'lienInvalide') return false;
  ecrire(null);
  return true;
}

export const finRecuperation = () => ecrire(null);

/** Mot de passe provisoire à changer : drapeau du serveur (app_metadata, migration 025) ou d'avant (user_metadata). */
export const doitChangerMdp = (u?: User | null) => u?.app_metadata?.doit_changer_mdp === true || u?.user_metadata?.doit_changer_mdp === true;
