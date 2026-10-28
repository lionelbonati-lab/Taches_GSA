import { createContext, useContext } from 'react';
import type { Coordonnees } from './membres';
import type { Person, Prefs } from './types';

// Session du club (PLAN_CLUB_SANS_ENTITE.md, étape 1) : on se connecte au club, pas à une entité. La personne du club,
// ses places dans les entités, et ce qui est à elle une seule fois pour tout le club : ses réglages, son profil (sa fiche
// « Personnes du club ») et ses lectures (notifications vues, discussions lues). Les entités (store.tsx) lisent et
// écrivent ces réglages et lectures ici, plus dans leurs données.
// Démo : DemoApp, gardé dans ce navigateur (clé « taches-gsa-demo-perso ») ; version réelle : à venir (étape 4).

export const DEFAULT_PREFS: Prefs = { theme: 'auto', vueDefaut: 'mes', affichage: 'tableau' };

/** Ce qu'une personne garde au club, une seule fois : ses réglages et ses lectures. */
export interface PersoClub {
  prefs?: Partial<Prefs>;
  /** Notifications vues : « <entité>|<clé de la notification dans l'entité> » (les plus récentes). */
  notifLues?: string[];
  /** Discussions lues : clé commune « <entité de la tâche>:<tâche> » → date du dernier message lu. */
  discussionsLues?: Record<string, string>;
}

export interface SessionClub {
  /** Moi, personne du club : identifiant de ma fiche « Personnes du club », et ses coordonnées. */
  personne: Person;
  /** Mes places : entité → ma fiche (place) dans l'entité. */
  places: Record<string, string>;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  /** Notifications vues de l'entité `uniteId` (leurs clés dans l'entité). */
  notifLues: (uniteId: string) => string[];
  /** Notifications vues : « <entité>|<clé> ». */
  marquerLues: (cles: string[]) => void;
  /** Discussions lues : clé commune → date du dernier message lu. */
  discussionsLues: Record<string, string>;
  /** Discussion lue jusqu'au message du `dernier` (sa date) ; `cle` : clé commune. */
  lireDiscussion: (cle: string, dernier: string) => void;
  /** Mon profil (prénom, nom, email, téléphone) : enregistré dans ma fiche du club ; mes places suivent. */
  enregistrerProfil: (c: Coordonnees) => Promise<void>;
  deconnecter: () => void;
}

export const SessionCtx = createContext<SessionClub | null>(null);

/** Session du club, absente quand l'appli s'appuie encore sur une entité de base (version réelle, jusqu'à l'étape 4). */
export const useSessionOptional = () => useContext(SessionCtx);

export function useSession() {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('Session du club manquante');
  return s;
}

/** Préférences complètes (valeurs par défaut pour celles jamais réglées). */
export const prefsCompletes = (p?: Partial<Prefs>): Prefs => ({ ...DEFAULT_PREFS, ...p });

/** Les 800 notifications vues les plus récentes suffisent ; les 400 discussions lues le plus récemment aussi. */
export function avecLues(avant: string[] = [], cles: string[]): string[] {
  const vues = new Set(avant);
  if (cles.every((k) => vues.has(k))) return avant;
  cles.forEach((k) => vues.add(k));
  return [...vues].slice(-800);
}

export function avecDiscussionLue(avant: Record<string, string> = {}, cle: string, dernier: string): Record<string, string> {
  if ((avant[cle] ?? '') >= dernier) return avant;
  return Object.fromEntries(Object.entries({ ...avant, [cle]: dernier }).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 400));
}
