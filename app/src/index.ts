import { buildServer } from '@app/api/server.js';
import { loadConfig, type AppConfig } from '@app/config/env.js';
import { createDb } from '@app/db/client.js';
import { checkDatabase } from '@app/db/health-check.js';
import { createPool, toDatabaseProbe } from '@app/db/pool.js';
import { createRepositories } from '@app/db/repositories/index.js';

const config = loadConfigOrExit();
const pool = createPool(config.databaseUrl);
const probe = toDatabaseProbe(pool);

const app = await buildServer({
  config,
  checkDatabase: () => checkDatabase(probe),
  repositories: createRepositories(createDb(pool)),
});

// Docker envía SIGTERM al parar el contenedor. Sin cerrar aquí, esperaría diez
// segundos a que el proceso reaccione antes de matarlo.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'no se pudo abrir el puerto');
  await pool.end();
  process.exit(1);
}

/**
 * La configuración se valida antes de abrir nada. Un fallo aquí se imprime en
 * claro —el proceso aún no tiene registro— y termina: arrancar a medias con una
 * variable ausente es peor que no arrancar.
 */
function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'apagando');

  try {
    // Primero el servidor y después el pool: al revés, una petición en vuelo se
    // quedaría sin base de datos.
    await app.close();
    await pool.end();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'fallo durante el apagado');
    process.exit(1);
  }
}
