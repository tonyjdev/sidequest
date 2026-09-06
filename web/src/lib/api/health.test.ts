import { afterEach, describe, expect, it, vi } from 'vitest';

import { getHealth, parseHealth } from '@web/lib/api/health';

const document = {
  status: 'ok',
  app: 'sidequest',
  version: '0.1.0',
  uptime_s: 12,
  checks: { database: { status: 'ok', latency_ms: 3 } },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseHealth', () => {
  it('lee el documento de la sonda', () => {
    expect(parseHealth(document)).toEqual(document);
  });

  it('rechaza un documento incompleto', () => {
    expect(() => parseHealth({ status: 'ok' })).toThrow(/documento esperado/);
  });
});

describe('getHealth', () => {
  it('trata el 503 como respuesta, no como error: es la sonda diciendo qué falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ...document,
              status: 'error',
              checks: { database: { status: 'error', latency_ms: 0, message: 'sin conexión' } },
            }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );

    const health = await getHealth();

    expect(health.status).toBe('error');
    expect(health.checks.database.message).toBe('sin conexión');
  });
});
