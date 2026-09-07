import { describe, expect, it } from 'vitest';

import {
  NOT_ENOUGH_OPTIONS,
  NO_CORRECT_OPTION,
  SINGLE_NEEDS_ONE_CORRECT,
  parseVisibleOptions,
  validatePublishable,
  validateQuestionDraft,
  type QuestionDraft,
} from '@web/lib/question-rules';

/**
 * La copia de las reglas del dominio en el formulario. Lo que se comprueba es
 * que rechace lo mismo y con las mismas palabras que `app/src/domain/questions.ts`.
 */

const base: QuestionDraft = {
  statement: '¿Cuál es la solución de 2x + 6 = 0?',
  type: 'single',
  visibleOptions: '',
  options: [
    { text: 'x = −3', isCorrect: true },
    { text: 'x = 3', isCorrect: false },
  ],
  resources: [],
};

function fields(issues: readonly { readonly field: string }[]): string[] {
  return issues.map((issue) => issue.field);
}

describe('reglas de la pregunta en el formulario', () => {
  it('acepta un borrador completo', () => {
    expect(validateQuestionDraft(base)).toEqual([]);
  });

  it('exige enunciado', () => {
    expect(fields(validateQuestionDraft({ ...base, statement: '   ' }))).toEqual(['statement']);
  });

  it('rechaza el texto vacío de una opción, nombrando cuál', () => {
    const issues = validateQuestionDraft({
      ...base,
      options: [base.options[0]!, { text: ' ', isCorrect: false }],
    });

    expect(fields(issues)).toEqual(['options.1.text']);
  });

  it('rechaza una URL de recurso que no sea absoluta', () => {
    const issues = validateQuestionDraft({ ...base, resources: [{ url: '/imagen.png' }] });

    expect(fields(issues)).toEqual(['resources.0.url']);
  });

  it('interpreta el campo de opciones visibles', () => {
    expect(parseVisibleOptions('')).toBeNull();
    expect(parseVisibleOptions('  ')).toBeNull();
    expect(parseVisibleOptions('4')).toBe(4);
    expect(parseVisibleOptions('1')).toBe('invalid');
    expect(parseVisibleOptions('2,5')).toBe('invalid');
    expect(parseVisibleOptions('muchas')).toBe('invalid');
  });

  it('repite las tres invariantes de publicación con las palabras del dominio', () => {
    const short = validatePublishable({ ...base, options: [base.options[0]!] });
    const none = validatePublishable({
      ...base,
      options: base.options.map((option) => ({ ...option, isCorrect: false })),
    });
    const twoCorrect = validatePublishable({
      ...base,
      options: base.options.map((option) => ({ ...option, isCorrect: true })),
    });

    expect(short[0]?.message).toBe(NOT_ENOUGH_OPTIONS);
    expect(none[0]?.message).toBe(NO_CORRECT_OPTION);
    expect(twoCorrect[0]?.message).toBe(SINGLE_NEEDS_ONE_CORRECT);
  });

  it('no exige una sola correcta en selección múltiple', () => {
    const issues = validatePublishable({
      ...base,
      type: 'multiple',
      options: base.options.map((option) => ({ ...option, isCorrect: true })),
    });

    expect(issues).toEqual([]);
  });
});
