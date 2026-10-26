import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { makeSeed } from './seed';
import { hasPermission, userRoles, voitTache } from './permissions';
import { applyDelaiRef, fmtDate, fullName, isDone, postesFor, today, uid } from './utils';
import type { ActivityNotif, AppData, OrgUnit, Permission, Person, Poll, Prefs, ScheduledEmail, Task, TaskDoc } from './types';
import { clearFiles, deleteFiles, getFile, saveFile } from './files';
import { avecSondages, avecVote, finSondage, sondageEnregistre } from './polls';
import { applyRows, pasDispoTache, pourInfoVu as vuServeur, prendreTache as prendreServeur, rattraper, type CloudSync } from './cloud';
import { useClubOptional } from './club';
import { autresResponsables, avecPartagees, estPartagee, idPartagee, texteAutres, versOrigine } from './partage';
import { ajouterVus, clesVu, encoreMontree, epurerPourInfo, pourMoi, recuePourMoi } from './pourInfo';
import { aPrendreOuverte, auteurAPrendre, epurerAPrendre, proposeeA } from './aPrendre';
import { suivreExternes, versEntite } from './externes';
import { migrate } from './migrate';
import { ajouterSuivante, idDe, preparerSuivante } from './suivante';
import type { CloudMode, DemoMode, Store } from './storeTypes';
import { useRecus } from './recus';
import { usePileAnnulation } from './pileAnnulation';

export type { CloudMode, DemoMode } from './storeTypes';

// Couche de données. Démo : tout vit en mémoire et dans le localStorage du navigateur.
// Version réelle : mêmes données, synchronisées avec le serveur par CloudSync (voir cloud.ts).
const KEY = 'taches-gsa-demo-v7';
const USER_KEY = 'taches-gsa-user';

const DEFAULT_PREFS: Prefs = { theme: 'auto', vueDefaut: 'mes', affichage: 'tableau' };

/** Tâches et sondages partagés par d'autres entités, sections ajoutées pour eux : affichés, jamais enregistrés ici. */
function sansPartagees(d: AppData) {
  d.tasks = d.tasks.filter((t) => !estPartagee(t.id));
  d.sections = d.sections.filter((s) => !estPartagee(s.id));
  if (d.polls) d.polls = d.polls.filter((p) => !estPartagee(p.id)).map(sondageEnregistre);
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

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, cloud = null, demo = null }: { children: ReactNode; cloud?: CloudMode | null; demo?: DemoMode | null }) {
  const [data, setData] = useState<AppData>(() => (cloud ? cloud.initial : demo ? demo.load() : load()));
  const [toast, setToast] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(() => {
    if (cloud) return cloud.personId;
    if (demo) return demo.personId;
    try {
      return localStorage.getItem(USER_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Version réelle : envoi des éléments modifiés au serveur ; démo : enregistrement dans le navigateur.
    if (cloud) return cloud.sync.schedule(data);
    if (demo) return demo.save(data);
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cloud]);

  // Démo : fiches de l'entité modifiées depuis le registre des membres du club : relues.
  const epoch = demo?.epoch;
  useEffect(() => {
    if (epoch && demo) setData(demo.load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  // Version réelle : modifications des autres membres reçues en direct ; modification refusée → version du serveur.
  // Fiches reçues du serveur : l'organigramme n'a pas à les faire suivre (voir plus bas).
  const distant = useRef(false);
  useEffect(() => {
    if (!cloud) return;
    const { sync } = cloud;
    sync.onRejected = async (message, rows) => {
      // Règle d'accès du serveur : élément d'un autre (ex. tâche confiée à quelqu'un d'autre entre-temps).
      const motif = /row-level security/i.test(message) ? 'tu n’as pas (ou plus) accès à cet élément' : message;
      setToast(`⚠️ Modification refusée par le serveur : ${motif}`);
      const fresh = await sync.fetchRows(rows);
      if (fresh.some((r) => r.kind === 'people')) distant.current = true;
      setData((prev) => applyRows(prev, fresh, sync.posOf));
    };
    return sync.listen((rows) => {
      if (rows.some((r) => r.kind === 'people')) distant.current = true;
      setData((prev) => applyRows(prev, rows, sync.posOf));
    });
  }, [cloud]);

  const club = useClubOptional();
  const clubRef = useRef(club);
  clubRef.current = club;

  // Version réelle, organigramme à glisser-déposer : personnes modifiées ici (fiche, console admin, import) → une fois
  // enregistrées, le serveur fait suivre les postes de l'entité et les postes liés (comme la démo, data/organigramme).
  const suivi = useRef<{ sig: string; people: Person[]; base: Person[] | null; timer?: ReturnType<typeof setTimeout>; file: Promise<void> }>({ sig: '', people: [], base: null, file: Promise.resolve() });
  useEffect(() => {
    if (!cloud) return;
    const s = suivi.current;
    const sig = JSON.stringify(data.people.map((p) => [p.id, p.actif, p.roles, p.poste, p.autresPostes, p.viaEntite]));
    const recu = distant.current;
    distant.current = false;
    const avant = s.people;
    const change = !!s.sig && sig !== s.sig;
    s.sig = sig;
    s.people = data.people;
    if (!change || recu || !data.postes) return;
    s.base ??= avant;
    clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      const base = s.base;
      s.base = null;
      if (!base) return;
      s.file = s.file
        .then(async () => {
          await cloud.sync.flushNow();
          await clubRef.current?.suivrePostes?.(base);
        })
        .catch(() => {});
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.people]);
  const moi = club?.current.id;
  // Tâches, « pour info », sondages et séances que d'autres entités du club partagent avec celle-ci (recus.ts).
  const { partagees, setPartagees, pourInfoRecus, sondagesRecus, setSondagesRecus, sondagesEntites, externes, chargerPartagees } = useRecus(club);

  const user = data.people.find((p) => p.id === userId && p.actif) ?? null;
  const myRoles = useMemo(() => userRoles(data.roles, user), [data.roles, user]);
  // Tâches partagées par d'autres entités : ajoutées aux données affichées (jamais enregistrées dans l'entité).
  const units = club?.units;
  const view = useMemo(() => {
    const avec = moi && units && partagees.length ? avecPartagees(data, partagees, moi, units) : data;
    return moi && units ? avecSondages(avec, sondagesRecus, moi, units, user?.id ?? null) : avec;
  }, [data, partagees, moi, units, sondagesRecus, user?.id]);

  const login = useCallback((id: string | null) => {
    if (cloud) {
      if (!id) cloud.signOut();
      return;
    }
    if (demo && !id) return demo.logout();
    setUserId(id);
    try {
      if (id) localStorage.setItem(USER_KEY, id);
      else localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud]);

  // « Annuler » / « Refaire » : chaque modification passe par etiqueter (pileAnnulation.ts).
  const { etiqueter, pile, aRefaire, annuler, refaire, oublier } = usePileAnnulation(data, setData, userId, setToast);

  const update = useCallback(
    (fn: (d: AppData) => void, action: string, o?: { annulable?: boolean }) => {
      setData((prev) => {
        const next = structuredClone(prev);
        fn(next);
        etiqueter(prev, next, o?.annulable === false ? { bloque: true } : { action });
        sansPartagees(next);
        // Les délais liés suivent automatiquement la date de leur événement / séance.
        next.tasks = next.tasks.map((t) => applyDelaiRef(next, t));
        next.log.unshift({ id: `l${Date.now()}${Math.random()}`, at: new Date().toISOString(), userId: userId ?? '?', action });
        next.log = next.log.slice(0, 300);
        return next;
      });
    },
    [userId, etiqueter],
  );

  const updateSilent = useCallback(
    (fn: (d: AppData) => void, o?: { annulable?: string; suite?: boolean }) => {
      setData((prev) => {
        const next = structuredClone(prev);
        fn(next);
        sansPartagees(next);
        etiqueter(prev, next, { action: o?.annulable, suite: o?.suite });
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );


  const prefs = { ...DEFAULT_PREFS, ...(userId ? data.prefs[userId] : {}) };

  const setPrefs = useCallback(
    (p: Partial<Prefs>) => {
      if (!userId) return;
      setData((prev) => ({ ...prev, prefs: { ...prev.prefs, [userId]: { ...DEFAULT_PREFS, ...prev.prefs[userId], ...p } } }));
    },
    [userId],
  );

  // Tâche partagée par une autre entité : enregistrée dans la sienne ; ici, le journal et les notifications.
  const savePartagee = useCallback(
    (t: Task) => {
      const c = clubRef.current;
      const x = partagees.find((p) => p.uniteId === t.source?.uniteId && p.task.id === t.source?.id);
      if (!c || !x || !moi) {
        setToast('⚠️ Cette tâche n’est plus partagée avec cette entité.');
        return Promise.resolve();
      }
      const before = view.tasks.find((y) => y.id === t.id);
      // À prendre (040) : proposée à d'autres personnes d'ici → c'est la personne connectée qui est prévenue des réponses.
      const proposees = (t.aPrendre?.personnes ?? []).filter((id) => !before?.aPrendre?.personnes.includes(id));
      if (proposees.length && userId) t = { ...t, aPrendre: { ...t.aPrendre!, par: userId } };
      const par = user ? `${fullName(user)} (${c.current.nom})` : c.current.nom;
      const next = versOrigine(x.task, t, x, { moi, statuses: data.statuses, people: data.people, units: c.units, par, aujourdhui: today(), meetings: data.meetings, centralId: c.central?.id });
      setPartagees((l) => l.map((p) => (p === x ? { ...p, task: next } : p)));
      const actor = userId ?? '?';
      const at = new Date().toISOString();
      const notifs: ActivityNotif[] = [];
      const push = (id: string, type: ActivityNotif['type']) => id !== actor && notifs.push({ id: uid('n'), userId: id, type, taskId: t.id, by: actor, at });
      t.responsables.filter((id) => !before?.responsables.includes(id)).forEach((id) => push(id, 'assign'));
      // Pour info et À prendre (040) : les personnes d'ici ajoutées sont prévenues, comme pour une tâche d'ici.
      (t.pourInfo?.personnes ?? []).filter((id) => !before?.pourInfo?.personnes?.includes(id)).forEach((id) => push(id, 'info'));
      if (aPrendreOuverte(t) && !isDone(data, t)) proposees.filter((id) => !t.responsables.includes(id)).forEach((id) => push(id, 'propose'));
      update((d) => {
        if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
      }, `Modification de la tâche « ${t.titre} » (partagée par ${x.unite})`, { annulable: false });
      // Tâche récurrente terminée ici (041) : son entité crée l'occurrence suivante.
      if (next.recurrence && !next.suivanteId && isDone(data, t) && !(before && isDone(data, before)))
        setToast(`🔁 « ${x.unite} » créera l’occurrence suivante (dès que l’un de ses membres ouvrira l’appli).`);
      return c
        .modifierTachePartagee(x.uniteId, next)
        .catch((e: Error) => setToast(`⚠️ Modification non enregistrée dans « ${x.unite} » : ${e.message}`))
        .finally(chargerPartagees);
    },
    [partagees, setPartagees, moi, view.tasks, user, data, userId, update, chargerPartagees],
  );

  const attribuerTache = useCallback(
    async (t: Task, cible: OrgUnit, sectionId: string, isNew: boolean) => {
      const c = clubRef.current;
      if (!c) throw new Error('Club introuvable');
      const st = data.statuses.find((s) => s.id === t.statusId);
      const x = versEntite(
        { ...t, titre: t.titre.trim() },
        { comite: c.current, cible, sectionId, people: data.people, meetings: data.meetings, moi: user, par: user ? fullName(user) : '', aujourdhui: today(), centralId: c.central?.id },
      );
      // Fichiers joints (rangés ici) : copiés dans le dossier de l'entité, comme déposés depuis la tâche partagée (041).
      const copies: TaskDoc[] = [];
      try {
        for (const d of (t.documents ?? []).filter((y) => y.kind === 'fichier')) {
          const blob = await getFile(d.id);
          if (!blob) throw new Error(`fichier « ${d.nom} » introuvable`);
          const id = `${cible.id}/pt-${uid('d')}`;
          await saveFile(id, blob);
          copies.push({ ...d, id });
        }
        await c.attribuerTache(cible.id, x, { label: st?.label ?? '', done: !!st?.done });
      } catch (e) {
        void deleteFiles(copies.map((d) => d.id));
        throw e;
      }
      // Puis joints à la tâche chez l'entité, comme depuis la tâche partagée.
      let erreur: string | undefined;
      if (copies.length) {
        try {
          const p = (await c.tachesPartagees()).find((y) => y.uniteId === cible.id && y.task.id === x.id);
          const vue = p && moi ? avecPartagees(data, [p], moi, c.units).tasks.find((y) => y.source?.id === x.id) : undefined;
          if (!p || !vue || !moi) throw new Error(`la tâche n’est pas visible ici depuis « ${cible.nom} »`);
          const par = user ? `${fullName(user)} (${c.current.nom})` : c.current.nom;
          const next = versOrigine(p.task, { ...vue, documents: [...(vue.documents ?? []), ...copies] }, p, { moi, statuses: data.statuses, people: data.people, units: c.units, par, aujourdhui: today(), meetings: data.meetings, centralId: c.central?.id });
          await c.modifierTachePartagee(cible.id, next);
        } catch (e) {
          erreur = (e as Error).message;
          void deleteFiles(copies.map((d) => d.id));
        }
      }
      // Responsables restés ceux d'ici (sans fiche chez elle) : prévenus comme pour une tâche partagée.
      const actor = userId ?? '?';
      const at = new Date().toISOString();
      const avant = isNew ? [] : (data.tasks.find((y) => y.id === t.id)?.responsables ?? []);
      const notifs: ActivityNotif[] = (x.respPartage?.[c.current.id] ?? [])
        .filter((id) => id !== actor && !avant.includes(id))
        .map((id) => ({ id: uid('n'), userId: id, type: 'assign', taskId: idPartagee(cible.id, x.id), by: actor, at }));
      update((d) => {
        if (!isNew) {
          d.tasks = d.tasks.filter((y) => y.id !== t.id);
          // Ses tâches liées restent ici, sans tâche principale ; les sondages liés restent, rattachés à sa section.
          d.tasks.forEach((y) => { if (y.parentId === t.id) y.parentId = undefined; });
          (d.polls ?? []).forEach((p) => {
            if (p.taskId === t.id) {
              p.taskId = undefined;
              p.sectionId = p.sectionId ?? t.sectionId;
            }
          });
        }
        if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
      }, `Tâche « ${x.titre} » ${isNew ? 'créée et ' : ''}enregistrée dans « ${cible.nom} » (partagée avec ${c.current.nom})`, { annulable: false });
      chargerPartagees();
      return { fichiers: erreur ? 0 : copies.length, erreur };
    },
    [data, moi, user, userId, update, chargerPartagees],
  );

  const saveTask = useCallback(
    (t: Task, isNew: boolean) => {
      if (t.source) return savePartagee(t);
      // Modifiée ici : ce n'est plus une entité du partage qui l'a modifiée en dernier.
      const task: Task = { ...t, updatedAt: new Date().toISOString(), modifiePar: undefined };
      task.pourInfo = task.paiement ? undefined : epurerPourInfo(task.pourInfo, task.responsables);
      task.aPrendre = task.paiement ? undefined : epurerAPrendre(task.aPrendre, task.responsables, task.respPartage);
      const before = data.tasks.find((x) => x.id === task.id);
      // Proposée à d'autres personnes : c'est la personne connectée qui est prévenue des réponses.
      if (task.aPrendre && userId && task.aPrendre.personnes.some((id) => !before?.aPrendre?.personnes.includes(id))) task.aPrendre.par = userId;
      // Une tâche récurrente retient les postes de ses responsables pour l'attribution suivante.
      task.postesResp = postesFor(data, task, before);

      // Date de clôture (pour le bilan de l'ordre du jour).
      if (!isDone(data, task)) task.termineeLe = undefined;
      else if (!(before && isDone(data, before))) task.termineeLe = new Date().toISOString().slice(0, 10);

      // Clôture d'une tâche récurrente → création de l'occurrence suivante (aussi : terminée depuis une entité du partage et
      // pas encore reconduite). Tâche annuelle liée à une séance : elle passe à la séance du même mois l'an prochain (créée
      // au besoin) ; tâche « à chaque séance » : à la séance suivante.
      const suite = task.recurrence && !task.suivanteId && isDone(data, task) && (!(before && isDone(data, before)) || !!before.modifiePar) ? preparerSuivante(data, task) : undefined;
      const next = suite?.next;
      const seance = suite?.seance;
      if (next) task.suivanteId = next.id;

      const who = next?.responsables.map((id) => fullName(data.people.find((p) => p.id === id))).join(', ') || (next?.aPrendre ? '🙋 à prendre' : '');

      // Notifications d'activité pour les autres responsables.
      const actor = userId ?? '?';
      const now = new Date().toISOString();
      const notifs: ActivityNotif[] = [];
      const push = (uidTo: string, type: ActivityNotif['type'], taskId: string, detail?: string) =>
        uidTo !== actor && notifs.push({ id: uid('n'), userId: uidTo, type, taskId, by: actor, at: now, detail });
      const added = task.responsables.filter((id) => !before?.responsables.includes(id));
      added.forEach((id) => push(id, 'assign', task.id));
      // Mentionnés pour info : prévenus une fois, quand on les ajoute.
      (task.pourInfo?.personnes ?? []).filter((id) => !before?.pourInfo?.personnes?.includes(id)).forEach((id) => push(id, 'info', task.id));
      // À prendre : les personnes à qui on la propose sont prévenues (tant qu'il reste une place et qu'elle n'est pas terminée).
      if (aPrendreOuverte(task) && !isDone(data, task))
        task.aPrendre!.personnes.filter((id) => !task.responsables.includes(id) && !before?.aPrendre?.personnes.includes(id)).forEach((id) => push(id, 'propose', task.id));
      if (before) {
        const st = data.statuses.find((x) => x.id === task.statusId)?.label;
        const detail =
          before.statusId !== task.statusId ? `statut : ${st}`
          : before.delai !== task.delai ? `délai : ${fmtDate(task.delai)}`
          : before.titre !== task.titre || before.remarque !== task.remarque ? 'contenu modifié'
          : undefined;
        if (detail) task.responsables.filter((id) => !added.includes(id)).forEach((id) => push(id, 'modif', task.id, detail));
      }
      next?.responsables.forEach((id) => push(id, 'recur', next!.id, next!.delai ? fmtDate(next!.delai) : undefined));
      next?.aPrendre?.personnes.filter((id) => !next!.responsables.includes(id)).forEach((id) => push(id, 'propose', next!.id));

      update(
        (d) => {
          if (isNew) d.tasks.unshift(task);
          else d.tasks = d.tasks.map((x) => (x.id === task.id ? task : x));
          if (suite) ajouterSuivante(d, task, suite);
          if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
        },
        `${isNew ? 'Création' : 'Modification'} de la tâche « ${t.titre} »` +
          (next ? ` — tâche récurrente : prochaine occurrence${next.delai ? ` le ${fmtDate(next.delai)}` : ''} pour ${who}` : '') +
          (seance ? `, séance « ${seance.meeting.titre} »${seance.nouvelle ? ' (ajoutée)' : ''}` : ''),
      );
      if (next) setToast(`🔁 Tâche récurrente reconduite${next.delai ? ` au ${fmtDate(next.delai)}` : ''} · ${who}${seance ? ` · 🗓️ ${seance.meeting.titre}` : ''}`);
    },
    [update, data, userId, savePartagee],
  );

  /**
   * Réponse à une tâche à prendre : « Je m'en charge » ou « Pas dispo ». Version réelle : le serveur vérifie et écrit d'un
   * coup (deux personnes en même temps : la seconde trouve la place prise ; rien d'autre n'est écrasé), puis la tâche
   * est relue ; démo : ici. Qui l'a proposée est prévenu. Tâche partagée (040) : réponse enregistrée dans son entité.
   */
  const repondre = useCallback(
    async (t: Task, prend: boolean) => {
      if (!user) throw new Error('Connecte-toi d’abord.');
      const x = (t.source ? view.tasks : data.tasks).find((y) => y.id === t.id);
      if (!x || !proposeeA(x, user.id)) throw new Error('Cette tâche ne t’est pas proposée.');
      if (x.responsables.includes(user.id)) {
        if (prend) return;
        throw new Error('Tu t’en charges déjà : retire-toi des responsables dans la tâche.');
      }
      if (prend && isDone(data, x)) throw new Error('Cette tâche est déjà terminée.');
      if (prend && !aPrendreOuverte(x)) throw new Error('Quelqu’un s’en charge déjà.');
      if (!prend && x.aPrendre?.refus?.includes(user.id)) return;
      const at = new Date().toISOString();
      // Tâche partagée : prévenue ici, la personne d'ici qui l'a proposée.
      const auteur = x.source ? x.aPrendre?.par : auteurAPrendre(x);
      const notifs: ActivityNotif[] = auteur && auteur !== user.id ? [{ id: uid('n'), userId: auteur, type: prend ? 'pris' : 'refus', taskId: x.id, by: user.id, at }] : [];
      const action = prend ? `${fullName(user)} se charge de la tâche « ${x.titre} »` : `${fullName(user)} n’est pas dispo pour la tâche « ${x.titre} »`;
      const c = clubRef.current;
      if (x.source) {
        const src = x.source;
        if (!c) throw new Error('Club introuvable');
        try {
          await c.repondreTachePartagee(src.uniteId, src.id, prend);
        } finally {
          chargerPartagees(); // réponse enregistrée (ou place prise entre-temps) : la tâche est relue
        }
        update((d) => {
          if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
        }, `${action} (partagée par ${src.unite})`, { annulable: false });
        return;
      }
      if (cloud && c) {
        await cloud.sync.flushNow();
        await (prend ? prendreServeur : pasDispoTache)(c.current.id, x.id).catch((e) => {
          rattraper(); // place prise entre-temps : la version du serveur est relue
          throw e;
        });
        const fresh = await cloud.sync.fetchRows([{ kind: 'tasks', id: x.id }]);
        setData((prev) => applyRows(prev, fresh, cloud.sync.posOf));
        update((d) => {
          if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
        }, action, { annulable: false });
        return;
      }
      update((d) => {
        d.tasks = d.tasks.map((y) => {
          if (y.id !== x.id || !y.aPrendre) return y;
          const refus = (y.aPrendre.refus ?? []).filter((id) => id !== user.id);
          if (!prend) refus.push(user.id);
          const aPrendre = { ...y.aPrendre, refus: refus.length ? refus : undefined };
          return { ...y, responsables: prend ? [...y.responsables, user.id] : y.responsables, aPrendre, updatedAt: at };
        });
        if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
      }, action, { annulable: false });
    },
    [user, data, view.tasks, cloud, update, chargerPartagees],
  );
  const prendreTache = useCallback((t: Task) => repondre(t, true), [repondre]);
  const pasDispo = useCallback((t: Task) => repondre(t, false), [repondre]);

  // « ✓ Vu » : version réelle, le serveur l'écrit sur la tâche (046 ; l'appli ne peut pas l'écrire elle-même), puis la
  // tâche est relue ; démo : ici. Tâche d'une autre entité : enregistré dans son entité.
  const vuPourInfo = useCallback(
    async (cle: string, tacheId: string, uniteId?: string) => {
      if (!user || !userId) return;
      setData((prev) => {
        const p = { ...DEFAULT_PREFS, ...prev.prefs[userId] };
        return p.pourInfoVus?.[cle] ? prev : { ...prev, prefs: { ...prev.prefs, [userId]: { ...p, pourInfoVus: { ...p.pourInfoVus, [cle]: today() } } } };
      });
      const c = clubRef.current;
      if (c && uniteId && uniteId !== c.current.id) {
        try {
          await c.vuPourInfo(uniteId, tacheId);
        } finally {
          chargerPartagees();
        }
        return;
      }
      const x = data.tasks.find((y) => y.id === tacheId);
      if (!x || !pourMoi(x, user.id) || x.pourInfoVus?.[`p:${user.id}`]) return;
      if (cloud) {
        if (!c) return;
        await cloud.sync.flushNow();
        await vuServeur(c.current.id, x.id, c.current.id);
        const fresh = await cloud.sync.fetchRows([{ kind: 'tasks', id: x.id }]);
        setData((prev) => applyRows(prev, fresh, cloud.sync.posOf));
        return;
      }
      const le = new Date().toISOString();
      update((d) => {
        d.tasks = d.tasks.map((y) => (y.id === x.id ? { ...y, pourInfoVus: ajouterVus(y.pourInfoVus, [`p:${user.id}`], le) } : y));
      }, `${fullName(user)} a vu la tâche « ${x.titre} » (pour info)`, { annulable: false });
    },
    [user, userId, data, cloud, update, chargerPartagees],
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
    clearFiles();
    if (demo) return demo.reset();
    setData(makeSeed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud]);

  const restore = useCallback(
    (d: AppData, label: string) => {
      const next = migrate(structuredClone(d));
      next.log.unshift({ id: uid('l'), at: new Date().toISOString(), userId: userId ?? '?', action: `Données restaurées depuis ${label}` });
      setData(next);
      oublier();
    },
    [userId, oublier],
  );

  const savePoll = useCallback(
    (poll: Poll, isNew: boolean) => {
      const p = sondageEnregistre(poll);
      update((d) => {
        d.polls = isNew ? [p, ...(d.polls ?? [])] : (d.polls ?? []).map((x) => (x.id === p.id ? p : x));
      }, `${isNew ? 'Création' : 'Modification'} du sondage « ${p.question} »`);
    },
    [update],
  );
  const votePoll = useCallback(
    (pollId: string, optionIds: string[], texte?: string) => {
      const p = view.polls?.find((x) => x.id === pollId);
      const cle = p?.cleMoi;
      if (!p || !cle) return;
      const src = p.source;
      if (src) {
        // Sondage d'une autre entité : la réponse s'enregistre dans son entité ; ici, le journal.
        const c = clubRef.current;
        if (!c) return;
        setSondagesRecus((l) => l.map((x) => (x.uniteId === src.uniteId && x.poll.id === src.id ? { ...x, poll: { ...x.poll, ...avecVote(x.poll, cle, optionIds, texte) } } : x)));
        update(() => {}, `Réponse au sondage « ${p.question} » (de « ${src.unite} »)`);
        c.voterSondagePartage(src.uniteId, src.id, optionIds, texte)
          .catch((e: Error) => setToast(`⚠️ Réponse non enregistrée dans « ${src.unite} » : ${e.message}`))
          .finally(chargerPartagees);
        return;
      }
      update((d) => {
        const x = d.polls?.find((y) => y.id === pollId);
        if (x) Object.assign(x, avecVote(x, cle, optionIds, texte));
      }, `Réponse au sondage « ${p.question} »`);
    },
    [update, view.polls, setSondagesRecus, chargerPartagees],
  );
  const closePoll = useCallback(
    (pollId: string, closed: boolean) => {
      const p = data.polls?.find((x) => x.id === pollId);
      update((d) => {
        const x = d.polls?.find((y) => y.id === pollId);
        if (!x) return;
        x.clotureLe = closed ? new Date().toISOString().slice(0, 10) : undefined;
        // Rouvrir un sondage clôturé automatiquement (date et heure limite passées) : on retire la date limite.
        if (!closed && (finSondage(x) ?? Infinity) <= Date.now()) {
          x.dateLimite = undefined;
          x.heureLimite = undefined;
          x.clotureAuto = undefined;
        }
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
      // Tâches partagées par une autre entité : pas de lien avec les tâches d'ici.
      if (!t || (parentId && !p)) return;
      update((d) => {
        const x = d.tasks.find((y) => y.id === taskId);
        if (x) {
          x.parentId = parentId;
          x.updatedAt = new Date().toISOString();
        }
      }, parentId ? `Tâche « ${t.titre} » rattachée à « ${p?.titre ?? ''} »` : `Tâche « ${t.titre} » détachée de « ${p?.titre ?? ''} »`);
    },
    [update, data.tasks],
  );

  // Avec les tâches partagées par d'autres entités (emails liés à « x:<entité>:<tâche> »).
  const taskTitle = (id: string) => view.tasks.find((t) => t.id === id)?.titre ?? '';
  const saveEmail = useCallback(
    (e: ScheduledEmail, isNew: boolean) =>
      update((d) => {
        d.emails = isNew ? [...(d.emails ?? []), e] : (d.emails ?? []).map((x) => (x.id === e.id ? e : x));
      }, `${isNew ? 'Email programmé' : 'Modification de l’email programmé'} « ${e.objet} » (tâche « ${taskTitle(e.taskId)} »)`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update, view.tasks],
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
    [update, data.emails, view.tasks, userId],
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
  const canEditTask = (t: Task) => can('tasks.editAny', t.sectionId) || (can('tasks.editOwn', t.sectionId) && isOwn(t));

  // « ✓ Vu » donnés avant que le serveur ne les enregistre sur la tâche (046) : reportés sur la tâche, une fois par
  // ouverture de l'appli (refusé, par exemple serveur pas encore à jour : pas retenté).
  const vusReportes = useRef(new Set<string>());
  const voitTout = can('tasks.viewAll');
  useEffect(() => {
    const vus = userId ? data.prefs[userId]?.pourInfoVus : undefined;
    if (!user || !moi || !vus) return;
    const aReporter = [
      ...view.tasks.filter((t) => vus[t.id] && pourMoi(t, user.id) && !t.pourInfoVus?.[`p:${user.id}`]).map((t) => ({ cle: t.id, tache: t.source?.id ?? t.id, unite: t.source?.uniteId })),
      ...pourInfoRecus
        .filter((x) => vus[`${x.uniteId}:${x.task.id}`] && clesVu(x.task, x.uniteId, moi, user.id, voitTout).some((k) => !x.task.pourInfoVus?.[k]))
        .map((x) => ({ cle: `${x.uniteId}:${x.task.id}`, tache: x.task.id, unite: x.uniteId })),
    ].filter((r) => !vusReportes.current.has(r.cle));
    for (const r of aReporter) {
      vusReportes.current.add(r.cle);
      vuPourInfo(r.cle, r.tache, r.unite).catch(() => {});
    }
  }, [user, userId, moi, data.prefs, view.tasks, pourInfoRecus, voitTout, vuPourInfo]);

  // Séance du comité dont l'entité dépend, événement d'une entité qui dépend d'elle : changé de nom ou de date → la copie
  // dans la tâche suit, et son délai lié aussi (update). Tâches en cours que l'on peut modifier ; une mise à jour refusée
  // par le serveur n'est pas retentée.
  const tentes = useRef(new Set<string>());
  useEffect(() => {
    if (!units || !user) return;
    const suivies = data.tasks.filter((t) => (t.seanceComite || t.evenementEntite) && !t.source && !isDone(data, t) && canEditTask(t));
    const suivis = suivreExternes(suivies, externes, units, today());
    for (const [id, patch] of suivis) {
      const cle = `${id}:${JSON.stringify(patch)}`;
      if (tentes.current.has(cle)) suivis.delete(id);
      else tentes.current.add(cle);
    }
    if (!suivis.size) return;
    const cibles = [...new Set([...suivis.values()].flatMap((p) => [p.seanceComite && `« ${p.seanceComite.titre} » (${fmtDate(p.seanceComite.date)})`, p.evenementEntite && `« ${p.evenementEntite.nom} »${p.evenementEntite.date ? ` (${fmtDate(p.evenementEntite.date)})` : ''}`]).filter(Boolean))];
    update((d) => {
      d.tasks = d.tasks.map((t) => (suivis.has(t.id) ? { ...t, ...suivis.get(t.id) } : t));
    }, `Changement suivi : ${cibles.join(', ')} → ${suivis.size} tâche${suivis.size > 1 ? 's' : ''} à jour`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.tasks, externes, units, myRoles, user?.id]);

  // Tâche récurrente terminée depuis une entité du partage (041) : l'occurrence suivante est créée ici, à l'ouverture de
  // l'appli par un membre qui peut la modifier. Identifiants fixes : deux appareils en même temps créent la même.
  useEffect(() => {
    if (!user) return;
    const finies = data.tasks.filter(
      (t) => t.recurrence && !t.suivanteId && t.modifiePar && !t.source && !t.paiement && isDone(data, t) && canEditTask(t) && !tentes.current.has(`r:${t.id}`),
    );
    if (!finies.length) return;
    finies.forEach((t) => tentes.current.add(`r:${t.id}`));
    const at = new Date().toISOString();
    const suites = finies.map((t) => {
      const task = { ...t, postesResp: postesFor(data, t, t) };
      return { task, suite: preparerSuivante(data, task, { tache: idDe('t', `${t.id}:suivante`), seance: idDe('m', `${t.id}:seance`) }) };
    });
    const notifs: ActivityNotif[] = suites.flatMap(({ suite: { next } }) => [
      ...next.responsables.filter((id) => id !== user.id).map((id) => ({ id: uid('n'), userId: id, type: 'recur' as const, taskId: next.id, by: user.id, at, detail: next.delai ? fmtDate(next.delai) : undefined })),
      ...(next.aPrendre?.personnes ?? []).filter((id) => id !== user.id && !next.responsables.includes(id)).map((id) => ({ id: uid('n'), userId: id, type: 'propose' as const, taskId: next.id, by: user.id, at })),
    ]);
    update((d) => {
      for (const { task, suite } of suites) {
        const x = d.tasks.find((y) => y.id === task.id);
        if (!x || x.suivanteId) continue;
        x.suivanteId = suite.next.id;
        x.postesResp = task.postesResp;
        ajouterSuivante(d, task, suite);
      }
      if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
    }, `Tâche${suites.length > 1 ? 's' : ''} récurrente${suites.length > 1 ? 's' : ''} terminée${suites.length > 1 ? 's' : ''} depuis une autre entité : ${suites.map(({ task, suite }) => `« ${task.titre} » → prochaine occurrence${suite.next.delai ? ` le ${fmtDate(suite.next.delai)}` : ''}`).join(', ')}`);
    setToast(`🔁 ${suites.length > 1 ? `${suites.length} tâches récurrentes terminées` : `« ${suites[0].task.titre} », terminée`} depuis une autre entité : occurrence suivante créée.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.tasks, data.statuses, myRoles, user?.id]);

  const value: Store = {
    mode: cloud ? 'reel' : 'demo',
    cloud,
    data: view,
    dataLocale: data,
    user,
    myRoles,
    can,
    canSeeTask: (t) => voitTache(t, user?.id, myRoles),
    canEditTask,
    canDeleteTask: (t) => !t.source && can('tasks.delete', t.sectionId),
    autresResp: (t) => (moi && units ? texteAutres(autresResponsables(t, moi, data.people, units)) : ''),
    canAssignOthers: (sec) => can('tasks.createAny', sec) || can('tasks.editAny', sec),
    creatableSections: () => data.sections.filter((s) => can('tasks.createAny', s.id) || can('tasks.editOwn', s.id)),
    prefs,
    login,
    update,
    updateSilent,
    annulable: pile[0] ? { action: pile[0].action, at: pile[0].at } : null,
    annuler,
    refaisable: aRefaire[0] ? { action: aRefaire[0].action, at: aRefaire[0].at } : null,
    refaire,
    setPrefs,
    saveTask,
    attribuerTache,
    prendreTache,
    pasDispo,
    vuPourInfo,
    toast,
    setToast,
    markNotifsRead,
    savePoll,
    votePoll,
    closePoll,
    deletePoll,
    canManagePoll: (p) => !!user && !p.source && (p.creePar === user.id || can('polls.manage')),
    sondagesEntites,
    externes,
    pourInfo: user && moi ? pourInfoRecus.filter((x) => recuePourMoi(x, moi, user.id, can('tasks.viewAll')) && encoreMontree(x) && !partagees.some((y) => y.uniteId === x.uniteId && y.task.id === x.task.id)) : [],
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
