import { describe, expect, it } from 'vitest';

import { checkDatabase, type DatabaseProbe } from '@app/db/health-check.js';

const respondiendo: DatabaseProbe = { query: () => Promise.resolve([[{ '1': 1 }], []]) };

describe('checkDatabase', () => {
  it('informa de estado ok cuando la base responde', async () => {
    const check = await checkDatabase(respondiendo);

    expect(check.status).toBe('ok');
    expect(check.message).toBeUndefined();
  });

  it('mide la latencia como un entero de milisegundos, que es lo que expone la sonda', async () => {
    const check = await checkDatabase(respondiendo);

    expect(Number.isInteger(check.latency_ms)).toBe(true);
    expect(check.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('sondea con SELECT 1, que no depende de que exista ninguna tabla', async () => {
    const consultas: string[] = [];

    await checkDatabase({
      query: (sql) => {
        consultas.push(sql);
        return Promise.resolve([[], []]);
      },
    });

    expect(consultas).toEqual(['SELECT 1']);
  });

  it('convierte el fallo de conexión en estado error con su motivo, sin propagarlo', async () => {
    const check = await checkDatabase({
      query: () => Promise.reject(new Error('connect ECONNREFUSED mysql:3306')),
    });

    expect(check).toMatchObject({
      status: 'error',
      message: 'connect ECONNREFUSED mysql:3306',
    });
  });

  it('describe un fallo sin mensaje, para que la sonda nunca devuelva un motivo vacío', async () => {
    const check = await checkDatabase({ query: () => Promise.reject(new Error('')) });

    expect(check.status).toBe('error');
    expect(check.message).toBeTruthy();
  });
});
