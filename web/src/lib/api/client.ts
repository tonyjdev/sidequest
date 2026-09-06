import { ApiClientError, NETWORK_MESSAGE, toApiClientError } from '@web/lib/api/errors';

/**
 * Cliente HTTP del panel. Es el único sitio que sabe hablar con la API: los
 * módulos de cada recurso solo describen su ruta y cómo se lee su respuesta.
 *
 * Las rutas son relativas a propósito. En producción el panel lo sirve el mismo
 * contenedor que la API, y en desarrollo el proxy de Vite reenvía `/api` al
 * puerto de la aplicación, así que el origen nunca aparece en el código.
 */
export const API_PREFIX = '/api/v1';

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions<T> {
  /** Convierte el cuerpo ya deserializado en el tipo del recurso. */
  readonly parse: (body: unknown) => T;
  readonly method?: 'GET' | 'POST' | 'PATCH';
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly signal?: AbortSignal;
  /**
   * Estados fuera del 2xx que el endpoint usa como respuesta legítima. La sonda
   * de salud responde `503` con su propio documento, no con el envoltorio de
   * error (docs/especificacion.md §5).
   */
  readonly acceptStatus?: readonly number[];
}

export async function apiRequest<T>(path: string, options: RequestOptions<T>): Promise<T> {
  const response = await send(path, options);
  const body = await readBody(response);

  if (!response.ok && !(options.acceptStatus ?? []).includes(response.status)) {
    throw toApiClientError(response.status, body);
  }

  return options.parse(body);
}

async function send(path: string, options: RequestOptions<unknown>): Promise<Response> {
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  };

  try {
    return await fetch(buildUrl(path, options.query), init);
  } catch (error) {
    // Una petición cancelada no es un fallo: la propaga tal cual para que quien
    // la canceló —un efecto que se desmonta— la reconozca y la ignore.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;

    throw new ApiClientError('network_error', NETWORK_MESSAGE, null, error);
  }
}

export function buildUrl(path: string, query?: Readonly<Record<string, QueryValue>>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.append(key, String(value));
  }

  const search = params.toString();

  return `${API_PREFIX}${path}${search === '' ? '' : `?${search}`}`;
}

/** `204` y los cuerpos vacíos llegan como `null`; el analizador del recurso decide si le vale. */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.trim() === '') return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
