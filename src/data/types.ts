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
  /** Fiche « Personnes du club » : coordonnées communes (registre du club). */
  membreId?: string;
}

/**
 * Personne du club (registre « Personnes du club ») : une seule fiche par personne, avec ou sans accès à l'appli. Les
 * fiches de l'appli (Person, avec leurs rôles) y sont liées par membreId.
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
  /** Ancien : groupes de l'organigramme (entités), gardés tels quels ; les groupes sont maintenant des étiquettes. */
  groupes?: string[];
  /** Données personnelles (email, téléphone, IBAN) masquées dans la liste des membres : son choix, dans ses réglages. */
  prive?: boolean;
  /**
   * Accès à l'appli d'une personne sans place dans l'organigramme (PERSONNES_DU_CLUB.md) : elle y voit les tâches qui lui
   * sont confiées. Démo ; version réelle : son compte du club (gsa_club_comptes, 056).
   */
  acces?: boolean;
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

/** `seance` : à chaque séance (l'occurrence suivante est liée à la séance suivante). */
export type Recurrence = 'hebdomadaire' | 'mensuelle' | 'trimestrielle' | 'semestrielle' | 'annuelle' | 'seance';

/**
 * Délai calculé à partir de la date de l'événement (eventId) ou de la séance (meetingId) liés, ou de celle d'une
 * étiquette « événement » datée (etiquetteId).
 */
export interface DelaiRef {
  type: 'event' | 'meeting' | 'etiquette';
  /** Type « etiquette » : l'étiquette dont la date sert de référence. */
  etiquetteId?: string;
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
}

/** Quand partir : date et heure fixes, ou N jours avant (négatif = après) le délai de la tâche. */
export type EmailWhen = { type: 'date'; date: string; heure: string } | { type: 'delai'; jours: number; heure: string };

/** Email programmé au sujet d'une tâche. */
export interface ScheduledEmail {
  id: string;
  taskId: string;
  /** Personnes destinataires (leur adresse vient de leur fiche). */
  destinataires: string[];
  /** Étiquettes entières : tous leurs membres, lus au moment d'envoyer. */
  etiquettes?: string[];
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
  /** Étiquettes de la tâche (événement, groupe) : leurs membres la voient. */
  etiquettes?: string[];
  /** Responsables qui n'ont pas de fiche dans l'appli : leur nom (et leur fiche « Personnes du club »). */
  respHors?: PersonneHors[];
  /** Pour info : personnes qui voient la tâche sans s'en occuper. */
  pourInfo?: PourInfo;
  /**
   * « ✓ Vu » des personnes mentionnées pour info, par clé « p:fiche ». Écrit par le serveur
   * seulement (gsa_pour_info_vu, 046) ; l'appli ne fait que le lire.
   */
  pourInfoVus?: Record<string, VuPourInfo>;
  /**
   * Dernière modification du contenu de la tâche (pas de « Pour info », ni discussion, ni « Vu ») : ceux qui l'avaient
   * marquée « ✓ Vu » avant voient qu'elle a changé. Posée par l'appli à l'enregistrement ; le serveur la garde honnête (052).
   */
  contenuLe?: string;
  /**
   * Ancienne place de la discussion (049, jusqu'à la migration 062) : relue si la tâche n'a pas de discussion à part
   * (AppData.discussions). Plus écrite.
   */
  commentaires?: Commentaire[];
  /** À prendre : tâche proposée à quelques personnes ; l'une d'elles s'en charge elle-même (« 🙋 Je m'en charge »). */
  aPrendre?: APrendre;
  /** Tâche de paiement : ticket à rembourser, validé (signé) puis payé par la caisse. */
  paiement?: Paiement;
  /**
   * Le point de la newsletter (newsletter.ts) : les infos sont les points rattachés à lui ; « Rassembler leurs remarques »
   * les reprend dans sa remarque. Il revient chaque mois (répétition), sa remarque repartant vide.
   */
  newsletter?: boolean;
}

/** « Pour info » d'une tâche : des personnes la voient (accueil, « Mes tâches », 🔔) sans en être responsables. */
export interface PourInfo {
  personnes?: string[];
}

/** Responsable d'une tâche qui n'a pas de fiche dans l'appli (sans accès). */
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
  /** Fiche de l'auteur. */
  par: string;
  /** Nom de l'auteur au moment du commentaire. */
  nom: string;
  le: string;
  texte: string;
  /** Corrigé par son auteur. */
  modifieLe?: string;
}

/**
 * À prendre : la tâche est proposée à quelques personnes ; la première qui clique « 🙋 Je m'en charge » en devient
 * responsable. Une place est prise tant que la personne proposée est responsable (retirée : la place se libère).
 */
export interface APrendre {
  /** Fiches des personnes à qui la tâche est proposée. */
  personnes: string[];
  /** Personnes qu'il faut (1 si absent). */
  nombre?: number;
  /** Personnes proposées qui ont répondu « Pas dispo ». */
  refus?: string[];
  /** Qui l'a proposée (prévenu des réponses ; sinon l'auteur de la tâche). */
  par?: string;
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
  /** Retards annoncés avant la séance (onglet Comité ou ordre du jour) : la personne viendra, mais plus tard. */
  retards?: RetardAnnonce[];
  /** Ordre du jour modifié à la main : remplace le document généré tant qu'on ne revient pas à celui-ci. */
  odjEdite?: { html: string; le: string; par: string };
  /**
   * Points (tâches, sondages : leurs identifiants) retirés de l'ordre du jour de la séance : ni dans l'ordre du jour, ni
   * dans le PV. Le point lui-même reste tel quel (liste des points, séances suivantes).
   */
  odjRetires?: string[];
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

/** Retard annoncé : la personne arrivera après le début de la séance (une seule annonce par personne : absente ou en retard). */
export interface RetardAnnonce {
  personId: string;
  /** Heure d'arrivée prévue (« 20:15 »), si elle est connue. */
  vers?: string;
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

/** Point du PV tel qu'il était à la fin de la séance (MeetingMinutes.etats). */
export interface EtatPoint extends TaskSnapshot {
  /** Son échéance à l'ordre du jour : en retard, pour la séance, pour la suivante, terminé depuis la précédente. */
  rang: 'late' | 'p1' | 'p2' | 'bilan';
}

export interface MeetingMinutes {
  presents: string[];
  excuses: string[];
  /** Arrivés en retard, comptés aussi parmi les présents : heure d'arrivée (« 20:15 » ; vide si elle n'est pas notée). */
  retards?: Record<string, string>;
  /**
   * Motif d'un excusé ou d'un retard (personne → motif), écrit dans le PV. Tant que le PV n'est pas validé, ceux annoncés
   * avant la séance (ordre du jour, liste des séances) y sont repris ; changés ici, l'annonce suit. Figés à la validation.
   */
  motifs?: Record<string, string>;
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
  /**
   * Points tels qu'ils étaient à la fin de la séance (statut, délai, responsables, intitulé, checklist, échéance), figés
   * dès le lendemain : repris plus tard, le PV les montre ainsi, sans ce qui a changé depuis ailleurs. Les changements
   * faits depuis le PV s'y reportent.
   */
  etats?: Record<string, EtatPoint>;
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
  /** Tâches : confiée, pour info, proposée (prise, déclinée), relance. */
  assign: boolean;
  /** Tâches : une des miennes modifiée par quelqu'un d'autre, reconduite, vue par tous. */
  modif: boolean;
  /** Messagerie : 💬 message dans la discussion d'une tâche (📣 : anciennes mentions @). */
  messages: boolean;
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
   * anciens profils communs (ReglagesOdj.profils), qui deviennent les siens dès qu'on en change un.
   */
  profilsOdj?: ProfilOdj[];
  /** « Envoyer par email » : profil du texte du mail et profil du PDF joint (`aucun` : sans PDF), parmi ses profils. */
  envoiOdj?: { texte?: string; pdf?: string };
  notif?: Partial<NotifPrefs>;
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
  /** Accueil, bloc « À faire » : toutes les tâches, pas seulement les miennes (droit « Voir toutes les tâches »). */
  aFaireToutes?: boolean;
  /** Page « Membres du club » : colonnes (ordre, masquées) et tri, propres à chacun. */
  membresColonnes?: ColonnesMembres;
  /**
   * Accueil, bloc « Pour info » : tâches marquées « ✓ Vu », qui n'y figurent plus (leur identifiant) → date.
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
   * n'est pas dispo (à l'auteur de la tâche) ; comment : nouveau commentaire sur la tâche (049, écrit par le serveur) ; mention : « @Prénom Nom » dans un commentaire (mentions abandonnées : seulement les anciennes, encore affichées) ; discussion : la personne a été ajoutée à la discussion de la tâche (063, écrit par le serveur) ; relance : rappel d'une tâche
   * « Pour info » pas encore vue (052) ; toutVu : à l'auteur, tout
   * le monde l'a marquée « ✓ Vu » (052).
   */
  type: 'assign' | 'modif' | 'recur' | 'info' | 'propose' | 'pris' | 'refus' | 'comment' | 'mention' | 'discussion' | 'relance' | 'toutVu';
  taskId: string;
  by: string;
  at: string;
  detail?: string;
  /** Titre de la tâche au moment de la notification. */
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
  /** En-tête de tous les documents imprimés (ordre du jour, PV, bon de paiement) ; sans réglage : logo et nom du club. */
  entete?: Entete;
  /** Ancien réglage, un en-tête par document : repris tant que « entete » n'est pas réglé (archives : leurs images). */
  entetes?: { odj?: Entete; pv?: Entete; bon?: Entete };
  /** Sceau « OK pour paiement » des tickets à rembourser. */
  timbre?: Timbre;
  /** Réglages communs de l'ordre du jour et du PV. */
  reglagesOdj?: ReglagesOdj;
  /** Propositions d'amélioration de l'appli reçues des membres du club. */
  propositions?: Proposition[];
  /** Étiquettes des tâches : événements et groupes, avec leurs membres. */
  etiquettes?: Etiquette[];
  /**
   * Discussions des tâches (062), par tâche : à part de la tâche, pour qu'une discussion réservée aux membres de ses
   * étiquettes ne parte pas avec la tâche. Version réelle : écrites par le serveur seulement (gsa_commenter), reçues
   * selon la règle de lecture (permissions.ts, litDiscussion) ; démo : par l'appli.
   */
  discussions?: Record<string, DiscussionTache>;
}

/** Discussion d'une tâche (ligne « discussions » du serveur, 062). */
export interface DiscussionTache {
  /** La tâche (discussion d'un point). */
  tache?: string;
  /** L'étiquette (discussion d'une étiquette, ligne « et:<id> », 066) : ses membres seulement. */
  etiquette?: string;
  /** Du plus ancien au plus récent. */
  commentaires: Commentaire[];
  /**
   * Personnes ajoutées à la discussion (063, fiches) : elles la lisent même si elle est réservée aux membres des
   * étiquettes de la tâche, voient la tâche et sont prévenues des messages.
   */
  participants?: string[];
}

/**
 * Étiquette du club : un événement (avec sa date) ou un groupe. Ses membres voient les tâches qui la portent ; les droits
 * restent ceux des rôles du club (pas de responsable d'étiquette). Un événement daté figure dans l'agenda et à l'accueil.
 */
export interface Etiquette {
  id: string;
  nom: string;
  couleur: string;
  type: TypeEtiquette;
  /** Événement : son (premier) jour, AAAA-MM-JJ. */
  date?: string;
  /** Événement sur plusieurs jours : le dernier. */
  dateFin?: string;
  /** Fiches des personnes qui voient ses tâches. */
  membres: string[];
  /**
   * Étiquette d'un événement de l'agenda (case « Étiquette » de l'événement) : son nom et ses dates sont ceux de
   * l'événement ; sa sous-section dans « Événements » est `lieux` ; les points rattachés à l'événement la reçoivent aussi.
   */
  eventId?: string;
  /** Étiquette d'une section, un groupe (coche « Groupe » de la section) : son nom est celui de la section. */
  sectionId?: string;
  /**
   * Sa place dans les sections (etiquettes.ts) : un point rangé là reçoit l'étiquette d'office, et ses membres (sans « Voir
   * tous les points ») n'y rangent leurs points que là. Événement : sa sous-section ; groupe : sa section (sans `lieux`).
   * Ancienne étiquette, pas encore reliée : réglée, sinon devinée d'après le nom.
   */
  lieux?: LieuEtiquette[];
  /** « Comité » : l'étiquette des points qui n'ont ni groupe ni événement. Une seule. */
  parDefaut?: boolean;
  /** Icône choisie dans la bibliothèque (IconesEtiquette.tsx) ; absente : celle de sa sorte. */
  icone?: string;
}

/** Place d'une étiquette : une section entière, ou l'une de ses sous-sections. */
export interface LieuEtiquette {
  sectionId: string;
  sousSection?: string;
}

export type TypeEtiquette = 'evenement' | 'groupe';

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
   * Anciens profils de l'ordre du jour, communs : les profils sont maintenant à chacun (Prefs.profilsOdj) ;
   * ceux-ci restent le point de départ de qui n'a pas encore les siens.
   */
  profils?: ProfilOdj[];
  /**
   * « Envoyer par email » : `lieu`, lien du lieu dans le mail (défaut : itinéraire Google Maps), commun.
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

/** Mise en forme de l'ordre du jour et du PV, commune (et gardée dans leurs archives). */
export interface StyleDocs {
  police?: 'arial' | 'calibri' | 'verdana' | 'georgia' | 'times';
  interligne?: 'serre' | 'aere';
  marges?: 'etroites' | 'larges';
  elements?: Partial<Record<ElementDoc, StyleElement>>;
}

/** En-tête des documents imprimés (ordre du jour, PV, bon de paiement), commun à tout le club. */
export interface Entete {
  /** Image : logo du club, image propre (ex. papier à lettres du club), ou aucune. */
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

/** Proposition d'amélioration de l'appli : envoyée par un membre du club, rangée dans les données du club. */
export interface Proposition {
  id: string;
  genre: 'idee' | 'probleme' | 'autre';
  texte: string;
  /** Page de l'appli concernée (ex. /taches) ; aucune : l'appli en général. */
  page?: string;
  le: string;
  /** Nom de l'auteur (pris sur sa fiche) ; `unite` : ancienne entité d'où elle a été envoyée. */
  par: string;
  unite?: string;
  /** Clé de l'auteur (son compte ; en démo, son adresse), pour qu'il en suive la réponse. */
  auteur: string;
  statut: 'nouvelle' | 'etudiee' | 'retenue' | 'faite' | 'refusee';
  reponse?: string;
  reponduLe?: string;
  reponduPar?: string;
  /** Suivi par l'auteur (version réelle) : supprimée par les admins. */
  supprimee?: boolean;
}

/** Ce que l'auteur écrit ; le reste (nom, date, statut) est ajouté à l'envoi. */
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
