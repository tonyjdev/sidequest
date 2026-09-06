import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ApiError, type ErrorBody } from '@app/api/errors.js';
import { buildServer } from '@app/api/server.js';
import { loadConfig } from '@app/config/env.js';
import { ConflictError, InvariantError, NotFoundError } from '@app/domain/errors.js';

const config = loadConfig({
  DATABASE_URL: 'mysql://sidequest:secreta@mysql:3306/sidequest',
  SIDEQUEST_ATTEMPT_SECRET: 'a'.repeat(64),
  WEB_PUBLIC_URL: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
});

const dependencies = {
  config,
  checkDatabase: () => Promise.resolve({ status: 'ok' as const, latency_ms: 1 }),
};

const SECRETO_INTERNO = 'la contraseña de MySQL es 1234';

/**
 * El manejador de errores es único, así que se prueba con rutas cualesquiera.
 * Viven aquí y no en `api/routes` porque no forman parte del contrato publicado.
 */
async function buildServerWithProbeRoutes() {
  const app = await buildServer(dependencies);

  app
    .withTypeProvider<ZodTypeProvider>()
    .post(
      '/api/v1/_pruebas/eco',
      { schema: { body: z.object({ name: z.string().min(3), age: z.number().int() }) } },
      (request) => Promise.resolve(request.body),
    );

  app.get('/api/v1/_pruebas/rota', () => {
    throw new Error(SECRETO_INTERNO);
  });

  app.get('/api/v1/_pruebas/conflicto', () => {
    throw new ApiError('conflict', 'Ya existe una materia con ese slug', [
      { field: 'slug', message: 'ya está en uso' },
    ]);
  });

  app.get('/api/v1/_pruebas/dominio/invariante', () => {
    throw new InvariantError('Una pregunta publicada necesita al menos dos opciones', {
      total: 1,
    });
  });

  app.get('/api/v1/_pruebas/dominio/ausente', () => {
    throw new NotFoundError('La materia no existe', { subjectId: 404 });
  });

  app.get('/api/v1/_pruebas/dominio/conflicto', () => {
    throw new ConflictError('No se puede publicar un tema cuya materia no está publicada');
  });

  return app;
}

describe('manejador de errores único', () => {
  it('devuelve 404 con el envelope propio en una ruta inexistente, no el de Fastify', async () => {
    const app = await buildServerWithProbeRoutes();
    const response = await app.inject({ method: 'GET', url: '/api/v1/no-existe' });

    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorBody>().error.code).toBe('not_found');

    await app.close();
  });

  it('nombra el método y la ruta que no existen', async () => {
    const app = await buildServerWithProbeRoutes();
    const response = await app.inject({ method: 'GET', url: '/api/v1/no-existe?x=1' });

    expect(response.json<ErrorBody>().error.details).toEqual({
      method: 'GET',
      path: '/api/v1/no-existe',
    });

    await app.close();
  });

  it('devuelve 422 con validation_failed y un detalle por campo inválido', async () => {
    const app = await buildServerWithProbeRoutes();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/_pruebas/eco',
      payload: { name: 'ab', age: 'treinta' },
    });

    expect(response.statusCode).toBe(422);

    const body = response.json<ErrorBody>();
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'age' }),
      ]),
    );

    await app.close();
  });

  it('traduce un ApiError a su estado y su código', async () => {
    const app = await buildServerWithProbeRoutes();
    const response = await app.inject({ method: 'GET', url: '/api/v1/_pruebas/conflicto' });

    expect(response.statusCode).toBe(409);
    expect(response.json<ErrorBody>()).toEqual({
      error: {
        code: 'conflict',
        message: 'Ya existe una materia con ese slug',
        details: [{ field: 'slug', message: 'ya está en uso' }],
      },
    });

    await app.close();
  });

  // El dominio no conoce el 422 ni el 409: los nombra por su razón y la
  // traducción vive solo aquí.
  it.each([
    ['invariante', 422, 'validation_failed'],
    ['ausente', 404, 'not_found'],
    ['conflicto', 409, 'conflict'],
  ])('traduce un error de dominio «%s» a %i', async (kind, status, code) => {
    const app = await buildServerWithProbeRoutes();
    const response = await app.inject({ method: 'GET', url: `/api/v1/_pruebas/dominio/${kind}` });

    expect(response.statusCode).toBe(status);
    expect(response.json<ErrorBody>().error.code).toBe(code);

    await app.close();
  });

  it('conserva el detalle del error de dominio', async () => {
    const app = await buildServerWithProbeRoutes();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/_pruebas/dominio/invariante',
    });

    expect(response.json<ErrorBody>().error).toEqual({
      code: 'validation_failed',
      message: 'Una pregunta publicada necesita al menos dos opciones',
      details: { total: 1 },
    });

    await app.close();
  });

  it('devuelve 500 con internal_error ante un fallo inesperado', async () => {
    const app = await buildServerWithProbeRoutes();
    const response = await app.inject({ method: 'GET', url: '/api/v1/_pruebas/rota' });

    expect(response.statusCode).toBe(500);
    expect(response.json<ErrorBody>().error.code).toBe('internal_error');

    await app.close();
  });

  it('no filtra el mensaje interno de la excepción al cliente', async () => {
    const app = await buildServerWithProbeRoutes();
    const response = await app.inject({ method: 'GET', url: '/api/v1/_pruebas/rota' });

    expect(response.body).not.toContain(SECRETO_INTERNO);

    await app.close();
  });

  it('responde siempre con las tres claves del envelope', async () => {
    const app = await buildServerWithProbeRoutes();

    for (const url of [
      '/api/v1/no-existe',
      '/api/v1/_pruebas/rota',
      '/api/v1/_pruebas/conflicto',
    ]) {
      const body = (await app.inject({ method: 'GET', url })).json<ErrorBody>();

      expect(Object.keys(body)).toEqual(['error']);
      expect(Object.keys(body.error).sort()).toEqual(['code', 'details', 'message']);
    }

    await app.close();
  });
});

describe('CORS', () => {
  it('abre el origen del panel', async () => {
    const app = await buildServerWithProbeRoutes();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    await app.close();
  });

  it('no abre ningún otro origen', async () => {
    const app = await buildServerWithProbeRoutes();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'http://malicioso.example' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });
});
