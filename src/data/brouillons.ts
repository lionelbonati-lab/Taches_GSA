import { useSyncExternalStore } from 'react';
import type { Task } from './types';
import { getMode } from './mode';

// Brouillons des points : ce qu'on a changé dans la fiche d'un point sans l'avoir encore enregistré, gardé sur cet
// appareil (localStorage) à chaque changement. L'appli fermée, rechargée (mise à jour) ou coupée par le téléphone avec
// une fiche ouverte : rien n'est perdu. Rouvrir le point reprend ses modifications ; un bandeau, sur toutes les pages,
// rappelle ceux qui attendent (BrouillonsEnAttente.tsx). Fermer la fiche (✕, Échap) les enregistre (TaskModal.tsx) ;
// le brouillon est alors effacé, comme après « Enregistrer » ou « Ne pas enregistrer ».
// Par personne connectée (et par mode : démo, version réelle) ; jamais envoyé au serveur.

export type Brouillon = {
  /** Le point tel qu'il est dans la fiche. */
  t: Task;
  /** Pas encore créé. */
  isNew: boolean;
  /** Dernière modification du point enregistré à l'ouverture de la fiche (pour dire s'il a changé depuis). */
  base?: string;
  /** Dernier changement. */
  le: string;
};

const cle = (userId: string) => `taches-gsa-brouillons-${getMode() ?? 'demo'}-${userId}`;

function lire(userId: string): Record<string, Brouillon> {
  try {
    const v = JSON.parse(localStorage.getItem(cle(userId)) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

let version = 0;
const abonnes = new Set<() => void>();
const prevenir = () => {
  version++;
  abonnes.forEach((f) => f());
};

function ecrire(userId: string, tous: Record<string, Brouillon>) {
  try {
    if (Object.keys(tous).length) localStorage.setItem(cle(userId), JSON.stringify(tous));
    else localStorage.removeItem(cle(userId));
  } catch {
    // Stockage plein ou refusé (navigation privée) : la fiche reste utilisable, sans copie de secours.
  }
  prevenir();
}

/** Le brouillon du point `id` (s'il y en a un). */
export const brouillonDe = (userId: string, id: string): Brouillon | undefined => lire(userId)[id];

export function garderBrouillon(userId: string, b: Brouillon) {
  ecrire(userId, { ...lire(userId), [b.t.id]: b });
}

export function effacerBrouillon(userId: string, id: string) {
  const tous = lire(userId);
  if (!(id in tous)) return;
  delete tous[id];
  ecrire(userId, tous);
}

/** Fiches ouvertes en ce moment : leur brouillon n'est pas rappelé (on est dessus). */
const ouverts = new Map<string, number>();
export function ficheOuverte(id: string) {
  ouverts.set(id, (ouverts.get(id) ?? 0) + 1);
  prevenir();
  return () => {
    const n = (ouverts.get(id) ?? 1) - 1;
    if (n > 0) ouverts.set(id, n);
    else ouverts.delete(id);
    prevenir();
  };
}

/** Brouillons qui attendent (fiche fermée), le plus récent d'abord. */
export function useBrouillons(userId: string | undefined): Brouillon[] {
  useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      // Une autre fenêtre de l'appli sur cet appareil.
      const stockage = (e: StorageEvent) => {
        if (userId && e.key === cle(userId)) prevenir();
      };
      window.addEventListener('storage', stockage);
      return () => {
        abonnes.delete(f);
        window.removeEventListener('storage', stockage);
      };
    },
    () => version,
  );
  if (!userId) return [];
  return Object.values(lire(userId))
    .filter((b) => b?.t?.id && !ouverts.has(b.t.id))
    .sort((a, b) => b.le.localeCompare(a.le));
}
