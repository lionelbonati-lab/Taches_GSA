import { useEffect, useState } from 'react';

// Gestion de l'installation de l'application (PWA).
// Chrome / Edge (ordinateur et Android) déclenchent « beforeinstallprompt » très tôt,
// avant même l'affichage de React : on le capture ici dès le chargement.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const ua = () => navigator.userAgent;
export const isIos = () => /iphone|ipad|ipod/i.test(ua()) || (/macintosh/i.test(ua()) && navigator.maxTouchPoints > 1);
const isSafariMac = () => /macintosh/i.test(ua()) && /safari/i.test(ua()) && !/chrome|chromium|edg/i.test(ua()) && navigator.maxTouchPoints <= 1;

export type InstallState =
  | { kind: 'installed' }
  | { kind: 'prompt'; install: () => Promise<void> }
  | { kind: 'manual'; steps: string };

export function useInstall(): InstallState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', l);
    return () => {
      listeners.delete(l);
      mq.removeEventListener?.('change', l);
    };
  }, []);

  if (isStandalone()) return { kind: 'installed' };
  if (deferred) {
    const ev = deferred;
    return {
      kind: 'prompt',
      install: async () => {
        await ev.prompt();
        await ev.userChoice;
        deferred = null;
        notify();
      },
    };
  }
  if (isIos()) return { kind: 'manual', steps: 'Dans Safari, touche le bouton Partager (carré avec une flèche), puis « Sur l’écran d’accueil ».' };
  if (isSafariMac()) return { kind: 'manual', steps: 'Dans Safari, menu Fichier › « Ajouter au Dock ».' };
  if (/firefox/i.test(ua()) && !/android/i.test(ua()))
    return { kind: 'manual', steps: 'Firefox sur ordinateur ne sait pas installer d’application : ouvre l’adresse dans Chrome ou Edge.' };
  if (!window.isSecureContext)
    return { kind: 'manual', steps: 'L’installation n’est possible que depuis une adresse sécurisée (https://…).' };
  return { kind: 'manual', steps: 'Utilise l’icône d’installation dans la barre d’adresse, ou le menu du navigateur › « Installer Tâches GSA » / « Ajouter à l’écran d’accueil ».' };
}
