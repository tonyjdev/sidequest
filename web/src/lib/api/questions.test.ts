import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@web/lib/api/errors';
import {
  changeQuestionStatus,
  createQuestion,
  getQuestion,
  listQuestions,
} from '@web/lib/api/questions';

/**
 * El cliente de preguntas: cómo se arma el filtro y qué pasa cuando la respuesta
 * no tiene la forma acordada.
 */

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

const question = {
  id: 1,
  subtopic_id: 100,
  type: 'single',
  statement: '¿Cuál es la solución?',
  explanation: null,
  difficulty: 'medium',
  status: 'draft',
  visible_options: null,
  version: 1,
  content_hash: 'a'.repeat(64),
  created_at: '2026-09-07T10:00:00.000Z',
  updated_at: '2026-09-07T10:00:00.000Z',
};

const detail = {
  ...question,
  options: [{ id: 11, text: 'x = −3', is_correct: true, position: 1 }],
  resources: [
    {
      id: 21,
      kind: 'page',
      url: 'https://es.wikipedia.org',
      label: null,
      storage_kind: 'external',
      position: 1,
    },
  ],
  tags: [{ id: 5, slug: 'basico', name: 'Básico', created_at: '2026-09-07T10:00:00.000Z' }],
};

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

describe('cliente de preguntas', () => {
  it('manda cada filtro con su parámetro y omite los que no hay', async () => {
    stub(() => jsonResponse({ items: [question] }));

    await listQuestions({
      status: ['draft', 'published'],
      subtopic_id: 100,
      difficulty: 'hard',
      tag_id: 5,
      search: '  ecuación  ',
      limit: 26,
      offset: 25,
    });

    const url = calls[0]?.url ?? '';

    expect(url).toContain('status=draft%2Cpublished');
    expect(url).toContain('subtopic_id=100');
    expect(url).toContain('difficulty=hard');
    expect(url).toContain('tag_id=5');
    expect(url).toContain('search=ecuaci%C3%B3n');
    expect(url).toContain('limit=26');
    expect(url).toContain('offset=25');
  });

  it('no manda la búsqueda cuando está en blanco', async () => {
    stub(() => jsonResponse({ items: [] }));

    await listQuestions({ search: '   ' });

    expect(calls[0]?.url).toBe('/api/v1/questions');
  });

  it('lee la ficha con lo que cuelga de la pregunta', async () => {
    stub(() => jsonResponse(detail));

    const loaded = await getQuestion(1);

    expect(loaded.options).toHaveLength(1);
    expect(loaded.resources[0]?.kind).toBe('page');
    expect(loaded.tags[0]?.name).toBe('Básico');
  });

  it('el alta lleva el estado con el que nace la pregunta', async () => {
    stub(() => jsonResponse(detail, 201));

    await createQuestion(
      {
        subtopic_id: 100,
        type: 'single',
        statement: '¿Cuál es la solución?',
        explanation: null,
        difficulty: 'medium',
        visible_options: null,
        options: [{ text: 'x = −3', is_correct: true }],
        resources: [],
        tag_ids: [],
      },
      'published',
    );

    expect(calls[0]).toMatchObject({ url: '/api/v1/questions', method: 'POST' });
    expect(calls[0]?.body).toMatchObject({ status: 'published' });
  });

  it('cada transición tiene su ruta', async () => {
    stub(() => jsonResponse(question));

    await changeQuestionStatus(1, 'unpublish');

    expect(calls[0]).toMatchObject({ url: '/api/v1/questions/1/unpublish', method: 'POST' });
  });

  it('una respuesta sin la forma acordada es un error del cliente', async () => {
    stub(() => jsonResponse({ items: [{ id: 'uno' }] }));

    await expect(listQuestions({})).rejects.toBeInstanceOf(ApiClientError);
  });
});
