import { describe, expect, it } from 'vitest';

import { InvariantError } from '@app/domain/errors.js';
import {
  assertOptionTexts,
  assertPublishableQuestion,
  assertQuestionStatement,
  assertResourceUrls,
  assertVisibleOptions,
  resolveVisibleOptions,
  type NewQuestionResource,
} from '@app/domain/questions.js';

const correct = { isCorrect: true };
const wrong = { isCorrect: false };

/** Cada invariante por separado: son tres reglas distintas, no una con tres motivos. */
describe('invariantes de publicación de la pregunta', () => {
  it('exige al menos dos opciones', () => {
    expect(() => {
      assertPublishableQuestion('single', [correct]);
    }).toThrow(/al menos dos opciones/);
  });

  it('exige al menos una opción correcta', () => {
    expect(() => {
      assertPublishableQuestion('multiple', [wrong, wrong]);
    }).toThrow(/al menos una opción correcta/);
  });

  it('exige exactamente una correcta en selección única', () => {
    expect(() => {
      assertPublishableQuestion('single', [correct, correct, wrong]);
    }).toThrow(/exactamente una opción correcta/);
  });

  it('admite varias correctas en selección múltiple', () => {
    expect(() => {
      assertPublishableQuestion('multiple', [correct, correct, wrong]);
    }).not.toThrow();
  });

  it('admite una múltiple con todas las opciones correctas', () => {
    expect(() => {
      assertPublishableQuestion('multiple', [correct, correct]);
    }).not.toThrow();
  });

  it('lleva el recuento en el detalle del error', () => {
    expect(() => {
      assertPublishableQuestion('single', [correct, correct]);
    }).toThrow(expect.objectContaining({ details: { total: 2, correct: 2 } }));
  });
});

describe('campos de la pregunta', () => {
  it('rechaza un enunciado en blanco', () => {
    expect(() => {
      assertQuestionStatement('  \n ');
    }).toThrow(InvariantError);
  });

  it('acepta que las opciones visibles no estén fijadas', () => {
    expect(() => {
      assertVisibleOptions(null);
    }).not.toThrow();
  });

  it.each([1, 0, 2.5])('rechaza %s opciones visibles', (value) => {
    expect(() => {
      assertVisibleOptions(value);
    }).toThrow(InvariantError);
  });

  it('rechaza una opción sin texto', () => {
    expect(() => {
      assertOptionTexts([
        { text: 'x = 3', isCorrect: true },
        { text: ' ', isCorrect: false },
      ]);
    }).toThrow(/options.1.text|texto de una opción/);
  });

  it('rechaza una URL de recurso que no es absoluta', () => {
    const resources: NewQuestionResource[] = [
      { kind: 'page', url: '/wiki/Polinomio', label: null, storageKind: 'external' },
    ];

    expect(() => {
      assertResourceUrls(resources);
    }).toThrow(InvariantError);
  });
});

describe('opciones visibles', () => {
  it('manda la pregunta cuando lo dice', () => {
    expect(resolveVisibleOptions(3, 4)).toBe(3);
  });

  it('usa el valor global cuando la pregunta no lo dice', () => {
    expect(resolveVisibleOptions(null, 4)).toBe(4);
  });

  it('nunca baja del mínimo de dos', () => {
    expect(resolveVisibleOptions(null, 1)).toBe(2);
  });
});
