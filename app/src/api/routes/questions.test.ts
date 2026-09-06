import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { ErrorBody } from '@app/api/errors.js';
import { buildServer } from '@app/api/server.js';
import { loadConfig } from '@app/config/env.js';
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';

/**
 * El contrato de `/questions` y `/tags` de punta a punta, con los repositorios
 * en memoria detrás: se ejerce la ruta real, el esquema real y el manejador de
 * errores real, y se comprueba lo que sale por el cable.
 *
 * Los repositorios en memoria imitan lo que la base impone por su cuenta —la
 * versión que sube sola, las invariantes de publicación, la atomicidad de la
 * escritura del agregado—, así que lo que se prueba aquí es el contrato, no el
 * SQL, que tiene su propia suite de integración.
 */

const config = loadConfig({
  DATABASE_URL: 'mysql://sidequest:secreta@mysql:3306/sidequest',
  SIDEQUEST_ATTEMPT_SECRET: 'a'.repeat(64),
  LOG_LEVEL: 'silent',
});

const repositories = createInMemoryRepositories();

const app = await buildServer({
  config,
  repositories,
  checkDatabase: () => Promise.resolve({ status: 'ok' as const, latency_ms: 1 }),
});

interface OptionBody {
  id: number;
  text: string;
  is_correct: boolean;
  position: number;
}

interface ResourceBody {
  id: number;
  kind: string;
  url: string;
  label: string | null;
  storage_kind: string;
  position: number;
}

interface TagBody {
  id: number;
  slug: string;
  name: string;
  created_at: string;
}

interface QuestionBody {
  id: number;
  subtopic_id: number;
  type: string;
  statement: string;
  explanation: string | null;
  difficulty: string;
  status: string;
  visible_options: number | null;
  version: number;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

interface QuestionDetailBody extends QuestionBody {
  options: OptionBody[];
  resources: ResourceBody[];
  tags: TagBody[];
}

interface Items<T> {
  items: T[];
}

const get = (url: string) => app.inject({ method: 'GET', url: `/api/v1${url}` });
const post = (url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, payload });
const patch = (url: string, payload: object) =>
  app.inject({ method: 'PATCH', url: `/api/v1${url}`, payload });

const OPTIONS = [
  { text: 'x = −3', is_correct: true },
  { text: 'x = 3', is_correct: false },
];

let subtopicId = 0;

async function newQuestion(overrides: object = {}): Promise<QuestionDetailBody> {
  const response = await post('/questions', {
    subtopic_id: subtopicId,
    type: 'single',
    statement: '¿Cuál es la solución de 2x + 6 = 0?',
    options: OPTIONS,
    ...overrides,
  });

  return response.json<QuestionDetailBody>();
}

beforeEach(async () => {
  repositories.reset();

  const subject = (await post('/subjects', { slug: 'matematicas', name: 'Matemáticas' })).json<{
    id: number;
  }>();
  const topic = (
    await post('/topics', { subject_id: subject.id, slug: 'algebra', name: 'Álgebra' })
  ).json<{ id: number }>();
  const subtopic = (
    await post('/subtopics', { topic_id: topic.id, slug: 'ecuaciones', name: 'Ecuaciones' })
  ).json<{ id: number }>();

  subtopicId = subtopic.id;
});

afterAll(async () => {
  await app.close();
});

describe('alta', () => {
  it('crea el agregado entero en una sola llamada y responde 201', async () => {
    const tag = (await post('/tags', { slug: 'algebra', name: 'Álgebra' })).json<TagBody>();

    const response = await post('/questions', {
      subtopic_id: subtopicId,
      type: 'single',
      statement: '¿Cuál es la solución de 2x + 6 = 0?',
      explanation: 'Se despeja la x.',
      difficulty: 'hard',
      visible_options: 3,
      options: OPTIONS,
      resources: [
        { kind: 'page', url: 'https://es.wikipedia.org/wiki/Ecuación', label: 'Ecuación' },
      ],
      tag_ids: [tag.id],
    });

    expect(response.statusCode).toBe(201);

    const body = response.json<QuestionDetailBody>();

    expect(body).toMatchObject({
      status: 'draft',
      version: 1,
      difficulty: 'hard',
      visible_options: 3,
      explanation: 'Se despeja la x.',
    });
    expect(body.content_hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(body.options.map((option) => option.position)).toEqual([1, 2]);
    expect(body.resources[0]).toMatchObject({ position: 1, storage_kind: 'external' });
    expect(body.tags).toEqual([tag]);
  });

  it('nace publicada cuando se pide y cumple las tres invariantes', async () => {
    const body = await newQuestion({ status: 'published' });

    expect(body.status).toBe('published');
  });

  it('devuelve 422 y no persiste nada al publicar una pregunta sin opción correcta', async () => {
    const response = await post('/questions', {
      subtopic_id: subtopicId,
      type: 'single',
      statement: 'Una pregunta sin respuesta',
      status: 'published',
      options: [
        { text: 'a', is_correct: false },
        { text: 'b', is_correct: false },
      ],
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.message).toMatch(/al menos una opción correcta/);
    expect((await get('/questions')).json<Items<QuestionBody>>().items).toEqual([]);
  });

  it('rechaza una de selección única con dos correctas', async () => {
    const response = await post('/questions', {
      subtopic_id: subtopicId,
      type: 'single',
      statement: 'Una pregunta con dos respuestas',
      status: 'published',
      options: [
        { text: 'a', is_correct: true },
        { text: 'b', is_correct: true },
      ],
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.message).toMatch(/exactamente una opción correcta/);
  });

  it('deja en borrador la que todavía no podría publicarse', async () => {
    const body = await newQuestion({ options: [] });

    expect(body).toMatchObject({ status: 'draft', visible_options: null });
    expect(body.options).toEqual([]);
  });

  it('devuelve 404 si el subtema no existe', async () => {
    const response = await post('/questions', {
      subtopic_id: 404,
      type: 'single',
      statement: 'Una pregunta huérfana',
      options: OPTIONS,
    });

    expect(response.statusCode).toBe(404);
  });

  it('rechaza una URL de recurso que no es absoluta', async () => {
    const response = await post('/questions', {
      subtopic_id: subtopicId,
      type: 'single',
      statement: 'Una pregunta con un enlace roto',
      options: OPTIONS,
      resources: [{ kind: 'page', url: '/relativa' }],
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.details).toEqual([
      { field: 'resources.0.url', message: 'URL no válida' },
    ]);
  });

  it('rechaza menos de dos opciones visibles', async () => {
    const response = await post('/questions', {
      subtopic_id: subtopicId,
      type: 'single',
      statement: 'Una pregunta con una sola opción a la vista',
      visible_options: 1,
      options: OPTIONS,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.details).toEqual([
      { field: 'visible_options', message: 'entero >= 2' },
    ]);
  });

  it('rechaza un campo que no está en el contrato', async () => {
    const response = await post('/questions', {
      subtopic_id: subtopicId,
      type: 'single',
      statement: 'Una pregunta con un campo de más',
      options: OPTIONS,
      content_hash: 'a'.repeat(64),
    });

    expect(response.statusCode).toBe(422);
  });
});

describe('edición', () => {
  it('sube la versión y rehace el hash al cambiar el enunciado', async () => {
    const created = await newQuestion();

    const body = (
      await patch(`/questions/${created.id}`, { statement: 'Otro enunciado distinto' })
    ).json<QuestionDetailBody>();

    expect(body.version).toBe(2);
    expect(body.content_hash).not.toBe(created.content_hash);
  });

  it('no sube la versión al mover la pregunta de subtema', async () => {
    const created = await newQuestion();
    const other = (
      await post('/subtopics', { topic_id: 2, slug: 'polinomios', name: 'Polinomios' })
    ).json<{ id: number }>();

    const body = (
      await patch(`/questions/${created.id}`, { subtopic_id: other.id })
    ).json<QuestionDetailBody>();

    expect(body).toMatchObject({ subtopic_id: other.id, version: 1 });
  });

  it('sustituye enteras las colecciones que llegan y deja las que no', async () => {
    const tag = (await post('/tags', { slug: 'algebra', name: 'Álgebra' })).json<TagBody>();
    const created = await newQuestion({ tag_ids: [tag.id] });

    const body = (
      await patch(`/questions/${created.id}`, {
        options: [
          { text: 'x = −3', is_correct: true },
          { text: 'x = 3', is_correct: false },
          { text: 'x = 0', is_correct: false },
        ],
      })
    ).json<QuestionDetailBody>();

    expect(body.options).toHaveLength(3);
    expect(body.tags).toEqual([tag]);
  });

  it('vacía la explicación con null y la deja intacta si no viene', async () => {
    const created = await newQuestion({ explanation: 'Se despeja la x.' });

    const kept = (
      await patch(`/questions/${created.id}`, { difficulty: 'easy' })
    ).json<QuestionDetailBody>();

    expect(kept.explanation).toBe('Se despeja la x.');

    const cleared = (
      await patch(`/questions/${created.id}`, { explanation: null })
    ).json<QuestionDetailBody>();

    expect(cleared.explanation).toBeNull();
  });

  it('rechaza un PATCH que intente mover el estado', async () => {
    const created = await newQuestion();

    const response = await patch(`/questions/${created.id}`, { status: 'published' });

    expect(response.statusCode).toBe(422);
  });

  it('no deja opciones huérfanas cuando la edición rompe una invariante', async () => {
    const created = await newQuestion({ status: 'published' });

    const response = await patch(`/questions/${created.id}`, {
      statement: 'Un enunciado que no llega a guardarse',
      options: [
        { text: 'a', is_correct: false },
        { text: 'b', is_correct: false },
      ],
    });

    expect(response.statusCode).toBe(422);

    const after = (await get(`/questions/${created.id}`)).json<QuestionDetailBody>();

    expect(after.statement).toBe(created.statement);
    expect(after.options.map((option) => option.text)).toEqual(['x = −3', 'x = 3']);
  });

  it('devuelve 404 al editar una pregunta que no existe', async () => {
    expect((await patch('/questions/404', { difficulty: 'easy' })).statusCode).toBe(404);
  });
});

describe('transiciones', () => {
  it('publica, despublica y archiva', async () => {
    const created = await newQuestion();

    expect((await post(`/questions/${created.id}/publish`)).json<QuestionBody>().status).toBe(
      'published',
    );
    expect((await post(`/questions/${created.id}/unpublish`)).json<QuestionBody>().status).toBe(
      'draft',
    );
    expect((await post(`/questions/${created.id}/archive`)).json<QuestionBody>().status).toBe(
      'archived',
    );
  });

  it('responde 409 al repetir la transición que ya se hizo', async () => {
    const created = await newQuestion({ status: 'published' });

    expect((await post(`/questions/${created.id}/publish`)).statusCode).toBe(409);
  });

  it('responde 409 al intentar recuperar una archivada', async () => {
    const created = await newQuestion();

    await post(`/questions/${created.id}/archive`);

    expect((await post(`/questions/${created.id}/publish`)).statusCode).toBe(409);
  });

  it('responde 422 al publicar una pregunta sin opciones', async () => {
    const created = await newQuestion({ options: [] });

    const response = await post(`/questions/${created.id}/publish`);

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.message).toMatch(/al menos dos opciones/);
  });
});

describe('listado', () => {
  it('devuelve la pregunta sin lo que cuelga de ella', async () => {
    await newQuestion();

    const [item] = (await get('/questions')).json<Items<QuestionBody>>().items;

    expect(item).toBeDefined();
    expect(item).not.toHaveProperty('options');
  });

  it('filtra por subtema, estado, dificultad y etiqueta', async () => {
    const tag = (await post('/tags', { slug: 'algebra', name: 'Álgebra' })).json<TagBody>();
    const marked = await newQuestion({
      difficulty: 'hard',
      tag_ids: [tag.id],
      status: 'published',
    });
    await newQuestion({ statement: 'Otra pregunta', difficulty: 'easy' });

    const ids = async (query: string) =>
      (await get(`/questions${query}`)).json<Items<QuestionBody>>().items.map((row) => row.id);

    expect(await ids('?difficulty=hard')).toEqual([marked.id]);
    expect(await ids(`?tag_id=${tag.id}`)).toEqual([marked.id]);
    expect(await ids('?status=published')).toEqual([marked.id]);
    expect(await ids('?status=draft,published')).toHaveLength(2);
    expect(await ids(`?subtopic_id=${subtopicId}`)).toHaveLength(2);
    expect(await ids('?subtopic_id=404')).toEqual([]);
  });

  it('busca en el enunciado sin distinguir mayúsculas ni acentos', async () => {
    const created = await newQuestion({ statement: 'La ecuación de segundo grado' });
    await newQuestion({ statement: 'Un polinomio cualquiera' });

    const items = (await get('/questions?search=ECUACION')).json<Items<QuestionBody>>().items;

    expect(items.map((row) => row.id)).toEqual([created.id]);
  });

  it('recorta con limit y offset', async () => {
    await newQuestion({ statement: 'Primera' });
    const second = await newQuestion({ statement: 'Segunda' });

    const items = (await get('/questions?limit=1&offset=1')).json<Items<QuestionBody>>().items;

    expect(items.map((row) => row.id)).toEqual([second.id]);
  });

  it('rechaza un estado que no existe', async () => {
    expect((await get('/questions?status=borrador')).statusCode).toBe(422);
  });
});

describe('ficha', () => {
  it('devuelve la pregunta con sus opciones, recursos y etiquetas', async () => {
    const created = await newQuestion();

    const body = (await get(`/questions/${created.id}`)).json<QuestionDetailBody>();

    expect(body.options).toHaveLength(2);
    expect(body.resources).toEqual([]);
    expect(body.tags).toEqual([]);
  });

  it('devuelve 404 cuando no existe', async () => {
    expect((await get('/questions/404')).statusCode).toBe(404);
  });
});

describe('etiquetas', () => {
  it('crea, lista y renombra', async () => {
    const created = await post('/tags', { slug: 'algebra', name: 'Álgebra' });

    expect(created.statusCode).toBe(201);

    const tag = created.json<TagBody>();
    const renamed = (await patch(`/tags/${tag.id}`, { name: 'Álgebra básica' })).json<TagBody>();

    expect(renamed.name).toBe('Álgebra básica');
    expect((await get('/tags')).json<Items<TagBody>>().items).toEqual([renamed]);
  });

  it('responde 409 con un slug ya en uso', async () => {
    await post('/tags', { slug: 'algebra', name: 'Álgebra' });

    expect((await post('/tags', { slug: 'algebra', name: 'Otra' })).statusCode).toBe(409);
  });

  it('responde 422 con un slug que no cumple el formato', async () => {
    expect((await post('/tags', { slug: 'Álgebra Básica', name: 'Álgebra' })).statusCode).toBe(422);
  });
});
