import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { APP_NAME } from '@app/app-info.js';
import { createLivenessServer } from '@app/liveness.js';

const server = createLivenessServer();
let origin = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

describe('sonda de vida', () => {
  it('responde 200 en /health, que es lo que prueba el contenedor', async () => {
    const response = await fetch(`${origin}/health`);
    const body = (await response.json()) as { status: string; app: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', app: APP_NAME });
  });

  it('responde 404 en cualquier otra ruta', async () => {
    const response = await fetch(`${origin}/api/v1/questions`);

    expect(response.status).toBe(404);
  });
});
