import { createConnection } from 'mysql2/promise';

import { loadRootEnvFile } from '@app/config/env-file.js';
import { resolveHostDatabaseUrl } from '@app/db/database-url.js';
import { rollbackLast } from '@app/db/migrator.js';

/**
 * Revierte la última migración aplicada. `pnpm db:rollback`.
 *
 * drizzle-kit solo genera el sentido de subida, así que cada migración lleva su
 * `drizzle/down/<tag>.down.sql` escrito a mano y esta es la forma de aplicarlo.
 */
loadRootEnvFile();

const connection = await createConnection(resolveHostDatabaseUrl(process.env));

try {
  const reverted = await rollbackLast(connection);

  console.log(
    reverted === null
      ? 'No hay ninguna migración aplicada que revertir.'
      : `Revertida ${reverted}.`,
  );
} finally {
  await connection.end();
}
