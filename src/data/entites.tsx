import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ClubCtx, type Club } from './club';
import { StoreCtx } from './storeCtx';
import type { Store } from './storeTypes';
import { computeNotifications, DEFAULT_NOTIF, type NotifItem } from './notifs';
import type { Meeting, OrgUnit, Poll } from './types';
import { sondagesVisibles } from './polls';

// Vue « moi » : mes autres entités sont ouvertes en arrière-plan, chacune avec sa couche de données (sans écran). Leurs
// tâches, discussions et notifications s'ajoutent à celles de l'entité ouverte (vueMoi.ts) ; une tâche de l'une d'elles
// s'ouvre dans la sienne (DansEntite), avec ses personnes, ses statuts et ses droits.

/** L'une de mes autres entités, ouverte en arrière-plan. */
export interface Entite {
  id: string;
  store: Store;
  club: Club;
  /** Ses notifications de la cloche, calculées comme dans l'entité. */
  notifs: NotifItem[];
}

const rien = () => () => {};
const aucune: Entite[] = [];

export class Registre {
  private entites = new Map<string, { e: Entite; jeton: object }>();
  /** Dernier état annoncé de chaque entité : ce qui change l'affichage. */
  private vues = new Map<string, { sig: unknown[]; e: Entite }>();
  private liste: Entite[] = aucune;
  private abonnes = new Set<() => void>();
  private parEntite = new Map<string, Set<() => void>>();
  /** Messages des entités en arrière-plan : affichés par l'entité ouverte. */
  afficher: (msg: string) => void = () => {};

  publier(e: Entite, jeton: object) {
    this.entites.set(e.id, { e, jeton });
    const s = e.store;
    const sig = [s.data, s.dataLocale, s.user, s.myRoles, e.club, e.notifs.map((n) => `${n.key}${n.unread ? '*' : ''}`).join('|')];
    const avant = this.vues.get(e.id);
    if (avant && avant.sig.every((x, i) => x === sig[i])) return;
    this.vues.set(e.id, { sig, e });
    this.annoncer(e.id);
  }

  /** `jeton` : celui de la publication (une entité rouverte entre-temps reste). */
  retirer(id: string, jeton: object) {
    if (this.entites.get(id)?.jeton !== jeton) return;
    this.entites.delete(id);
    this.vues.delete(id);
    this.annoncer(id);
  }

  private annoncer(id: string) {
    this.liste = [...this.vues.values()].map((v) => v.e);
    this.parEntite.get(id)?.forEach((f) => f());
    this.abonnes.forEach((f) => f());
  }

  /** L'entité telle qu'à l'instant : pour agir (ses fonctions les plus récentes). */
  get(id: string) {
    return this.entites.get(id)?.e;
  }
  /** L'entité telle qu'annoncée : pour afficher. */
  vue(id: string) {
    return this.vues.get(id)?.e;
  }
  toutes = () => this.liste;
  ecouter = (f: () => void) => {
    this.abonnes.add(f);
    return () => void this.abonnes.delete(f);
  };
  ecouterEntite(id: string, f: () => void) {
    const l = this.parEntite.get(id) ?? new Set();
    l.add(f);
    this.parEntite.set(id, l);
    return () => void l.delete(f);
  }
}

const RegistreCtx = createContext<Registre | null>(null);

/** Autour de l'appli : l'entité ouverte et mes autres entités en arrière-plan. */
export function RegistreEntites({ children }: { children: ReactNode }) {
  const [registre] = useState(() => new Registre());
  return <RegistreCtx.Provider value={registre}>{children}</RegistreCtx.Provider>;
}

export const useRegistre = () => useContext(RegistreCtx);

/** Mes autres entités ouvertes en arrière-plan (vides si `actif` est faux : pour l'entité ouverte seulement). */
export function useAutres(actif: boolean): Entite[] {
  const registre = useContext(RegistreCtx);
  const on = !!registre && actif;
  return useSyncExternalStore(on ? registre.ecouter : rien, () => (on ? registre.toutes() : aucune));
}

/** Une séance de l'une de mes entités : `u` son entité (absente hors club), `ici` : celle de l'entité ouverte. */
export interface SeanceMoi {
  m: Meeting;
  u?: OrgUnit;
  ici: boolean;
}

/**
 * Vue « moi » : les séances de l'entité ouverte et celles de mes autres entités où je vois les séances (droit « Séances »).
 * Celles d'une autre entité s'ouvrent dans la sienne (son ordre du jour, son PV).
 */
export function useSeancesMoi(): SeanceMoi[] {
  const store = useContext(StoreCtx);
  const club = useContext(ClubCtx);
  const autres = useAutres(!club?.arrierePlan);
  const meetings = store?.data.meetings;
  const ici = club?.current;
  return useMemo(
    () => [
      ...(meetings ?? []).map((m) => ({ m, u: ici, ici: true })),
      ...autres.filter((e) => e.store.user && e.store.can('tab.meetings')).flatMap((e) => e.store.data.meetings.map((m) => ({ m, u: e.club.current, ici: false }))),
    ],
    [meetings, ici, autres],
  );
}

/** L'une de mes entités (vue « moi ») : l'entité ouverte ou l'une des autres, avec sa couche de données et ses droits. */
export interface EntiteMoi {
  /** Son entité (absente hors club). */
  u?: OrgUnit;
  store: Store;
  ici: boolean;
}

/** Toutes mes entités, l'entité ouverte d'abord : les pages qui les réunissent (séances, événements, sondages). */
export function useMesEntites(): EntiteMoi[] {
  const store = useContext(StoreCtx);
  const club = useContext(ClubCtx);
  const autres = useAutres(!club?.arrierePlan);
  const ici = club?.current;
  return useMemo(
    () => [
      ...(store?.user ? [{ u: ici, store, ici: true }] : []),
      ...autres.filter((e) => e.store.user).map((e) => ({ u: e.club.current, store: e.store, ici: false })),
    ],
    [store, ici, autres],
  );
}

/** Un sondage de l'une de mes entités (ou reçu par elle), avec son entité. */
export interface SondageMoi {
  p: Poll;
  ent: EntiteMoi;
}

/**
 * Sondages de toutes mes entités (vue « moi ») : ceux où je vote, ceux que j'y ai créés ou que j'y gère, et ceux d'autres
 * entités ouverts aux miennes. Le même (ouvert à plusieurs de mes entités, ou venant de l'une d'elles) une seule fois,
 * chez lui d'abord.
 */
export function useSondagesMoi(): SondageMoi[] {
  const mes = useMesEntites();
  return useMemo(() => {
    const vus = new Set<string>();
    return mes
      .flatMap((ent) => sondagesVisibles(ent.store.data.polls ?? [], ent.store.user?.id, ent.store.can('polls.manage')).map((p) => ({ p, ent })))
      .sort((a, b) => Number(!!a.p.source) - Number(!!b.p.source))
      .filter(({ p, ent }) => {
        const cle = p.source ? `${p.source.uniteId}:${p.source.id}` : `${ent.u?.id ?? ''}:${p.id}`;
        if (vus.has(cle)) return false;
        vus.add(cle);
        return true;
      });
  }, [mes]);
}

/** Écran dans l'une de mes entités : l'entité ouverte telle quelle, une autre dans la sienne (DansEntite). */
export function Chez({ id, children, sinon = null }: { id?: string; children: ReactNode; sinon?: ReactNode }) {
  const club = useContext(ClubCtx);
  if (!id || id === club?.current.id) return <>{children}</>;
  return (
    <DansEntite id={id} sinon={sinon}>
      {children}
    </DansEntite>
  );
}

/** Dans une entité en arrière-plan : l'annonce à l'entité ouverte (sa couche de données, son club, ses notifications). */
export function Publier() {
  const registre = useContext(RegistreCtx);
  const store = useContext(StoreCtx);
  const club = useContext(ClubCtx);
  const [jeton] = useState(() => ({}));
  // Recalcul chaque minute, comme la cloche : échéances, emails programmés.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const user = store?.user;
  const notifs =
    store && user && club
      ? computeNotifications(store.data, user, { ...DEFAULT_NOTIF, ...store.prefs.notif }, club.demandesMdp, store.pourInfo, club.units, club.current.id, { mesFiches: club.mesFiches, lues: club.luesAilleurs })
      : [];
  const id = club?.current.id;
  useLayoutEffect(() => {
    if (registre && store && club && id) registre.publier({ id, store, club, notifs }, jeton);
  });
  useEffect(() => () => void (registre && id && registre.retirer(id, jeton)), [registre, id, jeton]);
  // Ses messages (modification refusée, tâche récurrente reconduite…) : affichés par l'entité ouverte.
  const toast = store?.toast;
  useEffect(() => {
    if (!toast || !registre) return;
    registre.afficher(toast);
    store?.setToast(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, registre]);
  return null;
}

/** Écran (fenêtre d'une tâche…) dans l'une de mes autres entités : sa couche de données et son club ; `sinon` : pas ouverte. */
export function DansEntite({ id, children, sinon = null }: { id: string; children: ReactNode; sinon?: ReactNode }) {
  const registre = useContext(RegistreCtx);
  const ecouter = useCallback((f: () => void) => (registre ? registre.ecouterEntite(id, f) : () => {}), [registre, id]);
  const e = useSyncExternalStore(ecouter, () => registre?.vue(id));
  if (!e) return <>{sinon}</>;
  return (
    <ClubCtx.Provider value={e.club}>
      <StoreCtx.Provider value={e.store}>{children}</StoreCtx.Provider>
    </ClubCtx.Provider>
  );
}
