import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const appSrc = fileURLToPath(new URL('./app/src', import.meta.url));
const webSrc = fileURLToPath(new URL('./web/src', import.meta.url));

// Un proyecto por paquete: comparten el ejecutor pero no el entorno, para que el
// panel pueda pasar a un DOM simulado sin arrastrar a la aplicación.
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
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
