import { defineConfig } from 'drizzle-kit';

import { resolveHostDatabaseUrl } from './app/src/db/database-url';

/**
 * Configuración de drizzle-kit: `pnpm db:generate`, `pnpm db:studio`.
 *
 * Vive en la raíz porque los comandos se ejecutan desde ahí, y así el `.env` y
 * las rutas se resuelven contra el directorio de trabajo sin sorpresas.
 * `pnpm db:migrate` no pasa por aquí: usa el migrador de drizzle-orm, que es el
 * mismo que ejecutan las pruebas de integración.
 */
process.loadEnvFile('.env');

export default defineConfig({
  dialect: 'mysql',
  schema: './app/src/db/schema.ts',
  out: './app/drizzle',
  dbCredentials: { url: resolveHostDatabaseUrl(process.env) },
  // Los `--> statement-breakpoint` son lo que el migrador usa para partir el
  // archivo en sentencias; sin ellos, una migración de varias líneas viajaría
  // como una sola consulta.
  breakpoints: true,
  verbose: true,
  strict: true,
});
