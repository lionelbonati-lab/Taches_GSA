import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './data/store';
import { App } from './App';
import { initPwa } from './pwa';
import './styles.css';

initPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
