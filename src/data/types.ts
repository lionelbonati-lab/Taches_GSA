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
  | 'paiements.payer'
  | 'club.membres';

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
  /** Fiche du registre « Membres du club » : coordonnées communes à toutes les entités. */
  membreId?: string;
  /**
   * Fiche liée : la personne fait partie de l'entité parce qu'elle est membre de cette autre entité (lien « Membres de »).
   * Tenue à jour automatiquement : elle quitte l'entité en quittant l'autre.
   */
  viaEntite?: string;
  /** Fiche liée : sa fiche dans l'autre entité. */
  viaFiche?: string;
  /** Fiche liée retirée de l'entité à la main : elle n'y revient pas avec le lien. */
  exclu?: boolean;
  /** Organigramme : arrivée dans l'entité par un poste lié (démo) ; quand elle perd sa place, elle quitte l'entité. */
  parLien?: boolean;
}

/** Une autre entité dont tous les membres font partie de l'entité (organigramme : « Membres de « … » »). */
export interface LienEntite {
  uniteId: string;
  /** Rôle donné à ses membres quand ils arrivent (jamais Admin). */
  role?: string;
}

/**
 * Membre du club (registre commun à toutes les entités, onglet « Membres du club ») : une seule fiche par personne,
 * avec ou sans accès à l'appli. Les fiches des entités (Person) y sont liées par membreId.
 */
export interface ClubMembre {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  /**
   * IBAN : enregistré seulement par la personne elle-même (Réglages, ou en demandant un remboursement) ; la liste ne le
   * donne qu'aux caissiers et à elle (serveur : migration 034). Absent : pas lu.
   */
  iban?: string;
  couleur: string;
  /** Groupes de l'organigramme (identifiants des entités de type « groupe »). */
  groupes: string[];
  /** Données personnelles (email, téléphone, IBAN) masquées dans la liste des membres : son choix, dans ses réglages. */
  prive?: boolean;
  /** Liste : données masquées par la personne (vides ici). */
  masque?: boolean;
  /** Liste : la personne connectée. */
  moi?: boolean;
}

/** Ma fiche du registre « Membres du club » (Réglages) : mon IBAN et ma confidentialité. */
export interface MonRegistre {
  id: string;
  prenom: string;
  nom: string;
  iban: string;
  prive: boolean;
}

/** Fiches et rôles d'une entité, pour gérer les accès depuis la page « Membres du club ». */
export interface FichesEntite {
  roles: Role[];
  people: Person[];
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

/** `seance` : à chaque séance de l'entité (l'occurrence suivante est liée à la séance suivante). */
export type Recurrence = 'hebdomadaire' | 'mensuelle' | 'trimestrielle' | 'semestrielle' | 'annuelle' | 'seance';

/**
 * Délai calculé à partir de la date de l'événement (eventId, sinon evenementEntite) ou de la séance (meetingId, sinon
 * seanceComite) liés.
 */
export interface DelaiRef {
  type: 'event' | 'meeting';
  /** Nombre de jours avant la date de référence (négatif = après). En mois : 30 jours par mois, valeur approchée. */
  joursAvant: number;
  /** Unité choisie (absente dans les tâches d'avant le réglage libre : des jours). */
  unite?: DelaiUnite;
  /** Délai en mois du calendrier (négatif = après) : 1 mois avant le 15.11 → le 15.10. */
  moisAvant?: number;
  /** Événement qui se répète : le premier jour de l'occurrence que suit le délai. */
  occurrence?: string;
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
  /** Ajouté depuis une autre entité (tâche partagée, 041) : « Prénom Nom (Entité) » (`par` est alors vide). */
  parNom?: string;
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
  /** Heure limite (« 18:00 », heure locale) ; absente = fin de la journée de la date limite. */
  heureLimite?: string;
  /** false : date limite indicative, le sondage reste ouvert jusqu'à « Clôturer » ; sinon il se clôture tout seul à la date limite. */
  clotureAuto?: boolean;
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
  /**
   * Autres entités du club dont tous les membres votent aussi (en plus des votants choisis ici). Leurs réponses sont
   * rangées sous la clé `entité:fiche` (voir data/polls.ts, electorat).
   */
  entites?: string[];
  /** Affichage seulement (jamais enregistré) : clés de vote de tous les votants, ceux des autres entités compris. */
  electeurs?: string[];
  /** Affichage seulement : clé de vote de la personne connectée, si elle vote. */
  cleMoi?: string;
  /** Affichage seulement : sondage d'une autre entité, ouvert à l'entité ouverte. */
  source?: { uniteId: string; unite: string; id: string };
}

/** Sondage d'une autre entité ouvert à l'entité ouverte, tel que le lit le serveur (gsa_sondages_partages). */
export interface SondagePartage {
  uniteId: string;
  unite: string;
  poll: Poll;
}

/** Quand partir : date et heure fixes, ou N jours avant (négatif = après) le délai de la tâche. */
export type EmailWhen = { type: 'date'; date: string; heure: string } | { type: 'delai'; jours: number; heure: string };

/** Email programmé au sujet d'une tâche. */
export interface ScheduledEmail {
  id: string;
  taskId: string;
  /** Personnes destinataires (leur adresse vient de leur fiche dans l'entité). */
  destinataires: string[];
  /** Entités du club entières : toutes leurs personnes, lues au moment d'envoyer. */
  unites?: string[];
  /** Personnes d'autres entités du club, par entité (leur fiche là-bas). */
  externes?: Record<string, string[]>;
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
  /**
   * Entités du club avec qui la tâche est partagée : elle reste dans son entité, et chacune la voit dans ses tâches
   * (et son ordre du jour) et la modifie comme les siennes.
   */
  partage?: string[];
  /** Ancienne case « Transmettre au comité central » : partagée avec le comité central. */
  auCentral?: boolean;
  /**
   * Responsables d'autres entités, par entité (leur fiche chez elle) : choisis par une entité du partage, ou confiés
   * d'ici à une personne seulement (sans partager la tâche avec son entité : elle seule la voit et la modifie, depuis
   * n'importe laquelle de ses entités ; serveur : 054).
   */
  respPartage?: Record<string, string[]>;
  /** Responsables qui ne sont dans aucune entité du club : leur nom (et leur fiche du registre « Membres du club »). */
  respHors?: PersonneHors[];
  /** Pour info : personnes et entités qui voient la tâche sans s'en occuper. */
  pourInfo?: PourInfo;
  /**
   * « ✓ Vu » des personnes mentionnées pour info, par clé de « Pour info » (« p:fiche », « a:entité:fiche ») ; pour une
   * entité mentionnée en entier, chacune de ses personnes qui la reçoit (« u:entité:fiche »). Écrit par le serveur
   * seulement (gsa_pour_info_vu, 046) ; l'appli ne fait que le lire.
   */
  pourInfoVus?: Record<string, VuPourInfo>;
  /**
   * Dernière modification du contenu de la tâche (pas de « Pour info », ni discussion, ni « Vu ») : ceux qui l'avaient
   * marquée « ✓ Vu » avant voient qu'elle a changé. Posée par l'appli à l'enregistrement ; le serveur la garde honnête et la
   * pose lui-même pour les modifications faites depuis une entité du partage (052).
   */
  contenuLe?: string;
  /**
   * Discussion sur la tâche (du plus ancien au plus récent). Écrite par le serveur seulement (gsa_commenter, 049) ;
   * démo : par l'appli.
   */
  commentaires?: Commentaire[];
  /** À prendre : tâche proposée à quelques personnes ; l'une d'elles s'en charge elle-même (« 🙋 Je m'en charge »). */
  aPrendre?: APrendre;
  /** Section choisie par les entités du partage (par entité ; sinon rangée automatiquement). */
  placePartage?: Record<string, { sectionId: string; sousSection: string }>;
  /** Dernière modification faite depuis une entité du partage : « Nom (entité) ». */
  modifiePar?: string;
  /**
   * Affichage seulement (jamais enregistré) : tâche d'une autre entité, partagée avec l'entité ouverte. `complet` : ses
   * documents, sa répétition, sa séance (ici) et son partage se modifient d'ici (serveur à jour : 041) ; `seanceAilleurs` :
   * la séance à laquelle elle est liée hors de l'entité ouverte (pas modifiable d'ici). `chezMoi` : tâche de l'une de mes
   * autres entités (vue « moi », vueMoi.ts), qui s'ouvre et s'enregistre dans la sienne.
   */
  source?: { uniteId: string; unite: string; id: string; responsables: string[]; complet?: boolean; seanceAilleurs?: string; chezMoi?: boolean };
  /** Tâche ajoutée par un membre du comité central (ancien accès « modifier / ajouter ») : son nom. */
  parCentral?: string;
  /** Tâche de paiement : ticket à rembourser, validé (signé) puis payé par la caisse. */
  paiement?: Paiement;
  /**
   * Copie d'une ancienne tâche d'une entité qui dépend maintenant de celle-ci, indépendante de l'original : le comité dont
   * l'entité dépendait alors, l'entité, la date de la copie (AAAA-MM-JJ) ; l'original (repère « déjà copiée »).
   */
  copieDe?: { comite: string; entite: string; le: string; uniteId?: string; tache?: string };
  /** Ancienne tâche ou tâche « pour info » lue du serveur : nombre de fichiers joints (non transmis). Affichage seulement. */
  pieces?: number;
  /**
   * Séance du comité dont l'entité dépend, à laquelle la tâche est liée : la tâche est partagée avec ce comité et figure à
   * l'ordre du jour et au PV de cette séance. Titre et date : ceux du moment du choix (affichage).
   */
  seanceComite?: SeanceComite;
  /**
   * Événement d'une entité qui dépend du comité (sa prochaine édition, ou l'un de ses événements) auquel la tâche est
   * liée. Nom et date : copiés au choix, puis mis à jour quand l'événement change (le délai lié suit).
   */
  evenementEntite?: EvenementEntite;
  /**
   * Tâche attribuée par le comité dont l'entité dépend (choisie dans sa sous-section) : enregistrée ici, partagée avec
   * lui. Le comité, la personne, la date (AAAA-MM-JJ).
   */
  attribueePar?: { uniteId: string; unite: string; par: string; le: string };
}

/** Événement d'une entité qui dépend du comité ; sans `id` : la prochaine édition de l'entité (sa date dans l'organigramme). */
export interface EvenementEntite {
  uniteId: string;
  id?: string;
  nom: string;
  /** '' : date de l'édition pas encore fixée. */
  date: string;
  dateFin?: string;
}

/** Séance d'un autre comité (celui dont l'entité dépend), liée à une tâche. */
export interface SeanceComite {
  uniteId: string;
  id: string;
  titre: string;
  date: string;
}

/** Séances du comité dont dépend l'entité ouverte (gsa_seances_comite, 032) ; `comite` : '' pour le comité central. */
export interface SeancesDuComite {
  comite: string;
  seances: { id: string; titre: string; date: string; heure?: string }[];
}

/** Sections des entités qui dépendent de l'entité ouverte, par entité (gsa_sections_dependantes, 033) : nom seulement. */
export type SectionsDependantes = Record<string, { id: string; nom: string }[]>;

/** Origine d'une tâche proposée au comité central. */
export interface Proposal {
  uniteId: string;
  unite: string;
  par: string;
  le: string;
}

/** Tâche d'une autre entité partagée avec l'entité ouverte, telle que la lit le serveur (gsa_taches_partagees). */
/**
 * « Pour info » d'une tâche : vue (accueil, « Mes tâches », 🔔) sans en être responsable, en lecture seule ailleurs que
 * dans l'entité de la tâche.
 */
export interface PourInfo {
  /** Fiches de l'entité de la tâche. */
  personnes?: string[];
  /** Entités du club : leurs admins et les rôles « Voir toutes les tâches ». */
  unites?: string[];
  /** Personnes d'autres entités : leur fiche dans leur entité, par entité. */
  autres?: Record<string, string[]>;
}

/** Responsable d'une tâche qui n'est dans aucune entité du club (sans accès à l'appli). */
export interface PersonneHors {
  id: string;
  prenom: string;
  nom: string;
  email?: string;
  /** Sa fiche du registre « Membres du club ». */
  membreId?: string;
}

/** « ✓ Vu » d'une tâche pour info : quand. */
export interface VuPourInfo {
  le: string;
  /** Revue après une modification de la tâche (contenuLe plus récent que le « Vu » précédent) : la dernière fois (052). */
  revu?: string;
}

/** Commentaire de la discussion d'une tâche. */
export interface Commentaire {
  id: string;
  /** Fiche de l'auteur, dans son entité (`u`, sinon celle de la tâche). */
  par: string;
  /** Entité de l'auteur, quand ce n'est pas celle de la tâche (tâche partagée ou reçue pour info). */
  u?: string;
  /** Nom de l'auteur au moment du commentaire. */
  nom: string;
  le: string;
  texte: string;
  /** Corrigé par son auteur. */
  modifieLe?: string;
}

/**
 * À prendre : la tâche est proposée à des personnes de son entité ; la première qui clique « 🙋 Je m'en charge » en devient
 * responsable. Une place est prise tant que la personne proposée est responsable (retirée : la place se libère).
 */
export interface APrendre {
  /** Fiches de l'entité à qui la tâche est proposée. */
  personnes: string[];
  /** Personnes qu'il faut (1 si absent). */
  nombre?: number;
  /** Personnes proposées qui ont répondu « Pas dispo ». */
  refus?: string[];
  /** Qui l'a proposée (prévenu des réponses ; sinon l'auteur de la tâche). */
  par?: string;
  /**
   * Tâche partagée : proposée aussi à des personnes des entités du partage (leurs fiches), par entité (serveur : 040).
   * Vue d'une tâche partagée par une autre entité : celles de l'entité de la tâche et des autres entités (ici :
   * personnes, refus et par sont celles de l'entité ouverte).
   */
  partage?: Record<string, PropositionAilleurs>;
}

/** Personnes d'une autre entité à qui une tâche à prendre est proposée. */
export interface PropositionAilleurs {
  personnes: string[];
  refus?: string[];
  par?: string;
}

export interface TachePartagee {
  uniteId: string;
  unite: string;
  type: UnitType;
  task: Task;
  /** Statuts de l'entité de la tâche (correspondance avec ceux de l'entité ouverte). */
  statuts: { id: string; label: string; done: boolean }[];
  /** Version du serveur (41 : documents, répétition, séance et partage modifiables d'ici). */
  v?: number;
  /**
   * Ancienne tâche (gsa_anciennes_taches, 030) : d'avant que l'entité dépende de l'entité ouverte. Elle se consulte et se
   * copie, sans modification ; `comite` : le comité dont l'entité dépendait alors, `jusqua` : date du changement.
   */
  ancienne?: { comite: string; jusqua: string };
}

/** Point sur une carte (degrés). */
export interface PointGeo {
  lat: number;
  lng: number;
}

/** Lien du lieu dans l'email de l'ordre du jour : itinéraire (application de navigation), carte, ou aucun. */
export type LienLieu = 'google' | 'waze' | 'apple' | 'carte' | 'aucun';

export interface Meeting {
  id: string;
  titre: string;
  date: string;
  /** Heure de début (ex. 19:30). */
  heure?: string;
  lieu: string;
  /** Lieu placé sur la carte (épingle) : lien « voir sur la carte » dans les documents, itinéraire dans l'email. */
  lieuGeo?: PointGeo;
  /** Anciens champs de la séance (points particuliers à l'ordre du jour, notes) : plus saisis ni affichés. */
  ordreDuJour?: string;
  notes?: string;
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
  /** Fichiers liés (identifiants des documents) retirés des annexes de l'ordre du jour de la séance ; les autres y sont. */
  odjAnnexesExclues?: string[];
  /** Mise en page choisie pour certains fichiers joints à l'ordre du jour (identifiant → photos ou pages par page). */
  odjAnnexesFormats?: Record<string, 1 | 2 | 4>;
  /** Pages à imprimer de certains PDF joints à l'ordre du jour (identifiant → « 1-3, 5 ») ; les autres en entier. */
  odjAnnexesPages?: Record<string, string>;
  /** Séance ponctuelle : ne revient pas l'année suivante (par défaut, une séance revient chaque année le même mois). */
  unique?: boolean;
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
  /** Options du document ; non réglées : celles du PV de la séance précédente, sinon par défaut. */
  options?: PvOptions;
  /**
   * Fichiers liés (identifiants des documents) retirés des annexes du PV ; les autres y sont. Absent : ceux retirés de
   * l'ordre du jour de la séance (fixé à la validation).
   */
  annexesExclues?: string[];
  /** Mise en page choisie pour certains fichiers joints au PV ; absent : celle de l'ordre du jour (fixée à la validation). */
  annexesFormats?: Record<string, 1 | 2 | 4>;
  /** Pages à imprimer de certains PDF joints au PV ; absent : celles de l'ordre du jour (fixées à la validation). */
  annexesPages?: Record<string, string>;
  /** Changements de tâches faits depuis l'onglet PV (seuls ceux-ci figurent dans le PV). */
  journal?: MinutesChange[];
  /** Tâches créées pendant la séance (« nouvelle tâche décidée »). */
  nouvelles?: string[];
  /** Intitulés des tâches supprimées depuis l'onglet PV. */
  supprimees?: string[];
  /**
   * Tâches modifiées, créées (avant : null) ou supprimées (après : null) depuis l'onglet PV : état avant la première
   * modification et après la dernière, pour « Remettre le PV à zéro ». Retiré à la validation.
   */
  tachesAvant?: Record<string, { avant: Task | null; apres: Task | null }>;
  valideLe?: string;
  validePar?: string;
  /** Numéro de la dernière version validée (1, 2…). */
  version?: number;
  /** PV validé rouvert pour correction (la validation créera la version suivante). */
  enCorrection?: boolean;
  /** Copie de la dernière version validée, pour pouvoir annuler une correction. */
  derniereValidee?: Omit<MeetingMinutes, 'derniereValidee'>;
}

/** Options du PV d'une séance. */
export interface PvOptions {
  /** Responsables, délai et échéance de chaque point (défaut : oui). */
  details?: boolean;
  /** Mises à jour des tâches faites pendant la séance, ↻ (défaut : oui). */
  misesAJour?: boolean;
  /** Documents (fichiers et liens) de chaque point, nommés ; un clic les ouvre (défaut : oui). */
  documents?: boolean;
  /**
   * Fichiers liés aux points du PV joints en fin de PV (défaut : non) : liste des annexes, puis les photos et les pages
   * des PDF reproduites (1, 2 ou 4 par page) ; les liens et les autres fichiers sont nommés.
   */
  annexes?: boolean;
  /** Photos par page imprimée (défaut : 1). */
  annexesParPage?: 1 | 2 | 4;
  /** Pages de PDF par page imprimée (défaut : 1, lisibles). */
  annexesPdfParPage?: 1 | 2 | 4;
  taille?: 'petite' | 'normale' | 'grande';
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

/** Réglages de l'ordre du jour (liste numérotée par section, titre : le nom du comité). */
export interface PvSettings {
  /** Ordre du jour complet, sections + sous-sections, ou sections seulement. */
  detail: 'complet' | 'sousSections' | 'sections';
  club: string;
  afficherClub: boolean;
  parts: {
    presences: boolean;
    retards: boolean;
    avantProchaine: boolean;
    avantSuivante: boolean;
    bilan: boolean;
    sondages: boolean;
    notes: boolean;
    /** Tâches partagées par d'autres entités. */
    partagees: boolean;
  };
  tri: 'delai' | 'statut' | 'titre';
  /** Afficher aussi les sections sans tâche (« Rien à signaler »), comme l'ordre du jour. */
  sectionsVides: boolean;
  colonnes: { sousSection: boolean; echeance: boolean; statut: boolean; remarque: boolean; checklist: boolean; documents: boolean; pourInfo?: boolean };
  statutsExclus: string[];
  sectionsExclues: string[];
  orientation: 'portrait' | 'paysage';
  taille: 'petite' | 'normale' | 'grande';
  /** Fichiers liés aux tâches joints en fin d'ordre du jour (liste, puis photos et pages des PDF). */
  annexes: boolean;
  /** Photos par page imprimée. */
  annexesParPage: 1 | 2 | 4;
  /** Pages de PDF par page imprimée (défaut : 1, lisibles). */
  annexesPdfParPage: 1 | 2 | 4;
}

/** Événement d'une entité, partagé avec tout le club pour l'agenda (sans sa description). */
export interface AgendaClubEvent {
  uniteId: string;
  id: string;
  nom: string;
  date: string;
  dateFin?: string;
  /** Heures et répétition : avec la migration 042. */
  heure?: string;
  heureFin?: string;
  lieu: string;
  repetition?: RepetitionEvenement;
  sauf?: string[];
}

export interface ClubEvent {
  id: string;
  nom: string;
  /** Premier jour ; pour un événement qui se répète, celui de la première occurrence. */
  date: string;
  /** Dernier jour, pour un événement sur plusieurs jours. */
  dateFin?: string;
  /** Heure de début (ex. 12:30) ; sans heure : toute la journée. */
  heure?: string;
  /** Heure de fin (le dernier jour). */
  heureFin?: string;
  lieu: string;
  description: string;
  /** Événement qui se répète (voir repetition.ts). */
  repetition?: RepetitionEvenement;
  /** Occurrences retirées de la série (leur premier jour) : supprimées seules, ou modifiées à part (événement `serie`). */
  sauf?: string[];
  /** Occurrence d'une série modifiée seule : la série et le jour de l'occurrence d'origine. */
  serie?: { id: string; date: string };
  /** Nouvelle édition d'un événement passé, avec ses tâches reprises (« Reprendre », reprise.ts) : celui-ci. */
  repriseDe?: string;
}

/** Répétition d'un événement, comme dans un agenda : tous les N jours, semaines, mois ou ans. */
export interface RepetitionEvenement {
  freq: 'jour' | 'semaine' | 'mois' | 'an';
  /** Tous les N jours / semaines / mois / ans (1 sans valeur). */
  intervalle?: number;
  /** Chaque semaine : les jours, 1 = lundi … 7 = dimanche (sans valeur : le jour de la première occurrence). */
  jours?: number[];
  /** Chaque mois : le même jour de la semaine (« le 3e jeudi », « le dernier jeudi ») au lieu de la même date (« le 15 »). */
  mensuel?: 'rang' | 'dernier';
  /** Se termine le (dernier jour possible, inclus). */
  jusquau?: string;
  /** Se termine après N occurrences. */
  nombre?: number;
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
  /** Résumé de la semaine, le lundi : tâches à faire d'ici dimanche, séances, événements, sondages. */
  semaine: boolean;
  /** Notifications de l'appareil (système), en plus de la cloche. */
  systeme: boolean;
}

export interface Prefs {
  theme: 'clair' | 'sombre' | 'auto';
  vueDefaut: 'mes' | 'toutes';
  affichage: 'tableau' | 'kanban';
  /** Tâches : masquer les terminées pas encore archivées (vue Tableau ; défaut : non). */
  masquerTerminees?: boolean;
  pv?: Partial<PvSettings>;
  /**
   * Profils de l'ordre du jour, à soi (jeux de réglages enregistrés sous un nom). Pas encore de liste à soi : les
   * anciens profils communs de l'entité (ReglagesOdj.profils), qui deviennent les siens dès qu'on en change un.
   */
  profilsOdj?: ProfilOdj[];
  /** « Envoyer par email » : profil du texte du mail et profil du PDF joint (`aucun` : sans PDF), parmi ses profils. */
  envoiOdj?: { texte?: string; pdf?: string };
  notif?: Partial<NotifPrefs>;
  /** Agenda : entités du club dont les dates (édition, événements) ne sont pas affichées. */
  manifsMasquees?: string[];
  /** Phrase d'explication en haut des pages (false : masquée). */
  explications?: boolean;
  /** Accueil : blocs masqués, sur téléphone et sur ordinateur (tout est affiché par défaut). */
  accueilMasque?: { telephone?: string[]; ordinateur?: string[] };
  /** Accueil : ordre des blocs (le même sur téléphone et sur ordinateur). */
  accueilOrdre?: string[];
  /** Accueil : compteurs masqués (statuts, « retard »), sur téléphone et sur ordinateur. */
  compteursMasque?: { telephone?: string[]; ordinateur?: string[] };
  /** Accueil : ordre des compteurs. */
  compteursOrdre?: string[];
  /** Accueil, bloc « À faire » : échéances des N prochains jours (7 par défaut). */
  aFaireJours?: number;
  /** Accueil, bloc « À faire » : toutes les tâches de l'entité, pas seulement les miennes (droit « Voir toutes les tâches »). */
  aFaireToutes?: boolean;
  /** Page « Membres du club » : colonnes (ordre, masquées) et tri, propres à chacun. */
  membresColonnes?: ColonnesMembres;
  /**
   * Accueil, bloc « Pour info » : tâches marquées « ✓ Vu », qui n'y figurent plus (tâche d'ici : son identifiant ;
   * d'une autre entité : « entité:tâche ») → date.
   */
  pourInfoVus?: Record<string, string>;
  /** Téléphone : rubriques de la barre du bas, dans l'ordre (5 au plus ; sans réglage : celles d'origine). */
  barreBas?: string[];
}

/** Colonnes de la page « Membres du club » : ordre, colonnes masquées, tri. */
export interface ColonnesMembres {
  ordre: string[];
  masquees: string[];
  tri?: { col: string; desc?: boolean };
}

/** Notification d'activité enregistrée (les rappels d'échéance sont calculés à la volée). */
export interface ActivityNotif {
  id: string;
  userId: string;
  /**
   * info : mentionné « pour info » ; propose : tâche à prendre proposée ; pris : quelqu'un s'en charge, refus : quelqu'un
   * n'est pas dispo (à l'auteur de la tâche) ; comment : nouveau commentaire sur la tâche (049, écrit par le serveur ;
   * tâche d'une autre entité : taskId « x:<entité>:<tâche> ») ; mention : « @Prénom Nom » dans un commentaire (mentions.ts,
   * écrit par l'appli de l'auteur ; detail : l'aperçu du message, comme le 💬 qu'il remplace) ; relance : rappel d'une tâche
   * « Pour info » pas encore vue (052 ; tâche d'une autre entité : taskId « x:<entité>:<tâche> ») ; toutVu : à l'auteur, tout
   * le monde l'a marquée « ✓ Vu » (052).
   */
  type: 'assign' | 'modif' | 'recur' | 'info' | 'propose' | 'pris' | 'refus' | 'comment' | 'mention' | 'relance' | 'toutVu';
  taskId: string;
  by: string;
  /** Auteur hors de l'entité (membre du comité central) : son nom, à afficher tel quel. */
  byName?: string;
  at: string;
  detail?: string;
  /** Titre de la tâche au moment de la notification (commentaire : la tâche peut être d'une autre entité). */
  titre?: string;
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
  /** Discussions lues, par utilisateur : tâche (son identifiant ici) → date du dernier message vu. */
  discussionsLues?: Record<string, Record<string, string>>;
  /** En-tête de tous les documents imprimés de l'entité (ordre du jour, PV, bon de paiement) ; sans réglage : logo et nom de l'entité. */
  entete?: Entete;
  /** Ancien réglage, un en-tête par document : repris tant que « entete » n'est pas réglé (archives : leurs images). */
  entetes?: { odj?: Entete; pv?: Entete; bon?: Entete };
  /** Sceau « OK pour paiement » des tickets à rembourser. */
  timbre?: Timbre;
  /** Réglages communs de l'ordre du jour et du PV de l'entité. */
  reglagesOdj?: ReglagesOdj;
  /** Entités dont tous les membres font aussi partie de celle-ci (fiches liées tenues à jour). */
  membresDe?: LienEntite[];
  /** Comité central : propositions d'amélioration de l'appli reçues des membres du club. */
  propositions?: Proposition[];
  /** Organigramme à glisser-déposer (démo) : postes de la zone « Responsables » de la fiche ; absent : à déduire des fonctions. */
  postes?: Poste[];
}

/**
 * Poste de la fiche d'une entité dans l'organigramme (zone « Responsables ») : il existe même vacant (affiché en rouge).
 * Son titulaire a son nom parmi ses fonctions (poste, autres postes).
 */
export interface Poste {
  id: string;
  nom: string;
  /** Fiche de la personne qui l'occupe ; absent : à pourvoir. */
  titulaire?: string;
  /** Poste lié au ★ d'une autre entité (son identifiant) : son titulaire en est le ★, changer l'un change l'autre. */
  lien?: string;
}

/** Réglages communs de l'ordre du jour et du PV. */
export interface ReglagesOdj {
  /**
   * Tâches dont l'échéance tombe peu après la séance suivante (jusqu'à N jours), reprises dès la séance préparée :
   * la séance suivante serait trop tard pour en parler (défaut : 0).
   */
  joursApres?: number;
  /** Mise en forme des documents (police, interligne, marges, et de chaque élément). */
  style?: StyleDocs;
  /**
   * Page web où déposer le PV validé (dossier partagé du club, formulaire d'envoi…), http(s) seulement :
   * « Valider et archiver » l'ouvre dans une nouvelle fenêtre et crée le PDF du PV, à y déposer.
   */
  depotPv?: string;
  /**
   * Anciens profils de l'ordre du jour, communs à l'entité : les profils sont maintenant à chacun (Prefs.profilsOdj) ;
   * ceux-ci restent le point de départ de qui n'a pas encore les siens.
   */
  profils?: ProfilOdj[];
  /**
   * « Envoyer par email » : `lieu`, lien du lieu dans le mail (défaut : itinéraire Google Maps), commun à l'entité.
   * `texte` et `pdf` : anciens choix communs de profils (maintenant Prefs.envoiOdj), repris par qui n'a pas encore les siens.
   */
  envoi?: { texte?: string; pdf?: string; lieu?: LienLieu };
}

/** Profil de l'ordre du jour (« Comité ordinaire », « Assemblée générale »…), réappliqué en un clic. */
export interface ProfilOdj {
  id: string;
  nom: string;
  /** Contenu et mise en page (réglages de chacun, appliqués à qui choisit le profil). */
  reglages: PvSettings;
  /** Réglage commun « et jusqu'à N jours après » la séance suivante. */
  joursApres?: number;
  /** Mise en forme commune (police, couleurs…), si le profil la garde ; {} : celle par défaut. */
  style?: StyleDocs;
  /** Dernier enregistrement. */
  par?: string;
  le?: string;
}

/** Éléments de l'ordre du jour et du PV dont la mise en forme se règle. */
export type ElementDoc = 'titre' | 'date' | 'infos' | 'partie' | 'section' | 'niveau2' | 'niveau3' | 'niveau4' | 'meta' | 'remarque' | 'note' | 'prochaine' | 'pied';

/** Mise en forme d'un élément des documents ; ce qui n'est pas réglé garde la mise en forme par défaut. */
export interface StyleElement {
  /** Taille, en % de sa taille par défaut. */
  taille?: number;
  gras?: boolean;
  italique?: boolean;
  majuscules?: boolean;
  /** Centré (titres seulement). */
  centre?: boolean;
  /** Couleur (#rrggbb). */
  couleur?: string;
  /** Couleur de fond (#rrggbb), pour les éléments encadrés (prochaine séance). */
  fond?: string;
}

/** Mise en forme de l'ordre du jour et du PV, commune à l'entité (et gardée dans leurs archives). */
export interface StyleDocs {
  police?: 'arial' | 'calibri' | 'verdana' | 'georgia' | 'times';
  interligne?: 'serre' | 'aere';
  marges?: 'etroites' | 'larges';
  elements?: Partial<Record<ElementDoc, StyleElement>>;
}

/** En-tête des documents imprimés (ordre du jour, PV, bon de paiement), commun à toute l'entité. */
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

/** Ce que l'entité dont elle dépend affiche de ses tâches (voir Unit.tachesDependance). */
export type TachesDependance = 'toutes' | 'partagees' | 'rien';

/**
 * Période terminée de la dépendance d'une entité, notée à chaque changement du comité dont elle dépend (serveur : 030).
 * L'ancien comité garde les tâches de sa période (selon le réglage d'alors) ; le nouveau peut lire et copier les
 * anciennes tâches (`taches` de la dernière période) tant que `copie` n'est pas retiré.
 */
export interface PeriodeDependance {
  /** Comité dont l'entité dépendait. */
  comite: string;
  nom: string;
  /** Date et heure du changement (ISO). */
  jusqua: string;
  reglage: TachesDependance;
  /** Tâches de l'entité à ce moment (hors tickets). */
  taches: string[];
  /** Le comité suivant peut lire et copier ces tâches (seul champ que les admins changent). */
  copie: boolean;
}

export interface Unit {
  id: string;
  nom: string;
  type: UnitType;
  /** Comité central dont dépend l'entité (absent pour le comité central). */
  parentId?: string;
  couleur: string;
  description?: string;
  /** Date de l'événement (sous-comité, équipe d'événement) : sa prochaine édition. */
  date?: string;
  /** Dernier jour de l'édition, si elle dure plusieurs jours. */
  dateFin?: string;
  /** Événement passé, entité plus utilisée : masquée des menus. */
  archive?: boolean;
  /**
   * Ancien réglage « Accès du comité central » (plus proposé : le comité dont elle dépend voit ses tâches selon
   * tachesDependance) ; gardé tel quel sur le serveur (006).
   */
  central?: CentralAccess;
  /** Logo (image réduite, data URL) : en-tête de l'appli, documents, icône de l'onglet. Sans logo, celui du club. */
  logo?: string;
  /** Couleur de l'appli dans l'entité (#rrggbb). Sans choix : celle du comité central, sinon le bleu d'origine. */
  couleurAppli?: string;
  /** Icône choisie dans la bibliothèque (IconesEntite) ; sans choix ou clé inconnue : celle de son type. */
  icone?: string;
  /**
   * Comité dont elle dépend ; sans choix (ou une valeur inconnue, comme l'ancien « aucun ») : le comité central. Une
   * ancienne valeur vers un groupe ou un événement : le comité dont il dépend (parentDans). Les accès suivent parentId.
   */
  dependDe?: string;
  /**
   * Ses tâches dans le comité dont elle dépend (liste des tâches, ordre du jour, PV) : toutes, seulement celles
   * partagées avec lui (sans choix), ou aucune (même partagées). Un événement dont tout le comité est responsable
   * (aucun poste ne lui est lié ⛓) : toutes, quel que soit ce réglage (reglageTaches).
   */
  tachesDependance?: TachesDependance;
  /** Périodes terminées de sa dépendance, de la plus ancienne à la plus récente (tenues par le serveur). */
  historiqueDependance?: PeriodeDependance[];
  /** Place de sa carte dans l'organigramme, posée à la main (sinon sa place dans l'arbre). */
  carte?: Carte;
  /** Comité : ordre des cartes de son cadre dans l'organigramme par postes (clés des cartes ; les autres à la suite). */
  rangement?: string[];
}

/** Coin haut gauche d'une carte de l'organigramme, en pixels depuis le coin haut gauche de l'arbre. */
export interface Carte {
  x: number;
  y: number;
}

/** Ancien réglage : accès du comité central aux données d'une entité (rien voir, consulter, ou aussi modifier). */
export type CentralAccess = 'aucun' | 'lecture' | 'ecriture';

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
  /** Tient la caisse de l'entité (rôle qui donne expressément le droit « Caisse »). */
  caisse?: boolean;
  /** Fiche du registre « Membres du club ». */
  membreId?: string;
  /** Membre par le lien d'une autre entité (son identifiant). */
  viaEntite?: string;
  /** Membre par le lien : sa fiche dans l'autre entité. */
  viaFiche?: string;
}

export interface OrgUnit extends Unit {
  membres: OrgMember[];
  /** L'utilisateur connecté en fait partie. */
  moi: boolean;
  /** L'utilisateur connecté en est admin (président / responsable). */
  moiAdmin: boolean;
  /** Comité central : sections (choix de la section d'une demande). */
  sections?: { id: string; nom: string }[];
  /** Entités dont tous les membres en font partie (lien « Membres de »). */
  liens?: string[];
  /** Organigramme à glisser-déposer (démo) : postes de sa fiche, vacants compris. */
  postes?: Poste[];
}

/** Organigramme d'une année, tel qu'il était à sa dernière photo (lecture seule ; sans adresses ni logos). */
export interface OrganigrammeAnnuel {
  annee: number;
  /** Date de la dernière photo de l'année (ISO). */
  maj: string;
  units: OrgUnit[];
}

/** Ticket envoyé depuis une entité à la caisse qui reçoit les siens (comité dont elle dépend, ou caisse centrale). */
export interface TicketCentral {
  type?: 'facture';
  /** Échéance d'une facture (AAAA-MM-JJ). */
  delai?: string;
  titre: string;
  montant: number;
  beneficiaire: string;
  iban?: string;
  remarque: string;
  documents: TaskDoc[];
}

/** Visa retrouvé par son n° (« Vérifier un visa ») : ce que le document visé doit montrer. Jamais l'IBAN. */
export interface VisaVerifie {
  code: string;
  entite: string;
  titre: string;
  type: 'remboursement' | 'facture';
  montant: number;
  beneficiaire: string;
  signataire: string;
  /** Facture visée par la personne qui l'a envoyée (droit de signature). */
  direct: boolean;
  le: string;
  etat: 'valide' | 'paye';
  payeLe?: string | null;
}

/** Suivi d'un ticket envoyé à une autre caisse, tel que le voit son demandeur. */
export interface SuiviTicket {
  id: string;
  type?: 'facture' | null;
  titre: string;
  montant: number;
  beneficiaire: string;
  etat: Paiement['etat'];
  le: string;
  unite: string;
  caisse: string;
  viseLe?: string | null;
  payeLe?: string | null;
  motif?: string | null;
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

/** Proposition d'amélioration de l'appli : envoyée par un membre du club, rangée dans les données du comité central. */
export interface Proposition {
  id: string;
  genre: 'idee' | 'probleme' | 'autre';
  texte: string;
  /** Page de l'appli concernée (ex. /taches) ; aucune : l'appli en général. */
  page?: string;
  le: string;
  /** Nom de l'auteur et entité d'où il l'a envoyée (pris sur sa fiche). */
  par: string;
  unite?: string;
  /** Clé de l'auteur (son compte ; en démo, son adresse), pour qu'il en suive la réponse. */
  auteur: string;
  statut: 'nouvelle' | 'etudiee' | 'retenue' | 'faite' | 'refusee';
  reponse?: string;
  reponduLe?: string;
  reponduPar?: string;
  /** Suivi par l'auteur (version réelle) : supprimée par le comité central. */
  supprimee?: boolean;
}

/** Ce que l'auteur écrit ; le reste (nom, entité, date, statut) est ajouté à l'envoi. */
export type NouvelleProposition = Pick<Proposition, 'genre' | 'texte' | 'page'>;

/** Ticket à rembourser (le paiement se fait hors de l'appli : la caisse fait le virement). */
export interface Paiement {
  /** Remboursement d'une personne qui a avancé l'argent (par défaut), ou facture payée directement à qui l'a envoyée. */
  type?: 'remboursement' | 'facture';
  montant: number;
  /** Personne à rembourser, ou créancier de la facture (nom). */
  beneficiaire: string;
  /** Compte pour le virement, si la caisse ne le connaît pas. */
  iban?: string;
  /** Circuit : reçu par la caisse → visa demandé → visé (virement à faire) → payé ; ou refusé. */
  etat: 'recu' | 'visa' | 'valide' | 'paye' | 'refuse';
  demandePar: string;
  demandeLe: string;
  /** Ticket envoyé à cette caisse par un membre d'une autre entité (pas de fiche ici : demandePar vide). */
  externe?: { uniteId: string; unite: string; par: string; email?: string; userId?: string };
  /** Visa demandé par la caisse (`par`) à la personne `a` (jamais le demandeur). */
  visa?: { a: string; par: string; le: string; message?: string };
  /**
   * Visa donné : signature (marquée du n° de visa) et sceau posé sur le justificatif (`docVise` : copie du ticket avec
   * le sceau) ; `code` : n° de visa unique imprimé sur le sceau (043), pour vérifier un document visé.
   */
  validation?: { par: string; le: string; signature: string; sceau?: SceauPose; docVise?: string; code?: string };
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
  /** Opacité du fond blanc, en % (0 : fond transparent ; 85 par défaut). */
  fond?: number;
  /** Opacité du cadre, du texte et de la signature, en % (100 par défaut). */
  encre?: number;
}

/** Sceau posé sur un justificatif : texte, position et largeur (en fraction de l'image). */
export interface SceauPose {
  entete: string;
  texte: string;
  couleur: string;
  fond?: number;
  encre?: number;
  docId?: string;
  /** Page du PDF où le sceau est posé (justificatif en PDF). */
  page?: number;
  x: number;
  y: number;
  largeur: number;
}
