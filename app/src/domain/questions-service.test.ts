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
  listQuestions,
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

describe('transiciones de estado', () => {
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

  it('devuelve a borrador la publicada, para poder arreglarla', async () => {
    const detail = await createQuestion(repos, input({ publish: true }));

    await expect(changeQuestionStatus(repos, detail.question.id, 'draft')).resolves.toMatchObject({
      status: 'draft',
    });
  });

  it('rechaza repetir la transición que ya se hizo', async () => {
    const detail = await createQuestion(repos, input({ publish: true }));

    await expect(changeQuestionStatus(repos, detail.question.id, 'published')).rejects.toThrow(
      ConflictError,
    );
  });

  it('no recupera una pregunta archivada', async () => {
    const detail = await createQuestion(repos, input({ publish: true }));

    await changeQuestionStatus(repos, detail.question.id, 'archived');

    await expect(changeQuestionStatus(repos, detail.question.id, 'draft')).rejects.toThrow(
      ConflictError,
    );
  });
});

describe('edición del agregado', () => {
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

  it('deja convertir en única si en el mismo cuerpo llegan las opciones que lo permiten', async () => {
    const detail = await createQuestion(
      repos,
      input({
        type: 'multiple',
        options: [
          { text: 'a', isCorrect: true },
          { text: 'b', isCorrect: true },
        ],
        publish: true,
      }),
    );

    const updated = await updateQuestion(repos, detail.question.id, {
      type: 'single',
      options: [
        { text: 'a', isCorrect: true },
        { text: 'b', isCorrect: false },
      ],
    });

    expect(updated.question.type).toBe('single');
    expect(updated.question.status).toBe('published');
  });

  it('sube la versión al cambiar el enunciado y rehace el hash', async () => {
    const detail = await createQuestion(repos, input());

    const updated = await updateQuestion(repos, detail.question.id, {
      statement: 'Otro enunciado distinto',
    });

    expect(updated.question.version).toBe(2);
    expect(updated.question.contentHash).not.toBe(detail.question.contentHash);
  });

  it('no sube la versión al archivar', async () => {
    const detail = await createQuestion(repos, input({ publish: true }));

    const archived = await changeQuestionStatus(repos, detail.question.id, 'archived');

    expect(archived.version).toBe(1);
  });

  it('sustituye enteras las opciones, los recursos y las etiquetas que llegan', async () => {
    const algebra = await createTag(repos, { slug: 'algebra', name: 'Álgebra' });
    const grado = await createTag(repos, { slug: 'grado-1', name: 'Primer grado' });
    const detail = await createQuestion(
      repos,
      input({
        tagIds: [algebra.id],
        resources: [
          { kind: 'page', url: 'https://ejemplo.test/a', label: null, storageKind: 'external' },
        ],
      }),
    );

    const updated = await updateQuestion(repos, detail.question.id, {
      options: [
        { text: 'x = −3', isCorrect: true },
        { text: 'x = 3', isCorrect: false },
        { text: 'x = 0', isCorrect: false },
      ],
      resources: [],
      tagIds: [grado.id],
    });

    expect(updated.options.map((option) => option.position)).toEqual([1, 2, 3]);
    expect(updated.resources).toEqual([]);
    expect(updated.tags).toEqual([grado]);
  });

  it('deja las colecciones que no llegan como estaban', async () => {
    const detail = await createQuestion(repos, input());

    const updated = await updateQuestion(repos, detail.question.id, { difficulty: 'hard' });

    expect(updated.question.difficulty).toBe('hard');
    expect(updated.options).toHaveLength(2);
  });

  it('no deja dejar sin correcta una publicada al reemplazar sus opciones', async () => {
    const detail = await createQuestion(repos, input({ publish: true }));

    await expect(
      updateQuestion(repos, detail.question.id, {
        options: [
          { text: 'a', isCorrect: false },
          { text: 'b', isCorrect: false },
        ],
      }),
    ).rejects.toThrow(/al menos una opción correcta/);
  });

  it('reemplaza las opciones de un borrador sin exigir nada', async () => {
    const detail = await createQuestion(repos, input({ options: [] }));

    const updated = await updateQuestion(repos, detail.question.id, {
      options: [{ text: 'única', isCorrect: false }],
    });

    expect(updated.options).toHaveLength(1);
    expect(updated.options[0]?.position).toBe(1);
  });

  it('no deja media edición escrita cuando el lote rompe una invariante', async () => {
    const detail = await createQuestion(repos, input({ publish: true }));

    // Se llama al puerto directamente, saltándose la comprobación del servicio:
    // lo que se prueba es que la escritura del agregado se deshace entera.
    await expect(
      repos.questions.update(detail.question.id, {
        patch: { statement: 'Un enunciado que no llega a guardarse' },
        options: [{ text: 'huérfana', isCorrect: true }],
      }),
    ).rejects.toThrow(/al menos dos opciones/);

    const after = await repos.questions.findById(detail.question.id);

    expect(after?.question.statement).toBe(input().statement);
    expect(after?.options.map((option) => option.text)).toEqual(['x = −3', 'x = 3']);
  });

  it('exige que el subtema y las etiquetas de destino existan', async () => {
    const detail = await createQuestion(repos, input());

    await expect(updateQuestion(repos, detail.question.id, { subtopicId: 404 })).rejects.toThrow(
      NotFoundError,
    );
    await expect(updateQuestion(repos, detail.question.id, { tagIds: [404] })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('listado', () => {
  it('filtra por subtema, estado, dificultad y etiqueta', async () => {
    const tag = await createTag(repos, { slug: 'algebra', name: 'Álgebra' });

    const marked = await createQuestion(repos, input({ difficulty: 'hard', tagIds: [tag.id] }));
    await createQuestion(repos, input({ statement: 'Otra pregunta', difficulty: 'easy' }));

    expect((await listQuestions(repos, { difficulties: ['hard'] })).map((row) => row.id)).toEqual([
      marked.question.id,
    ]);
    expect((await listQuestions(repos, { tagIds: [tag.id] })).map((row) => row.id)).toEqual([
      marked.question.id,
    ]);
    expect(await listQuestions(repos, { statuses: ['published'] })).toEqual([]);
    expect(await listQuestions(repos, { subtopicIds: [404] })).toEqual([]);
  });

  it('busca en el enunciado sin distinguir mayúsculas ni acentos', async () => {
    const detail = await createQuestion(
      repos,
      input({ statement: 'La ecuación de segundo grado' }),
    );
    await createQuestion(repos, input({ statement: 'Un polinomio cualquiera' }));

    expect((await listQuestions(repos, { search: 'ECUACION' })).map((row) => row.id)).toEqual([
      detail.question.id,
    ]);
    expect(await listQuestions(repos, { search: 'trigonometría' })).toEqual([]);
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
