import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * jsdom no implementa `matchMedia`, y el panel la consulta para seguir el tema
 * del sistema. Se responde «prefiere claro», que es el punto de partida de las
 * pruebas; la que necesite oscuro sustituye la consulta.
 */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
      addListener: () => undefined,
      removeListener: () => undefined,
    }) as MediaQueryList;
}

// Sin `globals`, la limpieza automática de Testing Library no se engancha sola.
afterEach(() => {
  cleanup();
});
