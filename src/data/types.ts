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
  | 'meetings.manage'
  | 'events.manage'
  | 'people.manage'
  | 'settings.lists'
  | 'admin.access';

export interface Person {
  id: string;
  poste: string;
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
  createdBy: string;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  titre: string;
  date: string;
  lieu: string;
  ordreDuJour: string;
  notes: string;
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

export interface Prefs {
  theme: 'clair' | 'sombre' | 'auto';
  vueDefaut: 'mes' | 'toutes';
  affichage: 'tableau' | 'kanban';
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
}
