/**
 * Comprobación de conectividad con la base de datos para `GET /api/v1/health`.
 *
 * Recibe el sondeo, no el pool: así la sonda se puede probar sin MySQL delante y
 * el adaptador real queda en `pool.ts`.
 */

/** Lo mínimo que la sonda necesita de un pool de MySQL. */
export interface DatabaseProbe {
  query(sql: string): Promise<unknown>;
}

export interface DatabaseCheck {
  readonly status: 'ok' | 'error';
  readonly latency_ms: number;
  readonly message?: string;
}

// No toca ninguna tabla a propósito: la sonda mide la conexión, y debe seguir
// respondiendo antes de que existan las migraciones de SQST-0005.
const PROBE_QUERY = 'SELECT 1';

export async function checkDatabase(probe: DatabaseProbe): Promise<DatabaseCheck> {
  const startedAt = performance.now();

  try {
    await probe.query(PROBE_QUERY);
    return { status: 'ok', latency_ms: elapsedMs(startedAt) };
  } catch (error) {
    return { status: 'error', latency_ms: elapsedMs(startedAt), message: describeFailure(error) };
  }
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message.trim() === '' ? 'La base de datos no respondió' : message;
}
