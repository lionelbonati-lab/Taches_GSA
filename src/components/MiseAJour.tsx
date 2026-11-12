import { useState } from 'react';
import { mettreAJour, useMiseAJourDisponible } from '../miseAJour';
import { Icone } from './icones';

/**
 * Bandeau « Mettre à jour l'application » : une nouvelle version a été publiée depuis l'ouverture de l'appli
 * (miseAJour.ts). Le bouton la charge (la page est rechargée : rien de ce qui est enregistré n'est perdu). Pas de « Plus
 * tard » : il reste jusqu'à la mise à jour, pour éviter les problèmes d'une version dépassée. Affiché partout, même sur
 * l'écran de connexion ou après une erreur d'affichage (main.tsx).
 */
export function BandeauMiseAJour() {
  const dispo = useMiseAJourDisponible();
  const [enCours, setEnCours] = useState(false);
  if (!dispo) return null;
  return (
    <div className="maj-appli" role="region" aria-label="Mise à jour de l’application">
      <Icone n="nouveau" />
      <span className="maj-appli-texte">
        <strong>Une nouvelle version de l’appli est disponible.</strong>
        <small>Mets-la à jour maintenant : une version dépassée peut causer des erreurs.</small>
      </span>
      <button className="btn primary" disabled={enCours} onClick={() => { setEnCours(true); void mettreAJour(); }}>
        <Icone n="recharger" /> {enCours ? 'Mise à jour…' : 'Mettre à jour l’application'}
      </button>
    </div>
  );
}
