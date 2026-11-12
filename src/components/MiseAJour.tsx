import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { mettreAJour, useMiseAJourDisponible } from '../miseAJour';
import { Icone } from './icones';

/**
 * Une fenêtre ouverte (fiche d'un point, formulaire…) ou une saisie en cours : on la laisse finir avant de bloquer
 * l'appli, pour que rien de ce qui n'est pas encore enregistré ne soit perdu.
 */
const occupe = () =>
  !!document.querySelector('.modal-back') || !!document.activeElement?.closest?.('input, textarea, select, [contenteditable="true"]');

/**
 * Appli pas à jour (miseAJour.ts) : une nouvelle version a été publiée depuis son ouverture. L'appli est bloquée jusqu'à
 * sa mise à jour : un écran par-dessus tout, avec le seul bouton « Mettre à jour l'application » (la page est rechargée ;
 * rien de ce qui est enregistré n'est perdu), sans « Plus tard ». Une fenêtre ouverte ou une saisie en cours est d'abord
 * terminée : en attendant, un avis en haut de l'écran (par-dessus les fenêtres, sans bouton : il ne cache pas leurs
 * boutons du bas) dit de terminer et d'enregistrer ; l'écran vient dès que c'est fait. Affiché partout, même sur l'écran
 * de connexion ou après une erreur d'affichage (main.tsx).
 */
export function BandeauMiseAJour() {
  const dispo = useMiseAJourDisponible();
  const [bloquee, setBloquee] = useState(false);
  const [enCours, setEnCours] = useState(false);

  // Dès que plus rien n'est en cours : bloquée.
  useEffect(() => {
    if (!dispo || bloquee) return;
    const voir = () => {
      if (!occupe()) setBloquee(true);
    };
    voir();
    const t = setInterval(voir, 1000);
    document.addEventListener('focusout', voir);
    return () => {
      clearInterval(t);
      document.removeEventListener('focusout', voir);
    };
  }, [dispo, bloquee]);

  // Bloquée : le reste de l'appli ne réagit plus (ni clic, ni clavier : Ctrl+Z, raccourcis…).
  useEffect(() => {
    if (!bloquee) return;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const clavier = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.('.maj-bloquee')) return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', clavier, true);
    return () => {
      root?.removeAttribute('inert');
      window.removeEventListener('keydown', clavier, true);
    };
  }, [bloquee]);

  if (!dispo) return null;
  if (bloquee)
    return createPortal(
      <div className="maj-bloquee" role="alertdialog" aria-modal="true" aria-labelledby="maj-titre" aria-describedby="maj-texte">
        <div className="maj-bloquee-carte">
          <Icone n="nouveau" />
          <h2 id="maj-titre">Mise à jour de l’appli</h2>
          <p id="maj-texte">
            Une nouvelle version de l’appli a été publiée. Mets-la à jour pour continuer : une version dépassée peut causer
            des erreurs. Rien de ce qui est enregistré n’est perdu.
          </p>
          <button className="btn primary" disabled={enCours} autoFocus onClick={() => { setEnCours(true); void mettreAJour(); }}>
            <Icone n="recharger" /> {enCours ? 'Mise à jour…' : 'Mettre à jour l’application'}
          </button>
        </div>
      </div>,
      document.body,
    );
  return (
    <div className="maj-appli" role="status" aria-label="Mise à jour de l’application">
      <Icone n="nouveau" />
      <span>Nouvelle version de l’appli : termine et enregistre ce que tu fais, elle se mettra à jour ensuite.</span>
    </div>
  );
}
