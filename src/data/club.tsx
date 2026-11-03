import { createContext, useContext } from 'react';
import type { ClubMembre, MonRegistre, NouvelleProposition, Proposition, Task, VisaVerifie } from './types';
import type { DemandeMdp } from './cloud';
import type { HistoriqueTache } from './historique';
import type { ErreurAppli, RapportErreur } from './rapportErreurs';
import type { SauvegardeClub } from './backup';

// Le club autour de son espace (PLAN_APPLI_SIMPLE.md) : un seul espace de travail (tâches, séances, événements,
// sondages…, dans la couche de données, store.tsx), et ce qui est au club : son nom et son logo, « Personnes du club »,
// les propositions, le rapport d'erreurs, les mots de passe oubliés, la sauvegarde.
// Démo : DemoApp (données dans le navigateur) ; version réelle : CloudClub (serveur).

/** L'espace du club : nom, logo, couleur et icône (en-tête de l'appli, documents). */
export interface Espace {
  id: string;
  nom: string;
  logo?: string;
  /** Couleur de l'appli (#rrggbb) ; sans choix : le bleu d'origine. */
  couleurAppli?: string;
  /** Icône choisie dans la bibliothèque (pastille de l'en-tête des documents). */
  icone?: string;
}

export interface Club {
  espace: Espace;
  loading: boolean;
  /** Nom, logo, couleur, icône de l'espace (console admin › Apparence). */
  modifierEspace: (patch: Partial<Omit<Espace, 'id'>>) => Promise<void>;
  /** Ticket visé qui porte ce n° de visa ; null : inconnu, visa retiré ou ticket supprimé (version réelle : 043). */
  verifierVisa: (code: string) => Promise<VisaVerifie | null>;
  /** Historique (050) d'une tâche : de la modification la plus récente à la plus ancienne. */
  historique: (tacheId: string) => Promise<HistoriqueTache>;
  /** Rapport d'erreurs (051) : erreur de l'appli signalée aux admins (sans réponse ni échec). */
  signalerErreur: (r: RapportErreur) => Promise<void>;
  /** Erreurs signalées, à regarder d'abord (admins). */
  erreurs: () => Promise<ErreurAppli[]>;
  reglerErreur: (id: string, reglee: boolean) => Promise<void>;
  /** Efface les erreurs réglées ; renvoie leur nombre. */
  effacerErreurs: () => Promise<number>;
  /**
   * Suivi des « Pour info » (052) : tâche → personnes attendues (clés « p:fiche » : fiches actives avec un compte).
   * null : le serveur ne le dit pas encore.
   */
  suiviPourInfo: (tacheIds: string[]) => Promise<Record<string, string[]> | null>;
  /**
   * Relance (052) d'une tâche « Pour info » (`tache` : celle de la fenêtre, pour la démo) : les personnes attendues qui ne
   * l'ont pas vue sont prévenues. `n` : combien ; `ici` (démo) : celles que l'appli prévient elle-même.
   */
  relancerPourInfo: (tacheId: string, tache: Task) => Promise<{ n: number; ici: string[] }>;
  /** Envoie une proposition d'amélioration de l'appli (tout membre du club). */
  proposerAmelioration: (p: NouvelleProposition) => Promise<void>;
  /** Propositions envoyées par la personne connectée, avec leur suivi ; null : le serveur ne les gère pas encore (022). */
  mesPropositions: () => Promise<Proposition[] | null>;
  /**
   * Personnes du club (liste unique) : `voir` la liste (tout le monde) ; `coordonnees` (email, téléphone) ; `gerer`
   * (ajouter, modifier, retirer du club). Selon les rôles de la personne ; version réelle : calculés par le serveur (055).
   */
  personnes: { voir: boolean; coordonnees: boolean; gerer: boolean };
  /** Caissier (rôle qui donne expressément « paiements.payer ») : lit les IBAN de la liste des membres. */
  caissier: boolean;
  /** Liste des membres : données masquées par une personne vides, IBAN aux caissiers (et à la personne elle-même). */
  membres: () => Promise<ClubMembre[]>;
  /** Enregistre des membres (nouveaux ou modifiés) ; leurs coordonnées passent dans les fiches liées. */
  saveMembres: (list: ClubMembre[]) => Promise<void>;
  /** Retire une personne du club : sa fiche (désactivée) et son accès ; ses tâches gardent son nom. */
  deleteMembre: (id: string) => Promise<void>;
  /** Ma fiche du registre (mon IBAN, ma confidentialité) ; null : je n'y suis pas. */
  monRegistre: () => Promise<MonRegistre | null>;
  /** Enregistre (vide : efface) mon IBAN : personne d'autre, pas même un admin, ne peut le faire. Renvoie l'IBAN enregistré. */
  enregistrerMonIban: (iban: string) => Promise<string>;
  /** Masque (ou non) mes données personnelles (email, téléphone, IBAN) dans la liste des membres. */
  setConfidentialite: (masquer: boolean) => Promise<void>;
  /** Version réelle : demandes « mot de passe oublié » (pour les admins). */
  demandesMdp: DemandeMdp[];
  /** Valide une demande : mot de passe provisoire à transmettre, à changer à la connexion. */
  approuverMdp: (id: string) => Promise<{ email: string; password: string }>;
  refuserMdp: (id: string) => Promise<void>;
  /** Super-admin du club : page « Comptes du club ». */
  superAdmin: boolean;
  /** Sauvegarde de tout le club (console admin › Sauvegarde), avec « Personnes du club » ; absente pour les autres. */
  sauvegardeClub?: (par: string) => Promise<SauvegardeClub>;
}

export const ClubCtx = createContext<Club | null>(null);

export function useClub() {
  const c = useContext(ClubCtx);
  if (!c) throw new Error('ClubCtx manquant');
  return c;
}

/** Comme useClub, mais sans erreur hors d'un club (tests, écrans isolés). */
export const useClubOptional = () => useContext(ClubCtx);
