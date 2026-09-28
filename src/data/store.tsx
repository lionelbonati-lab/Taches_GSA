import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { makeSeed } from './seed';
import { hasPermission, userRoles } from './permissions';
import { applyDelaiRef, fmtDate, fullName, isDone, nextOccurrence, postesFor, uid } from './utils';
import type { ActivityNotif, AppData, Permission, Person, Poll, Prefs, Role, Section, Task } from './types';
import { clearFiles } from './files';

// Couche de données de la démo : tout vit en mémoire et dans le localStorage du navigateur.
// Pour passer à une vraie base (ex. Supabase), seul ce fichier devra être remplacé.
const KEY = 'taches-gsa-demo-v7';
const USER_KEY = 'taches-gsa-user';

const DEFAULT_PREFS: Prefs = { theme: 'auto', vueDefaut: 'mes', affichage: 'tableau' };

export const SCHEMA = 8;

/** Mises à niveau des données déjà enregistrées dans le navigateur (évite de tout réinitialiser). */
function migrate(d: AppData): AppData {
  if ((d.schema ?? 7) < 8) {
    // v8 : onglet PV, donné par défaut au Secrétaire.
    const sec = d.roles.find((r) => r.id === 'secretaire');
    if (sec && !sec.permissions.includes('tab.minutes')) sec.permissions.push('tab.minutes');
  }
  d.schema = SCHEMA;
  return d;
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

      update(
        (d) => {
          if (isNew) d.tasks.unshift(task);
          else d.tasks = d.tasks.map((x) => (x.id === task.id ? task : x));
          if (next) d.tasks.unshift(next);
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

  const can = (p: Permission, sectionId?: string) => hasPermission(myRoles, p, sectionId);
  const isOwn = (t: Task) => !!user && (t.responsables.includes(user.id) || t.createdBy === user.id);

  const value: Store = {
    data,
    user,
    myRoles,
    can,
    canSeeTask: (t) => (!!user && t.responsables.includes(user.id)) || can('tasks.viewAll', t.sectionId),
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
    reset,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}
