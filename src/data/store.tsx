import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { makeSeed } from './seed';
import { statuses as STATUSES } from './seedData';
import { hasPermission, userRoles } from './permissions';
import { applyDelaiRef, fmtDate, fullName, isDone, nextOccurrence, postesFor, today, uid } from './utils';
import { seancePourSuivante } from './seances';
import type { ActivityNotif, AppData, ChecklistItem, Guest, Permission, Person, Poll, Prefs, Role, ScheduledEmail, Section, TachePartagee, Task } from './types';
import { clearFiles } from './files';
import { AUTRE_ID } from './polls';
import { snapshotToJournal } from './minutes';
import { emailsForNext } from './emails';
import { applyRows, GUEST_WRITABLE, type CloudSync, type Membership } from './cloud';
import type { Mode } from './mode';
import { useClubOptional } from './club';
import { autresResponsables, avecPartagees, estPartagee, texteAutres, versOrigine } from './partage';

// Couche de données. Démo : tout vit en mémoire et dans le localStorage du navigateur.
// Version réelle : mêmes données, synchronisées avec le serveur par CloudSync (voir cloud.ts).
const KEY = 'taches-gsa-demo-v7';
const USER_KEY = 'taches-gsa-user';

const DEFAULT_PREFS: Prefs = { theme: 'auto', vueDefaut: 'mes', affichage: 'tableau' };

export const SCHEMA = 16;

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
    // v10 : emails programmés.
    if (!d.emails) d.emails = [];
  }
  if ((d.schema ?? 7) < 11) simplifyStatuses(d);
  if ((d.schema ?? 7) < 12) linkSubtasks(d);
  if ((d.schema ?? 7) < 13) {
    // v13 : tickets à rembourser ; la caisse reçoit le droit de faire les virements (validation : admins).
    if (!d.roles.some((r) => r.permissions.includes('paiements.payer')))
      d.roles.filter((r) => r.id === 'caissier' || /caiss|trésor|tresor|financ/i.test(r.label)).forEach((r) => r.permissions.push('paiements.payer'));
  }
  // v14 : circuit caisse → visa ; les tickets « à valider » de la première version sont « reçus » par la caisse.
  if ((d.schema ?? 7) < 14) d.tasks.forEach((t) => { if (t.paiement && (t.paiement.etat as string) === 'a_valider') t.paiement.etat = 'recu'; });
  // v15 : chaque entité a sa caisse ; à défaut, un rôle « Caissier » (droits d'un membre du comité + caisse) à attribuer.
  if ((d.schema ?? 7) < 15 && !d.roles.some((r) => !r.locked && r.permissions.includes('paiements.payer'))) {
    const existant = d.roles.find((r) => r.id === 'caissier');
    if (existant) existant.permissions.push('paiements.payer');
    else {
      const membre = d.roles.find((r) => !r.locked && r.permissions.includes('tab.meetings'));
      const base: Permission[] = membre?.permissions.filter((p) => !p.startsWith('paiements.')) ?? ['tasks.viewAll', 'tasks.editOwn', 'tab.meetings', 'tab.events', 'tab.people'];
      d.roles.push({ id: 'caissier', label: 'Caissier', couleur: '#047857', permissions: [...base, 'paiements.payer'], sections: [] });
    }
  }
  // v16 : registre « Membres du club » ; le Secrétaire y a accès par défaut (les admins l'ont déjà).
  if ((d.schema ?? 7) < 16) d.roles.filter((r) => r.id === 'secretaire' && !r.permissions.includes('club.membres')).forEach((r) => r.permissions.push('club.membres'));
  d.schema = SCHEMA;
  return d;
}

/** Anciens statuts → statuts simplifiés (A valider → En cours, A discuter → À faire, Sans nouvelles → En attente, Info → Terminé). */
const STATUS_MAP: Record<string, string> = { s4: 's2', s5: 's1', s6: 's3', s8: 's7' };

/** v11 : statuts simplifiés (À faire, En cours, En attente, Terminé, Annulé) ; les tâches gardent leur avancement. */
function simplifyStatuses(d: AppData) {
  const known = new Set(STATUSES.map((s) => s.id));
  const sid = (id: string) => (known.has(id) ? id : STATUS_MAP[id] ?? STATUSES[0].id);
  d.tasks = d.tasks.map((t) => ({ ...t, statusId: sid(t.statusId) }));
  d.statuses = structuredClone(STATUSES);
  // Statuts exclus de l'ordre du jour : on retire ceux qui n'existent plus (exclure « Info » ne doit pas exclure « Terminé »).
  Object.values(d.prefs).forEach((p) => p.pv?.statutsExclus && (p.pv.statutsExclus = p.pv.statutsExclus.filter((id) => known.has(id))));
  d.log.unshift({ id: `l${Date.now()}v11`, at: new Date().toISOString(), userId: 'p1', action: 'Statuts simplifiés : À faire, En cours, En attente, Terminé, Annulé' });
}

/** Ancien format des sous-tâches (v10-v11) : personne chargée et délai propre. */
type OldItem = ChecklistItem & { assigneeId?: string; delai?: string; ref?: { type: 'event' | 'meeting'; id: string; joursAvant: number } };

/** v12 : une sous-tâche avec personne chargée ou délai devient une tâche liée ; les autres restent de simples cases à cocher. */
function linkSubtasks(d: AppData) {
  const doneId = d.statuses.find((s) => s.done)?.id ?? 's7';
  const openId = d.statuses.find((s) => !s.done)?.id ?? 's1';
  const now = new Date().toISOString();
  const strip = (c: OldItem): ChecklistItem => ({ id: c.id, label: c.label, done: c.done });
  const out: Task[] = [];
  for (const t of d.tasks) {
    const items = t.checklist as OldItem[];
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
  if (out.length !== d.tasks.length)
    d.log.unshift({ id: `l${Date.now()}v12`, at: now, userId: 'p1', action: 'Sous-tâches transformées en tâches liées à leur tâche principale' });
  d.tasks = out;
  d.notifications = (d.notifications ?? []).filter((n) => (n.type as string) !== 'subtask');
}

/** Tâches partagées par d'autres entités et sections ajoutées pour elles : affichées, jamais enregistrées ici. */
function sansPartagees(d: AppData) {
  d.tasks = d.tasks.filter((t) => !estPartagee(t.id));
  d.sections = d.sections.filter((s) => !estPartagee(s.id));
}

/** Droits d'un membre du comité central dans une entité qui lui est ouverte (jamais de suppression ni de gestion). */
function guestRole(g: Guest): Role {
  const write: Permission[] = g.niveau === 'ecriture' ? ['tasks.createAny', 'tasks.editAny'] : [];
  return {
    id: 'comite-central',
    label: g.niveau === 'ecriture' ? 'Comité central · modifier / ajouter' : 'Comité central · consultation',
    couleur: '#475569',
    permissions: ['tasks.viewAll', 'tab.meetings', 'tab.events', 'tab.people', ...write],
    sections: [],
  };
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

/** Démo : données de l'entité ouverte, gardées dans ce navigateur (voir demoClub.ts). */
export interface DemoMode {
  load: () => AppData;
  save: (d: AppData) => void;
  personId: string | null;
  logout: () => void;
  reset: () => void;
  /** Entité ouverte par un membre du comité central qui n'en fait pas partie. */
  guest?: Guest | null;
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

interface Store {
  mode: Mode;
  /** Version réelle (null en démo). */
  cloud: CloudMode | null;
  /** Membre du comité central qui consulte (ou complète) l'entité sans en faire partie ; null pour ses membres. */
  guest: Guest | null;
  data: AppData;
  /** Données de l'entité seules, sans les tâches partagées par d'autres entités (réglages, console admin). */
  dataLocale: AppData;
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

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, cloud = null, demo = null }: { children: ReactNode; cloud?: CloudMode | null; demo?: DemoMode | null }) {
  const [data, setData] = useState<AppData>(() => (cloud ? cloud.initial : demo ? demo.load() : load()));
  const [toast, setToast] = useState<string | null>(null);
  const guest = cloud?.membership.guest ?? demo?.guest ?? null;
  // Visiteur : ses réglages d'affichage restent dans cet onglet (rien n'est écrit dans l'entité).
  const [guestPrefs, setGuestPrefs] = useState<Partial<Prefs>>({});
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

  // Tâches que d'autres entités du club partagent avec celle-ci : relues à l'ouverture, au retour sur l'appli
  // et chaque minute (leurs modifications ne passent pas par la synchronisation de l'entité).
  const club = useClubOptional();
  const clubRef = useRef(club);
  clubRef.current = club;
  const moi = club?.current.id;
  const [partagees, setPartagees] = useState<TachePartagee[]>([]);
  const lecture = useRef(0);
  const chargerPartagees = useCallback(() => {
    const c = clubRef.current;
    if (!c || guest) return;
    const n = ++lecture.current;
    c.tachesPartagees()
      .then((l) => n === lecture.current && setPartagees(l))
      .catch(() => {});
  }, [guest]);
  useEffect(() => {
    chargerPartagees();
    const vis = () => document.visibilityState === 'visible' && chargerPartagees();
    const timer = setInterval(chargerPartagees, 60_000);
    window.addEventListener('focus', chargerPartagees);
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', chargerPartagees);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [chargerPartagees, moi]);

  const user = guest ? guest.person : data.people.find((p) => p.id === userId && p.actif) ?? null;
  const myRoles = useMemo(() => (guest ? [guestRole(guest)] : userRoles(data.roles, user)), [guest, data.roles, user]);
  // Visiteur : sa fiche s'ajoute aux données affichées (désactivée : ni assignable, ni dans la liste des membres)
  // pour que son nom s'affiche dans le journal et les tâches ; elle n'est jamais enregistrée.
  // Tâches partagées par d'autres entités : ajoutées aux données affichées (jamais enregistrées dans l'entité).
  const units = club?.units;
  const view = useMemo(() => {
    const base = guest ? { ...data, people: [...data.people, { ...guest.person, actif: false }] } : data;
    return moi && units && partagees.length ? avecPartagees(base, partagees, moi, units) : base;
  }, [data, guest, partagees, moi, units]);

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

  /** Visiteur : consultation seule (modification refusée), ou seulement les tâches et ce qui les accompagne. */
  const guestBlocked = useCallback(() => {
    if (guest?.niveau !== 'lecture') return false;
    setToast('👁 Consultation seule : cette entité ne permet pas au comité central de modifier ses données.');
    return true;
  }, [guest]);
  const keepGuestWrites = useCallback(
    (prev: AppData, next: AppData) => {
      if (!guest) return;
      const p = prev as unknown as Record<string, unknown>;
      const n = next as unknown as Record<string, unknown>;
      Object.keys(n).forEach((k) => !GUEST_WRITABLE.has(k) && (n[k] = p[k]));
    },
    [guest],
  );

  const update = useCallback(
    (fn: (d: AppData) => void, action: string) => {
      if (guestBlocked()) return;
      setData((prev) => {
        const next = structuredClone(prev);
        fn(next);
        keepGuestWrites(prev, next);
        sansPartagees(next);
        // Les délais liés suivent automatiquement la date de leur événement / séance.
        next.tasks = next.tasks.map((t) => applyDelaiRef(next, t));
        const by = guest ? ` — par ${fullName(guest.person)} (comité central)` : '';
        next.log.unshift({ id: `l${Date.now()}${Math.random()}`, at: new Date().toISOString(), userId: userId ?? '?', action: action + by });
        next.log = next.log.slice(0, 300);
        return next;
      });
    },
    [userId, guest, guestBlocked, keepGuestWrites],
  );

  const updateSilent = useCallback(
    (fn: (d: AppData) => void) => {
      if (guestBlocked()) return;
      setData((prev) => {
        const next = structuredClone(prev);
        fn(next);
        keepGuestWrites(prev, next);
        sansPartagees(next);
        return next;
      });
    },
    [guestBlocked, keepGuestWrites],
  );

  const prefs = guest ? { ...DEFAULT_PREFS, vueDefaut: 'toutes' as const, ...guestPrefs } : { ...DEFAULT_PREFS, ...(userId ? data.prefs[userId] : {}) };

  const setPrefs = useCallback(
    (p: Partial<Prefs>) => {
      if (guest) return setGuestPrefs((x) => ({ ...x, ...p }));
      if (!userId) return;
      setData((prev) => ({ ...prev, prefs: { ...prev.prefs, [userId]: { ...DEFAULT_PREFS, ...prev.prefs[userId], ...p } } }));
    },
    [userId, guest],
  );

  // Tâche partagée par une autre entité : enregistrée dans la sienne ; ici, le journal et les notifications.
  const savePartagee = useCallback(
    (t: Task) => {
      const c = clubRef.current;
      const x = partagees.find((p) => p.uniteId === t.source?.uniteId && p.task.id === t.source?.id);
      if (!c || !x || !moi) return setToast('⚠️ Cette tâche n’est plus partagée avec cette entité.');
      const before = view.tasks.find((y) => y.id === t.id);
      const par = user ? `${fullName(user)} (${c.current.nom})` : c.current.nom;
      const next = versOrigine(x.task, t, x, { moi, statuses: data.statuses, people: data.people, units: c.units, par, aujourdhui: today() });
      setPartagees((l) => l.map((p) => (p === x ? { ...p, task: next } : p)));
      const actor = userId ?? '?';
      const at = new Date().toISOString();
      const notifs: ActivityNotif[] = t.responsables
        .filter((id) => id !== actor && !before?.responsables.includes(id))
        .map((id) => ({ id: uid('n'), userId: id, type: 'assign', taskId: t.id, by: actor, at }));
      update((d) => {
        if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
      }, `Modification de la tâche « ${t.titre} » (partagée par ${x.unite})`);
      c.modifierTachePartagee(x.uniteId, next)
        .catch((e: Error) => setToast(`⚠️ Modification non enregistrée dans « ${x.unite} » : ${e.message}`))
        .finally(chargerPartagees);
    },
    [partagees, moi, view.tasks, user, data.statuses, data.people, userId, update, chargerPartagees],
  );

  const saveTask = useCallback(
    (t: Task, isNew: boolean) => {
      if (t.source) return savePartagee(t);
      // Modifiée ici : ce n'est plus une entité du partage qui l'a modifiée en dernier.
      const task: Task = { ...t, updatedAt: new Date().toISOString(), modifiePar: undefined };
      if (guest && isNew) task.parCentral = fullName(guest.person);
      const before = data.tasks.find((x) => x.id === task.id);
      // Une tâche récurrente retient les postes de ses responsables pour l'attribution suivante.
      task.postesResp = postesFor(data, task, before);

      // Date de clôture (pour le bilan de l'ordre du jour).
      if (!isDone(data, task)) task.termineeLe = undefined;
      else if (!(before && isDone(data, before))) task.termineeLe = new Date().toISOString().slice(0, 10);

      // Clôture d'une tâche récurrente → création de l'occurrence suivante.
      let next: Task | undefined;
      let seance: ReturnType<typeof seancePourSuivante>;
      if (task.recurrence && !task.suivanteId && isDone(data, task) && !(before && isDone(data, before))) {
        // Tâche annuelle liée à une séance : elle passe à la séance du même mois l'an prochain (créée au besoin,
        // sauf par un invité du comité central qui ne peut pas ajouter de séance).
        seance = seancePourSuivante(data, task);
        if (seance?.nouvelle && guest) seance = undefined;
        next = nextOccurrence(data, task, seance?.meeting);
        task.suivanteId = next.id;
      }

      const who = next?.responsables.map((id) => fullName(data.people.find((p) => p.id === id))).join(', ');

      // Notifications d'activité pour les autres responsables.
      const actor = userId ?? '?';
      const now = new Date().toISOString();
      const notifs: ActivityNotif[] = [];
      const byName = guest ? `${fullName(guest.person)} (comité central)` : undefined;
      const push = (uidTo: string, type: ActivityNotif['type'], taskId: string, detail?: string) =>
        uidTo !== actor && notifs.push({ id: uid('n'), userId: uidTo, type, taskId, by: actor, byName, at: now, detail });
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
            let suivante = next;
            if (seance?.nouvelle) {
              // Ajoutée entre-temps (deux tâches clôturées d'affilée) : la tâche rejoint celle-ci.
              const deja = d.meetings.find((m) => !m.unique && m.date.slice(0, 7) === seance!.meeting.date.slice(0, 7));
              if (!deja) d.meetings.push(seance.meeting);
              else suivante = applyDelaiRef(d, { ...next, meetingId: deja.id });
            }
            d.tasks.unshift(suivante);
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
          (next ? ` — tâche récurrente : prochaine occurrence le ${fmtDate(next.delai)} pour ${who}` : '') +
          (seance ? `, séance « ${seance.meeting.titre} »${seance.nouvelle ? ' (ajoutée)' : ''}` : ''),
      );
      if (next) setToast(`🔁 Tâche récurrente reconduite au ${fmtDate(next.delai)} · ${who}${seance ? ` · 🗓️ ${seance.meeting.titre}` : ''}`);
    },
    [update, data, userId, guest, savePartagee],
  );

  const markNotifsRead = useCallback(
    (keys: string[]) => {
      if (!userId || !keys.length || guest) return;
      setData((prev) => {
        const seen = new Set(prev.notifLues?.[userId] ?? []);
        if (keys.every((k) => seen.has(k))) return prev;
        keys.forEach((k) => seen.add(k));
        return { ...prev, notifLues: { ...prev.notifLues, [userId]: [...seen].slice(-800) } };
      });
    },
    [userId, guest],
  );

  const reset = useCallback(() => {
    if (cloud || guest) return;
    clearFiles();
    if (demo) return demo.reset();
    setData(makeSeed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, guest]);

  const restore = useCallback(
    (d: AppData, label: string) => {
      if (guest) return;
      const next = migrate(structuredClone(d));
      next.log.unshift({ id: uid('l'), at: new Date().toISOString(), userId: userId ?? '?', action: `Données restaurées depuis ${label}` });
      setData(next);
    },
    [userId, guest],
  );

  const savePoll = useCallback(
    (p: Poll, isNew: boolean) =>
      update((d) => {
        d.polls = isNew ? [p, ...(d.polls ?? [])] : (d.polls ?? []).map((x) => (x.id === p.id ? p : x));
      }, `${isNew ? 'Création' : 'Modification'} du sondage « ${p.question} »`),
    [update],
  );
  const votePoll = useCallback(
    (pollId: string, optionIds: string[], texte?: string) => {
      if (!userId) return;
      const p = data.polls?.find((x) => x.id === pollId);
      update((d) => {
        const x = d.polls?.find((y) => y.id === pollId);
        if (!x) return;
        x.votes = { ...x.votes, [userId]: optionIds };
        const textes = { ...x.textes };
        if (texte?.trim() && optionIds.includes(AUTRE_ID)) textes[userId] = texte.trim();
        else delete textes[userId];
        x.textes = textes;
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
      // Tâches partagées par une autre entité : pas de lien avec les tâches d'ici.
      if (!t || (parentId && !p)) return;
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
    guest,
    data: view,
    dataLocale: data,
    user,
    myRoles,
    can,
    // Remboursements et paiements : vus aussi de leur demandeur et de la caisse.
    canSeeTask: (t) =>
      (!!user && (t.responsables.includes(user.id) || t.paiement?.demandePar === user.id)) || can('tasks.viewAll', t.sectionId) || (!!t.paiement && can('paiements.payer')),
    canEditTask: (t) => can('tasks.editAny', t.sectionId) || (can('tasks.editOwn', t.sectionId) && isOwn(t)),
    canDeleteTask: (t) => !t.source && can('tasks.delete', t.sectionId),
    autresResp: (t) => (moi && units ? texteAutres(autresResponsables(t, moi, data.people, units)) : ''),
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
