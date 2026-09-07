import { beforeEach, describe, expect, it } from 'vitest';

import { recordAttempt } from '@app/domain/attempts-service.js';
import {
  changeSubjectStatus,
  changeSubtopicStatus,
  changeTopicStatus,
  createSubject,
  createSubtopic,
  createTopic,
} from '@app/domain/content-service.js';
import { createQuestion, createTag } from '@app/domain/questions-service.js';
import type { CandidatePage, CandidateQuery, Repositories } from '@app/domain/repositories.js';
import { selectNextQuestion, type SelectionCriteria } from '@app/domain/selection-service.js';
import { DEFAULT_SETTINGS } from '@app/domain/settings.js';
import { updateSettings } from '@app/domain/settings-service.js';
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';
import { createSeededRandom } from '@app/domain/testing/random.js';
import type { Difficulty } from '@app/domain/types.js';

/**
 * El sorteo entero, sin MySQL: el conjunto de candidatas, la relajación del
 * enfriamiento y la forma de la distribución en muestras grandes.
 *
 * Las pruebas no retrasan el reloj para envejecer un intento; adelantan el que
 * recibe la selección, que es el mismo parámetro que usará la API.
 */

const repos = createInMemoryRepositories();

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

interface ContentIds {
  readonly subjectId: number;
  readonly topicId: number;
  readonly subtopicId: number;
}

beforeEach(() => {
  repos.reset();
});

async function publishedContent(slug: string): Promise<ContentIds> {
  const subject = await createSubject(repos, { slug: `materia-${slug}`, name: `Materia ${slug}` });
  const topic = await createTopic(repos, subject.id, {
    slug: `tema-${slug}`,
    name: `Tema ${slug}`,
  });
  const subtopic = await createSubtopic(repos, topic.id, {
    slug: `subtema-${slug}`,
    name: `Subtema ${slug}`,
  });

  await changeSubjectStatus(repos, subject.id, 'published');
  await changeTopicStatus(repos, topic.id, 'published');
  await changeSubtopicStatus(repos, subtopic.id, 'published');

  return { subjectId: subject.id, topicId: topic.id, subtopicId: subtopic.id };
}

async function publishedQuestion(
  subtopicId: number,
  statement: string,
  extra: { difficulty?: Difficulty; tagIds?: readonly number[]; publish?: boolean } = {},
): Promise<number> {
  const detail = await createQuestion(repos, {
    subtopicId,
    type: 'single',
    statement,
    options: [
      { text: 'Correcta', isCorrect: true },
      { text: 'Incorrecta', isCorrect: false },
    ],
    publish: extra.publish ?? true,
    ...extra,
  });

  return detail.question.id;
}

async function answer(questionId: number, isCorrect: boolean): Promise<void> {
  await recordAttempt(repos, {
    questionId,
    sessionId: null,
    questionVersion: 1,
    subjectName: 'Materia',
    topicName: 'Tema',
    subtopicName: 'Subtema',
    questionStatement: 'Enunciado tal y como se mostró',
    questionType: 'single',
    difficulty: 'medium',
    presentedOptions: [
      { optionId: 1, text: 'Correcta', isCorrect: true },
      { optionId: 2, text: 'Incorrecta', isCorrect: false },
    ],
    selectedOptionIds: isCorrect ? [1] : [2],
    isCorrect,
  });
}

/** El reloj de la selección, adelantado para envejecer lo ya respondido. */
function inDays(days: number): Date {
  return new Date(Date.now() + days * MILLISECONDS_PER_DAY);
}

async function chosenId(criteria: SelectionCriteria): Promise<number | null> {
  const result = await selectNextQuestion(repos, criteria);

  return result.kind === 'selected' ? result.candidate.questionId : null;
}

/** Cuántas veces sale cada pregunta en una muestra grande, con semilla fija. */
async function sample(rounds: number, criteria: SelectionCriteria): Promise<Map<number, number>> {
  const random = createSeededRandom(20_120);
  const counts = new Map<number, number>();

  for (let round = 0; round < rounds; round += 1) {
    const id = await chosenId({ ...criteria, random });

    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return counts;
}

describe('conjunto de candidatas', () => {
  it('no hay error cuando no hay nada que sortear', async () => {
    await expect(selectNextQuestion(repos)).resolves.toEqual({ kind: 'empty' });
  });

  it('deja fuera lo que no está publicado, de la pregunta a la materia', async () => {
    const { subjectId, subtopicId } = await publishedContent('a');

    await publishedQuestion(subtopicId, 'Borrador', { publish: false });

    expect(await chosenId({})).toBeNull();

    const publicada = await publishedQuestion(subtopicId, 'Publicada');

    expect(await chosenId({})).toBe(publicada);

    // Archivar la materia baja en cascada y se lleva a la pregunta con ella.
    await changeSubjectStatus(repos, subjectId, 'archived');

    expect(await chosenId({})).toBeNull();
  });

  it('respeta el filtro por materia, tema, subtema, dificultad y etiqueta', async () => {
    const primera = await publishedContent('a');
    const segunda = await publishedContent('b');
    const etiqueta = await createTag(repos, { slug: 'repaso', name: 'Repaso' });

    const facil = await publishedQuestion(primera.subtopicId, 'Fácil y etiquetada', {
      difficulty: 'easy',
      tagIds: [etiqueta.id],
    });
    const dificil = await publishedQuestion(segunda.subtopicId, 'Difícil y sin etiqueta', {
      difficulty: 'hard',
    });

    expect(await chosenId({ filter: { subjectIds: [primera.subjectId] } })).toBe(facil);
    expect(await chosenId({ filter: { topicIds: [segunda.topicId] } })).toBe(dificil);
    expect(await chosenId({ filter: { subtopicIds: [primera.subtopicId] } })).toBe(facil);
    expect(await chosenId({ filter: { difficulties: ['hard'] } })).toBe(dificil);
    expect(await chosenId({ filter: { tagIds: [etiqueta.id] } })).toBe(facil);
  });

  it('un filtro que no encaja con nada devuelve conjunto vacío', async () => {
    const { subtopicId } = await publishedContent('a');

    await publishedQuestion(subtopicId, 'Media', { difficulty: 'medium' });

    await expect(
      selectNextQuestion(repos, { filter: { difficulties: ['hard'] } }),
    ).resolves.toEqual({ kind: 'empty' });
  });

  it('servir no consume: la selección no escribe nada', async () => {
    const { subtopicId } = await publishedContent('a');

    await publishedQuestion(subtopicId, 'Única');
    await selectNextQuestion(repos);
    await selectNextQuestion(repos);

    await expect(repos.attempts.list()).resolves.toEqual([]);
  });
});

describe('enfriamiento', () => {
  it('excluye lo respondido dentro de la ventana', async () => {
    const { subtopicId } = await publishedContent('a');

    const reciente = await publishedQuestion(subtopicId, 'Respondida hace un momento');
    const libre = await publishedQuestion(subtopicId, 'Sin responder');

    await answer(reciente, true);

    const counts = await sample(200, {});

    expect(counts.get(reciente)).toBeUndefined();
    expect(counts.get(libre)).toBe(200);
  });

  it('se levanta, y solo él, cuando no queda nada más', async () => {
    const { subtopicId } = await publishedContent('a');
    const unica = await publishedQuestion(subtopicId, 'La única que hay');

    await answer(unica, true);

    const result = await selectNextQuestion(repos);

    expect(result).toMatchObject({ kind: 'selected', cooldownRelaxed: true });
    expect(result.kind === 'selected' && result.candidate.questionId).toBe(unica);
  });

  it('relajarlo no levanta el filtro', async () => {
    const primera = await publishedContent('a');
    const segunda = await publishedContent('b');

    const dentro = await publishedQuestion(primera.subtopicId, 'De la materia pedida');

    await publishedQuestion(segunda.subtopicId, 'De la otra materia');
    await answer(dentro, true);

    const result = await selectNextQuestion(repos, {
      filter: { subjectIds: [primera.subjectId] },
    });

    expect(result).toMatchObject({ kind: 'selected', cooldownRelaxed: true });
    expect(result.kind === 'selected' && result.candidate.questionId).toBe(dentro);
  });

  it('apagado en los parámetros, nada queda fuera por reciente', async () => {
    const { subtopicId } = await publishedContent('a');
    const unica = await publishedQuestion(subtopicId, 'La única que hay');

    await answer(unica, true);
    await updateSettings(repos, { cooldown_hours: 0 });

    await expect(selectNextQuestion(repos)).resolves.toMatchObject({
      kind: 'selected',
      cooldownRelaxed: false,
    });
  });
});

describe('sorteo ponderado', () => {
  it('con la misma semilla, la misma secuencia', async () => {
    const { subtopicId } = await publishedContent('a');

    for (let index = 0; index < 8; index += 1) {
      await publishedQuestion(subtopicId, `Pregunta ${index}`);
    }

    const run = async (): Promise<number[]> => {
      const random = createSeededRandom(4_242);
      const picks: number[] = [];

      for (let round = 0; round < 20; round += 1) picks.push((await chosenId({ random })) ?? 0);

      return picks;
    };

    const first = await run();

    expect(await run()).toEqual(first);
    // Y no es una secuencia degenerada: el sorteo se mueve.
    expect(new Set(first).size).toBeGreaterThan(1);
  });

  it('lo nunca respondido sale claramente más', async () => {
    const { subtopicId } = await publishedContent('a');
    const nuevas: number[] = [];

    for (let index = 0; index < 5; index += 1) {
      nuevas.push(await publishedQuestion(subtopicId, `Nueva ${index}`));
      const vista = await publishedQuestion(subtopicId, `Vista ${index}`);

      await answer(vista, true);
    }

    // A 60 días, las vistas ya han madurado del todo: su desventaja es solo la
    // falta de `boost_nueva`, 10 contra 1.
    const counts = await sample(2_000, { now: inDays(60) });
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    const share = nuevas.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0) / total;

    expect(total).toBe(2_000);
    expect(share).toBeCloseTo(10 / 11, 1);
  });

  it('lo fallado sale más que lo acertado, en igualdad del resto', async () => {
    const { subtopicId } = await publishedContent('a');
    const fallada = await publishedQuestion(subtopicId, 'Siempre fallada');
    const acertada = await publishedQuestion(subtopicId, 'Siempre acertada');

    for (let index = 0; index < 4; index += 1) {
      await answer(fallada, false);
      await answer(acertada, true);
    }

    const counts = await sample(2_000, { now: inDays(60) });

    // Pesos 2,5 y 1: la fallada se lleva cinco de cada siete.
    expect((counts.get(fallada) ?? 0) / 2_000).toBeCloseTo(2.5 / 3.5, 1);
    expect(counts.get(fallada) ?? 0).toBeGreaterThan(counts.get(acertada) ?? 0);
  });

  it('devuelve el peso con el que ganó', async () => {
    const { subtopicId } = await publishedContent('a');

    await publishedQuestion(subtopicId, 'Nueva');

    await expect(selectNextQuestion(repos)).resolves.toMatchObject({
      kind: 'selected',
      weight: DEFAULT_SETTINGS.weightNewBoost,
      candidate: { attemptCount: 0, correctCount: 0, lastAnsweredAt: null },
    });
  });
});

describe('recorrido por páginas', () => {
  it('sortea entre todas las candidatas aunque no quepan en una página', async () => {
    const { subtopicId } = await publishedContent('a');
    const ids: number[] = [];

    for (let index = 0; index < 5; index += 1) {
      ids.push(await publishedQuestion(subtopicId, `Pregunta ${index}`));
    }

    const pages: number[] = [];
    const paged = withPageSize(repos, 2, pages);
    const random = createSeededRandom(909);
    const seen = new Set<number>();

    for (let round = 0; round < 200; round += 1) {
      const result = await selectNextQuestion(paged, { random });

      if (result.kind === 'selected') seen.add(result.candidate.questionId);
    }

    expect([...seen].sort((a, b) => a - b)).toEqual(ids);

    pages[0] = 0;
    await selectNextQuestion(paged, { random });

    // Cinco candidatas de dos en dos: dos páginas llenas y una a medias, que es
    // la que dice que no hay más.
    expect(pages[0]).toBe(3);
  });
});

/**
 * Los mismos repositorios con la página recortada, para que el motor tenga que
 * pedir más de una sin depender del tamaño real de `CANDIDATE_PAGE_SIZE`.
 */
function withPageSize(base: Repositories, size: number, calls: number[]): Repositories {
  calls[0] = 0;

  return {
    ...base,
    questions: {
      ...base.questions,
      listSelectionCandidates(query: CandidateQuery): Promise<CandidatePage> {
        calls[0] = (calls[0] ?? 0) + 1;

        return base.questions.listSelectionCandidates({ ...query, limit: size });
      },
    },
  };
}
