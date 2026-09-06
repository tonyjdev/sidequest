import { beforeEach, describe, expect, it } from 'vitest';

import {
  changeSubjectStatus,
  changeSubtopicStatus,
  changeTopicStatus,
  createSubject,
  createSubtopic,
  createTopic,
  updateSubject,
  updateTopic,
} from '@app/domain/content-service.js';
import { ConflictError, InvariantError, NotFoundError } from '@app/domain/errors.js';
import type { Repositories } from '@app/domain/repositories.js';
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';

/**
 * El dominio contra repositorios en memoria, sin MySQL delante: es el criterio
 * de aceptación de SQST-0006 y, de paso, lo que hace que estas reglas se puedan
 * probar en un `pnpm check` sin Docker.
 */
const repos = createInMemoryRepositories();

beforeEach(() => {
  repos.reset();
});

async function publishedSubject(slug = 'matematicas') {
  const subject = await createSubject(repos, { slug, name: 'Matemáticas' });

  return changeSubjectStatus(repos, subject.id, 'published');
}

async function publishedTopic(repositories: Repositories = repos) {
  const subject = await publishedSubject();
  const topic = await createTopic(repositories, subject.id, { slug: 'algebra', name: 'Álgebra' });

  return changeTopicStatus(repositories, topic.id, 'published');
}

describe('creación', () => {
  it('crea la materia en borrador, aunque venga para publicarse después', async () => {
    const subject = await createSubject(repos, { slug: 'matematicas', name: 'Matemáticas' });

    expect(subject.status).toBe('draft');
    expect(subject.description).toBeNull();
    expect(subject.position).toBe(0);
  });

  it('rechaza un slug de materia repetido', async () => {
    await createSubject(repos, { slug: 'matematicas', name: 'Matemáticas' });

    await expect(createSubject(repos, { slug: 'matematicas', name: 'Otra' })).rejects.toThrow(
      ConflictError,
    );
  });

  it('rechaza un slug mal formado antes de tocar la persistencia', async () => {
    await expect(createSubject(repos, { slug: 'Matemáticas', name: 'X' })).rejects.toThrow(
      InvariantError,
    );

    expect(await repos.subjects.list()).toEqual([]);
  });

  it('exige que la materia del tema exista', async () => {
    await expect(createTopic(repos, 404, { slug: 'algebra', name: 'Álgebra' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('exige el slug del tema único dentro de su materia y lo deja libre fuera', async () => {
    const first = await publishedSubject('matematicas');
    const second = await createSubject(repos, { slug: 'fisica', name: 'Física' });

    await createTopic(repos, first.id, { slug: 'introduccion', name: 'Introducción' });

    await expect(
      createTopic(repos, first.id, { slug: 'introduccion', name: 'Otra' }),
    ).rejects.toThrow(ConflictError);
    await expect(
      createTopic(repos, second.id, { slug: 'introduccion', name: 'Introducción' }),
    ).resolves.toMatchObject({ slug: 'introduccion' });
  });
});

describe('cadena de publicación', () => {
  it('no publica un tema si su materia sigue en borrador', async () => {
    const subject = await createSubject(repos, { slug: 'matematicas', name: 'Matemáticas' });
    const topic = await createTopic(repos, subject.id, { slug: 'algebra', name: 'Álgebra' });

    await expect(changeTopicStatus(repos, topic.id, 'published')).rejects.toThrow(
      /cuya materia no está publicada/,
    );
  });

  it('publica el tema cuando la materia ya lo está', async () => {
    const topic = await publishedTopic();

    expect(topic.status).toBe('published');
  });

  it('no publica un subtema si su tema sigue en borrador', async () => {
    const subject = await publishedSubject();
    const topic = await createTopic(repos, subject.id, { slug: 'algebra', name: 'Álgebra' });
    const subtopic = await createSubtopic(repos, topic.id, {
      slug: 'ecuaciones',
      name: 'Ecuaciones',
    });

    await expect(changeSubtopicStatus(repos, subtopic.id, 'published')).rejects.toThrow(
      /cuyo tema no está publicado/,
    );
  });

  it('publicar la materia no publica lo que cuelga de ella', async () => {
    const subject = await publishedSubject();
    const topic = await createTopic(repos, subject.id, { slug: 'algebra', name: 'Álgebra' });

    expect((await repos.topics.findById(topic.id))?.status).toBe('draft');
  });
});

describe('archivado', () => {
  it('archiva la materia y, con ella, sus temas y subtemas', async () => {
    const topic = await publishedTopic();
    const subtopic = await createSubtopic(repos, topic.id, {
      slug: 'ecuaciones',
      name: 'Ecuaciones',
    });
    await changeSubtopicStatus(repos, subtopic.id, 'published');

    const subject = await changeSubjectStatus(repos, topic.subjectId, 'archived');

    expect(subject.status).toBe('archived');
    expect((await repos.topics.findById(topic.id))?.status).toBe('archived');
    expect((await repos.subtopics.findById(subtopic.id))?.status).toBe('archived');
  });

  it('archiva el tema y sus subtemas sin tocar la materia', async () => {
    const topic = await publishedTopic();
    const subtopic = await createSubtopic(repos, topic.id, {
      slug: 'ecuaciones',
      name: 'Ecuaciones',
    });

    await changeTopicStatus(repos, topic.id, 'archived');

    expect((await repos.subtopics.findById(subtopic.id))?.status).toBe('archived');
    expect((await repos.subjects.findById(topic.subjectId))?.status).toBe('published');
  });

  it('no borra nada: el contenido archivado sigue estando', async () => {
    const topic = await publishedTopic();

    await changeSubjectStatus(repos, topic.subjectId, 'archived');

    expect(await repos.subjects.list()).toHaveLength(1);
    expect(await repos.topics.list()).toHaveLength(1);
  });
});

describe('actualización', () => {
  it('detecta el choque de slug con otra materia', async () => {
    const first = await createSubject(repos, { slug: 'matematicas', name: 'Matemáticas' });
    await createSubject(repos, { slug: 'fisica', name: 'Física' });

    await expect(updateSubject(repos, first.id, { slug: 'fisica' })).rejects.toThrow(ConflictError);
  });

  it('deja guardar el mismo slug que ya tenía', async () => {
    const subject = await createSubject(repos, { slug: 'matematicas', name: 'Matemáticas' });

    await expect(
      updateSubject(repos, subject.id, { slug: 'matematicas', name: 'Mates' }),
    ).resolves.toMatchObject({ name: 'Mates' });
  });

  it('permite vaciar la descripción y no toca lo que no viene', async () => {
    const topic = await publishedTopic();

    const updated = await updateTopic(repos, topic.id, { description: null });

    expect(updated.description).toBeNull();
    expect(updated.name).toBe('Álgebra');
  });

  it('rechaza actualizar lo que no existe', async () => {
    await expect(updateSubject(repos, 404, { name: 'X' })).rejects.toThrow(NotFoundError);
  });
});
