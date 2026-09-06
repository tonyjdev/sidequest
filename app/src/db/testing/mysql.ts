import { createConnection } from 'mysql2/promise';

const CONNECT_TIMEOUT_MS = 2000;

/**
 * ¿Hay MySQL a la vista? Las suites de integración se saltan enteras cuando no
 * lo hay, para que `pnpm check` siga siendo ejecutable sin Docker.
 */
export async function canConnect(url: string): Promise<boolean> {
  try {
    const connection = await createConnection({ uri: url, connectTimeout: CONNECT_TIMEOUT_MS });

    await connection.end();

    return true;
  } catch {
    return false;
  }
}
