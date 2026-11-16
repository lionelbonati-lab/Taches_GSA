import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { effacerBrouillon, useBrouillons, type Brouillon } from '../data/brouillons';
import { deleteFiles } from '../data/files';
import { fmtDateTime } from '../data/utils';
import { TaskModal } from './FicheTache';
import { Icone } from './icones';

/**
 * Points pas encore enregistrés (brouillons.ts) : une fiche restée ouverte quand l'appli a été fermée, rechargée ou
 * coupée. Rappelés en haut de chaque page : « Reprendre » rouvre la fiche avec les modifications (fermer l'enregistre),
 * « Abandonner » les oublie (après confirmation).
 */
export function BrouillonsEnAttente() {
  const { data, user } = useStore();
  const tous = useBrouillons(user?.id);
  const [ouvert, setOuvert] = useState<Brouillon | null>(null);
  // Le point tel qu'il est enregistré (pas encore créé, ou supprimé depuis : repris comme un nouveau point).
  const enregistre = (b: Brouillon) => data.tasks.find((x) => x.id === b.t.id);
  // Nouveau point créé depuis la dernière modification de son brouillon (« Créer », fiche fermée) : il ne sert plus.
  const perimes = tous.filter((b) => b.isNew && (enregistre(b)?.updatedAt ?? '') >= b.le).map((b) => b.t.id);
  const liste = tous.filter((b) => !perimes.includes(b.t.id));
  const cles = perimes.join();
  const userId = user?.id;
  useEffect(() => {
    if (userId && cles) cles.split(',').forEach((id) => effacerBrouillon(userId, id));
  }, [userId, cles]);
  if (!user || (!liste.length && !ouvert)) return null;
  const nom = (b: Brouillon) => `« ${b.t.titre.trim() || 'sans titre'} »`;
  const abandonner = (b: Brouillon) => {
    if (!confirm(`Abandonner les modifications non enregistrées de ${nom(b)} ?${!enregistre(b) ? ' Ce point n’a pas été créé : il sera perdu.' : ''}`)) return;
    // Fichiers joints dans le brouillon seulement (pas au point enregistré, ni à un autre) : effacés.
    const avant = enregistre(b)?.documents ?? [];
    const fichiers = (b.t.documents ?? [])
      .filter((d) => d.kind === 'fichier' && !avant.some((x) => x.id === d.id) && !data.tasks.some((x) => x.documents?.some((y) => y.id === d.id)))
      .map((d) => d.id);
    void deleteFiles(fichiers);
    effacerBrouillon(user.id, b.t.id);
  };
  return (
    <>
      {liste.length > 0 && (
        <div className="panel brouillons" role="region" aria-label="Points pas encore enregistrés">
          <strong><Icone n="enregistrer" /> {liste.length > 1 ? `${liste.length} points pas encore enregistrés` : 'Un point pas encore enregistré'}</strong>
          <ul>
            {liste.map((b) => (
              <li key={b.t.id}>
                <span className="grow">
                  {nom(b)} <small className="muted">· {!enregistre(b) ? 'nouveau point' : 'modifié'} le {fmtDateTime(b.le)}</small>
                </span>
                <button className="btn primary small" onClick={() => setOuvert(b)}>Reprendre</button>
                <button className="btn small" onClick={() => abandonner(b)}>Abandonner</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ouvert && <TaskModal task={enregistre(ouvert) ?? ouvert.t} isNew={!enregistre(ouvert)} onClose={() => setOuvert(null)} />}
    </>
  );
}
