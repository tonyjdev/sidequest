import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@web/App';

const container = document.getElementById('root');

if (!container) {
  throw new Error('No se encontró el contenedor #root del panel');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
