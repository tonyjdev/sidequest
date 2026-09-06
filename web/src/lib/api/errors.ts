/**
 * Contrato de error de la API (docs/especificacion.md §5): toda respuesta que no
 * sea 2xx llega con el mismo envoltorio, `{ error: { code, message, details } }`.
 *
 * El mapa del servidor es cerrado. `network_error` e `invalid_response` no salen
 * de él: los pone este cliente cuando la petición no llegó a viajar o cuando la
 * respuesta no tiene la forma acordada, y se distinguen a propósito para que un
 * fallo de red no se confunda con un rechazo del servidor.
 */
export const serverErrorCodes = [
  'validation_failed',
  'not_found',
  'conflict',
  'internal_error',
] as const;

export type ServerErrorCode = (typeof serverErrorCodes)[number];
export type ApiErrorCode = ServerErrorCode | 'network_error' | 'invalid_response';

/** Detalle de un campo que no pasó la validación, tal como lo envía la API. */
export interface FieldIssue {
  readonly field: string;
  readonly message: string;
}

export const NETWORK_MESSAGE =
  'No se pudo contactar con la API. Comprueba que la aplicación está levantada.';

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number | null = null,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** Los `details` de `validation_failed`, cuando llegan con la forma acordada. */
  get fieldIssues(): readonly FieldIssue[] {
    return Array.isArray(this.details) ? this.details.filter(isFieldIssue) : [];
  }
}

/**
 * Traduce el cuerpo de una respuesta fallida. El mensaje del servidor manda: solo
 * si el cuerpo no es el envoltorio acordado se recurre a uno propio, porque un
 * «error inesperado» esconde justo lo que la API acaba de explicar.
 */
export function toApiClientError(status: number, body: unknown): ApiClientError {
  const envelope = readEnvelope(body);

  if (envelope) {
    return new ApiClientError(envelope.code, envelope.message, status, envelope.details);
  }

  return new ApiClientError(
    'invalid_response',
    `La API respondió ${String(status)} sin el formato de error esperado`,
    status,
    body,
  );
}

/** Envuelve lo que sea que se haya lanzado, para que la interfaz reciba siempre lo mismo. */
export function asApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;

  return new ApiClientError(
    'invalid_response',
    error instanceof Error && error.message.trim() !== ''
      ? error.message
      : 'La respuesta de la API no se pudo interpretar',
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface Envelope {
  readonly code: ServerErrorCode;
  readonly message: string;
  readonly details: unknown;
}

function readEnvelope(body: unknown): Envelope | null {
  if (!isRecord(body) || !isRecord(body['error'])) return null;

  const { code, message, details } = body['error'];

  if (!isServerErrorCode(code) || typeof message !== 'string' || message === '') return null;

  return { code, message, details: details ?? null };
}

function isServerErrorCode(value: unknown): value is ServerErrorCode {
  return serverErrorCodes.includes(value as ServerErrorCode);
}

function isFieldIssue(value: unknown): value is FieldIssue {
  return (
    isRecord(value) && typeof value['field'] === 'string' && typeof value['message'] === 'string'
  );
}
