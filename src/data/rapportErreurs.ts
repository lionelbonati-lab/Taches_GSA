import { moduleIntrouvable } from '../pwa';

/**
 * Rapport d'erreurs (051) : l'appli signale d'elle-même ses erreurs (page qui ne s'affiche pas, erreur de script) aux
 * admins du comité central. Ni noms ni données : le message, l'emplacement dans le code, la page (sans ce qui suit « ? »),
 * la version et l'appareil. Chaque erreur une fois par ouverture de l'appli, 10 au plus ; les erreurs de connexion, de
 * mise à jour (module introuvable) et des extensions du navigateur sont laissées de côté.
 */
export type OrigineErreur = 'affichage' | 'script' | 'promesse' | 'essai';

export interface RapportErreur {
  /** Même erreur (message et emplacement, sans les numéros) → même empreinte : comptée au lieu d'être répétée. */
  empreinte: string;
  message: string;
  origine: OrigineErreur;
  pile?: string;
  page: string;
  version: string;
  navigateur: string;
}

/** Erreur lue par les admins (console admin). */
export interface ErreurAppli {
  id: string;
  message: string;
  origine?: string;
  pile?: string;
  page?: string;
  version?: string;
  navigateur?: string;
  /** Entité ouverte la dernière fois. */
  entite?: string;
  premiere: string;
  derniere: string;
  nombre: number;
  personnes: number;
  reglee: boolean;
}

const PAR_OUVERTURE = 10;
const IGNOREES = /ResizeObserver loop|^Script error\.?$|Failed to fetch|NetworkError|Load failed|network ?error|AbortError|aborted|cancell?ed/i;

let envoyer: ((r: RapportErreur) => Promise<void>) | null = null;
const enAttente: RapportErreur[] = [];
const dejaVues = new Set<string>();
let nombre = 0;

/** Lignes utiles d'une pile : sans l'adresse du site, 8 au plus. */
export const pileCourte = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim().replace(/https?:\/\/[^\s)]*\/assets\//g, ''))
    .filter(Boolean)
    .slice(0, 8)
    .join('\n');

/** Version publiée : le nom du fichier principal (« index-AbC123 ») ; « dev » en développement. */
export function versionAppli() {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.src ?? '';
  return /assets\/(index-[\w-]+)\.js/.exec(src)?.[1] ?? 'dev';
}

/** Navigateur et système en clair (« Safari · iPhone »). */
export function appareil(ua: string) {
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const sys = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return sys ? `${nav} · ${sys}` : nav;
}

/** Empreinte courte d'un texte (FNV-1a, 2 × 32 bits). */
function hacher(s: string) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ s.charCodeAt(i), 0x811c9dc5);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** Message et emplacement sans ce qui change d'une fois à l'autre (nombres, identifiants, version des fichiers). */
function empreinteDe(message: string, pile: string) {
  const sans = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '*').replace(/-[\w]{8}\.js/g, '.js').replace(/\d+/g, '#');
  const lieu = pile.split('\n').find((l) => /\bat\b|@/.test(l) && !l.includes(message.slice(0, 20))) ?? '';
  return `e${hacher(`${sans(message).slice(0, 200)}|${sans(lieu)}`)}`;
}

function vider() {
  if (!envoyer) return;
  for (const r of enAttente.splice(0)) envoyer(r).catch(() => {});
}

/**
 * Note une erreur pour les admins. Renvoie true si elle part (ou partira dès que l'appli est connectée). `force` :
 * envoyée même si elle a déjà été vue (erreur d'essai).
 */
export function noterErreur(e: unknown, origine: OrigineErreur, suite = '', force = false): boolean {
  try {
    const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })());
    const message = `${err.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err.message || 'Erreur sans message'}`.slice(0, 500);
    const brute = err.stack ?? '';
    if (!force && (IGNOREES.test(message) || moduleIntrouvable(err) || /extension:\/\//.test(brute))) return false;
    const pile = [pileCourte(brute), pileCourte(suite)].filter(Boolean).join('\n\n');
    const empreinte = force ? `essai-${Date.now().toString(36)}` : empreinteDe(message, pileCourte(brute));
    if (!force && (dejaVues.has(empreinte) || nombre >= PAR_OUVERTURE)) return false;
    dejaVues.add(empreinte);
    nombre++;
    enAttente.push({ empreinte, message, origine, pile: pile || undefined, page: location.hash.split('?')[0] || '#/', version: versionAppli(), navigateur: navigator.userAgent.slice(0, 300) });
    if (enAttente.length > PAR_OUVERTURE) enAttente.shift();
    vider();
    return true;
  } catch {
    return false;
  }
}

/** L'appli connectée envoie les erreurs (celles d'avant la connexion partent alors) ; renvoie de quoi se débrancher. */
export function brancherRapport(f: (r: RapportErreur) => Promise<void>) {
  envoyer = f;
  vider();
  return () => {
    if (envoyer === f) envoyer = null;
  };
}

/** L'appli connectée envoie-t-elle les erreurs ? (sinon : écran de connexion, pas encore d'entité). */
export const rapportBranche = () => envoyer !== null;

/** Erreurs de script et promesses rejetées sans traitement, sur toute l'appli. */
export function installerRapport() {
  window.addEventListener('error', (ev) => {
    noterErreur(ev.error ?? ev.message, 'script');
  });
  window.addEventListener('unhandledrejection', (ev) => {
    noterErreur(ev.reason, 'promesse');
  });
}
