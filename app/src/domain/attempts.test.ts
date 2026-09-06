import { describe, expect, it } from 'vitest';

import {
  assertAttemptDraft,
  assertPresentedOptions,
  assertSelectionWithinPresented,
  type AttemptDraft,
  type PresentedOption,
} from '@app/domain/attempts.js';
import { InvariantError } from '@app/domain/errors.js';

function option(optionId: number, isCorrect: boolean): PresentedOption {
  return { optionId, text: `Opción ${optionId}`, isCorrect };
}

function draft(overrides: Partial<AttemptDraft> = {}): AttemptDraft {
  return {
    questionId: 1,
    sessionId: null,
    questionVersion: 1,
    subjectName: 'Matemáticas',
    topicName: 'Álgebra',
    subtopicName: 'Ecuaciones',
    questionStatement: '¿Cuál es la solución de 2x + 6 = 0?',
    questionType: 'single',
    difficulty: 'easy',
    presentedOptions: [option(1, true), option(2, false)],
    selectedOptionIds: [1],
    isCorrect: true,
    ...overrides,
  };
}

describe('invariante del intento', () => {
  it('exige al menos una opción correcta entre las mostradas', () => {
    expect(() => {
      assertPresentedOptions([option(1, false), option(2, false)]);
    }).toThrow(/al menos una opción correcta entre las mostradas/);
  });

  it('exige al menos dos opciones mostradas', () => {
    expect(() => {
      assertPresentedOptions([option(1, true)]);
    }).toThrow(/al menos 2 opciones mostradas/);
  });

  it('no admite la misma opción dos veces', () => {
    expect(() => {
      assertPresentedOptions([option(1, true), option(1, false)]);
    }).toThrow(/la misma opción dos veces/);
  });

  it('acepta una composición válida', () => {
    expect(() => {
      assertPresentedOptions([option(1, true), option(2, false)]);
    }).not.toThrow();
  });
});

describe('respuesta elegida', () => {
  it('rechaza una opción que no se mostró', () => {
    expect(() => {
      assertSelectionWithinPresented([option(1, true), option(2, false)], [3]);
    }).toThrow(/no se mostraron/);
  });

  it('admite no elegir ninguna', () => {
    expect(() => {
      assertSelectionWithinPresented([option(1, true), option(2, false)], []);
    }).not.toThrow();
  });
});

describe('intento completo', () => {
  it('acepta el que cumple las dos mitades', () => {
    expect(() => {
      assertAttemptDraft(draft());
    }).not.toThrow();
  });

  it('rechaza el que no se podía acertar', () => {
    expect(() => {
      assertAttemptDraft(draft({ presentedOptions: [option(1, false), option(2, false)] }));
    }).toThrow(InvariantError);
  });
});
