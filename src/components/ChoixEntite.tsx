import { Fragment, useState, type ReactNode } from 'react';
import { Chez, type EntiteMoi } from '../data/entites';
import type { OrgUnit } from '../data/types';
import { Deroulante } from './Deroulante';
import { PastilleEntite } from './IconesEntite';
import { usePlusieursEntites } from './ui';

// Vue « moi » : une nouvelle séance, un nouvel événement, un nouveau sondage se crée dans l'une de mes entités, choisie
// dans la fenêtre ; celle-ci se rouvre alors chez elle (ses personnes, ses droits), avec ce qui a déjà été saisi.

/** Entité où créer, choisie dans la fenêtre. */
export type ChoixEntiteFenetre<T> = { liste: OrgUnit[]; valeur: string; changer: (id: string, v: T) => void };

/** Le choix en tête de la fenêtre (une seule entité possible : elle est indiquée). */
export function ChampEntite<T>({ choix, v, label }: { choix?: ChoixEntiteFenetre<T>; v: T; label: string }) {
  if (!choix?.liste.length) return null;
  if (choix.liste.length === 1)
    return (
      <p className="full champ-entite">
        {label} : <PastilleEntite u={choix.liste[0]} /> <strong>{choix.liste[0].nom}</strong>
      </p>
    );
  return (
    <label className="full">
      {label}
      <Deroulante
        aria-label={label}
        value={choix.valeur}
        onChange={(id) => id !== choix.valeur && choix.changer(id, v)}
        options={choix.liste.map((u) => ({ value: u.id, label: u.nom, icone: <PastilleEntite u={u} /> }))}
      />
    </label>
  );
}

/**
 * Fenêtre de création dans l'une de `entites` (la première d'abord) : `cree` prépare l'élément chez elle (`v` : ce qui
 * a déjà été saisi ailleurs) ; `children` affiche la fenêtre, avec le choix (membre de plusieurs entités).
 */
export function NouveauDans<T>({ entites, cree, children }: { entites: EntiteMoi[]; cree: (e: EntiteMoi, v?: T) => T; children: (v: T, choix?: ChoixEntiteFenetre<T>) => ReactNode }) {
  const plusieurs = usePlusieursEntites();
  const [chez, setChez] = useState(() => ({ id: entites[0]?.u?.id, v: entites[0] ? cree(entites[0]) : undefined, n: 0 }));
  const liste = entites.flatMap((e) => (e.u ? [e.u] : []));
  if (chez.v === undefined) return null;
  const choix: ChoixEntiteFenetre<T> | undefined =
    (liste.length > 1 || plusieurs) && chez.id
      ? {
          liste,
          valeur: chez.id,
          changer: (id, v) => {
            const e = entites.find((x) => x.u?.id === id);
            if (e) setChez((c) => ({ id, v: cree(e, v), n: c.n + 1 }));
          },
        }
      : undefined;
  return (
    <Chez id={chez.id}>
      <Fragment key={chez.n}>{children(chez.v, choix)}</Fragment>
    </Chez>
  );
}
