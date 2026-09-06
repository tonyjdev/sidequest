import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { ErrorBody } from '@app/api/errors.js';
import { buildServer } from '@app/api/server.js';
import { loadConfig } from '@app/config/env.js';
import { createQuestion } from '@app/domain/questions-service.js';
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';

/**
 * El contrato de `/subjects`, `/topics` y `/subtopics` de punta a punta, con los
 * repositorios en memoria detrás: se ejerce la ruta real, el esquema real y el
 * manejador de errores real, y se comprueba lo que sale por el cable.
 *
 * Sin MySQL delante a propósito: son las reglas y su traducción a HTTP lo que se
 * está probando, no el SQL, que tiene su propia suite de integración.
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

interface ContentBody {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  position: number;
  created_at: string;
  updated_at: string;
}

interface TopicBody extends ContentBody {
  subject_id: number;
}

interface SubtopicBody extends ContentBody {
  topic_id: number;
}

interface SubtopicSummaryBody extends SubtopicBody {
  question_count: number;
}

interface Items<T> {
  items: T[];
}

const get = (url: string) => app.inject({ method: 'GET', url: `/api/v1${url}` });
// Las rutas de transición no llevan cuerpo; un `{}` vacío evita partir el
// ayudante en dos por algo que Fastify ignora igualmente.
const post = (url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, payload });
const patch = (url: string, payload: object) =>
  app.inject({ method: 'PATCH', url: `/api/v1${url}`, payload });

async function newSubject(slug = 'matematicas'): Promise<ContentBody> {
  return (await post('/subjects', { slug, name: 'Matemáticas' })).json<ContentBody>();
}

async function publishedSubject(slug = 'matematicas'): Promise<ContentBody> {
  const subject = await newSubject(slug);

  return (await post(`/subjects/${subject.id}/publish`)).json<ContentBody>();
}

async function newTopic(subjectId: number, slug = 'algebra'): Promise<TopicBody> {
  return (
    await post('/topics', { subject_id: subjectId, slug, name: 'Álgebra' })
  ).json<TopicBody>();
}

async function publishedTopic(slug = 'algebra'): Promise<TopicBody> {
  const subject = await publishedSubject();
  const topic = await newTopic(subject.id, slug);

  return (await post(`/topics/${topic.id}/publish`)).json<TopicBody>();
}

async function newSubtopic(topicId: number, slug = 'ecuaciones'): Promise<SubtopicBody> {
  return (
    await post('/subtopics', { topic_id: topicId, slug, name: 'Ecuaciones' })
  ).json<SubtopicBody>();
}

beforeEach(() => {
  repositories.reset();
});

afterAll(async () => {
  await app.close();
});

describe('listado', () => {
  it('devuelve los temas de la materia pedida y deja fuera los de otra', async () => {
    const first = await publishedSubject('matematicas');
    const second = await newSubject('fisica');

    await newTopic(first.id, 'algebra');
    await newTopic(second.id, 'cinematica');

    const body = (await get(`/topics?subject_id=${first.id}`)).json<Items<TopicBody>>();

    expect(body.items.map((topic) => topic.slug)).toEqual(['algebra']);
  });

  it('filtra por estado', async () => {
    const subject = await publishedSubject();
    const published = await newTopic(subject.id, 'algebra');
    await newTopic(subject.id, 'geometria');
    await post(`/topics/${published.id}/publish`);

    const body = (await get('/topics?status=published')).json<Items<TopicBody>>();

    expect(body.items.map((topic) => topic.slug)).toEqual(['algebra']);
  });

  it('entiende la lista de estados separada por comas y el parámetro repetido', async () => {
    const subject = await publishedSubject();
    await newTopic(subject.id, 'algebra');

    for (const query of ['?status=draft,published', '?status=draft&status=published']) {
      expect((await get(`/topics${query}`)).json<Items<TopicBody>>().items).toHaveLength(1);
    }
  });

  it('rechaza un estado que no existe con 422', async () => {
    const response = await get('/topics?status=inventado');

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.code).toBe('validation_failed');
  });

  it('devuelve el recuento de preguntas por subtema', async () => {
    const topic = await publishedTopic();
    const withQuestions = await newSubtopic(topic.id, 'ecuaciones');
    const empty = await newSubtopic(topic.id, 'polinomios');

    for (const statement of ['¿Cuánto es 2 + 2?', '¿Cuánto es 3 + 3?']) {
      await createQuestion(repositories, {
        subtopicId: withQuestions.id,
        type: 'single',
        statement,
        options: [
          { text: '4', isCorrect: true },
          { text: '5', isCorrect: false },
        ],
      });
    }

    const body = (await get('/subtopics')).json<Items<SubtopicSummaryBody>>();

    expect(body.items).toEqual([
      expect.objectContaining({ id: withQuestions.id, question_count: 2 }),
      expect.objectContaining({ id: empty.id, question_count: 0 }),
    ]);
  });

  it('devuelve 404 leyendo un id que no existe', async () => {
    const response = await get('/topics/404');

    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorBody>().error.code).toBe('not_found');
  });
});

describe('alta', () => {
  it('crea el tema en borrador y responde 201', async () => {
    const subject = await publishedSubject();
    const response = await post('/topics', {
      subject_id: subject.id,
      slug: 'algebra',
      name: 'Álgebra',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<TopicBody>()).toMatchObject({
      slug: 'algebra',
      status: 'draft',
      description: null,
      subject_id: subject.id,
    });
  });

  it('rechaza el slug repetido dentro del mismo tema con 409 y no crea nada', async () => {
    const topic = await publishedTopic();
    await newSubtopic(topic.id, 'ecuaciones');

    const response = await post('/subtopics', {
      topic_id: topic.id,
      slug: 'ecuaciones',
      name: 'Otro',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<ErrorBody>().error.code).toBe('conflict');
    expect((await get('/subtopics')).json<Items<SubtopicBody>>().items).toHaveLength(1);
  });

  it('deja libre el mismo slug bajo otro tema', async () => {
    const first = await publishedTopic('algebra');
    const second = await newTopic(first.subject_id, 'geometria');

    await newSubtopic(first.id, 'introduccion');

    expect(
      (
        await post('/subtopics', {
          topic_id: second.id,
          slug: 'introduccion',
          name: 'Introducción',
        })
      ).statusCode,
    ).toBe(201);
  });

  it('rechaza un slug mal formado con 422', async () => {
    const subject = await publishedSubject();
    const response = await post('/topics', {
      subject_id: subject.id,
      slug: 'Álgebra Lineal',
      name: 'Álgebra',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.code).toBe('validation_failed');
  });

  it('rechaza el alta sin los campos obligatorios con 422', async () => {
    const response = await post('/topics', { slug: 'algebra' });

    expect(response.statusCode).toBe(422);
  });

  it('devuelve 404 si la materia del tema no existe', async () => {
    const response = await post('/topics', {
      subject_id: 404,
      slug: 'algebra',
      name: 'Álgebra',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('edición', () => {
  it('cambia lo que viene y deja quieto lo demás', async () => {
    const topic = await publishedTopic();
    const response = await patch(`/topics/${topic.id}`, { name: 'Álgebra lineal' });

    expect(response.statusCode).toBe(200);
    expect(response.json<TopicBody>()).toMatchObject({
      name: 'Álgebra lineal',
      slug: 'algebra',
      status: 'published',
    });
  });

  it('vacía la descripción con null', async () => {
    const topic = await publishedTopic();

    await patch(`/topics/${topic.id}`, { description: 'Una descripción' });

    expect(
      (await patch(`/topics/${topic.id}`, { description: null })).json<TopicBody>(),
    ).toMatchObject({ description: null });
  });

  it('no deja mover el estado con un PATCH: tiene su propia ruta', async () => {
    const topic = await publishedTopic();
    const response = await patch(`/topics/${topic.id}`, { status: 'archived' });

    expect(response.statusCode).toBe(422);
    expect((await get(`/topics/${topic.id}`)).json<TopicBody>().status).toBe('published');
  });

  it('rechaza el choque de slug con un hermano con 409', async () => {
    const first = await publishedTopic('algebra');
    const second = await newTopic(first.subject_id, 'geometria');

    expect((await patch(`/topics/${second.id}`, { slug: 'algebra' })).statusCode).toBe(409);
  });
});

describe('publicación', () => {
  it('publica el tema cuando su materia ya lo está', async () => {
    const topic = await publishedTopic();

    expect(topic.status).toBe('published');
  });

  it('no publica un subtema si su tema sigue en borrador, y lo explica', async () => {
    const subject = await publishedSubject();
    const topic = await newTopic(subject.id);
    const subtopic = await newSubtopic(topic.id);

    const response = await post(`/subtopics/${subtopic.id}/publish`);

    expect(response.statusCode).toBe(409);
    expect(response.json<ErrorBody>().error).toMatchObject({
      code: 'conflict',
      message: 'No se puede publicar un subtema cuyo tema no está publicado',
    });
  });

  it('no publica un tema si su materia sigue en borrador', async () => {
    const subject = await newSubject();
    const topic = await newTopic(subject.id);

    const response = await post(`/topics/${topic.id}/publish`);

    expect(response.statusCode).toBe(409);
    expect(response.json<ErrorBody>().error.message).toMatch(/materia no está publicada/);
  });

  it('rechaza publicar lo que ya está publicado', async () => {
    const topic = await publishedTopic();
    const response = await post(`/topics/${topic.id}/publish`);

    expect(response.statusCode).toBe(409);
    expect(response.json<ErrorBody>().error.message).toBe('El tema ya está publicado');
  });

  it('rechaza publicar lo archivado: solo se publica desde borrador', async () => {
    const topic = await publishedTopic();

    await post(`/topics/${topic.id}/archive`);

    const response = await post(`/topics/${topic.id}/publish`);

    expect(response.statusCode).toBe(409);
    expect(response.json<ErrorBody>().error.message).toMatch(/solo se publica desde borrador/);
  });
});

describe('archivado', () => {
  it('archiva el tema y arrastra sus subtemas', async () => {
    const topic = await publishedTopic();
    const subtopic = await newSubtopic(topic.id);

    const response = await post(`/topics/${topic.id}/archive`);

    expect(response.statusCode).toBe(200);
    expect(response.json<TopicBody>().status).toBe('archived');
    expect((await get(`/subtopics/${subtopic.id}`)).json<SubtopicBody>().status).toBe('archived');
  });

  it('archiva la materia y baja los tres niveles', async () => {
    const topic = await publishedTopic();
    const subtopic = await newSubtopic(topic.id);

    await post(`/subjects/${topic.subject_id}/archive`);

    expect((await get(`/topics/${topic.id}`)).json<TopicBody>().status).toBe('archived');
    expect((await get(`/subtopics/${subtopic.id}`)).json<SubtopicBody>().status).toBe('archived');
  });

  it('no borra nada: lo archivado sigue en el listado', async () => {
    const topic = await publishedTopic();

    await post(`/topics/${topic.id}/archive`);

    expect((await get('/topics')).json<Items<TopicBody>>().items).toHaveLength(1);
    expect((await get('/topics?status=published')).json<Items<TopicBody>>().items).toHaveLength(0);
  });

  it('rechaza archivar dos veces', async () => {
    const topic = await publishedTopic();

    await post(`/topics/${topic.id}/archive`);

    const response = await post(`/topics/${topic.id}/archive`);

    expect(response.statusCode).toBe(409);
    expect(response.json<ErrorBody>().error.message).toBe('El tema ya está archivado');
  });
});

describe('reordenación', () => {
  it('reparte position 1..n en el orden recibido', async () => {
    const subject = await publishedSubject();
    const first = await newTopic(subject.id, 'algebra');
    const second = await newTopic(subject.id, 'geometria');
    const third = await newTopic(subject.id, 'analisis');

    const response = await post('/topics/reorder', {
      subject_id: subject.id,
      ids: [third.id, first.id, second.id],
    });

    expect(response.statusCode).toBe(200);
    expect(
      response.json<Items<TopicBody>>().items.map((topic) => [topic.slug, topic.position]),
    ).toEqual([
      ['analisis', 1],
      ['algebra', 2],
      ['geometria', 3],
    ]);
  });

  it('rechaza un subconjunto de hermanos con 422 y no mueve nada', async () => {
    const subject = await publishedSubject();
    const first = await newTopic(subject.id, 'algebra');
    const second = await newTopic(subject.id, 'geometria');

    const response = await post('/topics/reorder', {
      subject_id: subject.id,
      ids: [first.id],
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.details).toEqual({
      duplicated: [],
      unknown: [],
      missing: [second.id],
    });
    expect((await get(`/topics/${first.id}`)).json<TopicBody>().position).toBe(0);
  });

  it('rechaza un id que no es hermano', async () => {
    const subject = await publishedSubject();
    const other = await newSubject('fisica');
    const mine = await newTopic(subject.id, 'algebra');
    const alien = await newTopic(other.id, 'cinematica');

    const response = await post('/topics/reorder', {
      subject_id: subject.id,
      ids: [mine.id, alien.id],
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.details).toEqual({
      duplicated: [],
      unknown: [alien.id],
      missing: [],
    });
  });

  it('rechaza un id repetido', async () => {
    const subject = await publishedSubject();
    const topic = await newTopic(subject.id, 'algebra');

    const response = await post('/topics/reorder', {
      subject_id: subject.id,
      ids: [topic.id, topic.id],
    });

    expect(response.statusCode).toBe(422);
  });

  it('devuelve 404 si el padre no existe', async () => {
    expect((await post('/topics/reorder', { subject_id: 404, ids: [] })).statusCode).toBe(404);
  });

  it('reordena también los subtemas de un tema', async () => {
    const topic = await publishedTopic();
    const first = await newSubtopic(topic.id, 'ecuaciones');
    const second = await newSubtopic(topic.id, 'polinomios');

    const response = await post('/subtopics/reorder', {
      topic_id: topic.id,
      ids: [second.id, first.id],
    });

    expect(response.json<Items<SubtopicBody>>().items.map((row) => row.slug)).toEqual([
      'polinomios',
      'ecuaciones',
    ]);
  });
});

describe('serialización', () => {
  it('nombra las claves en inglés y snake_case, y las fechas en ISO', async () => {
    const topic = await publishedTopic();
    const body = (await get(`/topics/${topic.id}`)).json<TopicBody>();

    expect(Object.keys(body).sort()).toEqual([
      'created_at',
      'description',
      'id',
      'name',
      'position',
      'slug',
      'status',
      'subject_id',
      'updated_at',
    ]);
    expect(new Date(body.created_at).toISOString()).toBe(body.created_at);
  });
});
