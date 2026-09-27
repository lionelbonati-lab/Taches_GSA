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
  | 'meetings.manage'
  | 'events.manage'
  | 'people.manage'
  | 'settings.lists'
  | 'admin.access';

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

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export type Recurrence = 'hebdomadaire' | 'mensuelle' | 'trimestrielle' | 'semestrielle' | 'annuelle';

/** Délai calculé à partir de la date de l'événement (eventId) ou de la séance (meetingId) liés. */
export interface DelaiRef {
  type: 'event' | 'meeting';
  /** Nombre de jours avant la date de référence (négatif = après). */
  joursAvant: number;
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
  delaiRef?: DelaiRef;
  recurrence?: Recurrence;
  /** Postes des responsables : l'occurrence suivante va à la personne qui occupe alors le poste. */
  postesResp?: string[];
  /** Occurrence suivante déjà créée (évite les doublons si on rouvre puis referme la tâche). */
  suivanteId?: string;
  /** Date de clôture (passage à un statut « terminé »), pour le bilan du PV. */
  termineeLe?: string;
  createdBy: string;
  updatedAt: string;
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
  /** Documents PV archivés pour cette séance (copie figée du document généré). */
  pvArchives?: PvArchive[];
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
    notes: boolean;
  };
  groupBy: 'section' | 'responsable' | 'aucun';
  tri: 'delai' | 'statut' | 'titre';
  colonnes: { sousSection: boolean; statut: boolean; remarque: boolean; checklist: boolean; suivi: boolean };
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
  notifications?: ActivityNotif[];
  /** Clés des notifications déjà vues, par utilisateur. */
  notifLues?: Record<string, string[]>;
}
