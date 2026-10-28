import { createContext, useCallback, useContext, useState } from 'react';
import { ClubCtx } from './club';
import { StoreCtx } from './storeCtx';
import { useAutres } from './entites';
import type { OrgUnit, Permission } from './types';

// Vue « moi » : un compte, pas une entité. Tout est réuni (tâches, séances, événements, sondages…), sauf l'ordre du jour
// et le PV (ceux de l'un de mes comités) et la console admin (celle de l'une de mes entités), choisis en haut de la page,
// sans changer d'entité. Un autre que l'entité ouverte s'y affiche dans le sien (DansEntite, Layout), avec ses séances,
// ses tâches et mes droits chez lui (président de deux comités : les deux ordres du jour, les deux PV).

/** Droits des pages Comité. */
export const PERMS_COMITE: Permission[] = ['tab.meetings', 'tab.pv', 'tab.minutes'];
/** Droits des pages qui réunissent mes entités, ou en choisissent une : il suffit de les avoir dans l'une d'elles. */
export const PERMS_MOI: Permission[] = [...PERMS_COMITE, 'tab.events', 'admin.access'];
/** Droits des pages d'une seule entité à la fois (la choisie). */
export const PERMS_CHOIX: Permission[] = [...PERMS_COMITE, 'admin.access'];

/** Page d'une seule entité à la fois (la choisie) : le droit qu'elle demande et le nom du choix ; rien pour les autres. */
export function pageParEntite(chemin: string): { perm: Permission; libelle: string } | undefined {
  if (chemin === '/ordre-du-jour') return { perm: 'tab.pv', libelle: 'Comité' };
  if (chemin === '/pv') return { perm: 'tab.minutes', libelle: 'Comité' };
  if (chemin === '/admin' || chemin.startsWith('/admin/') || chemin === '/mots-de-passe') return { perm: 'admin.access', libelle: 'Entité' };
  return undefined;
}

export interface Comites {
  /** Mes entités où j'ai ce droit, l'entité ouverte d'abord. */
  liste: (p: Permission) => OrgUnit[];
  /** L'entité choisie (ordre du jour, PV, console admin) si elle me donne ce droit, sinon la première qui le donne. */
  choisi: (p: Permission) => OrgUnit | undefined;
  choisir: (id: string) => void;
  /** Droit dans l'une de mes entités (pages Comité, Événements, console admin) : leurs adresses existent. */
  canUn: (p: Permission) => boolean;
}

export const ComitesCtx = createContext<Comites | null>(null);

export const useComites = () => useContext(ComitesCtx);

/** État du choix (autour de l'appli, dans l'entité ouverte). */
export function useComitesEtat(): Comites {
  const store = useContext(StoreCtx);
  const club = useContext(ClubCtx);
  const autres = useAutres(!club?.arrierePlan);
  const ici = club?.current;
  const [choix, setChoix] = useState<string | null>(null);
  // Vue du club : aucune entité ouverte, toutes en arrière-plan.
  const tous = [
    ...(ici && store?.user && !club?.vueClub ? [{ u: ici, can: store.can }] : []),
    ...autres.filter((e) => e.store.user).map((e) => ({ u: e.club.current, can: e.store.can })),
  ];
  const avec = (p: Permission) => tous.filter((x) => x.can(p));
  const choisir = useCallback((id: string) => setChoix(id), []);
  return {
    liste: (p) => avec(p).map((x) => x.u),
    choisi: (p) => {
      const l = avec(p);
      return (l.find((x) => x.u.id === choix) ?? l[0])?.u;
    },
    choisir,
    canUn: (p) => !!store?.can(p) || (PERMS_MOI.includes(p) && avec(p).length > 0),
  };
}
