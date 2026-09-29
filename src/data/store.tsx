import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { demoEmails, makeSeed } from './seed';
import { MERGED } from './seedData';
import { hasPermission, userRoles } from './permissions';
import { applyDelaiRef, fmtDate, fullName, isDone, nextOccurrence, postesFor, uid } from './utils';
import type { ActivityNotif, AppData, MeetingMinutes, Permission, Person, Poll, Prefs, Role, ScheduledEmail, Section, Task } from './types';
import { clearFiles } from './files';
import { snapshotToJournal } from './minutes';
import { emailsForNext } from './emails';

// Couche de données de la démo : tout vit en mémoire et dans le localStorage du navigateur.
// Pour passer à une vraie base (ex. Supabase), seul ce fichier devra être remplacé.
const KEY = 'taches-gsa-demo-v7';
const USER_KEY = 'taches-gsa-user';

const DEFAULT_PREFS: Prefs = { theme: 'auto', vueDefaut: 'mes', affichage: 'tableau' };

export const SCHEMA = 11;

/** Mises à niveau des données déjà enregistrées dans le navigateur (évite de tout réinitialiser). */
function migrate(d: AppData): AppData {
  if ((d.schema ?? 7) < 8) {
    // v8 : onglet PV, donné par défaut au Secrétaire.
    const sec = d.roles.find((r) => r.id === 'secretaire');
    if (sec && !sec.permissions.includes('tab.minutes')) sec.permissions.push('tab.minutes');
  }
  if ((d.schema ?? 7) < 9) {
    // v9 : le PV garde un journal des changements faits depuis l'onglet PV (au lieu d'un état de départ).
    d.meetings.forEach((m) => m.minutes && snapshotToJournal(d, m.minutes));
  }
  if ((d.schema ?? 7) < 10) {
    // v10 : emails programmés (exemples ajoutés).
    if (!d.emails) d.emails = demoEmails(d.tasks);
  }
  if ((d.schema ?? 7) < 11) reimport(d);
  d.schema = SCHEMA;
  return d;
}

/** Anciens statuts → statuts simplifiés (A valider → En cours, A discuter → À faire, Sans nouvelles → En attente, Info → Terminé). */
const STATUS_MAP: Record<string, string> = { s4: 's2', s5: 's1', s6: 's3', s8: 's7' };

/**
 * v11 : données du tableau reprises — une sous-section présente plusieurs fois devient une seule tâche
 * dont chaque ligne est une sous-tâche ; statuts simplifiés. Les tâches créées dans l'appli sont gardées
 * et tout ce qui visait une ligne regroupée (sondages, emails, notifications, PV) vise désormais sa tâche.
 */
function reimport(d: AppData) {
  const seed = makeSeed();
  const tid = (id: string) => MERGED[id] ?? id;
  const known = new Set(seed.statuses.map((s) => s.id));
  const sid = (id: string) => (known.has(id) ? id : STATUS_MAP[id] ?? seed.statuses[0].id);
  const own = d.tasks.filter((t) => !/^t\d+$/.test(t.id)).map((t) => ({ ...t, statusId: sid(t.statusId) }));
  d.statuses = seed.statuses;
  d.tasks = [...seed.tasks.map((t) => applyDelaiRef(d, t)), ...own];
  for (const s of seed.sections) {
    const x = d.sections.find((y) => y.id === s.id);
    if (!x) d.sections.push(s);
    else s.sousSections.forEach((ss) => x.sousSections.includes(ss) || x.sousSections.push(ss));
  }
  d.polls?.forEach((p) => p.taskId && (p.taskId = tid(p.taskId)));
  d.emails?.forEach((e) => (e.taskId = tid(e.taskId)));
  d.notifications?.forEach((n) => (n.taskId = tid(n.taskId)));
  const remapMinutes = (m?: Omit<MeetingMinutes, 'derniereValidee'>) => {
    if (!m) return;
    if (m.pointIds) m.pointIds = [...new Set(m.pointIds.map(tid))];
    if (m.nouvelles) m.nouvelles = [...new Set(m.nouvelles.map(tid))];
    m.journal?.forEach((j) => (j.taskId = tid(j.taskId)));
  };
  d.meetings.forEach((m) => {
    remapMinutes(m.minutes);
    remapMinutes(m.minutes?.derniereValidee);
  });
  // Statuts exclus de l'ordre du jour : on retire ceux qui n'existent plus (exclure « Info » ne doit pas exclure « Terminé »).
  Object.values(d.prefs).forEach((p) => p.pv?.statutsExclus && (p.pv.statutsExclus = p.pv.statutsExclus.filter((id) => known.has(id))));
  d.log.unshift({
    id: `l${Date.now()}v11`,
    at: new Date().toISOString(),
    userId: 'p1',
    action: 'Données du tableau reprises : sous-sections regroupées en tâches à sous-tâches, statuts simplifiés',
  });
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    /* stockage indisponible : on repart des données fictives */
  }
  return makeSeed();
}

interface Store {
  data: AppData;
  user: Person | null;
  /** Rôles de l'utilisateur connecté. */
  myRoles: Role[];
  /** Droit accordé par au moins un rôle, éventuellement pour une section donnée. */
  can: (p: Permission, sectionId?: string) => boolean;
  canSeeTask: (t: Task) => boolean;
  /** Sous-tâche attribuée à l'utilisateur connecté (hors responsables de la tâche). */
  hasSubtask: (t: Task) => boolean;
  canEditTask: (t: Task) => boolean;
  canDeleteTask: (t: Task) => boolean;
  canAssignOthers: (sectionId: string) => boolean;
  /** Sections dans lesquelles l'utilisateur peut créer une tâche. */
  creatableSections: () => Section[];
  prefs: Prefs;
  login: (id: string | null) => void;
  /** Applique une modification et l'inscrit au journal d'activité. */
  update: (fn: (d: AppData) => void, action: string) => void;
  /** Modification sans entrée au journal (prise de notes, présences…). */
  updateSilent: (fn: (d: AppData) => void) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  saveTask: (t: Task, isNew: boolean) => void;
  /** Message de confirmation affiché quelques secondes (ex. tâche récurrente reconduite). */
  toast: string | null;
  setToast: (msg: string | null) => void;
  /** Marque des notifications comme vues (sans entrée au journal). */
  markNotifsRead: (keys: string[]) => void;
  savePoll: (p: Poll, isNew: boolean) => void;
  votePoll: (pollId: string, optionIds: string[]) => void;
  closePoll: (pollId: string, closed: boolean) => void;
  deletePoll: (pollId: string) => void;
  canManagePoll: (p: Poll) => boolean;
  /** Coche / décoche une sous-tâche tout de suite (même sans droit de modifier la tâche, si elle m'est attribuée). */
  toggleSubtask: (taskId: string, itemId: string) => void;
  saveEmail: (e: ScheduledEmail, isNew: boolean) => void;
  setEmailStatus: (id: string, statut: ScheduledEmail['statut']) => void;
  deleteEmail: (id: string) => void;
  reset: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);
  const [toast, setToast] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(USER_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [data]);

  const user = data.people.find((p) => p.id === userId && p.actif) ?? null;
  const myRoles = useMemo(() => userRoles(data.roles, user), [data.roles, user]);

  const login = useCallback((id: string | null) => {
    setUserId(id);
    try {
      if (id) localStorage.setItem(USER_KEY, id);
      else localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback(
    (fn: (d: AppData) => void, action: string) => {
      setData((prev) => {
        const next = structuredClone(prev);
        fn(next);
        // Les délais liés suivent automatiquement la date de leur événement / séance.
        next.tasks = next.tasks.map((t) => applyDelaiRef(next, t));
        next.log.unshift({ id: `l${Date.now()}${Math.random()}`, at: new Date().toISOString(), userId: userId ?? '?', action });
        next.log = next.log.slice(0, 300);
        return next;
      });
    },
    [userId],
  );

  const updateSilent = useCallback((fn: (d: AppData) => void) => {
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const prefs = { ...DEFAULT_PREFS, ...(userId ? data.prefs[userId] : {}) };

  const setPrefs = useCallback(
    (p: Partial<Prefs>) => {
      if (!userId) return;
      setData((prev) => ({ ...prev, prefs: { ...prev.prefs, [userId]: { ...DEFAULT_PREFS, ...prev.prefs[userId], ...p } } }));
    },
    [userId],
  );

  const saveTask = useCallback(
    (t: Task, isNew: boolean) => {
      const task: Task = { ...t, updatedAt: new Date().toISOString() };
      const before = data.tasks.find((x) => x.id === task.id);
      // Une tâche récurrente retient les postes de ses responsables pour l'attribution suivante.
      task.postesResp = postesFor(data, task, before);

      // Date de clôture (pour le bilan de l'ordre du jour).
      if (!isDone(data, task)) task.termineeLe = undefined;
      else if (!(before && isDone(data, before))) task.termineeLe = new Date().toISOString().slice(0, 10);

      // Clôture d'une tâche récurrente → création de l'occurrence suivante.
      let next: Task | undefined;
      if (task.recurrence && !task.suivanteId && isDone(data, task) && !(before && isDone(data, before))) {
        next = nextOccurrence(data, task);
        task.suivanteId = next.id;
      }

      const who = next?.responsables.map((id) => fullName(data.people.find((p) => p.id === id))).join(', ');

      // Notifications d'activité pour les autres responsables.
      const actor = userId ?? '?';
      const now = new Date().toISOString();
      const notifs: ActivityNotif[] = [];
      const push = (uidTo: string, type: ActivityNotif['type'], taskId: string, detail?: string) =>
        uidTo !== actor && notifs.push({ id: uid('n'), userId: uidTo, type, taskId, by: actor, at: now, detail });
      const added = task.responsables.filter((id) => !before?.responsables.includes(id));
      added.forEach((id) => push(id, 'assign', task.id));
      if (before) {
        const st = data.statuses.find((x) => x.id === task.statusId)?.label;
        const detail =
          before.statusId !== task.statusId ? `statut : ${st}`
          : before.delai !== task.delai ? `délai : ${fmtDate(task.delai)}`
          : before.titre !== task.titre || before.remarque !== task.remarque ? 'contenu modifié'
          : undefined;
        if (detail) task.responsables.filter((id) => !added.includes(id)).forEach((id) => push(id, 'modif', task.id, detail));
      }
      next?.responsables.forEach((id) => push(id, 'recur', next!.id, fmtDate(next!.delai)));
      // Sous-tâches nouvellement attribuées à quelqu'un.
      for (const c of task.checklist) {
        const prev = before?.checklist.find((x) => x.id === c.id);
        if (c.assigneeId && !c.done && prev?.assigneeId !== c.assigneeId) push(c.assigneeId, 'subtask', task.id, c.label);
      }
      const nextEmails = next ? emailsForNext(data, task, next) : [];

      update(
        (d) => {
          if (isNew) d.tasks.unshift(task);
          else d.tasks = d.tasks.map((x) => (x.id === task.id ? task : x));
          if (next) d.tasks.unshift(next);
          if (nextEmails.length) d.emails = [...(d.emails ?? []), ...nextEmails];
          if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
        },
        `${isNew ? 'Création' : 'Modification'} de la tâche « ${t.titre} »` +
          (next ? ` — tâche récurrente : prochaine occurrence le ${fmtDate(next.delai)} pour ${who}` : ''),
      );
      if (next) setToast(`🔁 Tâche récurrente reconduite au ${fmtDate(next.delai)} · ${who}`);
    },
    [update, data, userId],
  );

  const markNotifsRead = useCallback(
    (keys: string[]) => {
      if (!userId || !keys.length) return;
      setData((prev) => {
        const seen = new Set(prev.notifLues?.[userId] ?? []);
        if (keys.every((k) => seen.has(k))) return prev;
        keys.forEach((k) => seen.add(k));
        return { ...prev, notifLues: { ...prev.notifLues, [userId]: [...seen].slice(-800) } };
      });
    },
    [userId],
  );

  const reset = useCallback(() => {
    setData(makeSeed());
    clearFiles();
  }, []);

  const savePoll = useCallback(
    (p: Poll, isNew: boolean) =>
      update((d) => {
        d.polls = isNew ? [p, ...(d.polls ?? [])] : (d.polls ?? []).map((x) => (x.id === p.id ? p : x));
      }, `${isNew ? 'Création' : 'Modification'} du sondage « ${p.question} »`),
    [update],
  );
  const votePoll = useCallback(
    (pollId: string, optionIds: string[]) => {
      if (!userId) return;
      const p = data.polls?.find((x) => x.id === pollId);
      update((d) => {
        const x = d.polls?.find((y) => y.id === pollId);
        if (x) x.votes = { ...x.votes, [userId]: optionIds };
      }, `Réponse au sondage « ${p?.question ?? ''} »`);
    },
    [update, userId, data.polls],
  );
  const closePoll = useCallback(
    (pollId: string, closed: boolean) => {
      const p = data.polls?.find((x) => x.id === pollId);
      update((d) => {
        const x = d.polls?.find((y) => y.id === pollId);
        if (!x) return;
        x.clotureLe = closed ? new Date().toISOString().slice(0, 10) : undefined;
        // Rouvrir un sondage dont la date limite est passée : on retire la date limite.
        if (!closed && x.dateLimite && x.dateLimite < new Date().toISOString().slice(0, 10)) x.dateLimite = undefined;
      }, `Sondage « ${p?.question ?? ''} » ${closed ? 'clôturé' : 'rouvert'}`);
    },
    [update, data.polls],
  );
  const deletePoll = useCallback(
    (pollId: string) => {
      const p = data.polls?.find((x) => x.id === pollId);
      update((d) => {
        d.polls = (d.polls ?? []).filter((x) => x.id !== pollId);
      }, `Suppression du sondage « ${p?.question ?? ''} »`);
    },
    [update, data.polls],
  );

  const toggleSubtask = useCallback(
    (taskId: string, itemId: string) => {
      const t = data.tasks.find((x) => x.id === taskId);
      const c = t?.checklist.find((x) => x.id === itemId);
      if (!t || !c) return;
      const actor = userId ?? '?';
      const now = new Date().toISOString();
      // Les responsables sont prévenus quand quelqu'un d'autre termine sa sous-tâche.
      const notifs: ActivityNotif[] = c.done
        ? []
        : t.responsables.filter((id) => id !== actor).map((id) => ({ id: uid('n'), userId: id, type: 'modif' as const, taskId, by: actor, at: now, detail: `sous-tâche « ${c.label} » faite` }));
      update((d) => {
        const x = d.tasks.find((y) => y.id === taskId)?.checklist.find((y) => y.id === itemId);
        if (x) x.done = !x.done;
        if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
      }, `Sous-tâche « ${c.label} » ${c.done ? 'rouverte' : 'faite'} (tâche « ${t.titre} »)`);
    },
    [update, data.tasks, userId],
  );

  const taskTitle = (id: string) => data.tasks.find((t) => t.id === id)?.titre ?? '';
  const saveEmail = useCallback(
    (e: ScheduledEmail, isNew: boolean) =>
      update((d) => {
        d.emails = isNew ? [...(d.emails ?? []), e] : (d.emails ?? []).map((x) => (x.id === e.id ? e : x));
      }, `${isNew ? 'Email programmé' : 'Modification de l’email programmé'} « ${e.objet} » (tâche « ${taskTitle(e.taskId)} »)`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update, data.tasks],
  );
  const setEmailStatus = useCallback(
    (id: string, statut: ScheduledEmail['statut']) => {
      const e = data.emails?.find((x) => x.id === id);
      if (!e) return;
      update((d) => {
        const x = d.emails?.find((y) => y.id === id);
        if (!x) return;
        x.statut = statut;
        x.envoyeLe = statut === 'envoye' ? new Date().toISOString() : undefined;
        x.envoyePar = statut === 'envoye' ? userId ?? undefined : undefined;
      }, `Email « ${e.objet} » (tâche « ${taskTitle(e.taskId)} ») ${statut === 'envoye' ? 'envoyé' : statut === 'annule' ? 'annulé' : 'reprogrammé'}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update, data.emails, data.tasks, userId],
  );
  const deleteEmail = useCallback(
    (id: string) => {
      const e = data.emails?.find((x) => x.id === id);
      update((d) => {
        d.emails = (d.emails ?? []).filter((x) => x.id !== id);
      }, `Suppression de l’email programmé « ${e?.objet ?? ''} »`);
    },
    [update, data.emails],
  );

  const can = (p: Permission, sectionId?: string) => hasPermission(myRoles, p, sectionId);
  const isOwn = (t: Task) => !!user && (t.responsables.includes(user.id) || t.createdBy === user.id);
  const hasSubtask = (t: Task) => !!user && t.checklist.some((c) => c.assigneeId === user.id);

  const value: Store = {
    data,
    user,
    myRoles,
    can,
    canSeeTask: (t) => (!!user && t.responsables.includes(user.id)) || hasSubtask(t) || can('tasks.viewAll', t.sectionId),
    hasSubtask,
    canEditTask: (t) => can('tasks.editAny', t.sectionId) || (can('tasks.editOwn', t.sectionId) && isOwn(t)),
    canDeleteTask: (t) => can('tasks.delete', t.sectionId),
    canAssignOthers: (sec) => can('tasks.createAny', sec) || can('tasks.editAny', sec),
    creatableSections: () => data.sections.filter((s) => can('tasks.createAny', s.id) || can('tasks.editOwn', s.id)),
    prefs,
    login,
    update,
    updateSilent,
    setPrefs,
    saveTask,
    toast,
    setToast,
    markNotifsRead,
    savePoll,
    votePoll,
    closePoll,
    deletePoll,
    canManagePoll: (p) => !!user && (p.creePar === user.id || can('polls.manage')),
    toggleSubtask,
    saveEmail,
    setEmailStatus,
    deleteEmail,
    reset,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}
