import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { annulerChangements, changements, horsAnnulation, reunir, type Changement } from './annuler';
import type { AppData } from './types';
import { uid } from './utils';

type Etiquette = { actions: string[]; suite: boolean; bloque: boolean; sens?: 'annuler' | 'refaire' };
type Entree = { id: string; action: string; at: string; items: Changement[] };

/**
 * Pile « Annuler » / « Refaire » des actions faites dans cette session. `etiqueter` : à appeler à chaque modification
 * des données (voir update dans store.tsx) ; `oublier` : vide les deux piles (données remplacées).
 */
export function usePileAnnulation(data: AppData, setData: Dispatch<SetStateAction<AppData>>, userId: string | null, setToast: (msg: string) => void) {
  // « Annuler » : chaque action laisse une étiquette sur les données qu'elle produit (plusieurs modifications groupées :
  // étiquettes réunies) ; une fois affichées, les éléments changés depuis l'affichage précédent sont retenus.
  // Action qui ne s'annule pas (`bloque`) : celles groupées avec elle non plus. `sens` : annulation (elle va dans
  // « Refaire ») ou action refaite (elle revient dans « Annuler »).
  const etiquettes = useRef(new WeakMap<AppData, Etiquette>());
  const affichees = useRef(data);
  affichees.current = data;
  const etiqueter = useCallback((prev: AppData, next: AppData, o: { action?: string; suite?: boolean; bloque?: boolean; sens?: Etiquette['sens'] }) => {
    const e = prev === affichees.current ? undefined : etiquettes.current.get(prev);
    etiquettes.current.set(next, {
      actions: [...(e?.actions ?? []), ...(o.action ? [o.action] : [])],
      suite: !!(e?.suite || o.suite),
      bloque: !!(e?.bloque || o.bloque),
      sens: o.sens ?? e?.sens,
    });
  }, []);
  const [pile, setPile] = useState<Entree[]>([]);
  // Actions annulées, à refaire ; une nouvelle action les oublie.
  const [aRefaire, setARefaire] = useState<Entree[]>([]);
  const precedentes = useRef(data);
  const derniere = useRef<AppData | null>(null);
  useEffect(() => {
    const avant = precedentes.current;
    precedentes.current = data;
    const e = etiquettes.current.get(data);
    if (avant === data || !e || (!e.actions.length && !e.suite && !e.bloque)) return;
    const items = changements(avant, data);
    if (!items.length) return;
    if (e.bloque) {
      derniere.current = null;
      return;
    }
    // Paiement, fichiers effacés : l'action ne s'annule pas, ni celles d'avant (elles ont pu en dépendre).
    if (horsAnnulation(items)) {
      derniere.current = null;
      setARefaire([]);
      return setPile([]);
    }
    const entree = { id: uid('a'), action: e.actions[0] ?? '', at: new Date().toISOString(), items };
    if (e.sens === 'annuler') {
      derniere.current = null;
      return setARefaire((r) => [entree, ...r].slice(0, 20));
    }
    if (e.actions.length) {
      setPile((p) => [entree, ...p].slice(0, 20));
      if (e.sens !== 'refaire') setARefaire([]);
    } else if (avant === derniere.current) {
      // Suite de l'action affichée juste avant (ex. PV : changement de tâche inscrit au PV) : annulées ensemble.
      setPile((p) => (p.length ? [{ ...p[0], items: reunir(p[0].items, items) }, ...p.slice(1)] : p));
    } else return;
    derniere.current = data;
  }, [data]);
  // Autre personne connectée : rien à annuler de la précédente.
  useEffect(() => {
    setPile([]);
    setARefaire([]);
  }, [userId]);

  // Annuler (la dernière action revient en arrière, et passe dans « Refaire ») ou refaire (l'annulation est défaite).
  const revenirSur = (sens: 'annuler' | 'refaire') => {
    const a = (sens === 'annuler' ? pile : aRefaire)[0];
    if (!a) return;
    const { conflits } = annulerChangements(data, a.items);
    (sens === 'annuler' ? setPile : setARefaire)((p) => p.filter((x) => x.id !== a.id));
    const mot = sens === 'annuler' ? 'Annulé' : 'Refait';
    setData((prev) => {
      const next = annulerChangements(prev, a.items).data;
      next.log = [{ id: uid('l'), at: new Date().toISOString(), userId: userId ?? '?', action: `${mot} : ${a.action}` }, ...next.log].slice(0, 300);
      etiqueter(prev, next, { action: a.action, sens });
      return next;
    });
    const signe = sens === 'annuler' ? '↶' : '↷';
    setToast(
      conflits
        ? `${signe} ${mot} en partie : ${a.action} (modifié depuis par ailleurs : ${conflits > 1 ? `${conflits} éléments gardés` : 'un élément gardé'} tel quel)`
        : `${signe} ${mot} : ${a.action}`,
    );
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const annuler = useCallback(() => revenirSur('annuler'), [pile, data, userId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refaire = useCallback(() => revenirSur('refaire'), [aRefaire, data, userId]);
  const oublier = useCallback(() => {
    setPile([]);
    setARefaire([]);
  }, []);
  return { etiqueter, pile, aRefaire, annuler, refaire, oublier };
}
