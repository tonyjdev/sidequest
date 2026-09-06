import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// El `.env` vive en la raíz del repositorio, no en este paquete: es el mismo que
// lee Docker Compose, así que el panel en desarrollo usa los puertos de verdad.
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repositoryRoot, '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@web': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      host: true,
      port: Number(env['WEB_PORT'] ?? 5173),
      // El cliente de la API pide siempre rutas relativas. En el contenedor las
      // sirve el mismo origen que el panel; aquí las reenvía el proxy, para que
      // el código no tenga que saber en cuál de los dos se está ejecutando.
      proxy: {
        '/api': {
          target: env['API_PROXY_TARGET'] ?? `http://localhost:${env['APP_HOST_PORT'] ?? '3000'}`,
          changeOrigin: true,
        },
      },
    },
  };
});
