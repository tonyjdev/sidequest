import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import type { Connection, Pool } from 'mysql2/promise';

import * as schema from '@app/db/schema.js';

/**
 * Cliente Drizzle sobre una conexión ya creada. Los repositorios llegan en
 * SQST-0006; aquí solo se ata el esquema al pool para que el sembrado, las
 * migraciones y las pruebas hablen con la base por el mismo sitio.
 */
export type Database = MySql2Database<typeof schema>;

export function createDb(connection: Pool | Connection): Database {
  return drizzle(connection, { schema, mode: 'default' });
}
