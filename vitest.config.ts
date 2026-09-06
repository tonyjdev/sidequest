import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const appSrc = fileURLToPath(new URL('./app/src', import.meta.url));
const webSrc = fileURLToPath(new URL('./web/src', import.meta.url));

// Un proyecto por paquete: comparten el ejecutor pero no el entorno. El panel
// se prueba en un DOM simulado —navega, dibuja y pinta sus estados— sin que la
// aplicación, que no tiene navegador, cargue nada de eso.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { '@app': appSrc } },
        test: {
          name: 'app',
          root: './app',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: { '@web': webSrc } },
        test: {
          name: 'web',
          root: './web',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
