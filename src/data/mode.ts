// Deux façons d'utiliser l'appli, à la même adresse :
// - « demo » : données fictives gardées dans ce navigateur, connexion sans mot de passe (pour faire essayer) ;
// - « reel » : données du comité sur le serveur (Supabase), partagées en direct, connexion par email + mot de passe.

export type Mode = 'demo' | 'reel';

const KEY = 'taches-gsa-mode';

export function getMode(): Mode | null {
  try {
    const m = localStorage.getItem(KEY);
    return m === 'demo' || m === 'reel' ? m : null;
  } catch {
    return null;
  }
}

/** Change de mode (null : retour à l'écran d'accueil) et recharge l'appli. */
export function switchMode(m: Mode | null) {
  try {
    if (m) localStorage.setItem(KEY, m);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.location.hash = '';
  window.location.reload();
}
