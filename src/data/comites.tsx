import { createContext, useCallback, useContext, useState } from 'react';
import { ClubCtx } from './club';
import { StoreCtx } from './storeCtx';
import { useAutres } from './entites';
import type { OrgUnit, Permission } from './types';

// Vue « moi » : un compte, pas une entité. Les pages Comité (séances, ordre du jour, PV) travaillent sur l'un de mes
// comités, choisi en haut de la page, sans changer d'entité : un autre que l'entité ouverte s'y affiche dans le sien
// (DansEntite, Layout), avec ses séances, ses tâches et mes droits chez lui (président de deux comités : les deux PV).

/** Droits des pages Comité. */
export const PERMS_COMITE: Permission[] = ['tab.meetings', 'tab.pv', 'tab.minutes'];
/** Adresses des pages Comité. */
export const PAGES_COMITE = ['/comite', '/ordre-du-jour', '/pv'];

export interface Comites {
  /** Mes entités où j'ai l'une des pages Comité, l'entité ouverte d'abord. */
  liste: OrgUnit[];
  /** Le comité des pages Comité (par défaut l'entité ouverte). */
  choisi?: OrgUnit;
  choisir: (id: string) => void;
  /** Droit du comité choisi (pages Comité). */
  canChoisi: (p: Permission) => boolean;
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
  // Le choix vaut pour l'entité ouverte où il a été fait (une autre ouverte : retour à elle).
  const [choix, setChoix] = useState<{ pour?: string; id: string } | null>(null);
  const peut = (can: (p: Permission) => boolean) => PERMS_COMITE.some((p) => can(p));
  const tous = [
    ...(ici && store?.user && peut(store.can) ? [{ u: ici, can: store.can }] : []),
    ...autres.filter((e) => e.store.user && peut(e.store.can)).map((e) => ({ u: e.club.current, can: e.store.can })),
  ];
  const voulu = choix?.pour === ici?.id ? choix?.id : undefined;
  const choisi = tous.find((x) => x.u.id === voulu) ?? tous[0];
  const choisir = useCallback((id: string) => setChoix({ pour: ici?.id, id }), [ici?.id]);
  return {
    liste: tous.map((x) => x.u),
    choisi: choisi?.u,
    choisir,
    canChoisi: (p) => (PERMS_COMITE.includes(p) && choisi ? choisi.can(p) : !!store?.can(p)),
    canUn: (p) => !!store?.can(p) || (PERMS_COMITE.includes(p) && tous.some((x) => x.can(p))),
  };
}
