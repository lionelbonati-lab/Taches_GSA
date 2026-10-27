import { createContext, useCallback, useContext, useState } from 'react';
import { ClubCtx } from './club';
import { StoreCtx } from './storeCtx';
import { useAutres } from './entites';
import type { OrgUnit, Permission } from './types';

// Vue « moi » : un compte, pas une entité. Tout est réuni (tâches, séances, événements, sondages…), sauf l'ordre du jour
// et le PV : ceux de l'un de mes comités, choisi en haut de la page, sans changer d'entité. Un autre que l'entité ouverte
// s'y affiche dans le sien (DansEntite, Layout), avec ses séances, ses tâches et mes droits chez lui (président de deux
// comités : les deux ordres du jour, les deux PV).

/** Droits des pages Comité. */
export const PERMS_COMITE: Permission[] = ['tab.meetings', 'tab.pv', 'tab.minutes'];
/** Pages d'un seul comité à la fois (le choisi), et le droit qu'elles demandent. */
export const PAGES_PAR_COMITE: Record<string, Permission> = { '/ordre-du-jour': 'tab.pv', '/pv': 'tab.minutes' };

export interface Comites {
  /** Mes entités où j'ai ce droit, l'entité ouverte d'abord. */
  liste: (p: Permission) => OrgUnit[];
  /** Le comité choisi s'il me donne ce droit, sinon le premier qui le donne. */
  choisi: (p: Permission) => OrgUnit | undefined;
  choisir: (id: string) => void;
  /** Droit dans l'un de mes comités (pages Comité) : leurs adresses existent. */
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
  const tous = [
    ...(ici && store?.user ? [{ u: ici, can: store.can }] : []),
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
    canUn: (p) => !!store?.can(p) || (PERMS_COMITE.includes(p) && avec(p).length > 0),
  };
}
