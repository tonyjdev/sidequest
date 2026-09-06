import { createConnection } from 'mysql2/promise';

import { loadRootEnvFile } from '@app/config/env-file.js';
import { createDb } from '@app/db/client.js';
import { resolveHostDatabaseUrl } from '@app/db/database-url.js';
import { seedDevelopmentContent } from '@app/db/seeder.js';

/**
 * Siembra el contenido de desarrollo. `pnpm db:seed`.
 *
 * Requiere las migraciones aplicadas. No es parte del arranque de la
 * aplicación: una instalación real empieza vacía y se llena importando.
 */
loadRootEnvFile();

const connection = await createConnection(resolveHostDatabaseUrl(process.env));

try {
  const outcome = await seedDevelopmentContent(createDb(connection));

  console.log(
    outcome === 'skipped'
      ? 'El contenido de ejemplo ya estaba sembrado; no se ha escrito nada.'
      : 'Contenido de ejemplo sembrado.',
  );
} finally {
  await connection.end();
}
