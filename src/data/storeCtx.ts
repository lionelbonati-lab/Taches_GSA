import { createContext } from 'react';
import type { Store } from './storeTypes';

/** Couche de données d'une entité (store.tsx) : celle ouverte, ou l'une de mes autres entités (entites.tsx). */
export const StoreCtx = createContext<Store | null>(null);
