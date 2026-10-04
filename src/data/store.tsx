import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { demoEmails, makeSeed } from './seed';
import { GROUPS } from './seedData';
import { hasPermission, userRoles } from './permissions';
import { applyDelaiRef, fmtDate, fullName, isDone, nextOccurrence, postesFor, uid } from './utils';
import type { ActivityNotif, AppData, ChecklistItem, MeetingMinutes, Permission, Person, Poll, Prefs, Role, ScheduledEmail, Section, Task } from './types';
import { clearFiles } from './files';
import { snapshotToJournal } from './minutes';
import { emailsForNext } from './emails';
import { applyRows, type CloudSync, type Membership } from './cloud';
import type { Mode } from './mode';

// Couche de données. Démo : tout vit en mémoire et dans le localStorage du navigateur.
// Version réelle : mêmes données, synchronisées avec le serveur par CloudSync (voir cloud.ts).
const KEY = 'taches-gsa-demo-v7';
const USER_KEY = 'taches-gsa-user';

const DEFAULT_PREFS: Prefs = { theme: 'auto', vueDefaut: 'mes', affichage: 'tableau' };

export const SCHEMA = 12;

/**
 * Mises à niveau des données déjà enregistrées (évite de tout réinitialiser).
 * Les étapes v8 à v12 ne concernent que la démo : les données réelles partent du format v12.
 */
export function migrate(d: AppData): AppData {
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
  if ((d.schema ?? 7) < 12) linkSubtasks(d);
  d.schema = SCHEMA;
  return d;
}

/** Anciens statuts → statuts simplifiés (A valider → En cours, A discuter → À faire, Sans nouvelles → En attente, Info → Terminé). */
const STATUS_MAP: Record<string, string> = { s4: 's2', s5: 's1', s6: 's3', s8: 's7' };

/**
 * v11 : données du tableau reprises — une sous-section présente plusieurs fois devient une tâche principale
 * dont chaque ligne est une tâche liée ; statuts simplifiés. Les tâches créées dans l'appli sont gardées
 * (statut converti) ; sondages, emails et PV visent toujours la même ligne du tableau.
 */
function reimport(d: AppData) {
  const seed = makeSeed();
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
  // Statuts exclus de l'ordre du jour : on retire ceux qui n'existent plus (exclure « Info » ne doit pas exclure « Terminé »).
  Object.values(d.prefs).forEach((p) => p.pv?.statutsExclus && (p.pv.statutsExclus = p.pv.statutsExclus.filter((id) => known.has(id))));
  d.log.unshift({
    id: `l${Date.now()}v11`,
    at: new Date().toISOString(),
    userId: 'p1',
    action: 'Données du tableau reprises : sous-sections regroupées en tâches principales avec tâches liées, statuts simplifiés',
  });
}

/** Ancien format des sous-tâches (v10-v11) : personne chargée et délai propre. */
type OldItem = ChecklistItem & { assigneeId?: string; delai?: string; ref?: { type: 'event' | 'meeting'; id: string; joursAvant: number } };

/**
 * v12 : les sous-tâches deviennent des tâches liées à une tâche principale ; les sous-tâches restantes
 * redeviennent de simples cases à cocher (sans délai ni personne chargée).
 * - Tâche regroupée en v11 (sous-section du tableau) : elle devient la tâche principale (identifiant du groupe)
 *   et chaque ligne du tableau redevient une vraie tâche (responsable, délai lié, statut, remarque, répétition),
 *   cochée → terminée. Tout ce qui visait la tâche regroupée vise la tâche principale.
 * - Autre sous-tâche avec personne chargée ou délai : devient une tâche liée.
 */
function linkSubtasks(d: AppData) {
  const seed = makeSeed();
  const seedById = new Map(seed.tasks.map((t) => [t.id, t]));
  const doneId = d.statuses.find((s) => s.done)?.id ?? 's7';
  const openId = d.statuses.find((s) => !s.done)?.id ?? 's1';
  const isDoneId = (id: string) => !!d.statuses.find((s) => s.id === id)?.done;
  const renamed = new Map<string, string>();
  const now = new Date().toISOString();
  const strip = (c: OldItem): ChecklistItem => ({ id: c.id, label: c.label, done: c.done });
  const out: Task[] = [];
  for (const t of d.tasks) {
    const items = t.checklist as OldItem[];
    const pid = GROUPS[t.id];
    const rows = pid ? items.filter((c) => /^ct\d+$/.test(c.id) && seedById.has(c.id.slice(1))) : [];
    if (pid && rows.length) {
      renamed.set(t.id, pid);
      const seedParent = seedById.get(pid);
      // Tâche regroupée jamais modifiée : on reprend la tâche principale telle qu'importée.
      const base = seedParent && t.updatedAt === seedParent.updatedAt ? { ...structuredClone(seedParent), checklist: [] } : { ...t, remarque: '', checklist: [] };
      out.push(applyDelaiRef(d, { ...base, id: pid, checklist: items.filter((c) => !rows.includes(c)).map(strip) }));
      for (const c of rows) {
        const child = applyDelaiRef(d, { ...structuredClone(seedById.get(c.id.slice(1))!), parentId: pid });
        if (c.done !== isDoneId(child.statusId)) {
          child.statusId = c.done ? doneId : openId;
          child.termineeLe = c.done ? now.slice(0, 10) : undefined;
        }
        out.push(child);
      }
      continue;
    }
    const toTask = items.filter((c) => c.assigneeId || c.delai);
    out.push({ ...t, checklist: items.filter((c) => !toTask.includes(c)).map(strip) });
    for (const c of toTask)
      out.push(
        applyDelaiRef(d, {
          id: uid('t'),
          sectionId: t.sectionId,
          sousSection: t.sousSection,
          titre: c.label,
          responsables: c.assigneeId ? [c.assigneeId] : [...t.responsables],
          statusId: c.done ? doneId : openId,
          delai: c.delai || t.delai,
          remarque: '',
          checklist: [],
          parentId: t.id,
          ...(c.ref ? { [c.ref.type === 'meeting' ? 'meetingId' : 'eventId']: c.ref.id, delaiRef: { type: c.ref.type, joursAvant: c.ref.joursAvant } } : {}),
          termineeLe: c.done ? now.slice(0, 10) : undefined,
          createdBy: t.createdBy,
          updatedAt: now,
        }),
      );
  }
  const tid = (id: string) => renamed.get(id) ?? id;
  d.tasks = out.map((t) => (t.suivanteId ? { ...t, suivanteId: tid(t.suivanteId) } : t));
  d.polls?.forEach((p) => p.taskId && (p.taskId = tid(p.taskId)));
  d.emails?.forEach((e) => (e.taskId = tid(e.taskId)));
  d.notifications = (d.notifications ?? []).filter((n) => (n.type as string) !== 'subtask').map((n) => ({ ...n, taskId: tid(n.taskId) }));
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
  if (renamed.size || out.length !== d.tasks.length)
    d.log.unshift({ id: `l${Date.now()}v12`, at: now, userId: 'p1', action: 'Sous-tâches transformées en tâches liées à leur tâche principale' });
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

/** Version réelle : connexion au serveur et données du comité chargées. */
export interface CloudMode {
  sync: CloudSync;
  initial: AppData;
  personId: string;
  membership: Membership;
  email: string;
  signOut: () => void;
}

interface Store {
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
  /** Lie une tâche à une tâche principale (ou la délie avec undefined). */
  linkTask: (taskId: string, parentId: string | undefined) => void;
  saveEmail: (e: ScheduledEmail, isNew: boolean) => void;
  setEmailStatus: (id: string, statut: ScheduledEmail['statut']) => void;
  deleteEmail: (id: string) => void;
  reset: () => void;
  /** Remplace toutes les données par celles d'une sauvegarde (mise à niveau du format comprise). */
  restore: (d: AppData, label: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, cloud = null }: { children: ReactNode; cloud?: CloudMode | null }) {
  const [data, setData] = useState<AppData>(() => (cloud ? cloud.initial : load()));
  const [toast, setToast] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(() => {
    if (cloud) return cloud.personId;
    try {
      return localStorage.getItem(USER_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Version réelle : envoi des éléments modifiés au serveur ; démo : enregistrement dans le navigateur.
    if (cloud) return cloud.sync.schedule(data);
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [data, cloud]);

  // Version réelle : modifications des autres membres reçues en direct ; modification refusée → version du serveur.
  useEffect(() => {
    if (!cloud) return;
    const { sync } = cloud;
    sync.onRejected = async (message, rows) => {
      setToast(`⚠️ Modification refusée par le serveur : ${message}`);
      const fresh = await sync.fetchRows(rows);
      setData((prev) => applyRows(prev, fresh, sync.posOf));
    };
    return sync.listen((rows) => setData((prev) => applyRows(prev, rows, sync.posOf)));
  }, [cloud]);

  const user = data.people.find((p) => p.id === userId && p.actif) ?? null;
  const myRoles = useMemo(() => userRoles(data.roles, user), [data.roles, user]);

  const login = useCallback((id: string | null) => {
    if (cloud) {
      if (!id) cloud.signOut();
      return;
    }
    setUserId(id);
    try {
      if (id) localStorage.setItem(USER_KEY, id);
      else localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }, [cloud]);

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
      const nextEmails = next ? emailsForNext(data, task, next) : [];

      update(
        (d) => {
          if (isNew) d.tasks.unshift(task);
          else d.tasks = d.tasks.map((x) => (x.id === task.id ? task : x));
          if (next) {
            d.tasks.unshift(next);
            // Tâche principale reconduite : les occurrences suivantes de ses tâches liées la rejoignent.
            d.tasks
              .filter((x) => x.parentId === task.id)
              .forEach((c) => {
                let x = c;
                for (let y = d.tasks.find((z) => z.id === x.suivanteId); y; y = d.tasks.find((z) => z.id === x.suivanteId)) x = y;
                if (x !== c && !x.parentId) x.parentId = next!.id;
              });
          }
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
    if (cloud) return;
    setData(makeSeed());
    clearFiles();
  }, [cloud]);

  const restore = useCallback(
    (d: AppData, label: string) => {
      const next = migrate(structuredClone(d));
      next.log.unshift({ id: uid('l'), at: new Date().toISOString(), userId: userId ?? '?', action: `Données restaurées depuis ${label}` });
      setData(next);
    },
    [userId],
  );

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

  const linkTask = useCallback(
    (taskId: string, parentId: string | undefined) => {
      const t = data.tasks.find((x) => x.id === taskId);
      const p = parentId ? data.tasks.find((x) => x.id === parentId) : data.tasks.find((x) => x.id === t?.parentId);
      if (!t) return;
      update((d) => {
        const x = d.tasks.find((y) => y.id === taskId);
        if (x) {
          x.parentId = parentId;
          x.updatedAt = new Date().toISOString();
        }
      }, parentId ? `Tâche « ${t.titre} » liée à « ${p?.titre ?? ''} »` : `Tâche « ${t.titre} » déliée de « ${p?.titre ?? ''} »`);
    },
    [update, data.tasks],
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

  const value: Store = {
    mode: cloud ? 'reel' : 'demo',
    cloud,
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
    linkTask,
    saveEmail,
    setEmailStatus,
    deleteEmail,
    reset,
    restore,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}

const noSync = () => () => {};
/** Version réelle : état de l'envoi au serveur (à jour, envoi en cours, hors ligne) et nombre d'éléments en attente. */
export function useSyncStatus() {
  const { cloud } = useStore();
  const sync = cloud?.sync;
  const status = useSyncExternalStore(sync ? sync.subscribe : noSync, () => (sync ? `${sync.status}:${sync.pendingCount}` : 'ok:0'));
  const [s, n] = status.split(':');
  return { status: s as CloudSync['status'], pending: Number(n) };
}
