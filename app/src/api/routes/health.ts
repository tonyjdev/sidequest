import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { APP_NAME, APP_VERSION } from '@app/app-info.js';
import type { DatabaseCheck } from '@app/db/health-check.js';

const databaseCheckSchema = z.object({
  status: z.enum(['ok', 'error']),
  latency_ms: z.number().int().nonnegative(),
  message: z.string().optional(),
});

/**
 * La sonda devuelve el mismo documento con 200 y con 503, cambiando `status` y
 * el detalle de cada comprobación: quien monitoriza necesita saber *qué* falló,
 * no un mensaje genérico. El envelope de error cubre los endpoints de contenido.
 */
const healthSchema = z.object({
  status: z.enum(['ok', 'error']),
  app: z.string(),
  version: z.string(),
  uptime_s: z.number().int().nonnegative(),
  checks: z.object({ database: databaseCheckSchema }),
});

export interface HealthDependencies {
  readonly checkDatabase: () => Promise<DatabaseCheck>;
}

export function healthRoutes({ checkDatabase }: HealthDependencies): FastifyPluginAsyncZod {
  return (app) => {
    app.get(
      '/health',
      { schema: { response: { 200: healthSchema, 503: healthSchema } } },
      async (_request, reply) => {
        const database = await checkDatabase();

        return reply.code(database.status === 'ok' ? 200 : 503).send({
          status: database.status,
          app: APP_NAME,
          version: APP_VERSION,
          uptime_s: Math.floor(process.uptime()),
          checks: { database },
        });
      },
    );

    return Promise.resolve();
  };
}
