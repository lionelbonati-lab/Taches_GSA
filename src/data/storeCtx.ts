import { createContext } from 'react';
import type { Store } from './storeTypes';

/** Couche de données de l'espace du club (store.tsx). */
export const StoreCtx = createContext<Store | null>(null);
