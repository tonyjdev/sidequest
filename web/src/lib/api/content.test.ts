import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  archiveContent,
  createContent,
  getContentCatalog,
  publishContent,
  reorderContent,
  updateContent,
} from '@web/lib/api/content';
import { ApiClientError } from '@web/lib/api/errors';

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

const calls: Call[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function node(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    slug: `nodo-${String(id)}`,
    name: `Nodo ${String(id)}`,
    description: null,
    status: 'draft',
    position: id,
    created_at: '2026-09-07T10:00:00.000Z',
    updated_at: '2026-09-07T10:00:00.000Z',
    ...extra,
  };
}

function stub(responder: (url: string) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      calls.push({
        url: input,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      });

      return Promise.resolve(responder(input));
    }),
  );
}

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catálogo de contenido', () => {
  it('pide los tres niveles sin filtrar y los devuelve con su padre y su recuento', async () => {
    stub((url) => {
      if (url.startsWith('/api/v1/subjects')) return jsonResponse({ items: [node(1)] });
      if (url.startsWith('/api/v1/topics')) {
        return jsonResponse({ items: [node(10, { subject_id: 1 })] });
      }

      return jsonResponse({ items: [node(100, { topic_id: 10, question_count: 4 })] });
    });

    const catalog = await getContentCatalog();

    expect(calls.map((call) => call.url).sort()).toEqual([
      '/api/v1/subjects',
      '/api/v1/subtopics',
      '/api/v1/topics',
    ]);
    expect(catalog.topics[0]?.subject_id).toBe(1);
    expect(catalog.subtopics[0]).toMatchObject({ topic_id: 10, question_count: 4 });
  });

  it('rechaza un listado sin la forma acordada', async () => {
    stub(() => jsonResponse({ items: [{ id: 1 }] }));

    await expect(getContentCatalog()).rejects.toBeInstanceOf(ApiClientError);
  });

  it('conserva el mensaje del servidor cuando rechaza', async () => {
    stub(() =>
      jsonResponse({ error: { code: 'internal_error', message: 'La base no responde' } }, 500),
    );

    await expect(getContentCatalog()).rejects.toMatchObject({
      code: 'internal_error',
      message: 'La base no responde',
    });
  });
});

describe('escrituras de la jerarquía', () => {
  beforeEach(() => {
    stub(() => jsonResponse(node(1)));
  });

  it('manda el padre en el cuerpo del alta, y ninguno en el de la materia', async () => {
    await createContent('subjects', null, { slug: 'algebra', name: 'Álgebra', description: null });
    await createContent('topics', 3, { slug: 'algebra', name: 'Álgebra', description: null });
    await createContent('subtopics', 7, {
      slug: 'ecuaciones',
      name: 'Ecuaciones',
      description: 'Con texto',
    });

    expect(calls[0]).toMatchObject({
      url: '/api/v1/subjects',
      method: 'POST',
      body: { slug: 'algebra', name: 'Álgebra', description: null },
    });
    expect(calls[1]?.body).toMatchObject({ subject_id: 3 });
    expect(calls[2]?.body).toMatchObject({ topic_id: 7, description: 'Con texto' });
  });

  it('edita con PATCH y mueve el estado por su propia ruta', async () => {
    await updateContent('topics', 3, { slug: 'algebra', name: 'Álgebra', description: null });
    await publishContent('topics', 3);
    await archiveContent('subtopics', 9);

    expect(calls[0]).toMatchObject({ url: '/api/v1/topics/3', method: 'PATCH' });
    expect(calls[1]).toMatchObject({ url: '/api/v1/topics/3/publish', method: 'POST' });
    expect(calls[2]).toMatchObject({ url: '/api/v1/subtopics/9/archive', method: 'POST' });
  });

  it('reordena con la lista completa de hermanos y con su padre', async () => {
    stub(() => jsonResponse({ items: [node(1), node(2)] }));

    await reorderContent('subtopics', 3, [9, 8]);
    await reorderContent('subjects', null, [2, 1]);

    expect(calls[0]).toMatchObject({
      url: '/api/v1/subtopics/reorder',
      method: 'POST',
      body: { topic_id: 3, ids: [9, 8] },
    });
    expect(calls[1]?.body).toEqual({ ids: [2, 1] });
  });
});
