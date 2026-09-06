import { beforeEach, describe, expect, it } from 'vitest';

import type { AttemptDraft } from '@app/domain/attempts.js';
import { recordAttempt } from '@app/domain/attempts-service.js';
import { InvariantError } from '@app/domain/errors.js';
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';

const repos = createInMemoryRepositories();

beforeEach(() => {
  repos.reset();
});

function draft(overrides: Partial<AttemptDraft> = {}): AttemptDraft {
  return {
    questionId: 7,
    sessionId: null,
    questionVersion: 3,
    subjectName: 'Matemáticas',
    topicName: 'Álgebra',
    subtopicName: 'Ecuaciones',
    questionStatement: '¿Cuál es la solución de 2x + 6 = 0?',
    questionType: 'single',
    difficulty: 'easy',
    presentedOptions: [
      { optionId: 1, text: 'x = −3', isCorrect: true },
      { optionId: 2, text: 'x = 3', isCorrect: false },
    ],
    selectedOptionIds: [1],
    isCorrect: true,
    ...overrides,
  };
}

describe('registro del intento', () => {
  it('guarda la copia del enunciado y de las opciones mostradas', async () => {
    const attempt = await recordAttempt(repos, draft());

    expect(attempt.id).toBeGreaterThan(0);
    expect(attempt.questionStatement).toBe('¿Cuál es la solución de 2x + 6 = 0?');
    expect(attempt.questionVersion).toBe(3);
    expect(attempt.presentedOptions).toHaveLength(2);
  });

  it('no registra un intento imposible de acertar', async () => {
    await expect(
      recordAttempt(
        repos,
        draft({
          presentedOptions: [
            { optionId: 1, text: 'a', isCorrect: false },
            { optionId: 2, text: 'b', isCorrect: false },
          ],
          isCorrect: false,
        }),
      ),
    ).rejects.toThrow(InvariantError);

    expect(await repos.attempts.list()).toEqual([]);
  });

  it('no registra una respuesta con opciones que no se mostraron', async () => {
    await expect(recordAttempt(repos, draft({ selectedOptionIds: [9] }))).rejects.toThrow(
      /no se mostraron/,
    );
  });
});
