import fastifyCors from '@fastify/cors';
import Fastify, { type FastifyError } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
  type ZodFastifySchemaValidationError,
} from 'fastify-type-provider-zod';

import { ApiError, type ApiErrorCode, type FieldIssue } from '@app/api/errors.js';
import { subjectRoutes, subtopicRoutes, topicRoutes } from '@app/api/routes/content.js';
import { healthRoutes } from '@app/api/routes/health.js';
import type { AppConfig } from '@app/config/env.js';
import type { DatabaseCheck } from '@app/db/health-check.js';
import { DomainError, type DomainErrorKind } from '@app/domain/errors.js';
import type { Repositories } from '@app/domain/repositories.js';

/** Prefijo de todas las rutas de la API. Ver docs/especificacion.md §5. */
export const API_PREFIX = '/api/v1';

// Lo único que ve el cliente ante un fallo no previsto: el detalle queda en el log.
const INTERNAL_MESSAGE = 'Error interno del servidor';

/**
 * El único punto donde una razón del dominio se convierte en un estado HTTP. El
 * dominio no conoce el 422 ni el 409; el MCP hará su propia traducción sin
 * repetir ninguna regla.
 */
const API_CODE_BY_DOMAIN_KIND: Readonly<Record<DomainErrorKind, ApiErrorCode>> = {
  invalid: 'validation_failed',
  not_found: 'not_found',
  conflict: 'conflict',
};

export interface ServerDependencies {
  readonly config: AppConfig;
  readonly checkDatabase: () => Promise<DatabaseCheck>;
  readonly repositories: Repositories;
}

export async function buildServer({ config, checkDatabase, repositories }: ServerDependencies) {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Lista de un solo origen —el panel— en vez de una cadena fija: así
  // @fastify/cors compara con el `Origin` de la petición y omite la cabecera
  // cuando no coincide, en lugar de anunciar la URL del panel a cualquiera.
  await app.register(fastifyCors, { origin: [config.webPublicUrl] });

  app.setNotFoundHandler((request, reply) => {
    const error = new ApiError('not_found', 'La ruta solicitada no existe', {
      method: request.method,
      path: request.url.split('?')[0] ?? request.url,
    });

    return reply.code(error.statusCode).send(error.toBody());
  });

  app.setErrorHandler((error, request, reply) => {
    const apiError = toApiError(error);

    if (apiError.code === 'internal_error') {
      request.log.error({ err: error }, 'fallo no controlado');
    } else {
      request.log.info({ err: error }, apiError.message);
    }

    return reply.code(apiError.statusCode).send(apiError.toBody());
  });

  await app.register(healthRoutes({ checkDatabase }), { prefix: API_PREFIX });
  await app.register(subjectRoutes({ repositories }), { prefix: API_PREFIX });
  await app.register(topicRoutes({ repositories }), { prefix: API_PREFIX });
  await app.register(subtopicRoutes({ repositories }), { prefix: API_PREFIX });

  return app;
}

/**
 * Traduce cualquier cosa lanzada dentro de Fastify al mapa cerrado de códigos.
 * Es el único punto donde se decide el estado HTTP de un error.
 */
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof DomainError) {
    return new ApiError(API_CODE_BY_DOMAIN_KIND[error.kind], error.message, error.details);
  }

  if (typeof error !== 'object' || error === null) {
    return new ApiError('internal_error', INTERNAL_MESSAGE);
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    return new ApiError(
      'validation_failed',
      'Los datos enviados no son válidos',
      error.validation.map(toFieldIssue),
    );
  }

  // La respuesta no encaja con su propio esquema: es un fallo nuestro, no del cliente.
  if (isResponseSerializationError(error)) {
    return new ApiError('internal_error', INTERNAL_MESSAGE);
  }

  const status = statusCodeOf(error);

  if (status === 404) return new ApiError('not_found', 'La ruta solicitada no existe');
  if (status === 409) return new ApiError('conflict', clientSafeMessage(error));
  if (status >= 400 && status < 500) {
    return new ApiError('validation_failed', clientSafeMessage(error));
  }

  return new ApiError('internal_error', INTERNAL_MESSAGE);
}

function toFieldIssue(issue: ZodFastifySchemaValidationError): FieldIssue {
  const field = issue.instancePath.replace(/^\//, '').replaceAll('/', '.');

  return { field: field === '' ? '(cuerpo)' : field, message: issue.message ?? 'valor no válido' };
}

function statusCodeOf(error: object): number {
  const { statusCode } = error as Partial<FastifyError>;

  return typeof statusCode === 'number' ? statusCode : 500;
}

// Los 4xx que fabrica Fastify —cuerpo mal formado, tipo de contenido no admitido—
// llevan un mensaje accionable y sin datos internos, así que se propaga tal cual.
function clientSafeMessage(error: object): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : INTERNAL_MESSAGE;
}
