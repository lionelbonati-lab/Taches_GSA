export type RoleId = string;

export type Permission =
  | 'tasks.viewAll'
  | 'tasks.createAny'
  | 'tasks.editAny'
  | 'tasks.editOwn'
  | 'tasks.delete'
  | 'tab.meetings'
  | 'tab.events'
  | 'tab.people'
  | 'tab.pv'
  | 'tab.minutes'
  | 'polls.create'
  | 'polls.manage'
  | 'meetings.manage'
  | 'events.manage'
  | 'people.manage'
  | 'settings.lists'
  | 'admin.access'
  | 'paiements.valider'
  | 'paiements.payer';

export interface Person {
  id: string;
  poste: string;
  /** Autres fonctions occupées, séparées par des virgules (ex. « Course à pied, Camp de Pentecôte »). */
  autresPostes?: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  roles: RoleId[];
  actif: boolean;
  couleur: string;
}

export interface Role {
  id: RoleId;
  label: string;
  couleur: string;
  permissions: Permission[];
  /** Sections sur lesquelles portent les droits « tâches » du rôle. Vide = toutes. */
  sections: string[];
  /** Rôle système (Admin) : non modifiable, non supprimable. */
  locked?: boolean;
}

export interface Status {
  id: string;
  label: string;
  couleur: string;
  done: boolean;
}

export interface Section {
  id: string;
  nom: string;
  sousSections: string[];
}

/** Sous-tâche : simple case à cocher (pour une étape avec responsable ou délai, créer une tâche liée). */
export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export type Recurrence = 'hebdomadaire' | 'mensuelle' | 'trimestrielle' | 'semestrielle' | 'annuelle';

/** Délai calculé à partir de la date de l'événement (eventId) ou de la séance (meetingId) liés. */
export interface DelaiRef {
  type: 'event' | 'meeting';
  /** Nombre de jours avant la date de référence (négatif = après). En mois : 30 jours par mois, valeur approchée. */
  joursAvant: number;
  /** Unité choisie (absente dans les tâches d'avant le réglage libre : des jours). */
  unite?: DelaiUnite;
  /** Délai en mois du calendrier (négatif = après) : 1 mois avant le 15.11 → le 15.10. */
  moisAvant?: number;
}

export type DelaiUnite = 'jours' | 'semaines' | 'mois';

/** Document joint à une tâche : fichier (contenu gardé à part, voir files.ts) ou lien. */
export interface TaskDoc {
  id: string;
  nom: string;
  kind: 'fichier' | 'lien';
  url?: string;
  mime?: string;
  taille?: number;
  par: string;
  le: string;
}

export type PollType = 'ouinon' | 'choix' | 'dates';

export interface PollOption {
  id: string;
  label: string;
  date?: string;
  heure?: string;
  /** Réponse « Autre » : le votant écrit sa propre réponse. */
  autre?: boolean;
}

export interface Poll {
  id: string;
  question: string;
  description?: string;
  type: PollType;
  /** Choix multiple autorisé (toujours vrai pour un sondage de dates). */
  multiple: boolean;
  options: PollOption[];
  votants: string[];
  anonyme: boolean;
  dateLimite?: string;
  taskId?: string;
  /** Section de l'ordre du jour (sinon celle de la tâche liée). */
  sectionId?: string;
  creePar: string;
  creeLe: string;
  clotureLe?: string;
  /** Réponses : personne → options choisies. */
  votes: Record<string, string[]>;
  /** Texte écrit avec la réponse « Autre » : personne → texte. */
  textes?: Record<string, string>;
}

/** Quand partir : date et heure fixes, ou N jours avant (négatif = après) le délai de la tâche. */
export type EmailWhen = { type: 'date'; date: string; heure: string } | { type: 'delai'; jours: number; heure: string };

/** Email programmé au sujet d'une tâche. */
export interface ScheduledEmail {
  id: string;
  taskId: string;
  /** Personnes destinataires (leur adresse vient de l'onglet Responsables). */
  destinataires: string[];
  /** Adresses supplémentaires, séparées par des virgules. */
  autres?: string;
  objet: string;
  message: string;
  quand: EmailWhen;
  /** Ne pas envoyer si la tâche est déjà terminée à ce moment-là. */
  siNonTerminee: boolean;
  statut: 'programme' | 'envoye' | 'annule';
  envoyeLe?: string;
  envoyePar?: string;
  creePar: string;
  creeLe: string;
}

export interface Task {
  id: string;
  sectionId: string;
  sousSection: string;
  titre: string;
  responsables: string[];
  statusId: string;
  delai: string; // AAAA-MM-JJ
  remarque: string;
  eventId?: string;
  meetingId?: string;
  checklist: ChecklistItem[];
  /** Tâche principale à laquelle cette tâche est liée (un seul niveau). */
  parentId?: string;
  documents?: TaskDoc[];
  delaiRef?: DelaiRef;
  recurrence?: Recurrence;
  /** Postes des responsables : l'occurrence suivante va à la personne qui occupe alors le poste. */
  postesResp?: string[];
  /** Occurrence suivante déjà créée (évite les doublons si on rouvre puis referme la tâche). */
  suivanteId?: string;
  /** Date de clôture (passage à un statut « terminé »), pour le bilan de l'ordre du jour. */
  termineeLe?: string;
  createdBy: string;
  updatedAt: string;
  /** Tâche proposée au comité central par un sous-comité, un groupe ou une équipe. */
  proposee?: Proposal;
  /** Tâche ajoutée par un membre du comité central (entité ouverte en « modifier / ajouter ») : son nom. */
  parCentral?: string;
  /** Tâche de paiement : ticket à rembourser, validé (signé) puis payé par la caisse. */
  paiement?: Paiement;
}

/** Origine d'une tâche proposée au comité central. */
export interface Proposal {
  uniteId: string;
  unite: string;
  par: string;
  le: string;
}

export interface Meeting {
  id: string;
  titre: string;
  date: string;
  /** Heure de début (ex. 19:30). */
  heure?: string;
  lieu: string;
  ordreDuJour: string;
  notes: string;
  /** Ordres du jour archivés pour cette séance (copie figée du document généré). */
  pvArchives?: PvArchive[];
  /** Prise de notes du PV pendant la séance. */
  minutes?: MeetingMinutes;
  /** PV validés (copie figée du document envoyé). */
  minutesArchives?: PvArchive[];
  /** Excuses annoncées avant la séance (onglet Comité ou ordre du jour). */
  excuses?: Excuse[];
  /** Ordre du jour modifié à la main : remplace le document généré tant qu'on ne revient pas à celui-ci. */
  odjEdite?: { html: string; le: string; par: string };
}

export interface Excuse {
  personId: string;
  motif?: string;
  /** Date de l'annonce. */
  le: string;
}

/** État d'une tâche au début de la séance, pour repérer ce qui a changé pendant la séance. */
export interface TaskSnapshot {
  statusId: string;
  delai: string;
  responsables: string[];
  titre: string;
  /** Sous-tâches : identifiant → faite. */
  sous?: Record<string, boolean>;
}

export interface MeetingMinutes {
  presents: string[];
  excuses: string[];
  invites?: string;
  heureDebut?: string;
  heureFin?: string;
  demarreLe?: string;
  /** Notes par point : 'sec:<id>', 'task:<id>', 'poll:<id>', 'divers'. */
  notes: Record<string, string>;
  snapshot?: Record<string, TaskSnapshot>;
  /** Points de l'ordre du jour au début de la séance (restent affichés même s'ils sont reportés). */
  pointIds?: string[];
  /** Afficher dans le PV tous les points de l'ordre du jour (sinon seulement ceux avec notes ou changements). */
  tousLesPoints?: boolean;
  /** Changements de tâches faits depuis l'onglet PV (seuls ceux-ci figurent dans le PV). */
  journal?: MinutesChange[];
  /** Tâches créées pendant la séance (« nouvelle tâche décidée »). */
  nouvelles?: string[];
  /** Intitulés des tâches supprimées depuis l'onglet PV. */
  supprimees?: string[];
  valideLe?: string;
  validePar?: string;
  /** Numéro de la dernière version validée (1, 2…). */
  version?: number;
  /** PV validé rouvert pour correction (la validation créera la version suivante). */
  enCorrection?: boolean;
  /** Copie de la dernière version validée, pour pouvoir annuler une correction. */
  derniereValidee?: Omit<MeetingMinutes, 'derniereValidee'>;
}

export interface MinutesChange {
  taskId: string;
  titre: string;
  changes: string[];
  at: string;
}

export interface PvArchive {
  id: string;
  at: string;
  by: string;
  titre: string;
  html: string;
  orientation?: 'portrait' | 'paysage';
}

export interface PvSettings {
  /** Liste numérotée (1. / a. / ■, comme les ordres du jour du club) ou tableaux. */
  presentation: 'liste' | 'tableaux';
  /** Liste : ordre du jour complet, sections + sous-sections, ou sections seulement. */
  detail: 'complet' | 'sousSections' | 'sections';
  titre: string;
  club: string;
  afficherClub: boolean;
  parts: {
    ordreDuJour: boolean;
    presences: boolean;
    retards: boolean;
    avantProchaine: boolean;
    avantSuivante: boolean;
    bilan: boolean;
    sondages: boolean;
    notes: boolean;
  };
  groupBy: 'section' | 'responsable' | 'aucun';
  tri: 'delai' | 'statut' | 'titre';
  /** false : tout sous chaque section (retards, séance, suivante, terminées ensemble). */
  separerParEcheance: boolean;
  /** Afficher aussi les sections sans tâche (« Rien à signaler »), comme l'ordre du jour. */
  sectionsVides: boolean;
  colonnes: { sousSection: boolean; echeance: boolean; statut: boolean; remarque: boolean; checklist: boolean; documents: boolean; suivi: boolean };
  statutsExclus: string[];
  sectionsExclues: string[];
  orientation: 'portrait' | 'paysage';
  taille: 'petite' | 'normale' | 'grande';
}

export interface ClubEvent {
  id: string;
  nom: string;
  date: string;
  lieu: string;
  description: string;
}

export interface LogEntry {
  id: string;
  at: string;
  userId: string;
  action: string;
}

export interface NotifPrefs {
  assign: boolean;
  modif: boolean;
  echeance: boolean;
  echeanceJours: number;
  retard: boolean;
  seance: boolean;
  seanceJours: number;
  sondage: boolean;
  /** Un email programmé arrive à son heure d'envoi. */
  email: boolean;
  /** Notifications de l'appareil (système), en plus de la cloche. */
  systeme: boolean;
}

export interface Prefs {
  theme: 'clair' | 'sombre' | 'auto';
  vueDefaut: 'mes' | 'toutes';
  affichage: 'tableau' | 'kanban';
  pv?: Partial<PvSettings>;
  notif?: Partial<NotifPrefs>;
}

/** Notification d'activité enregistrée (les rappels d'échéance sont calculés à la volée). */
export interface ActivityNotif {
  id: string;
  userId: string;
  type: 'assign' | 'modif' | 'recur';
  taskId: string;
  by: string;
  /** Auteur hors de l'entité (membre du comité central) : son nom, à afficher tel quel. */
  byName?: string;
  at: string;
  detail?: string;
}

export interface AppData {
  people: Person[];
  statuses: Status[];
  sections: Section[];
  tasks: Task[];
  meetings: Meeting[];
  events: ClubEvent[];
  roles: Role[];
  log: LogEntry[];
  prefs: Record<string, Prefs>;
  /** Version du format des données (migrations au chargement). */
  schema?: number;
  notifications?: ActivityNotif[];
  polls?: Poll[];
  emails?: ScheduledEmail[];
  /** Clés des notifications déjà vues, par utilisateur. */
  notifLues?: Record<string, string[]>;
  /** En-têtes des documents imprimés (sans réglage : logo et nom de l'entité ; PV : celui de l'ordre du jour). */
  entetes?: { odj?: Entete; pv?: Entete };
  /** Sceau « OK pour paiement » des tickets à rembourser. */
  timbre?: Timbre;
}

/** En-tête d'un document imprimé (ordre du jour, PV), commun à toute l'entité. */
export interface Entete {
  /** Image : logo de l'entité (ou du club), image propre (ex. papier à lettres du club), ou aucune. */
  image: 'logo' | 'perso' | 'aucune';
  /** Image propre (data URL réduite). */
  imagePerso?: string;
  /** Hauteur de l'image ; « pleine » : toute la largeur de la page (bannière), le texte dessous. */
  taille: 'petite' | 'moyenne' | 'grande' | 'pleine';
  /** Une ligne par ligne, la première en gras : nom du club, adresse, site… */
  texte: string;
  /** Image à gauche et texte à côté, image à gauche et texte à droite, image au-dessus du texte centré, ou image à droite. */
  disposition: 'gauche' | 'opposes' | 'centre' | 'droite';
  couleur: string;
  /** Trait sous l'en-tête. */
  trait: boolean;
}

/**
 * Entités du club. Chacune a ses propres responsables, rôles, sections, statuts et tâches,
 * invisibles des autres : comité central, sous-comités (organisation d'un événement),
 * groupes (école de cyclisme, compétition…) et équipes d'événement (sans comité).
 */
export type UnitType = 'central' | 'sous-comite' | 'groupe' | 'equipe';

export interface Unit {
  id: string;
  nom: string;
  type: UnitType;
  /** Comité central dont dépend l'entité (absent pour le comité central). */
  parentId?: string;
  couleur: string;
  description?: string;
  /** Date de l'événement (sous-comité, équipe d'événement). */
  date?: string;
  /** Événement passé, entité plus utilisée : masquée des menus. */
  archive?: boolean;
  /** Ce que le comité central peut faire des données de l'entité (réglage de ses admins ; absent = rien). */
  central?: CentralAccess;
  /** Logo (image réduite, data URL) : en-tête de l'appli, documents, icône. Sans logo, celui du club. */
  logo?: string;
}

/** Accès du comité central aux données d'une entité : rien voir, consulter, ou aussi ajouter et modifier des tâches. */
export type CentralAccess = 'aucun' | 'lecture' | 'ecriture';

/** Membre du comité central qui ouvre une entité sans en faire partie (selon le réglage de l'entité). */
export interface Guest {
  /** Sa fiche au comité central (identifiant préfixé, absente des membres de l'entité). */
  person: Person;
  niveau: Exclude<CentralAccess, 'aucun'>;
}

/** Membre d'une entité, tel qu'affiché dans l'organigramme. */
export interface OrgMember {
  /** Fiche de la personne dans l'entité. */
  id: string;
  prenom: string;
  nom: string;
  poste: string;
  autresPostes?: string;
  email: string;
  telephone?: string;
  couleur: string;
  roles: string[];
  admin: boolean;
}

export interface OrgUnit extends Unit {
  membres: OrgMember[];
  /** L'utilisateur connecté en fait partie. */
  moi: boolean;
  /** L'utilisateur connecté en est admin (président / responsable). */
  moiAdmin: boolean;
  /** Comité central : sections (choix de la section d'une demande). */
  sections?: { id: string; nom: string }[];
}

/** Demande envoyée au comité central, telle que la voit l'entité qui l'a envoyée. */
export interface MyRequest {
  id: string;
  titre: string;
  delai: string;
  le: string;
  par: string;
  statut: string;
  couleur: string;
  termine: boolean;
  supprimee: boolean;
  responsables: string[];
}

/** Ticket à rembourser (le paiement se fait hors de l'appli : la caisse fait le virement). */
export interface Paiement {
  montant: number;
  /** Personne à rembourser (nom). */
  beneficiaire: string;
  /** Compte pour le virement, si la caisse ne le connaît pas. */
  iban?: string;
  /** Circuit : reçu par la caisse → visa demandé → visé (virement à faire) → payé ; ou refusé. */
  etat: 'recu' | 'visa' | 'valide' | 'paye' | 'refuse';
  demandePar: string;
  demandeLe: string;
  /** Visa demandé par la caisse (`par`) à la personne `a` (jamais le demandeur). */
  visa?: { a: string; par: string; le: string; message?: string };
  /** Visa donné : signature et sceau posé sur le justificatif (`docVise` : copie du ticket avec le sceau). */
  validation?: { par: string; le: string; signature: string; sceau?: SceauPose; docVise?: string };
  refus?: { par: string; le: string; motif: string };
  paye?: { par: string; le: string; remarque?: string };
}

/** Modèle du sceau de paiement (réglable par la caisse). */
export interface Timbre {
  /** Ligne du haut, ex. « G.S. Ajoie – Caisse ». */
  entete: string;
  /** Texte principal, ex. « OK pour paiement ». */
  texte: string;
  couleur: string;
}

/** Sceau posé sur un justificatif : texte, position et largeur (en fraction de l'image). */
export interface SceauPose {
  entete: string;
  texte: string;
  couleur: string;
  docId?: string;
  x: number;
  y: number;
  largeur: number;
}
