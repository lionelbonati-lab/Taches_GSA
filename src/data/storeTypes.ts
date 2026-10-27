import type { Mode } from './mode';
import type { CloudSync, Membership } from './cloud';
import type { Externes } from './externes';
import type { ActionCommentaire } from './commentaires';
import type { AppData, OrgUnit, Permission, Person, Poll, Prefs, Role, ScheduledEmail, Section, TachePartagee, Task } from './types';

// Ce que la couche de données (store.tsx) donne aux écrans, et ses deux modes : démo et version réelle.

/** Démo : données de l'entité ouverte, gardées dans ce navigateur (voir demoClub.ts). */
export interface DemoMode {
  load: () => AppData;
  save: (d: AppData) => void;
  personId: string | null;
  logout: () => void;
  reset: () => void;
  /** Change quand les données de l'entité ont été modifiées hors de l'écran (registre des membres du club) : relues. */
  epoch?: number;
}

/** Version réelle : connexion au serveur et données du comité chargées. */
export interface CloudMode {
  sync: CloudSync;
  initial: AppData;
  personId: string;
  membership: Membership;
  email: string;
  signOut: () => void;
}

export interface Store {
  mode: Mode;
  /** Version réelle (null en démo). */
  cloud: CloudMode | null;
  data: AppData;
  /** Données de l'entité seules, sans les tâches partagées par d'autres entités (réglages, console admin). */
  dataLocale: AppData;
  /**
   * Vue « moi » : `data` avec les tâches que je vois dans mes autres entités (tâches, accueil, calendrier, messages) ;
   * elles s'ouvrent et s'enregistrent dans la leur (vueMoi.ts).
   */
  dataMoi: AppData;
  user: Person | null;
  /** Rôles de l'utilisateur connecté. */
  myRoles: Role[];
  /** Droit accordé par au moins un rôle, éventuellement pour une section donnée. */
  can: (p: Permission, sectionId?: string) => boolean;
  canSeeTask: (t: Task) => boolean;
  canEditTask: (t: Task) => boolean;
  canDeleteTask: (t: Task) => boolean;
  /** Responsables d'autres entités (tâche partagée) : « Prénom Nom (Entité) », vide sinon. */
  autresResp: (t: Task) => string;
  canAssignOthers: (sectionId: string) => boolean;
  /** Sections dans lesquelles l'utilisateur peut créer une tâche. */
  creatableSections: () => Section[];
  prefs: Prefs;
  login: (id: string | null) => void;
  /**
   * Applique une modification et l'inscrit au journal d'activité. `annulable: false` : « Annuler » ne la défait pas
   * (enregistrée aussi ailleurs : serveur, autre entité).
   */
  update: (fn: (d: AppData) => void, action: string, o?: { annulable?: boolean }) => void;
  /**
   * Modification sans entrée au journal (prise de notes, présences…). `annulable` : action que « Annuler » peut défaire ;
   * `suite` : complète l'action précédente (annulées ensemble).
   */
  updateSilent: (fn: (d: AppData) => void, o?: { annulable?: string; suite?: boolean }) => void;
  /** Dernière action de cette session que l'on peut annuler (actions faites ici, depuis l'ouverture de l'appli). */
  annulable: { action: string; at: string } | null;
  /** Annule la dernière action : les éléments qu'elle a changés reviennent comme avant (sauf modifiés depuis). */
  annuler: () => void;
  /** Dernière action annulée, que l'on peut refaire (jusqu'à la prochaine action). */
  refaisable: { action: string; at: string } | null;
  refaire: () => void;
  setPrefs: (p: Partial<Prefs>) => void;
  /** Tâche partagée par une autre entité : promesse résolue une fois la modification envoyée à son entité (acceptée ou non). */
  saveTask: (t: Task, isNew: boolean) => void | Promise<void>;
  /**
   * Tâche attribuée à l'entité `cible` qui dépend de l'entité ouverte (sous-section du formulaire) : enregistrée chez elle,
   * dans sa section `sectionId`, partagée avec l'entité ouverte ; une tâche existante est retirée d'ici (elle y revient
   * partagée). Ses fichiers joints sont copiés chez l'entité et y suivent la tâche ; `erreur` : la tâche est enregistrée,
   * mais pas ses fichiers. Erreur : rien n'est changé.
   */
  attribuerTache: (t: Task, cible: OrgUnit, sectionId: string, isNew: boolean) => Promise<{ fichiers: number; erreur?: string }>;
  /** « 🙋 Je m'en charge » : la personne connectée devient responsable d'une tâche à prendre qui lui est proposée. */
  prendreTache: (t: Task) => Promise<void>;
  /** « Pas dispo » : la personne connectée décline une tâche à prendre qui lui est proposée (l'auteur est prévenu). */
  pasDispo: (t: Task) => Promise<void>;
  /**
   * « ✓ Vu » d'une tâche pour info : elle quitte l'accueil (préférence `cle`) et le « Vu » est enregistré sur la tâche,
   * pour son auteur et ses responsables. `uniteId` : entité de la tâche quand ce n'est pas l'entité ouverte (reçue pour
   * info, partagée ; `tacheId` : son identifiant là-bas).
   */
  vuPourInfo: (cle: string, tacheId: string, uniteId?: string) => Promise<void>;
  /**
   * Discussion sur une tâche (049) : ajoute, corrige ou retire un commentaire ; les personnes concernées sont prévenues.
   * `uniteId` : entité de la tâche quand ce n'est pas l'entité ouverte (partagée, reçue pour info ; `tacheId` : son
   * identifiant là-bas).
   */
  commenter: (tacheId: string, a: ActionCommentaire, uniteId?: string) => Promise<void>;
  /**
   * Relance (052) d'une tâche « Pour info » de l'entité ouverte : les personnes attendues qui ne l'ont pas encore vue
   * reçoivent une notification 🔔, chacune dans son entité. Auteur, responsables, « Modifier toutes les tâches » ; une fois
   * par heure au plus. Renvoie le nombre de personnes relancées.
   */
  relancerPourInfo: (t: Task) => Promise<number>;
  /** La personne connectée peut relancer cette tâche (auteur, responsable, « Modifier toutes les tâches ») ; tâche d'ici. */
  peutRelancer: (t: Task) => boolean;
  /** Message de confirmation affiché quelques secondes (ex. tâche récurrente reconduite). */
  toast: string | null;
  setToast: (msg: string | null) => void;
  /** Marque des notifications comme vues (sans entrée au journal). */
  markNotifsRead: (keys: string[]) => void;
  /** Discussion d'une tâche lue jusqu'au message du `dernier` (sa date) ; `cle` : la tâche vue d'ici. Ses 💬 aussi. */
  discussionLue: (cle: string, dernier: string) => void;
  /** Date jusqu'où j'ai lu la discussion `cle` (vue d'ici), ici ou dans l'une de mes autres entités. */
  discussionLueLe: (cle: string) => string | undefined;
  savePoll: (p: Poll, isNew: boolean) => void;
  /** `texte` : réponse écrite avec « Autre ». */
  votePoll: (pollId: string, optionIds: string[], texte?: string) => void;
  closePoll: (pollId: string, closed: boolean) => void;
  deletePoll: (pollId: string) => void;
  canManagePoll: (p: Poll) => boolean;
  /** Sondages : on peut les ouvrir à d'autres entités du club (démo, ou serveur à jour : migration 021). */
  sondagesEntites: boolean;
  /** Séances du comité dont l'entité dépend, agenda du club (entités qui dépendent d'elle) : pour y lier des tâches. */
  externes: Externes;
  /** Tâches d'autres entités « pour info » de la personne connectée (elle, ou son entité), en lecture seule. */
  pourInfo: TachePartagee[];
  /** Lie une tâche à une tâche principale (ou la délie avec undefined). */
  linkTask: (taskId: string, parentId: string | undefined) => void;
  saveEmail: (e: ScheduledEmail, isNew: boolean) => void;
  setEmailStatus: (id: string, statut: ScheduledEmail['statut']) => void;
  deleteEmail: (id: string) => void;
  reset: () => void;
  /** Remplace toutes les données par celles d'une sauvegarde (mise à niveau du format comprise). */
  restore: (d: AppData, label: string) => void;
}
