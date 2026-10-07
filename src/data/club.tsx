import { createContext, useContext } from 'react';
import type { ClubMembre, MyRequest, OrgUnit, Person, SuiviTicket, TachePartagee, Task, TicketCentral, Unit, UnitType, AgendaClubEvent } from './types';
import { uid } from './utils';

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
  loading: boolean;
  error: string;
  /** Ouvre une autre entité ; `hash` : page à afficher ensuite (par défaut l'accueil). */
  switchUnit: (id: string, hash?: string) => void;
  refresh: () => void;
  createUnit: (u: NewUnit) => Promise<CreatedUnit>;
  updateUnit: (id: string, patch: Partial<Pick<Unit, 'nom' | 'type' | 'couleur' | 'description' | 'date' | 'dateFin' | 'archive' | 'central' | 'logo' | 'couleurAppli' | 'dependDe'>>) => Promise<void>;
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
