import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { makeSeed } from './seed';
import type { AppData, Permission, Person, Prefs, Task } from './types';

// Couche de données de la démo : tout vit en mémoire et dans le localStorage du navigateur.
// Pour passer à une vraie base (ex. Supabase), seul ce fichier devra être remplacé.
const KEY = 'taches-gsa-demo-v1';
const USER_KEY = 'taches-gsa-user';

const DEFAULT_PREFS: Prefs = { theme: 'auto', vueDefaut: 'mes', affichage: 'tableau' };

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* stockage indisponible : on repart des données fictives */
  }
  return makeSeed();
}

interface Store {
  data: AppData;
  user: Person | null;
  perms: Permission[];
  can: (p: Permission) => boolean;
  prefs: Prefs;
  login: (id: string | null) => void;
  /** Applique une modification et l'inscrit au journal d'activité. */
  update: (fn: (d: AppData) => void, action: string) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  saveTask: (t: Task, isNew: boolean) => void;
  reset: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);
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
  const perms = useMemo<Permission[]>(() => {
    if (!user) return [];
    const list = data.permissions[user.role] ?? [];
    // L'admin garde toujours l'accès à la console pour ne pas se bloquer.
    return user.role === 'admin' ? Array.from(new Set<Permission>([...list, 'admin.access'])) : list;
  }, [user, data.permissions]);

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
        next.log.unshift({ id: `l${Date.now()}${Math.random()}`, at: new Date().toISOString(), userId: userId ?? '?', action });
        next.log = next.log.slice(0, 300);
        return next;
      });
    },
    [userId],
  );

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
      const task = { ...t, updatedAt: new Date().toISOString() };
      update((d) => {
        if (isNew) d.tasks.unshift(task);
        else d.tasks = d.tasks.map((x) => (x.id === task.id ? task : x));
      }, `${isNew ? 'Création' : 'Modification'} de la tâche « ${t.titre} »`);
    },
    [update],
  );

  const reset = useCallback(() => {
    setData(makeSeed());
  }, []);

  const value: Store = {
    data,
    user,
    perms,
    can: (p) => perms.includes(p),
    prefs,
    login,
    update,
    setPrefs,
    saveTask,
    reset,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}
