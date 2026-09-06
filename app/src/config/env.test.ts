import { describe, expect, it } from 'vitest';

import { loadConfig } from '@app/config/env.js';

const requiredEnv = {
  DATABASE_URL: 'mysql://sidequest:secreta@mysql:3306/sidequest',
  SIDEQUEST_ATTEMPT_SECRET: 'a'.repeat(64),
};

describe('loadConfig', () => {
  it('aplica los valores por defecto cuando solo están las variables obligatorias', () => {
    const config = loadConfig(requiredEnv);

    expect(config).toMatchObject({
      env: 'development',
      host: '0.0.0.0',
      port: 3000,
      webPublicUrl: 'http://localhost:5173',
      databaseUrl: requiredEnv.DATABASE_URL,
    });
  });

  it('falla nombrando la variable obligatoria que falta', () => {
    expect(() => loadConfig({ SIDEQUEST_ATTEMPT_SECRET: 'a'.repeat(64) })).toThrow(/DATABASE_URL/);
  });

  it('nombra todas las variables inválidas, no solo la primera', () => {
    let message = '';
    try {
      loadConfig({});
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('SIDEQUEST_ATTEMPT_SECRET');
  });

  it('rechaza un puerto que no es un número', () => {
    expect(() => loadConfig({ ...requiredEnv, APP_PORT: 'ochenta' })).toThrow(/APP_PORT/);
  });

  it('rechaza una DATABASE_URL que no apunta a MySQL', () => {
    expect(() => loadConfig({ ...requiredEnv, DATABASE_URL: 'postgres://u@h:5432/d' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rechaza un secreto de intento demasiado corto para firmar', () => {
    expect(() => loadConfig({ ...requiredEnv, SIDEQUEST_ATTEMPT_SECRET: 'corto' })).toThrow(
      /SIDEQUEST_ATTEMPT_SECRET/,
    );
  });

  it('convierte APP_PORT a número, porque el entorno solo entrega cadenas', () => {
    expect(loadConfig({ ...requiredEnv, APP_PORT: '4000' }).port).toBe(4000);
  });
});
