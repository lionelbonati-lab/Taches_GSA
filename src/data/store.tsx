import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { makeSeed } from './seed';
import { hasPermission, litDiscussion, userRoles, voitTache } from './permissions';
import { applyDelaiRef, fmtDate, fullName, isDone, peutRattacherA, postesFor, today, uid } from './utils';
import type { ActivityNotif, AppData, Permission, Poll, Prefs, ScheduledEmail, Task } from './types';
import { clearFiles } from './files';
import { avecVote, finSondage, sondageEnregistre } from './polls';
import { ajouterADiscussion as ajouterServeur, applyRows, commenterEtiquette as commenterEtiquetteServeur, commenterTache, pasDispoTache, pourInfoVu as vuServeur, prendreTache as prendreServeur, rattraper, type CloudSync } from './cloud';
import { useClubOptional } from './club';
import { ajouterVus, cleVu, dernierAttendu, epurerPourInfo, pourMoi, vuAvantModif } from './pourInfo';
import { changementsTache } from './historique';
import { aPrendreOuverte, auteurAPrendre, epurerAPrendre, proposeeA } from './aPrendre';
import { migrate } from './migrate';
import { ajouterSuivante, preparerSuivante } from './suivante';
import type { CloudMode, DemoMode, Store } from './storeTypes';
import { ajouteesDe, appliquerCommentaire, cleEtiquette, commentairesDe, commentairesEtiquette, COMMENTAIRES_ETIQUETTE_MAX, destinatairesCommentaire, notifsCommentaire, type ActionCommentaire } from './commentaires';
import { usePileAnnulation } from './pileAnnulation';
import { StoreCtx } from './storeCtx';
import { etiquettesDesLieux, lieuxDe, suivreLieux, synchroniserEtiquettes } from './etiquettes';

export type { CloudMode, DemoMode } from './storeTypes';

// Couche de données de l'espace du club (un seul espace : PLAN_APPLI_SIMPLE.md). Démo : tout vit en mémoire et dans le
// localStorage du navigateur (demoClub.ts). Version réelle : mêmes données, synchronisées avec le serveur par CloudSync
// (voir cloud.ts).

export const DEFAULT_PREFS: Prefs = { theme: 'auto', vueDefaut: 'mes', affichage: 'tableau' };

/** Les 300 notifications d'activité les plus récentes suffisent. */
const avecNotifs = (d: AppData, notifs: ActivityNotif[]) => {
  if (notifs.length) d.notifications = [...notifs, ...(d.notifications ?? [])].slice(0, 300);
};

export function StoreProvider({ children, cloud = null, demo = null }: { children?: ReactNode; cloud?: CloudMode | null; demo?: DemoMode | null }) {
  const [data, setData] = useState<AppData>(() => (cloud ? cloud.initial : demo ? demo.load() : makeSeed()));
  const [toast, setToast] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(() => cloud?.personId ?? demo?.personId ?? null);

  useEffect(() => {
    // Version réelle : envoi des éléments modifiés au serveur ; démo : enregistrement dans le navigateur.
    if (cloud) return cloud.sync.schedule(data);
    if (demo) demo.save(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cloud]);

  // Démo : fiches modifiées depuis « Personnes du club » : relues.
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
      // Règle d'accès du serveur : élément d'un autre (ex. tâche confiée à quelqu'un d'autre entre-temps).
      const motif = /row-level security/i.test(message) ? 'tu n’as pas (ou plus) accès à cet élément' : message;
      setToast(`⚠️ Modification refusée par le serveur : ${motif}`);
      const fresh = await sync.fetchRows(rows);
      setData((prev) => applyRows(prev, fresh, sync.posOf));
    };
    // Élément modifié en même temps par quelqu'un d'autre : les deux versions réunies (cloud.ts, fusion.ts). Rien n'est
    // perdu sans le dire : un même champ changé des deux côtés, ou un élément supprimé par l'autre, est signalé.
    sync.onFusion = (rows, sorte) => {
      setData((prev) => applyRows(prev, rows, sync.posOf));
      if (sorte === 'conflit') setToast('⚠️ Modifié en même temps par quelqu’un d’autre : les deux versions ont été réunies, ta saisie l’emporte là où vous avez changé la même chose. Vérifie le résultat.');
      else if (sorte === 'efface') setToast('⚠️ Cet élément a été supprimé entre-temps par quelqu’un d’autre : ta modification n’a pas été gardée.');
    };
    return sync.listen((rows) => setData((prev) => applyRows(prev, rows, sync.posOf)));
  }, [cloud]);

  const club = useClubOptional();
  const clubRef = useRef(club);
  clubRef.current = club;
  /** Version réelle : l'espace sur le serveur. */
  const espaceId = cloud?.membership.committeeId ?? '';

  const user = data.people.find((p) => p.id === userId && p.actif) ?? null;
  const myRoles = userRoles(data.roles, user);

  const login = useCallback((id: string | null) => {
    if (cloud) {
      if (!id) cloud.signOut();
      return;
    }
    if (demo && !id) return demo.logout();
    setUserId(id);
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
        // Les étiquettes suivent leur événement ou leur section ; celles d'office, la place des points (etiquettes.ts).
        synchroniserEtiquettes(next);
        suivreLieux(prev, next);
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
        etiqueter(prev, next, { action: o?.annulable, suite: o?.suite });
        synchroniserEtiquettes(next);
        suivreLieux(prev, next);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const prefs: Prefs = { ...DEFAULT_PREFS, ...(userId ? data.prefs[userId] : {}) };

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
      task.pourInfo = task.paiement ? undefined : epurerPourInfo(task.pourInfo, task.responsables);
      task.aPrendre = task.paiement ? undefined : epurerAPrendre(task.aPrendre, task.responsables);
      if (!task.etiquettes?.length) task.etiquettes = undefined;
      const before = data.tasks.find((x) => x.id === task.id);
      // Écrits par le serveur (discussion, « Vu ») : ceux de la tâche enregistrée, pas ceux de la fenêtre ouverte plus tôt.
      task.commentaires = isNew ? undefined : before?.commentaires;
      task.pourInfoVus = isNew ? undefined : before?.pourInfoVus;
      // Contenu modifié (pas seulement « Pour info ») : ceux qui l'avaient marquée « ✓ Vu » voient qu'elle a changé (052).
      const changes = isNew ? null : changementsTache(before, task);
      task.contenuLe = changes && Object.keys(changes.champs).some((k) => k !== 'pourInfo') ? task.updatedAt : before?.contenuLe;
      // Proposée à d'autres personnes : c'est la personne connectée qui est prévenue des réponses.
      if (task.aPrendre && userId && task.aPrendre.personnes.some((id) => !before?.aPrendre?.personnes.includes(id))) task.aPrendre.par = userId;
      // Une tâche récurrente retient les postes de ses responsables pour l'attribution suivante.
      task.postesResp = postesFor(data, task, before);

      // Date de clôture (pour le bilan de l'ordre du jour).
      // Terminée depuis le PV d'une séance passée (le corriger, c'est être le soir de la séance) : le jour de la séance,
      // donné par le PV ; sinon aujourd'hui.
      if (!isDone(data, task)) task.termineeLe = undefined;
      else if (!(before && isDone(data, before))) task.termineeLe = task.termineeLe ?? today();

      // Clôture d'une tâche récurrente → création de l'occurrence suivante. Tâche annuelle liée à une séance : elle passe à
      // la séance du même mois l'an prochain (créée au besoin) ; tâche « à chaque séance » : à la séance suivante.
      const suite = task.recurrence && !task.suivanteId && isDone(data, task) && !(before && isDone(data, before)) ? preparerSuivante(data, task) : undefined;
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
          avecNotifs(d, notifs);
        },
        `${isNew ? 'Création' : 'Modification'} du point « ${t.titre} »` +
          (next ? ` — point récurrent : prochaine occurrence${next.delai ? ` le ${fmtDate(next.delai)}` : ''} pour ${who}` : '') +
          (seance ? `, séance « ${seance.meeting.titre} »${seance.nouvelle ? ' (ajoutée)' : ''}` : ''),
      );
      if (next) setToast(`🔁 Point récurrent reconduit${next.delai ? ` au ${fmtDate(next.delai)}` : ''} · ${who}${seance ? ` · 🗓️ ${seance.meeting.titre}` : ''}`);
    },
    [update, data, userId],
  );

  /**
   * Réponse à une tâche à prendre : « Je m'en charge » ou « Pas dispo ». Version réelle : le serveur vérifie et écrit d'un
   * coup (deux personnes en même temps : la seconde trouve la place prise ; rien d'autre n'est écrasé), puis la tâche
   * est relue ; démo : ici. Qui l'a proposée est prévenu.
   */
  const repondre = useCallback(
    async (t: Task, prend: boolean) => {
      if (!user) throw new Error('Connecte-toi d’abord.');
      const x = data.tasks.find((y) => y.id === t.id);
      if (!x || !proposeeA(x, user.id)) throw new Error('Ce point ne t’est pas proposé.');
      if (x.responsables.includes(user.id)) {
        if (prend) return;
        throw new Error('Tu t’en charges déjà : retire-toi des responsables dans le point.');
      }
      if (prend && isDone(data, x)) throw new Error('Ce point est déjà terminé.');
      if (prend && !aPrendreOuverte(x)) throw new Error('Quelqu’un s’en charge déjà.');
      if (!prend && x.aPrendre?.refus?.includes(user.id)) return;
      const at = new Date().toISOString();
      const auteur = auteurAPrendre(x);
      const notifs: ActivityNotif[] = auteur && auteur !== user.id ? [{ id: uid('n'), userId: auteur, type: prend ? 'pris' : 'refus', taskId: x.id, by: user.id, at }] : [];
      const action = prend ? `${fullName(user)} se charge du point « ${x.titre} »` : `${fullName(user)} n’est pas dispo pour le point « ${x.titre} »`;
      if (cloud) {
        await cloud.sync.flushNow();
        await (prend ? prendreServeur : pasDispoTache)(espaceId, x.id).catch((e) => {
          rattraper(); // place prise entre-temps : la version du serveur est relue
          throw e;
        });
        const fresh = await cloud.sync.fetchRows([{ kind: 'tasks', id: x.id }]);
        setData((prev) => applyRows(prev, fresh, cloud.sync.posOf));
        update((d) => avecNotifs(d, notifs), action, { annulable: false });
        return;
      }
      update((d) => {
        d.tasks = d.tasks.map((y) => {
          if (y.id !== x.id || !y.aPrendre) return y;
          const refus = (y.aPrendre.refus ?? []).filter((id) => id !== user.id);
          if (!prend) refus.push(user.id);
          const aPrendre = { ...y.aPrendre, refus: refus.length ? refus : undefined };
          return { ...y, responsables: prend ? [...y.responsables, user.id] : y.responsables, aPrendre, updatedAt: at, contenuLe: at };
        });
        avecNotifs(d, notifs);
      }, action, { annulable: false });
    },
    [user, data, cloud, update, espaceId],
  );
  const prendreTache = useCallback((t: Task) => repondre(t, true), [repondre]);
  const pasDispo = useCallback((t: Task) => repondre(t, false), [repondre]);

  // « ✓ Vu » : version réelle, le serveur l'écrit sur la tâche (046 ; l'appli ne peut pas l'écrire elle-même), puis la
  // tâche est relue ; démo : ici.
  const vuPourInfo = useCallback(
    async (tacheId: string) => {
      if (!user || !userId) return;
      setData((prev) => {
        const p = { ...DEFAULT_PREFS, ...prev.prefs[userId] };
        return p.pourInfoVus?.[tacheId] ? prev : { ...prev, prefs: { ...prev.prefs, [userId]: { ...p, pourInfoVus: { ...p.pourInfoVus, [tacheId]: today() } } } };
      });
      const x = data.tasks.find((y) => y.id === tacheId);
      // Déjà vue, sauf si elle a changé depuis (052 : revue).
      const cle = cleVu(user.id);
      const deja = x?.pourInfoVus?.[cle];
      if (!x || !pourMoi(x, user.id) || (deja && !vuAvantModif(deja, x))) return;
      if (cloud) {
        await cloud.sync.flushNow();
        await vuServeur(espaceId, x.id, espaceId);
        const fresh = await cloud.sync.fetchRows([{ kind: 'tasks', id: x.id }]);
        setData((prev) => applyRows(prev, fresh, cloud.sync.posOf));
        return;
      }
      const le = new Date().toISOString();
      // Dernier « ✓ Vu » attendu : l'auteur est prévenu (version réelle : le serveur, 052).
      const c = clubRef.current;
      const attendus = c && !deja ? (await c.suiviPourInfo([x.id]).catch(() => null))?.[x.id] : undefined;
      const auteur = x.createdBy !== user.id && data.people.some((p) => p.id === x.createdBy && p.actif) ? x.createdBy : undefined;
      const toutVu = !!auteur && !!attendus && dernierAttendu(x.pourInfoVus, ajouterVus(x.pourInfoVus, [cle], le), attendus);
      update((d) => {
        d.tasks = d.tasks.map((y) => (y.id === x.id ? { ...y, pourInfoVus: ajouterVus(y.pourInfoVus, [cle], le, y.contenuLe) } : y));
        if (toutVu) avecNotifs(d, [{ id: uid('n'), userId: auteur!, type: 'toutVu', taskId: x.id, by: user.id, at: le, titre: x.titre }]);
      }, `${fullName(user)} a ${deja ? 'revu' : 'vu'} le point « ${x.titre} » (pour info)`, { annulable: false });
    },
    [user, userId, data, cloud, update, espaceId],
  );

  // Discussion (049, à part de la tâche depuis 062) : version réelle, le serveur écrit le commentaire et prévient les
  // personnes concernées, puis la discussion est relue (et la tâche, tant que le serveur garde les messages dedans) ;
  // démo : ici, mêmes règles (tâche étiquetée : membres de ses étiquettes seulement).
  const commenter = useCallback(
    async (tacheId: string, a: ActionCommentaire) => {
      if (!user) throw new Error('Connecte-toi d’abord.');
      const le = new Date().toISOString();
      const x = data.tasks.find((y) => y.id === tacheId);
      if (!x) throw new Error('Point introuvable');
      if (cloud) {
        await cloud.sync.flushNow();
        await commenterTache(espaceId, x.id, espaceId, a);
        const fresh = await cloud.sync.fetchRows([{ kind: 'discussions', id: x.id }, { kind: 'tasks', id: x.id }]);
        setData((prev) => applyRows(prev, fresh, cloud.sync.posOf));
        return;
      }
      if (x.paiement) throw new Error('Pas de discussion sur un ticket de paiement');
      const ajoutees = ajouteesDe(data, x);
      if (!litDiscussion(x, user.id, myRoles, data.etiquettes, ajoutees)) throw new Error('Discussion réservée aux membres de l’étiquette');
      const avant = commentairesDe(data, x);
      const commentaires = appliquerCommentaire(avant, a, { moi: user.id, nom: fullName(user), admin: hasPermission(myRoles, 'admin.access'), le });
      const notifs = a.cle
        ? []
        : notifsCommentaire(
            destinatairesCommentaire(x, avant, user.id, data.etiquettes, ajoutees).filter((id) => data.people.some((p) => p.id === id && p.actif)),
            { tache: x.id, titre: x.titre, moi: user.id, texte: a.texte ?? '', le },
          );
      update((d) => {
        d.discussions = { ...d.discussions, [x.id]: { ...d.discussions?.[x.id], tache: x.id, commentaires } };
        // Messages d'avant 062 restés dans la tâche : ils sont maintenant dans sa discussion.
        if (x.commentaires) d.tasks = d.tasks.map((y) => (y.id === x.id ? { ...y, commentaires: undefined } : y));
        avecNotifs(d, notifs);
      }, `${fullName(user)} a ${a.supprimer ? 'retiré un commentaire de' : a.cle ? 'corrigé un commentaire sur' : 'commenté'} le point « ${x.titre} »`, { annulable: false });
    },
    [user, data, cloud, update, myRoles, espaceId],
  );

  // Discussion d'une étiquette (066) : version réelle, le serveur écrit le message et prévient les autres membres, puis la
  // discussion est relue ; démo : ici, mêmes règles (membres de l'étiquette seulement).
  const commenterEtiquette = useCallback(
    async (etiquetteId: string, a: ActionCommentaire) => {
      if (!user) throw new Error('Connecte-toi d’abord.');
      const e = data.etiquettes?.find((x) => x.id === etiquetteId);
      if (!e) throw new Error('Étiquette introuvable');
      const cle = cleEtiquette(e.id);
      if (cloud) {
        await cloud.sync.flushNow();
        await commenterEtiquetteServeur(espaceId, e.id, a);
        const fresh = await cloud.sync.fetchRows([{ kind: 'discussions', id: cle }]);
        setData((prev) => applyRows(prev, fresh, cloud.sync.posOf));
        return;
      }
      if (!e.membres?.includes(user.id)) throw new Error('Discussion réservée aux membres de l’étiquette');
      const le = new Date().toISOString();
      const avant = commentairesEtiquette(data, e.id);
      // Les 500 derniers messages sont gardés.
      const garde = !a.cle && avant.length >= COMMENTAIRES_ETIQUETTE_MAX ? avant.slice(1) : avant;
      const commentaires = appliquerCommentaire(garde, a, { moi: user.id, nom: fullName(user), admin: hasPermission(myRoles, 'admin.access'), le });
      const notifs = a.cle
        ? []
        : notifsCommentaire(
            e.membres.filter((id) => id !== user.id && data.people.some((p) => p.id === id && p.actif)),
            { tache: cle, titre: e.nom, moi: user.id, texte: a.texte ?? '', le },
          );
      update((d) => {
        d.discussions = { ...d.discussions, [cle]: { etiquette: e.id, commentaires } };
        avecNotifs(d, notifs);
      }, `${fullName(user)} a ${a.supprimer ? 'retiré un message de' : a.cle ? 'corrigé un message de' : 'écrit dans'} la discussion de « ${e.nom} »`, { annulable: false });
    },
    [user, data, cloud, update, myRoles, espaceId],
  );

  // Personne ajoutée à une discussion (063) : version réelle, le serveur l'ajoute, la prévient et lui envoie la tâche,
  // puis la discussion est relue ; démo : ici, mêmes règles (qui lit la discussion ajoute ou retire ; on se retire soi-même).
  const ajouterADiscussion = useCallback(
    async (tacheId: string, fiche: string, retirer = false) => {
      if (!user) throw new Error('Connecte-toi d’abord.');
      const x = data.tasks.find((y) => y.id === tacheId);
      if (!x) throw new Error('Point introuvable');
      if (cloud) {
        await cloud.sync.flushNow();
        await ajouterServeur(espaceId, x.id, fiche, retirer);
        const fresh = await cloud.sync.fetchRows([{ kind: 'discussions', id: x.id }]);
        setData((prev) => applyRows(prev, fresh, cloud.sync.posOf));
        return;
      }
      if (x.paiement) throw new Error('Pas de discussion sur un ticket de paiement');
      const ajoutees = ajouteesDe(data, x);
      if (!litDiscussion(x, user.id, myRoles, data.etiquettes, ajoutees)) throw new Error('Tu ne lis pas cette discussion');
      const p = data.people.find((y) => y.id === fiche);
      if (!retirer && !p?.actif) throw new Error('Personne introuvable');
      if (retirer ? !ajoutees.includes(fiche) : ajoutees.includes(fiche)) return;
      const nom = fullName(p);
      update((d) => {
        const disc = d.discussions?.[x.id];
        const suite = retirer ? ajoutees.filter((id) => id !== fiche) : [...ajoutees, fiche];
        d.discussions = { ...d.discussions, [x.id]: { tache: x.id, commentaires: disc?.commentaires ?? commentairesDe(d, x), participants: suite } };
        if (!retirer && fiche !== user.id)
          avecNotifs(d, [{ id: uid('n'), userId: fiche, type: 'discussion', taskId: x.id, by: user.id, at: new Date().toISOString(), titre: x.titre }]);
      }, retirer
        ? fiche === user.id ? `${fullName(user)} a quitté la discussion de « ${x.titre} »` : `${nom} retiré(e) de la discussion de « ${x.titre} »`
        : `${nom} ajouté(e) à la discussion de « ${x.titre} »`, { annulable: false });
    },
    [user, data, cloud, update, myRoles, espaceId],
  );

  // Relance (052) : version réelle, le serveur prévient chacune des personnes attendues qui n'ont pas encore vu la tâche ;
  // démo : l'appli les prévient ici.
  const relancerPourInfo = useCallback(
    async (x: Task) => {
      const c = clubRef.current;
      if (!user || !c) throw new Error('Connecte-toi d’abord.');
      if (x.paiement) throw new Error('Un ticket ne se relance pas.');
      if (cloud) await cloud.sync.flushNow();
      const r = await c.relancerPourInfo(x.id, x);
      const at = new Date().toISOString();
      const notifs: ActivityNotif[] = r.ici.map((id) => ({ id: uid('n'), userId: id, type: 'relance', taskId: x.id, by: user.id, at, titre: x.titre }));
      if (notifs.length) update((d) => avecNotifs(d, notifs), `${fullName(user)} a relancé le point « ${x.titre} » (pour info)`, { annulable: false });
      return r.n;
    },
    [user, cloud, update],
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

  const discussionLue = useCallback(
    (cle: string, dernier: string) => {
      if (!userId || !dernier) return;
      setData((prev) => {
        const lues = prev.discussionsLues?.[userId] ?? {};
        // Ses notifications 💬 et 📣 sont lues du même coup.
        const seen = new Set(prev.notifLues?.[userId] ?? []);
        const notifs = (prev.notifications ?? []).filter((n) => n.userId === userId && (n.type === 'comment' || n.type === 'mention' || n.type === 'discussion') && n.taskId === cle && !seen.has(n.id));
        if ((lues[cle] ?? '') >= dernier && !notifs.length) return prev;
        notifs.forEach((n) => seen.add(n.id));
        // Les 400 discussions lues le plus récemment suffisent.
        const garder = Object.entries({ ...lues, [cle]: dernier > (lues[cle] ?? '') ? dernier : lues[cle] }).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 400);
        return {
          ...prev,
          discussionsLues: { ...prev.discussionsLues, [userId]: Object.fromEntries(garder) },
          notifLues: notifs.length ? { ...prev.notifLues, [userId]: [...seen].slice(-800) } : prev.notifLues,
        };
      });
    },
    [userId],
  );

  const luIci = userId ? data.discussionsLues?.[userId] : undefined;
  const discussionLueLe = useCallback((cle: string) => luIci?.[cle], [luIci]);

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
      const p = data.polls?.find((x) => x.id === pollId);
      if (!p || !userId || !p.votants.includes(userId)) return;
      update((d) => {
        const x = d.polls?.find((y) => y.id === pollId);
        if (x) Object.assign(x, avecVote(x, userId, optionIds, texte));
      }, `Réponse au sondage « ${p.question} »`);
    },
    [update, data.polls, userId],
  );
  const closePoll = useCallback(
    (pollId: string, closed: boolean) => {
      const p = data.polls?.find((x) => x.id === pollId);
      update((d) => {
        const x = d.polls?.find((y) => y.id === pollId);
        if (!x) return;
        x.clotureLe = closed ? today() : undefined;
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
      // Pas de boucle : ni à lui-même, ni à un point qui lui est rattaché (à tout niveau).
      if (!t || (parentId && (!p || !peutRattacherA({ tasks: data.tasks }, taskId, parentId)))) return;
      update((d) => {
        const x = d.tasks.find((y) => y.id === taskId);
        if (x) {
          x.parentId = parentId;
          x.updatedAt = new Date().toISOString();
        }
      }, parentId ? `Point « ${t.titre} » rattaché à « ${p?.titre ?? ''} »` : `Point « ${t.titre} » détaché de « ${p?.titre ?? ''} »`);
    },
    [update, data.tasks],
  );

  const taskTitle = (id: string) => data.tasks.find((t) => t.id === id)?.titre ?? '';
  const saveEmail = useCallback(
    (e: ScheduledEmail, isNew: boolean) =>
      update((d) => {
        d.emails = isNew ? [...(d.emails ?? []), e] : (d.emails ?? []).map((x) => (x.id === e.id ? e : x));
      }, `${isNew ? 'Email programmé' : 'Modification de l’email programmé'} « ${e.objet} » (point « ${taskTitle(e.taskId)} »)`),
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
      }, `Email « ${e.objet} » (point « ${taskTitle(e.taskId)} ») ${statut === 'envoye' ? 'envoyé' : statut === 'annule' ? 'annulé' : 'reprogrammé'}`);
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
  // Rangement des points (etiquettes.ts) : qui voit tous les points d'une section y range les siens librement ; les membres
  // d'étiquettes qui ont leur place, eux, seulement là où le point reçoit l'une d'elles (le camp VTT dans le camp VTT).
  // Sans étiquette placée : les sections de ses rôles, comme avant.
  const mesPlacees = (data.etiquettes ?? []).filter((e) => !!user && e.membres?.includes(user.id) && (e.parDefaut || lieuxDe(e, data.sections).length > 0)).map((e) => e.id);
  const auto = etiquettesDesLieux(data);
  const peutRanger = (sectionId: string, sousSection = '') =>
    !!sectionId && (can('tasks.createAny', sectionId) || can('tasks.editOwn', sectionId))
    && (can('tasks.viewAll', sectionId) || !mesPlacees.length || auto(sectionId, sousSection).some((id) => mesPlacees.includes(id)));
  const isOwn = (t: Task) => !!user && (t.responsables.includes(user.id) || t.createdBy === user.id);
  const canEditTask = (t: Task) => can('tasks.editAny', t.sectionId) || (can('tasks.editOwn', t.sectionId) && isOwn(t));

  // « ✓ Vu » donnés avant que le serveur ne les enregistre sur la tâche (046) : reportés sur la tâche, une fois par
  // ouverture de l'appli (refusé, par exemple serveur pas encore à jour : pas retenté).
  const vusReportes = useRef(new Set<string>());
  useEffect(() => {
    const vus = userId ? data.prefs[userId]?.pourInfoVus : undefined;
    if (!user || !vus) return;
    const aReporter = data.tasks.filter((t) => vus[t.id] && pourMoi(t, user.id) && !t.pourInfoVus?.[cleVu(user.id)] && !vusReportes.current.has(t.id));
    for (const t of aReporter) {
      vusReportes.current.add(t.id);
      vuPourInfo(t.id).catch(() => {});
    }
  }, [user, userId, data.prefs, data.tasks, vuPourInfo]);

  const value: Store = {
    mode: cloud ? 'reel' : 'demo',
    cloud,
    data,
    user,
    myRoles,
    can,
    // Personne ajoutée à la discussion (063) : elle voit aussi la tâche.
    canSeeTask: (t) => voitTache(t, user?.id, myRoles, data.etiquettes) || (!!user && !t.paiement && ajouteesDe(data, t).includes(user.id)),
    canReadDiscussion: (t) => litDiscussion(t, user?.id, myRoles, data.etiquettes, ajouteesDe(data, t)),
    canEditTask,
    canDeleteTask: (t) => can('tasks.delete', t.sectionId),
    canAssignOthers: (sec) => can('tasks.createAny', sec) || can('tasks.editAny', sec),
    creatableSections: () => data.sections.filter((s) => peutRanger(s.id) || s.sousSections.some((ss) => peutRanger(s.id, ss))),
    peutRanger,
    // Étiquette mise à la main : celles dont on est membre ; toutes pour qui règle les étiquettes.
    peutEtiqueter: (id) => can('settings.lists') || !!(user && data.etiquettes?.find((e) => e.id === id)?.membres?.includes(user.id)),
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
    prendreTache,
    pasDispo,
    vuPourInfo,
    commenter,
    commenterEtiquette,
    ajouterADiscussion,
    relancerPourInfo,
    peutRelancer: (t) => !!user && !t.paiement && (t.createdBy === user.id || t.responsables.includes(user.id) || can('tasks.editAny', t.sectionId)),
    toast,
    setToast,
    markNotifsRead,
    discussionLue,
    discussionLueLe,
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
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const s = useContext(StoreCtx);
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
