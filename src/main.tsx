import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Polices embarquées (disponibles hors ligne)
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/600.css';
import '@fontsource/eb-garamond/400-italic.css';
import './index.css';

import { App } from './app/App';
import { setupPwa } from './app/pwa';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

setupPwa();
