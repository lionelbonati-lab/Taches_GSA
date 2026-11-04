import type { Mode } from './mode';
import type { CloudSync, Membership } from './cloud';
import type { ActionCommentaire } from './commentaires';
import type { AppData, Permission, Person, Poll, Prefs, Role, ScheduledEmail, Section, Task } from './types';

// Ce que la couche de données (store.tsx) donne aux écrans, et ses deux modes : démo et version réelle.

/** Démo : données de l'espace du club, gardées dans ce navigateur (voir demoClub.ts). */
export interface DemoMode {
  load: () => AppData;
  save: (d: AppData) => void;
  personId: string | null;
  logout: () => void;
  reset: () => void;
  /** Change quand les données ont été modifiées hors de l'écran (« Personnes du club ») : relues. */
  epoch?: number;
}

/** Version réelle : connexion au serveur et données de l'espace chargées. */
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
  user: Person | null;
  /** Rôles de l'utilisateur connecté. */
  myRoles: Role[];
  /** Droit accordé par au moins un rôle, éventuellement pour une section donnée. */
  can: (p: Permission, sectionId?: string) => boolean;
  canSeeTask: (t: Task) => boolean;
  /** Lit (et écrit) la discussion de la tâche : tâche étiquetée, membres de ses étiquettes seulement (062). */
  canReadDiscussion: (t: Task) => boolean;
  canEditTask: (t: Task) => boolean;
  canDeleteTask: (t: Task) => boolean;
  canAssignOthers: (sectionId: string) => boolean;
  /** Sections dans lesquelles l'utilisateur peut créer une tâche (dans l'une de leurs places au moins). */
  creatableSections: () => Section[];
  /**
   * L'utilisateur peut ranger un point (nouveau, ou déplacé) dans `sectionId` › `sousSection` : droit de créer dans la
   * section, et, sans « Voir tous les points » de la section, le point y reçoit l'une de ses étiquettes (s'il est membre
   * d'étiquettes qui ont leur place : etiquettes.ts).
   */
  peutRanger: (sectionId: string, sousSection?: string) => boolean;
  /** L'utilisateur peut mettre (ou retirer) cette étiquette à la main : il en est membre, ou il règle les étiquettes. */
  peutEtiqueter: (etiquetteId: string) => boolean;
  prefs: Prefs;
  login: (id: string | null) => void;
  /**
   * Applique une modification et l'inscrit au journal d'activité. `annulable: false` : « Annuler » ne la défait pas
   * (enregistrée aussi ailleurs : serveur).
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
  saveTask: (t: Task, isNew: boolean) => void;
  /** « 🙋 Je m'en charge » : la personne connectée devient responsable d'une tâche à prendre qui lui est proposée. */
  prendreTache: (t: Task) => Promise<void>;
  /** « Pas dispo » : la personne connectée décline une tâche à prendre qui lui est proposée (l'auteur est prévenu). */
  pasDispo: (t: Task) => Promise<void>;
  /** « ✓ Vu » d'une tâche pour info : elle quitte l'accueil et le « Vu » est enregistré sur la tâche, pour son auteur et ses responsables. */
  vuPourInfo: (tacheId: string) => Promise<void>;
  /** Discussion sur une tâche (049) : ajoute, corrige ou retire un commentaire ; les personnes concernées sont prévenues. */
  commenter: (tacheId: string, a: ActionCommentaire) => Promise<void>;
  /** Discussion d'une étiquette (066) : ses membres seulement ; les autres membres sont prévenus (🔔). */
  commenterEtiquette: (etiquetteId: string, a: ActionCommentaire) => Promise<void>;
  /** Ajoute la personne `fiche` à la discussion de la tâche (063), ou l'en retire (`retirer`, soi-même compris). */
  ajouterADiscussion: (tacheId: string, fiche: string, retirer?: boolean) => Promise<void>;
  /**
   * Relance (052) d'une tâche « Pour info » : les personnes attendues qui ne l'ont pas encore vue reçoivent une
   * notification 🔔. Auteur, responsables, « Modifier toutes les tâches » ; une fois par heure au plus. Renvoie le nombre
   * de personnes relancées.
   */
  relancerPourInfo: (t: Task) => Promise<number>;
  /** La personne connectée peut relancer cette tâche (auteur, responsable, « Modifier toutes les tâches »). */
  peutRelancer: (t: Task) => boolean;
  /** Message de confirmation affiché quelques secondes (ex. tâche récurrente reconduite). */
  toast: string | null;
  setToast: (msg: string | null) => void;
  /** Marque des notifications comme vues (sans entrée au journal). */
  markNotifsRead: (keys: string[]) => void;
  /** Discussion d'une tâche lue jusqu'au message du `dernier` (sa date). Ses 💬 aussi. */
  discussionLue: (tacheId: string, dernier: string) => void;
  /** Date jusqu'où j'ai lu la discussion de la tâche. */
  discussionLueLe: (tacheId: string) => string | undefined;
  savePoll: (p: Poll, isNew: boolean) => void;
  /** `texte` : réponse écrite avec « Autre ». */
  votePoll: (pollId: string, optionIds: string[], texte?: string) => void;
  closePoll: (pollId: string, closed: boolean) => void;
  deletePoll: (pollId: string) => void;
  canManagePoll: (p: Poll) => boolean;
  /** Lie une tâche à une tâche principale (ou la délie avec undefined). */
  linkTask: (taskId: string, parentId: string | undefined) => void;
  saveEmail: (e: ScheduledEmail, isNew: boolean) => void;
  setEmailStatus: (id: string, statut: ScheduledEmail['statut']) => void;
  deleteEmail: (id: string) => void;
  reset: () => void;
  /** Remplace toutes les données par celles d'une sauvegarde (mise à niveau du format comprise). */
  restore: (d: AppData, label: string) => void;
}
