import { createContext, useContext } from 'react';
import type { Carte, ClubMembre, FichesEntite, MonRegistre, MyRequest, NouvelleProposition, OrganigrammeAnnuel, OrgUnit, Person, Proposition, SeancesDuComite, SectionsDependantes, SondagePartage, SuiviTicket, VisaVerifie, TachePartagee, Task, TicketCentral, Unit, UnitType, AgendaClubEvent } from './types';
import { uid } from './utils';
import type { OpOrga } from './organigramme';
import type { DemandeMdp } from './cloud';

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
  /** Icône choisie dans la bibliothèque (sinon celle du type). */
  icone?: string;
  description?: string;
  date?: string;
  dateFin?: string;
  /** Entité dont elle dépend dans l'organigramme (sinon le comité central). */
  dependDe?: string;
  /** Président ou responsable : admin de la nouvelle entité. */
  chef: NewMember;
  /** Postes de départ, à pourvoir (organigramme ; un comité : secrétaire et caissier). */
  postes?: string[];
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

/** Ce que la suppression définitive d'une entité archivée effacerait. */
export interface ApercuSuppression {
  nom: string;
  taches: number;
  tickets: number;
  seances: number;
  evenements: number;
  sondages: number;
  personnes: number;
  /** Comptes qui y ont accès (version réelle). */
  acces?: number;
  fichiers: number;
  /** Entités actives dont « Dépend de » la désigne (elles dépendront du comité central). */
  dependantes: string[];
  /** Postes liés ⛓ à elle dans les autres entités (déliés, ils restent). */
  postesLies: number;
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
  updateUnit: (id: string, patch: Partial<Pick<Unit, 'nom' | 'type' | 'couleur' | 'description' | 'date' | 'dateFin' | 'archive' | 'central' | 'logo' | 'couleurAppli' | 'icone' | 'dependDe' | 'tachesDependance' | 'historiqueDependance' | 'carte' | 'rangement'>>) => Promise<void>;
  /** Entité archivée : ce que sa suppression définitive effacerait (admins du comité central). */
  apercuSuppression: (id: string) => Promise<ApercuSuppression>;
  /**
   * Supprime définitivement une entité archivée et toutes ses données (`nom` : son nom, retapé pour confirmer).
   * Renvoie un avertissement si une étape secondaire a échoué (fichiers, postes liés).
   */
  supprimerUnite: (id: string, nom: string) => Promise<string | undefined>;
  /** Place des cartes dans l'organigramme (null : leur place dans l'arbre). Admins de l'entité ou du comité central. */
  placerCartes: (places: Record<string, Carte | null>) => Promise<void>;
  /** Change la date de la prochaine édition de l'entité ouverte (ses admins, son droit « Gérer les événements », le comité central). */
  setEditionDate: (date: string, dateFin?: string) => Promise<void>;
  /** Envoie une tâche au comité central (depuis une autre entité). */
  proposeTask: (r: NewRequest) => Promise<void>;
  /** Demandes envoyées au comité central par l'entité ouverte, avec leur suivi. */
  myRequests: () => Promise<MyRequest[]>;
  /**
   * Envoie un ticket à rembourser à la caisse qui reçoit ceux de l'entité ouverte : celle du comité dont elle dépend
   * s'il a un caissier, sinon la caisse centrale (caisseDe ; membre d'une autre entité que celle de la caisse).
   */
  ticketCentral: (t: TicketCentral) => Promise<void>;
  /** Tickets envoyés à une autre caisse (comité dont l'entité dépend, caisse centrale) par la personne connectée. */
  mesTicketsCentraux: () => Promise<SuiviTicket[]>;
  /**
   * Ticket visé qui porte ce n° de visa, dans toutes les entités du club (« Vérifier un visa ») ; null : inconnu, visa
   * retiré ou ticket supprimé. Version réelle : gsa_verifier_visa (migration 043).
   */
  verifierVisa: (code: string) => Promise<VisaVerifie | null>;
  /** Événements de toutes les entités du club (agenda ; sans description). */
  agendaClub: () => Promise<AgendaClubEvent[]>;
  /** Tâches que d'autres entités du club partagent avec l'entité ouverte. */
  tachesPartagees: () => Promise<TachePartagee[]>;
  /**
   * Anciennes tâches des entités qui dépendent de l'entité ouverte depuis leur dernier changement de dépendance
   * (lecture et copie) ; null : le serveur ne les gère pas encore (migration 030).
   */
  anciennesTaches: () => Promise<TachePartagee[] | null>;
  /**
   * Tâches d'autres entités du club « pour info » de l'entité ouverte (l'entité, ou l'une de ses personnes, mentionnée),
   * en lecture seule ; null : le serveur ne les gère pas encore (migration 037).
   */
  tachesPourInfo: () => Promise<TachePartagee[] | null>;
  /**
   * Séances du comité dont dépend l'entité ouverte, pour y lier une tâche (son ordre du jour et son PV) ; null : le
   * serveur ne les donne pas encore (migration 032).
   */
  seancesComite: () => Promise<SeancesDuComite | null>;
  /**
   * Sections des entités qui dépendent de l'entité ouverte, pour y ranger une tâche qui leur est attribuée ; null : le
   * serveur ne les donne pas encore (migration 033).
   */
  sectionsDependantes: () => Promise<SectionsDependantes | null>;
  /**
   * Enregistre une tâche de l'entité ouverte dans l'entité `uniteId` qui dépend d'elle (attribuée depuis sa sous-section),
   * partagée avec l'entité ouverte. `statut` : son statut ici, pour retrouver le même chez elle.
   */
  attribuerTache: (uniteId: string, task: Task, statut: { label: string; done: boolean }) => Promise<void>;
  /** Enregistre, dans son entité, une tâche partagée modifiée depuis l'entité ouverte. */
  modifierTachePartagee: (uniteId: string, task: Task) => Promise<void>;
  /**
   * « 🙋 Je m'en charge » (prend) ou « Pas dispo » sur une tâche à prendre de l'entité `uniteId`, partagée avec l'entité
   * ouverte et proposée ici à la personne connectée (040) : réponse enregistrée dans l'entité de la tâche.
   */
  repondreTachePartagee: (uniteId: string, tacheId: string, prend: boolean) => Promise<void>;
  /**
   * « ✓ Vu » de la personne connectée sur une tâche de l'entité `uniteId` pour info de l'entité ouverte (elle-même, ou
   * l'entité pour ses admins et les rôles « Voir toutes les tâches ») ou partagée avec elle : enregistré sur la tâche,
   * pour son auteur (version réelle : gsa_pour_info_vu, 046).
   */
  vuPourInfo: (uniteId: string, tacheId: string) => Promise<void>;
  /** Sondages d'autres entités ouverts à l'entité ouverte ; null : le serveur ne les gère pas encore (migration 021). */
  sondagesPartages: () => Promise<SondagePartage[] | null>;
  /** Réponse de la personne connectée à un sondage d'une autre entité, enregistrée dans son entité. */
  voterSondagePartage: (uniteId: string, pollId: string, choix: string[], texte?: string) => Promise<void>;
  /**
   * Moteur de l'organigramme (postes, postes liés, personnes glissées) ; absent : le serveur n'est pas encore à jour
   * (migration 023), l'organigramme est en lecture seule. Renvoie ce qui a été fait et de quoi l'annuler.
   */
  organiser?: (op: OpOrga) => Promise<{ message: string; annuler: () => Promise<void> }>;
  /**
   * Version réelle : personnes de l'entité ouverte modifiées ailleurs que dans l'organigramme (fiche, console admin),
   * déjà enregistrées ; `avant` : ses fiches d'avant. Le serveur fait suivre ses postes et les postes liés.
   */
  suivrePostes?: (avant: Person[]) => Promise<void>;
  /**
   * Organigrammes des années enregistrées (une photo par année, la dernière prise pendant l'année), du plus récent au
   * plus ancien ; null : le serveur ne les tient pas encore (migration 026). Lecture seule, pour tout le club.
   */
  organigrammesAnnuels: () => Promise<OrganigrammeAnnuel[] | null>;
  /** Envoie une proposition d'amélioration de l'appli au comité central (tout membre du club). */
  proposerAmelioration: (p: NouvelleProposition) => Promise<void>;
  /** Propositions envoyées par la personne connectée, avec leur suivi ; null : le serveur ne les gère pas encore (migration 022). */
  mesPropositions: () => Promise<Proposition[] | null>;
  /** Registre « Membres du club » : accès (droit « club.membres » ou admin de l'une des entités du club). */
  membresAcces: boolean;
  /**
   * Caissier du club (rôle qui donne expressément « paiements.payer » dans l'une de ses entités) : lit la liste des
   * membres, avec leurs IBAN (eux seuls).
   */
  caissier: boolean;
  /** Liste des membres : données masquées par une personne vides, IBAN aux caissiers (et à la personne elle-même). */
  membres: () => Promise<ClubMembre[]>;
  /** Enregistre des membres (nouveaux ou modifiés) ; leurs coordonnées passent dans les fiches liées des entités. */
  saveMembres: (list: ClubMembre[]) => Promise<void>;
  /** Supprime un membre du registre (refusé s'il a encore un poste actif dans une entité). */
  deleteMembre: (id: string) => Promise<void>;
  /** Ma fiche du registre (mon IBAN, ma confidentialité) ; null : je n'y suis pas. */
  monRegistre: () => Promise<MonRegistre | null>;
  /** Enregistre (vide : efface) mon IBAN : personne d'autre, pas même un admin, ne peut le faire. Renvoie l'IBAN enregistré. */
  enregistrerMonIban: (iban: string) => Promise<string>;
  /** Masque (ou non) mes données personnelles (email, téléphone, IBAN) dans la liste des membres. */
  setConfidentialite: (masquer: boolean) => Promise<void>;
  /** Fiches et rôles d'une entité dont on est admin (accès gérés depuis la page « Membres du club »). */
  fichesEntite: (uniteId: string) => Promise<FichesEntite>;
  /** Enregistre une fiche (rôles, retrait, réactivation, ajout) dans une entité dont on est admin ; ses postes suivent. */
  enregistrerFiche: (uniteId: string, p: Person) => Promise<void>;
  /** Version réelle : demandes « mot de passe oublié » des membres de l'entité ouverte (pour ses admins). */
  demandesMdp: DemandeMdp[];
  /** Valide une demande : mot de passe provisoire à transmettre, à changer à la connexion. */
  approuverMdp: (id: string) => Promise<{ email: string; password: string }>;
  refuserMdp: (id: string) => Promise<void>;
  /** Super-admin du club (hors des entités) : page « Comptes du club ». */
  superAdmin: boolean;
}

export const ClubCtx = createContext<Club | null>(null);

export function useClub() {
  const c = useContext(ClubCtx);
  if (!c) throw new Error('ClubCtx manquant');
  return c;
}

/** Comme useClub, mais sans erreur hors d'un club (tests, écrans isolés). */
export const useClubOptional = () => useContext(ClubCtx);
