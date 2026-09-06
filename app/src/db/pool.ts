import { createPool as createMysqlPool, type Pool } from 'mysql2/promise';

import type { DatabaseProbe } from '@app/db/health-check.js';

// Corto a propósito: la sonda de salud tiene que contestar 503 en un tiempo
// razonable cuando MySQL está caído, no quedarse esperando al timeout del sistema.
const CONNECT_TIMEOUT_MS = 2000;

/**
 * Pool de conexiones de la aplicación. Es la conexión sobre la que SQST-0005
 * monta Drizzle; aquí solo la usa la sonda de salud.
 */
export function createPool(databaseUrl: string): Pool {
  return createMysqlPool({
    uri: databaseUrl,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: CONNECT_TIMEOUT_MS,
  });
}

/** Adapta el pool al sondeo mínimo que necesita `checkDatabase`. */
export function toDatabaseProbe(pool: Pool): DatabaseProbe {
  return { query: (sql) => pool.query(sql) };
}
