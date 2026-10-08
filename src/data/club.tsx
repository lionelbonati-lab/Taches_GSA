import { createContext, useContext } from 'react';
import type { Carte, ClubMembre, MyRequest, NouvelleProposition, OrgUnit, Person, Proposition, SondagePartage, SuiviTicket, TachePartagee, Task, TicketCentral, Unit, UnitType, AgendaClubEvent } from './types';
import { uid } from './utils';
import type { NouveauResponsable } from './cablage';
import type { OpOrga } from './organigramme';

// Le club et ses entités (comité central, sous-comités, groupes, équipes d'événement).
// L'appli travaille sur les données d'une entité à la fois ; ce contexte donne l'organigramme,
// le changement d'entité et ce qui passe d'une entité à l'autre (demandes au comité central).
// Démo : DemoApp (données dans le navigateur) ; version réelle : CloudApp (serveur).

/** Personne qui rejoint une nouvelle entité (prise dans l'annuaire du club ou nouvelle). */
export interface NewMember {
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  couleur: string;
  poste: string;
}

/** Fiche d'une personne dans la nouvelle entité. */
export const toPerson = (m: NewMember, roles: string[]): Person => ({
  id: uid('p'),
  prenom: m.prenom,
  nom: m.nom,
  email: m.email,
  telephone: m.telephone ?? '',
  couleur: m.couleur,
  poste: m.poste,
  roles,
  actif: true,
});

export interface NewUnit {
  nom: string;
  type: UnitType;
  couleur: string;
  description?: string;
  date?: string;
  dateFin?: string;
  /** Entité dont elle dépend dans l'organigramme (sinon le comité central). */
  dependDe?: string;
  /** Président ou responsable : admin de la nouvelle entité. */
  chef: NewMember;
  /** Autres membres de départ. */
  membres: NewMember[];
}

/** Résultat de la création : accès du président (version réelle). */
export interface CreatedUnit {
  unitId: string;
  email?: string;
  password?: string;
  existant?: boolean;
  /** Entité créée, mais une étape a échoué (accès à créer depuis l’onglet Membres de l’entité). */
  avertissement?: string;
}

export interface NewRequest {
  titre: string;
  remarque: string;
  delai: string;
  sectionId: string;
  /** Nom de la personne qui envoie la demande. */
  par: string;
}

export interface Club {
  /** Toutes les entités du club, avec leurs membres (archivées comprises). */
  units: OrgUnit[];
  /** Entité ouverte. */
  current: OrgUnit;
  central: OrgUnit | null;
  /** Entités dont l'utilisateur fait partie (hors archivées, sauf l'entité ouverte). */
  mine: OrgUnit[];
  /**
   * Entités ouvertes au comité central (réglage « Accès du comité central ») que l'utilisateur, membre du
   * comité central, peut consulter ou compléter sans en faire partie (hors archivées, sauf l'entité ouverte).
   */
  visitable: OrgUnit[];
  /** Admin du comité central : crée et modifie les entités du club. */
  canManage: boolean;
  /** Toute une entité parmi les membres d'une autre : tenu à jour par le serveur (migration 020) ou par la démo. */
  liens: boolean;
  loading: boolean;
  error: string;
  /** Ouvre une autre entité ; `hash` : page à afficher ensuite (par défaut l'accueil). */
  switchUnit: (id: string, hash?: string) => void;
  refresh: () => void;
  createUnit: (u: NewUnit) => Promise<CreatedUnit>;
  updateUnit: (id: string, patch: Partial<Pick<Unit, 'nom' | 'type' | 'couleur' | 'description' | 'date' | 'dateFin' | 'archive' | 'central' | 'logo' | 'couleurAppli' | 'dependDe' | 'carte'>>) => Promise<void>;
  /** Place des cartes dans l'organigramme (null : leur place dans l'arbre). Admins de l'entité ou du comité central. */
  placerCartes: (places: Record<string, Carte | null>) => Promise<void>;
  /** Change la date de la prochaine édition de l'entité ouverte (ses admins, son droit « Gérer les événements », le comité central). */
  setEditionDate: (date: string, dateFin?: string) => Promise<void>;
  /** Envoie une tâche au comité central (depuis une autre entité). */
  proposeTask: (r: NewRequest) => Promise<void>;
  /** Demandes envoyées au comité central par l'entité ouverte, avec leur suivi. */
  myRequests: () => Promise<MyRequest[]>;
  /** Envoie un ticket à rembourser à la caisse centrale (membre d'une autre entité). */
  ticketCentral: (t: TicketCentral) => Promise<void>;
  /** Tickets envoyés à la caisse centrale par la personne connectée. */
  mesTicketsCentraux: () => Promise<SuiviTicket[]>;
  /** Événements de toutes les entités du club (agenda ; sans description). */
  agendaClub: () => Promise<AgendaClubEvent[]>;
  /** Tâches que d'autres entités du club partagent avec l'entité ouverte. */
  tachesPartagees: () => Promise<TachePartagee[]>;
  /** Enregistre, dans son entité, une tâche partagée modifiée depuis l'entité ouverte. */
  modifierTachePartagee: (uniteId: string, task: Task) => Promise<void>;
  /** Sondages d'autres entités ouverts à l'entité ouverte ; null : le serveur ne les gère pas encore (migration 021). */
  sondagesPartages: () => Promise<SondagePartage[] | null>;
  /** Réponse de la personne connectée à un sondage d'une autre entité, enregistrée dans son entité. */
  voterSondagePartage: (uniteId: string, pollId: string, choix: string[], texte?: string) => Promise<void>;
  /**
   * Organigramme câblé : fait d'une personne le responsable (★) d'une entité du club (pas le comité central) ;
   * sa fiche y est reprise ou créée. Admins du comité central, ou de l'entité. `compte` : son compte au club lui ouvre l'entité.
   */
  definirResponsable: (uniteId: string, r: NouveauResponsable) => Promise<{ compte: boolean }>;
  /**
   * Organigramme à glisser-déposer (fiches à trois zones, postes liés) ; absent : l'organigramme câblé d'avant (démo
   * « classique », serveur pas encore à jour). Renvoie ce qui a été fait et de quoi l'annuler.
   */
  organiser?: (op: OpOrga) => Promise<{ message: string; annuler: () => Promise<void> }>;
  /**
   * Version réelle : personnes de l'entité ouverte modifiées ailleurs que dans l'organigramme (fiche, console admin),
   * déjà enregistrées ; `avant` : ses fiches d'avant. Le serveur fait suivre ses postes et les postes liés.
   */
  suivrePostes?: (avant: Person[]) => Promise<void>;
  /** Envoie une proposition d'amélioration de l'appli au comité central (tout membre du club). */
  proposerAmelioration: (p: NouvelleProposition) => Promise<void>;
  /** Propositions envoyées par la personne connectée, avec leur suivi ; null : le serveur ne les gère pas encore (migration 022). */
  mesPropositions: () => Promise<Proposition[] | null>;
  /** Registre « Membres du club » : accès (droit « club.membres » ou admin de l'une des entités du club). */
  membresAcces: boolean;
  membres: () => Promise<ClubMembre[]>;
  /** Enregistre des membres (nouveaux ou modifiés) ; leurs coordonnées passent dans les fiches liées des entités. */
  saveMembres: (list: ClubMembre[]) => Promise<void>;
  /** Supprime un membre du registre (refusé s'il a encore un poste actif dans une entité). */
  deleteMembre: (id: string) => Promise<void>;
}

export const ClubCtx = createContext<Club | null>(null);

export function useClub() {
  const c = useContext(ClubCtx);
  if (!c) throw new Error('ClubCtx manquant');
  return c;
}

/** Comme useClub, mais sans erreur hors d'un club (tests, écrans isolés). */
export const useClubOptional = () => useContext(ClubCtx);
