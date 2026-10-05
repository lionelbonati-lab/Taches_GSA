import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getMode, modeFromUrl } from './data/mode';
import { DemoApp } from './DemoApp';
import { CloudApp } from './CloudApp';
import { Welcome } from './pages/Real';
import { initPwa } from './pwa';
import { applyAppIcon, cachedLogo } from './data/logo';
import './styles.css';

initPwa();
modeFromUrl();
// Dernier logo affiché sur cet appareil : icône de l'appli dès le lancement.
void applyAppIcon(cachedLogo());

// Démo (données fictives dans ce navigateur), version réelle (serveur) ou, au premier passage, l'écran de choix.
const mode = getMode();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {mode === 'reel' ? (
      <CloudApp />
    ) : mode === 'demo' ? (
      <DemoApp />
    ) : (
      <Welcome />
    )}
  </StrictMode>,
);
