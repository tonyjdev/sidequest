import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest, buildUrl } from '@web/lib/api/client';
import { ApiClientError, NETWORK_MESSAGE } from '@web/lib/api/errors';

const raw = (body: unknown) => body;

function stubFetch(response: Response | Promise<never>) {
  const fetchMock = vi.fn(() =>
    response instanceof Response ? Promise.resolve(response) : response,
  );

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildUrl', () => {
  it('cuelga la ruta del prefijo de la API', () => {
    expect(buildUrl('/subjects')).toBe('/api/v1/subjects');
  });

  it('añade los parámetros presentes y omite los indefinidos', () => {
    expect(buildUrl('/questions', { status: 'draft', limit: 50, search: undefined })).toBe(
      '/api/v1/questions?status=draft&limit=50',
    );
  });
});

describe('apiRequest', () => {
  it('devuelve el cuerpo analizado de una respuesta correcta', async () => {
    const fetchMock = stubFetch(jsonResponse({ items: [] }));

    await expect(apiRequest('/subjects', { parse: raw })).resolves.toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/subjects',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('conserva el mensaje del servidor cuando llega el envoltorio de error', async () => {
    stubFetch(
      jsonResponse(
        {
          error: {
            code: 'validation_failed',
            message: 'Los datos enviados no son válidos',
            details: [{ field: 'slug', message: 'ya está en uso' }],
          },
        },
        422,
      ),
    );

    const error = await apiRequest('/subjects', { parse: raw }).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'validation_failed',
      message: 'Los datos enviados no son válidos',
      status: 422,
    });
    expect((error as ApiClientError).fieldIssues).toEqual([
      { field: 'slug', message: 'ya está en uso' },
    ]);
  });

  it('avisa de que la respuesta no trae el formato de error acordado', async () => {
    stubFetch(new Response('<html>502</html>', { status: 502 }));

    const error = await apiRequest('/subjects', { parse: raw }).catch((value: unknown) => value);

    expect(error).toMatchObject({ code: 'invalid_response', status: 502 });
  });

  it('distingue un fallo de red de un rechazo del servidor', async () => {
    stubFetch(Promise.reject(new TypeError('Failed to fetch')));

    const error = await apiRequest('/subjects', { parse: raw }).catch((value: unknown) => value);

    expect(error).toMatchObject({ code: 'network_error', message: NETWORK_MESSAGE, status: null });
  });

  it('propaga la cancelación en lugar de convertirla en error de red', async () => {
    stubFetch(Promise.reject(new DOMException('cancelada', 'AbortError')));

    const error = await apiRequest('/subjects', { parse: raw }).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(DOMException);
  });

  it('acepta como respuesta los estados que el endpoint declara suyos', async () => {
    stubFetch(jsonResponse({ status: 'error' }, 503));

    await expect(apiRequest('/health', { parse: raw, acceptStatus: [503] })).resolves.toEqual({
      status: 'error',
    });
  });

  it('serializa el cuerpo de escritura como JSON', async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 1 }, 201));

    await apiRequest('/subjects', { parse: raw, method: 'POST', body: { name: 'Álgebra' } });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/subjects',
      expect.objectContaining({ method: 'POST', body: '{"name":"Álgebra"}' }),
    );
  });
});
