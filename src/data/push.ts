import { sb } from './cloud';
import { isIos, isStandalone } from '../pwa';

// Notifications sur téléphone, même l'appli fermée (version réelle, migration 047, fonction « gsa-push ») : l'appareil
// s'inscrit auprès du service de notification de son navigateur (Google, Apple, Mozilla…) avec la clé publique du
// serveur, puis donne son adresse d'envoi au serveur. Le contenu des notifications est chiffré pour l'appareil seul.

export interface EtatPush {
  /** Cet appareil reçoit les notifications. */
  inscrit: boolean;
  /** Appareils inscrits de la personne (tous navigateurs). */
  appareils: number;
  /** Dernier envoi réussi à l'un d'eux. */
  envoye: string | null;
}

/** Pourquoi ce navigateur ne peut pas recevoir de notifications appli fermée (null : il peut). */
export function pushImpossible(): string | null {
  if (isIos() && !isStandalone())
    return 'Sur iPhone et iPad, installe d’abord l’application sur l’écran d’accueil (Partager › « Sur l’écran d’accueil »), puis ouvre-la depuis son icône (iOS 16.4 ou plus récent).';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'Ce navigateur ne reçoit pas les notifications appli fermée. Essaie avec Chrome, Edge, Firefox ou Safari à jour.';
  return null;
}

const PAS_047 = 'Le serveur n’envoie pas encore les notifications sur téléphone (mise à jour 047 à appliquer).';

/** Fonction ou table du serveur absente : migration 047 pas encore appliquée, ou fonction pas encore déployée. */
function pushErreur(e: { message: string; code?: string }): Error {
  return new Error(['42P01', '42883', 'PGRST202', 'PGRST205'].includes(e.code ?? '') || (/gsa_push/.test(e.message) && /exist|find|schema cache/i.test(e.message)) ? PAS_047 : e.message);
}

/** Appel de la fonction « gsa-push » ; son message d'erreur s'il y en a un. */
async function fonction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke('gsa-push', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const corps = ctx ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
    if (corps?.error) throw new Error(corps.error);
    // 404 sans message de la fonction : pas encore déployée. Pas de réponse : hors connexion, ou pas encore déployée.
    if (ctx?.status === 404) throw new Error(PAS_047);
    throw new Error(ctx ? error.message : 'Serveur des notifications injoignable : vérifie la connexion (ou la mise à jour 047 n’est pas encore faite).');
  }
  return data as T;
}

// Cet appareil reçoit les notifications appli fermée (choix gardé dans le navigateur).
const DRAPEAU = 'taches-gsa-push';
export function pushActifIci() {
  try {
    return localStorage.getItem(DRAPEAU) === '1';
  } catch {
    return false;
  }
}
function noter(actif: boolean) {
  try {
    if (actif) localStorage.setItem(DRAPEAU, '1');
    else localStorage.removeItem(DRAPEAU);
  } catch {
    /* navigation privée */
  }
}

const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const b64url = (b: ArrayBuffer | null) => (b ? btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '');

async function inscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  return { reg, sub: (await reg?.pushManager.getSubscription()) ?? null };
}

/** Nom lisible de l'appareil, pour s'y retrouver (« iPhone · Safari »). */
function nomAppareil() {
  const u = navigator.userAgent;
  const os = /iphone/i.test(u) ? 'iPhone' : /ipad/i.test(u) || (/macintosh/i.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /android/i.test(u) ? 'Android' : /macintosh/i.test(u) ? 'Mac' : /windows/i.test(u) ? 'Windows' : /linux/i.test(u) ? 'Linux' : 'Appareil';
  const nav = /edg\//i.test(u) ? 'Edge' : /firefox|fxios/i.test(u) ? 'Firefox' : /samsungbrowser/i.test(u) ? 'Samsung Internet' : /chrome|crios/i.test(u) ? 'Chrome' : /safari/i.test(u) ? 'Safari' : '';
  return nav ? `${os} · ${nav}` : os;
}

/** État pour la personne connectée et cet appareil. */
export async function etatPush(): Promise<EtatPush> {
  const { sub } = pushImpossible() ? { sub: null } : await inscription();
  const { data, error } = await sb().rpc('gsa_push_etat', { adresse: sub?.endpoint ?? '' });
  if (error) throw pushErreur(error);
  const d = data as EtatPush;
  // Inscrit côté navigateur mais plus côté serveur (retiré, autre compte) : pas inscrit ici.
  const inscrit = !!sub && d.inscrit;
  if (!inscrit) noter(false);
  return { inscrit, appareils: d.appareils ?? 0, envoye: d.envoye ?? null };
}

/** Inscrit cet appareil (demande l'autorisation des notifications si besoin). Renvoie le nombre d'appareils inscrits. */
export async function activerPush(): Promise<number> {
  const raison = pushImpossible();
  if (raison) throw new Error(raison);
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted')
    throw new Error(perm === 'denied' ? 'Notifications bloquées pour ce site : réautorise-les dans les réglages du navigateur, puis recommence.' : 'Autorise les notifications pour recevoir les rappels.');
  const { cle } = await fonction<{ cle: string }>({ action: 'cle' });
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Inscription faite avec une autre clé de serveur : à refaire.
  if (sub && b64url(sub.options.applicationServerKey) !== cle) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64url(cle) });
  const { data, error } = await sb().rpc('gsa_push_abonner', {
    adresse: sub.endpoint,
    cle: b64url(sub.getKey('p256dh')),
    secret: b64url(sub.getKey('auth')),
    appareil: nomAppareil(),
  });
  if (error) throw pushErreur(error);
  noter(true);
  return data as number;
}

/**
 * À l'ouverture de l'appli (version réelle) : réinscrit cet appareil s'il reçoit les notifications. Le navigateur
 * change parfois l'adresse d'envoi ; un autre compte connecté sur l'appareil les reçoit à son tour.
 */
export async function rafraichirPush() {
  if (!pushActifIci() || pushImpossible()) return;
  if (Notification.permission !== 'granted') return noter(false);
  await activerPush().catch(() => undefined);
}

/** Retire cet appareil (serveur et navigateur). */
export async function desactiverPush() {
  noter(false);
  const { sub } = await inscription();
  if (!sub) return;
  const { error } = await sb().rpc('gsa_push_desabonner', { adresse: sub.endpoint });
  if (error) throw pushErreur(error);
  await sub.unsubscribe().catch(() => false);
}

/** Notification d'essai sur les appareils inscrits de la personne. */
export const essaiPush = () => fonction<{ appareils: number; envois: number }>({ action: 'essai' });
