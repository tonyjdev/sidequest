import { describe, expect, it } from 'vitest';

import { buildServer } from '@app/api/server.js';
import { APP_NAME, APP_VERSION } from '@app/app-info.js';
import { loadConfig } from '@app/config/env.js';
import type { DatabaseCheck } from '@app/db/health-check.js';
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';

const config = loadConfig({
  DATABASE_URL: 'mysql://sidequest:secreta@mysql:3306/sidequest',
  SIDEQUEST_ATTEMPT_SECRET: 'a'.repeat(64),
  LOG_LEVEL: 'silent',
});

const repositories = createInMemoryRepositories();

interface HealthBody {
  status: string;
  app: string;
  version: string;
  uptime_s: number;
  checks: { database: DatabaseCheck };
}

async function probe(database: DatabaseCheck) {
  const app = await buildServer({
    config,
    repositories,
    checkDatabase: () => Promise.resolve(database),
  });
  const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
  await app.close();

  return response;
}

describe('GET /api/v1/health', () => {
  it('responde 200 con la base de datos disponible', async () => {
    const response = await probe({ status: 'ok', latency_ms: 3 });

    expect(response.statusCode).toBe(200);
    expect(response.json<HealthBody>()).toEqual({
      status: 'ok',
      app: APP_NAME,
      version: APP_VERSION,
      uptime_s: expect.any(Number) as number,
      checks: { database: { status: 'ok', latency_ms: 3 } },
    });
  });

  it('responde 503 sin la base de datos', async () => {
    const response = await probe({
      status: 'error',
      latency_ms: 2003,
      message: 'connect ECONNREFUSED mysql:3306',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<HealthBody>().status).toBe('error');
  });

  it('mantiene la carga útil de salud en el 503, para que se vea qué comprobación falló', async () => {
    const response = await probe({
      status: 'error',
      latency_ms: 2003,
      message: 'connect ECONNREFUSED mysql:3306',
    });
    const body = response.json<HealthBody>();

    expect(body.version).toBe(APP_VERSION);
    expect(body.checks.database).toEqual({
      status: 'error',
      latency_ms: 2003,
      message: 'connect ECONNREFUSED mysql:3306',
    });
    expect(body).not.toHaveProperty('error');
  });

  it('no cuelga de la raíz: la sonda vive bajo el prefijo de la API', async () => {
    const app = await buildServer({
      config,
      repositories,
      checkDatabase: () => Promise.resolve({ status: 'ok' as const, latency_ms: 1 }),
    });

    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(404);

    await app.close();
  });
});
