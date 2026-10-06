import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getMode, modeFromUrl } from './data/mode';
import { DemoApp } from './DemoApp';
import { CloudApp } from './CloudApp';
import { Welcome } from './pages/Real';
import { initPwa } from './pwa';
import { applyAppColor, cachedColor } from './data/couleur';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

initPwa();
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
  </StrictMode>,
);
