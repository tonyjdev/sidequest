import { apiRequest } from '@web/lib/api/client';
import { ApiClientError, isRecord } from '@web/lib/api/errors';

/**
 * Sonda de salud (docs/especificacion.md §5). Es el único endpoint que devuelve
 * el mismo documento con `200` y con `503`: quien la consulta necesita ver qué
 * comprobación falló, así que el `503` se acepta como respuesta y no como error.
 */
export interface HealthCheck {
  readonly status: 'ok' | 'error';
  readonly latency_ms: number;
  readonly message?: string;
}

export interface HealthDocument {
  readonly status: 'ok' | 'error';
  readonly app: string;
  readonly version: string;
  readonly uptime_s: number;
  readonly checks: { readonly database: HealthCheck };
}

export function getHealth(signal?: AbortSignal): Promise<HealthDocument> {
  return apiRequest('/health', {
    parse: parseHealth,
    acceptStatus: [503],
    ...(signal ? { signal } : {}),
  });
}

export function parseHealth(body: unknown): HealthDocument {
  if (!isRecord(body) || !isRecord(body['checks'])) throw invalidHealth();

  const database = parseCheck(body['checks']['database']);
  const { status, app, version, uptime_s: uptime } = body;

  if (
    !isStatus(status) ||
    typeof app !== 'string' ||
    typeof version !== 'string' ||
    typeof uptime !== 'number'
  ) {
    throw invalidHealth();
  }

  return { status, app, version, uptime_s: uptime, checks: { database } };
}

function parseCheck(value: unknown): HealthCheck {
  if (!isRecord(value) || !isStatus(value['status']) || typeof value['latency_ms'] !== 'number') {
    throw invalidHealth();
  }

  const message = value['message'];

  return {
    status: value['status'],
    latency_ms: value['latency_ms'],
    ...(typeof message === 'string' ? { message } : {}),
  };
}

function isStatus(value: unknown): value is 'ok' | 'error' {
  return value === 'ok' || value === 'error';
}

function invalidHealth(): ApiClientError {
  return new ApiClientError(
    'invalid_response',
    'La sonda de salud no devolvió el documento esperado',
  );
}
