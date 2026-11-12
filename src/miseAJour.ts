import { useSyncExternalStore } from 'react';

// Appli pas à jour : une nouvelle version a été publiée depuis son ouverture (une appli installée sur un téléphone peut
// rester ouverte des jours sans être rechargée). Une version trop ancienne ne connaît pas les nouveautés et peut abîmer
// les données (10.11.2026 et 12.11.2026 : les séries d'événements effacées par un appareil pas à jour ; le serveur les
// protège maintenant, migration 069). L'appli relit donc la page publiée (index.html) de temps en temps et compare son
// script principal (« assets/index-<empreinte>.js », dont le nom change à chaque publication du code) au sien : s'il
// diffère, l'appli est bloquée jusqu'à sa mise à jour (MiseAJour.tsx : un écran avec le seul bouton « Mettre à jour
// l'application », sans « Plus tard » ; un formulaire ouvert ou une saisie en cours est d'abord terminé, le bandeau
// prévient en attendant).
// Quand : 5 s après l'ouverture, toutes les 15 minutes, au retour sur l'appli (après au moins une minute) et au retour
// de la connexion. En développement (vite dev, pas de script « assets/index-… ») : jamais.

const PREMIERE = 5_000;
const PERIODE = 15 * 60_000;
const ECART_MIN = 60_000;

/** Script principal de la page (`src` d'un `<script type="module">` dans `assets/`). */
const ENTREE = /<script[^>]*type="module"[^>]*src="([^"]*assets\/index-[^"]+\.js)"/;

/** Le script principal chargé par cette appli, en adresse complète ; aucun (développement) : pas de vérification. */
function scriptCourant(): string | undefined {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]');
  return s?.src || undefined;
}

let nouvelle = false;
let derniere = 0;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());

/** Adresse de la page de l'appli (le dossier au-dessus de « assets/ »). */
const racine = (script: string) => new URL('../', script).href;

/**
 * Relit la page publiée et dit si son script principal n'est plus celui de cette appli. Lue sans aucun cache, et gardée
 * nulle part (sw.js ne garde pas une réponse « no-store ») : hors connexion, l'appli rouvre la version dont elle a les
 * fichiers.
 */
export async function verifierMiseAJour(): Promise<boolean> {
  const courant = scriptCourant();
  if (!courant || !navigator.onLine) return nouvelle;
  derniere = Date.now();
  try {
    const res = await fetch(racine(courant), { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return nouvelle;
    const m = ENTREE.exec(await res.text());
    // Page sans script principal (portail d'un wifi public, page d'erreur) : rien à conclure.
    if (!m) return nouvelle;
    const publie = new URL(m[1], res.url || racine(courant)).href;
    if (publie !== courant && !nouvelle) {
      nouvelle = true;
      prevenir();
    }
  } catch {
    // Hors connexion, serveur injoignable : on réessaiera.
  }
  return nouvelle;
}

/** Lance les vérifications (une fois, au démarrage : main.tsx). */
export function suivreMisesAJour() {
  if (!scriptCourant()) return;
  const verifier = () => void verifierMiseAJour();
  setTimeout(verifier, PREMIERE);
  setInterval(() => {
    if (document.visibilityState === 'visible') verifier();
  }, PERIODE);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - derniere > ECART_MIN) verifier();
  });
  window.addEventListener('online', verifier);
}

/**
 * Met l'appli à jour : le service worker relu (s'il a changé), la nouvelle page reprise du serveur (elle remplace celle
 * du cache du navigateur), puis rechargée.
 */
export async function mettreAJour() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    // Sans service worker (navigateur, mode privé) : le rechargement suffit.
  }
  const courant = scriptCourant();
  if (courant) await fetch(racine(courant), { cache: 'reload', credentials: 'same-origin' }).catch(() => undefined);
  location.reload();
}

const etat = () => nouvelle;

/** Une nouvelle version est publiée depuis l'ouverture de l'appli. */
export function useMiseAJourDisponible() {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    etat,
  );
}
