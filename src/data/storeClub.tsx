import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StoreCtx } from './storeCtx';
import type { Store } from './storeTypes';
import { useAutres, useRegistre, type Entite } from './entites';
import { useClubOptional } from './club';
import { useSession } from './session';
import { cleCommune } from './commentaires';
import { idPartagee } from './partage';
import { modifDepuisIci, tacheAilleurs } from './vueMoi';
import { vueClub } from './vueClub';
import type { Externes } from './externes';
import type { Role, TachePartagee, Task } from './types';

// Vue du club (PLAN_CLUB_SANS_ENTITE.md, étape 1) : la couche de données des écrans quand l'appli ne s'appuie sur aucune
// entité. Une façade : la personne du club et ses réglages (session.tsx), ses droits réunis (un droit dans l'une de ses
// entités), la vue réunie de ses entités (vueClub.ts). Chaque action va à l'entité concernée, ouverte en arrière-plan
// (entites.tsx) : la tâche s'enregistre chez elle, la notification y est lue, etc.

/** Section de la vue du club « x:<entité>:<section> » : son entité et la section chez elle. */
const dansEntite = (id?: string) => {
  const m = id ? /^x:([^:]+):(.+)$/.exec(id) : null;
  return m ? { entite: m[1], id: m[2] } : null;
};

const aucunExterne: Externes = {};

/** `attendues` : mes entités ; l'appli s'affiche une fois toutes ouvertes en arrière-plan. */
export function StoreClub({ attendues, children }: { attendues: string[]; children?: ReactNode }) {
  const session = useSession();
  const club = useClubOptional();
  const registre = useRegistre();
  const ouvertes = useAutres(true);
  const units = club?.units;
  // Dans l'ordre du club (comité central d'abord).
  const entites = useMemo(() => {
    const parId = new Map(ouvertes.filter((e) => e.store.user).map((e) => [e.id, e]));
    return (units ?? []).flatMap((u) => parId.get(u.id) ?? []);
  }, [ouvertes, units]);
  // Toutes ouvertes (celle où ma place a été retirée entre-temps n'est simplement pas réunie).
  const pret = attendues.every((id) => ouvertes.some((e) => e.id === id));
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (registre) registre.afficher = setToast;
  }, [registre]);

  const { personne, prefs } = session;
  const vue = useMemo(
    () =>
      vueClub(
        entites.map((e) => ({ id: e.id, nom: e.club.current.nom, type: e.club.current.type, data: e.store.data, voit: e.store.canSeeTask, fiche: e.store.user!.id })),
        personne,
        units ?? [],
        prefs,
      ),
    [entites, personne, units, prefs],
  );
  const data = vue.data;

  /** L'entité qui enregistre la tâche `id` (vue du club) et la tâche telle que chez elle (ses fonctions les plus récentes). */
  const chez = useCallback(
    (id: string): { e: Entite; t: Task } | null => {
      const o = vue.ou.get(id);
      const e = o && registre?.get(o.entite);
      const t = e?.store.data.tasks.find((x) => x.id === o!.id);
      return e && t ? { e, t } : null;
    },
    [vue, registre],
  );
  /** Identifiant chez elle (`id`) et, partagée par une autre entité, celle-ci (`unite`). */
  const local = (t: Task) => (t.source ? { id: t.source.id, unite: t.source.uniteId } : { id: t.id, unite: undefined });

  // Tâches d'autres entités pour info de l'une des miennes (ou de moi chez elle) : une fois, avec celle qui l'a reçue.
  const pourInfo = useMemo(() => {
    const vues = new Set<string>();
    const l: TachePartagee[] = [];
    for (const e of entites)
      for (const x of e.store.pourInfo) {
        const k = idPartagee(x.uniteId, x.task.id);
        if (vues.has(k) || vue.ou.has(k)) continue;
        vues.add(k);
        l.push({ ...x, chez: e.id });
      }
    return l;
  }, [entites, vue]);
  const recue = useCallback(
    (uniteId?: string, tacheId?: string) => {
      const x = pourInfo.find((p) => p.uniteId === uniteId && p.task.id === tacheId);
      return x?.chez ? registre?.get(x.chez) : undefined;
    },
    [pourInfo, registre],
  );

  // Droits réunis : un droit dans l'une de mes entités ; pour une section, celui de son entité.
  const can = useCallback(
    (p: Parameters<Store['can']>[0], sectionId?: string) => {
      const s = dansEntite(sectionId);
      if (s) return !!registre?.get(s.entite)?.store.can(p, s.id);
      return entites.some((e) => e.store.can(p));
    },
    [entites, registre],
  );
  const myRoles = useMemo(() => {
    const vus = new Set<string>();
    return entites.flatMap((e) => e.store.myRoles).filter((r: Role) => !vus.has(r.label) && !!vus.add(r.label));
  }, [entites]);

  // Annuler / Refaire : la dernière action faite ici, dans l'entité où elle a été enregistrée.
  const derniere = (k: 'annulable' | 'refaisable') =>
    entites.reduce<Entite | undefined>((m, e) => (e.store[k] && (!m || e.store[k]!.at > m.store[k]!.at) ? e : m), undefined);
  const aAnnuler = derniere('annulable');
  const aRefaire = derniere('refaisable');

  const rien = useCallback(() => setToast('⚠️ Choisis d’abord l’entité où l’enregistrer.'), []);

  const value: Store = {
    mode: entites[0]?.store.mode ?? 'demo',
    cloud: null,
    data,
    dataLocale: data,
    dataMoi: data,
    user: personne,
    myRoles,
    can,
    canSeeTask: (t) => vue.ou.has(t.id),
    canEditTask: (t) => {
      const x = chez(t.id);
      return !!x && x.e.store.canEditTask(x.t);
    },
    canDeleteTask: () => false,
    autresResp: () => '',
    canAssignOthers: (sec) => {
      const s = dansEntite(sec);
      return !!s && !!registre?.get(s.entite)?.store.canAssignOthers(s.id);
    },
    // Une nouvelle tâche se crée dans l'une de mes entités (choisie dans la fenêtre : FicheTache).
    creatableSections: () => [],
    prefs,
    login: (id) => {
      if (!id) session.deconnecter();
    },
    update: rien,
    updateSilent: rien,
    annulable: aAnnuler?.store.annulable ?? null,
    annuler: () => aAnnuler?.store.annuler(),
    refaisable: aRefaire?.store.refaisable ?? null,
    refaire: () => aRefaire?.store.refaire(),
    setPrefs: session.setPrefs,
    saveTask: (t, isNew) => {
      const x = isNew ? null : chez(t.id);
      const avant = data.tasks.find((y) => y.id === t.id);
      if (!x || !avant) {
        setToast('⚠️ Cette tâche n’est plus visible dans son entité.');
        return;
      }
      return x.e.store.saveTask(modifDepuisIci(x.t, avant, t, data.statuses, x.e.store.data.statuses), false);
    },
    attribuerTache: () => Promise.reject(new Error('Une tâche s’attribue depuis son entité.')),
    prendreTache: async (t) => {
      const x = chez(t.id);
      if (!x) throw new Error('Cette tâche n’est plus visible dans son entité.');
      return x.e.store.prendreTache(x.t);
    },
    pasDispo: async (t) => {
      const x = chez(t.id);
      if (!x) throw new Error('Cette tâche n’est plus visible dans son entité.');
      return x.e.store.pasDispo(x.t);
    },
    vuPourInfo: async (cle, tacheId, uniteId) => {
      const x = chez(uniteId ? idPartagee(uniteId, tacheId) : tacheId);
      if (x) {
        const l = local(x.t);
        return x.e.store.vuPourInfo(cle, l.id, l.unite);
      }
      return recue(uniteId, tacheId)?.store.vuPourInfo(cle, tacheId, uniteId);
    },
    commenter: async (tacheId, a, uniteId) => {
      const x = chez(uniteId ? idPartagee(uniteId, tacheId) : tacheId);
      if (x) {
        const l = local(x.t);
        return x.e.store.commenter(l.id, a, l.unite);
      }
      const e = recue(uniteId, tacheId);
      if (!e) throw new Error('Tâche introuvable');
      return e.store.commenter(tacheId, a, uniteId);
    },
    relancerPourInfo: async (t) => {
      const x = chez(t.id);
      if (!x) throw new Error('Une tâche se relance depuis son entité.');
      return x.e.store.relancerPourInfo(x.t);
    },
    peutRelancer: (t) => {
      const x = chez(t.id);
      return !!x && x.e.store.peutRelancer(x.t);
    },
    toast,
    setToast,
    // Notifications de mes entités (« @<entité>|<clé> ») : vues au club.
    markNotifsRead: (cles) => session.marquerLues(cles.map((k) => k.replace(/^@/, ''))),
    // Lue au club ; ses 💬 et 📣 aussi, dans chacune de mes entités qui voit la tâche.
    discussionLue: (cle, dernier) => {
      const x = tacheAilleurs(cle);
      if (!x || !dernier) return;
      session.lireDiscussion(`${x.uniteId}:${x.id}`, dernier);
      for (const e of entites) e.store.discussionLue(x.uniteId === e.id ? x.id : cle, dernier);
    },
    discussionLueLe: (cle) => session.discussionsLues[cleCommune(cle, '')],
    savePoll: rien,
    votePoll: rien,
    closePoll: rien,
    deletePoll: rien,
    canManagePoll: () => false,
    sondagesEntites: entites.some((e) => e.store.sondagesEntites),
    externes: aucunExterne,
    pourInfo,
    linkTask: rien,
    saveEmail: rien,
    setEmailStatus: (id, statut) => {
      const s = dansEntite(id);
      registre?.get(s?.entite ?? '')?.store.setEmailStatus(s!.id, statut);
    },
    deleteEmail: rien,
    reset: () => entites[0]?.store.reset(),
    restore: rien,
    versClub: vue.personneDe,
  };
  if (!pret) return null;
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
