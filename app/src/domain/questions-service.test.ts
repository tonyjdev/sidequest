import { beforeEach, describe, expect, it } from 'vitest';

import {
  changeSubjectStatus,
  changeSubtopicStatus,
  changeTopicStatus,
  createSubject,
  createSubtopic,
  createTopic,
} from '@app/domain/content-service.js';
import { ConflictError, InvariantError, NotFoundError } from '@app/domain/errors.js';
import {
  changeQuestionStatus,
  createQuestion,
  createTag,
  findDuplicateQuestions,
  replaceQuestionOptions,
  setQuestionTags,
  updateQuestion,
  type QuestionInput,
} from '@app/domain/questions-service.js';
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';

const repos = createInMemoryRepositories();

let subtopicId = 0;

beforeEach(async () => {
  repos.reset();

  const subject = await changeSubjectStatus(
    repos,
    (await createSubject(repos, { slug: 'matematicas', name: 'Matemáticas' })).id,
    'published',
  );
  const topic = await changeTopicStatus(
    repos,
    (await createTopic(repos, subject.id, { slug: 'algebra', name: 'Álgebra' })).id,
    'published',
  );
  const subtopic = await changeSubtopicStatus(
    repos,
    (await createSubtopic(repos, topic.id, { slug: 'ecuaciones', name: 'Ecuaciones' })).id,
    'published',
  );

  subtopicId = subtopic.id;
});

function input(overrides: Partial<QuestionInput> = {}): QuestionInput {
  return {
    subtopicId,
    type: 'single',
    statement: '¿Cuál es la solución de 2x + 6 = 0?',
    options: [
      { text: 'x = −3', isCorrect: true },
      { text: 'x = 3', isCorrect: false },
    ],
    ...overrides,
  };
}

describe('creación', () => {
  it('crea la pregunta en borrador con sus opciones, recursos y etiquetas', async () => {
    const tag = await createTag(repos, { slug: 'algebra', name: 'Álgebra' });

    const detail = await createQuestion(
      repos,
      input({
        resources: [
          {
            kind: 'page',
            url: 'https://es.wikipedia.org/wiki/Ecuaci%C3%B3n',
            label: 'Ecuación',
            storageKind: 'external',
          },
        ],
        tagIds: [tag.id],
      }),
    );

    expect(detail.question.status).toBe('draft');
    expect(detail.question.version).toBe(1);
    expect(detail.options).toHaveLength(2);
    expect(detail.resources).toHaveLength(1);
    expect(detail.tags).toEqual([tag]);
  });

  it('deriva el content_hash del enunciado', async () => {
    const detail = await createQuestion(repos, input());

    expect(detail.question.contentHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('publica la que cumple las tres invariantes', async () => {
    const detail = await createQuestion(repos, input({ publish: true }));

    expect(detail.question.status).toBe('published');
  });

  it('deja crear en borrador una pregunta que todavía no podría publicarse', async () => {
    const detail = await createQuestion(repos, input({ options: [] }));

    expect(detail.question.status).toBe('draft');
  });

  it.each([
    ['sin dos opciones', { options: [{ text: 'x = −3', isCorrect: true }] }, /al menos dos/],
    [
      'sin ninguna correcta',
      {
        options: [
          { text: 'a', isCorrect: false },
          { text: 'b', isCorrect: false },
        ],
      },
      /al menos una opción correcta/,
    ],
    [
      'única con dos correctas',
      {
        options: [
          { text: 'a', isCorrect: true },
          { text: 'b', isCorrect: true },
        ],
      },
      /exactamente una opción correcta/,
    ],
  ])('no publica una pregunta %s', async (_name, overrides, message) => {
    await expect(createQuestion(repos, input({ ...overrides, publish: true }))).rejects.toThrow(
      message,
    );

    expect(await repos.questions.list()).toEqual([]);
  });

  it('exige que el subtema exista', async () => {
    await expect(createQuestion(repos, input({ subtopicId: 404 }))).rejects.toThrow(NotFoundError);
  });

  it('exige que las etiquetas existan', async () => {
    await expect(createQuestion(repos, input({ tagIds: [404] }))).rejects.toThrow(NotFoundError);
  });

  it('rechaza un enunciado en blanco', async () => {
    await expect(createQuestion(repos, input({ statement: '   ' }))).rejects.toThrow(
      InvariantError,
    );
  });
});

describe('publicación posterior', () => {
  it('no publica una pregunta sin opciones', async () => {
    const detail = await createQuestion(repos, input({ options: [] }));

    await expect(changeQuestionStatus(repos, detail.question.id, 'published')).rejects.toThrow(
      /al menos dos opciones/,
    );
  });

  it('publica cuando ya tiene con qué', async () => {
    const detail = await createQuestion(repos, input());

    await expect(
      changeQuestionStatus(repos, detail.question.id, 'published'),
    ).resolves.toMatchObject({ status: 'published' });
  });

  it('archiva sin exigir nada: nada se borra', async () => {
    const detail = await createQuestion(repos, input({ options: [] }));

    await expect(
      changeQuestionStatus(repos, detail.question.id, 'archived'),
    ).resolves.toMatchObject({ status: 'archived' });
  });
});

describe('edición', () => {
  it('no deja convertir en única una publicada con dos correctas', async () => {
    const detail = await createQuestion(
      repos,
      input({
        type: 'multiple',
        options: [
          { text: 'a', isCorrect: true },
          { text: 'b', isCorrect: true },
          { text: 'c', isCorrect: false },
        ],
        publish: true,
      }),
    );

    await expect(updateQuestion(repos, detail.question.id, { type: 'single' })).rejects.toThrow(
      /exactamente una opción correcta/,
    );
  });

  it('sube la versión al cambiar el enunciado y rehace el hash', async () => {
    const detail = await createQuestion(repos, input());

    const updated = await updateQuestion(repos, detail.question.id, {
      statement: 'Otro enunciado distinto',
    });

    expect(updated.version).toBe(2);
    expect(updated.contentHash).not.toBe(detail.question.contentHash);
  });

  it('no sube la versión al archivar', async () => {
    const detail = await createQuestion(repos, input({ publish: true }));

    const archived = await changeQuestionStatus(repos, detail.question.id, 'archived');

    expect(archived.version).toBe(1);
  });

  it('no deja dejar sin correcta una publicada al reemplazar sus opciones', async () => {
    const detail = await createQuestion(repos, input({ publish: true }));

    await expect(
      replaceQuestionOptions(repos, detail.question.id, [
        { text: 'a', isCorrect: false },
        { text: 'b', isCorrect: false },
      ]),
    ).rejects.toThrow(/al menos una opción correcta/);
  });

  it('reemplaza las opciones de un borrador sin exigir nada', async () => {
    const detail = await createQuestion(repos, input({ options: [] }));

    const options = await replaceQuestionOptions(repos, detail.question.id, [
      { text: 'única', isCorrect: false },
    ]);

    expect(options).toHaveLength(1);
    expect(options[0]?.position).toBe(1);
  });

  it('reemplaza las etiquetas por completo', async () => {
    const algebra = await createTag(repos, { slug: 'algebra', name: 'Álgebra' });
    const grado = await createTag(repos, { slug: 'grado-1', name: 'Primer grado' });
    const detail = await createQuestion(repos, input({ tagIds: [algebra.id] }));

    expect(await setQuestionTags(repos, detail.question.id, [grado.id])).toEqual([grado]);
  });
});

describe('etiquetas', () => {
  it('rechaza un slug de etiqueta repetido', async () => {
    await createTag(repos, { slug: 'algebra', name: 'Álgebra' });

    await expect(createTag(repos, { slug: 'algebra', name: 'Otra' })).rejects.toThrow(
      ConflictError,
    );
  });
});

describe('duplicados', () => {
  it('encuentra la pregunta con el mismo enunciado normalizado en el mismo subtema', async () => {
    const detail = await createQuestion(repos, input());

    const found = await findDuplicateQuestions(
      repos,
      subtopicId,
      '  ¿CUÁL es la solución de 2x + 6 = 0?  ',
    );

    expect(found.map((question) => question.id)).toEqual([detail.question.id]);
  });

  it('no cruza subtemas', async () => {
    await createQuestion(repos, input());
    const other = await createSubtopic(repos, 2, { slug: 'polinomios', name: 'Polinomios' });

    expect(await findDuplicateQuestions(repos, other.id, input().statement)).toEqual([]);
  });
});
