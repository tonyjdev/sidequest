import { createConnection } from 'mysql2/promise';

import { loadRootEnvFile } from '@app/config/env-file.js';
import { resolveHostDatabaseUrl } from '@app/db/database-url.js';
import { applyMigrations } from '@app/db/migrator.js';

/**
 * Aplica las migraciones pendientes. `pnpm db:migrate`.
 *
 * Se ejecuta desde la máquina anfitriona contra el puerto que publica Compose;
 * la aplicación no migra al arrancar, para que levantar el contenedor no cambie
 * el esquema sin que nadie lo haya pedido.
 */
loadRootEnvFile();

// Una conexión única y no un pool: el migrador es secuencial y así el proceso
// termina en cuanto acaba.
const connection = await createConnection(resolveHostDatabaseUrl(process.env));

try {
  await applyMigrations(connection);
  console.log('Migraciones aplicadas.');
} finally {
  await connection.end();
}
