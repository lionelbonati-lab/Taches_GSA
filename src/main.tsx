import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getMode, modeFromUrl } from './data/mode';
import { oublierEntiteDuLien } from './data/lienPartage';
import { DemoApp } from './DemoApp';
import { CloudApp } from './CloudApp';
import { Welcome } from './pages/Real';
import { initPwa } from './pwa';
import { suivreMisesAJour } from './miseAJour';
import { BandeauMiseAJour } from './components/MiseAJour';
import { suivreClavier } from './clavier';
import { applyAppColor, cachedColor } from './data/couleur';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installerRapport } from './data/rapportErreurs';
import './styles.css';

initPwa();
// Nouvelle version publiée depuis l'ouverture : bandeau « Mettre à jour l'application ».
suivreMisesAJour();
suivreClavier();
// Erreurs de script signalées aux admins du club, une fois l'appli connectée (Layout).
installerRapport();
oublierEntiteDuLien();
modeFromUrl();
// Dernière couleur de l'appli sur cet appareil, dès le lancement (écran de connexion).
applyAppColor(cachedColor());

// Démo (données fictives dans ce navigateur), version réelle (serveur) ou, au premier passage, l'écran de choix.
const mode = getMode();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {mode === 'reel' ? (
        <CloudApp />
      ) : mode === 'demo' ? (
        <DemoApp />
      ) : (
        <Welcome />
      )}
    </ErrorBoundary>
    <BandeauMiseAJour />
  </StrictMode>,
);
