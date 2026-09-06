import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@web': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    port: Number(process.env['WEB_PORT'] ?? 5173),
  },
});
