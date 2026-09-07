import { describe, expect, it } from 'vitest';

import { composeQuestionPreview, type PreviewCandidate } from '@web/lib/question-preview';

/**
 * La composición del intento tal como la ve el editor (docs/especificacion.md
 * §4.3). Es la copia del panel de una regla de dominio, así que lo que se
 * comprueba aquí es exactamente lo que la regla promete.
 */

function option(key: string, isCorrect: boolean): PreviewCandidate {
  return { key, text: key, isCorrect };
}

const two = [option('c1', true), option('d1', false)];

const many = [
  option('c1', true),
  option('c2', true),
  option('c3', true),
  option('d1', false),
  option('d2', false),
  option('d3', false),
  option('d4', false),
];

function keys(options: readonly PreviewCandidate[]): string[] {
  return options.map((entry) => entry.key).sort();
}

describe('composición de la vista previa', () => {
  it('en selección única muestra una correcta y el resto distractores', () => {
    const preview = composeQuestionPreview({
      type: 'single',
      options: many,
      visibleOptions: 4,
      visibleOptionsDefault: 4,
      seed: 7,
    });

    expect(preview.options).toHaveLength(4);
    expect(preview.options.filter((entry) => entry.isCorrect)).toHaveLength(1);
    expect(preview.presentable).toBe(true);
  });

  it('en selección múltiple muestra todas las correctas', () => {
    const preview = composeQuestionPreview({
      type: 'multiple',
      options: many,
      visibleOptions: 4,
      visibleOptionsDefault: 4,
      seed: 7,
    });

    expect(preview.options).toHaveLength(4);
    expect(preview.options.filter((entry) => entry.isCorrect)).toHaveLength(3);
  });

  it('amplía las opciones mostradas cuando las correctas no caben', () => {
    const preview = composeQuestionPreview({
      type: 'multiple',
      options: many,
      visibleOptions: 2,
      visibleOptionsDefault: 4,
      seed: 3,
    });

    expect(preview.visibleOptions).toBe(3);
    expect(preview.options.filter((entry) => entry.isCorrect)).toHaveLength(3);
  });

  it('usa el valor global cuando la pregunta no lo dice', () => {
    const preview = composeQuestionPreview({
      type: 'single',
      options: many,
      visibleOptions: null,
      visibleOptionsDefault: 5,
      seed: 1,
    });

    expect(preview.options).toHaveLength(5);
  });

  it('nunca muestra menos de dos opciones aunque el valor global sea menor', () => {
    const preview = composeQuestionPreview({
      type: 'single',
      options: many,
      visibleOptions: null,
      visibleOptionsDefault: 1,
      seed: 1,
    });

    expect(preview.options).toHaveLength(2);
  });

  it('con menos distractores de los pedidos muestra los que hay, sin repetir', () => {
    const preview = composeQuestionPreview({
      type: 'single',
      options: two,
      visibleOptions: 5,
      visibleOptionsDefault: 4,
      seed: 9,
    });

    expect(keys(preview.options)).toEqual(['c1', 'd1']);
  });

  it('la misma semilla da la misma composición y otra la puede cambiar', () => {
    const input = {
      type: 'single' as const,
      options: many,
      visibleOptions: 3,
      visibleOptionsDefault: 4,
    };
    const first = composeQuestionPreview({ ...input, seed: 11 });
    const again = composeQuestionPreview({ ...input, seed: 11 });

    expect(again.options).toEqual(first.options);

    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
      composeQuestionPreview({ ...input, seed })
        .options.map((entry) => entry.key)
        .join(),
    );

    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('marca como trivial la múltiple cuyas opciones mostradas son todas correctas', () => {
    const preview = composeQuestionPreview({
      type: 'multiple',
      options: [option('c1', true), option('c2', true)],
      visibleOptions: null,
      visibleOptionsDefault: 4,
      seed: 2,
    });

    expect(preview.trivial).toBe(true);
    expect(preview.presentable).toBe(true);
  });

  it('no es presentable sin correcta ni con menos de dos opciones', () => {
    expect(
      composeQuestionPreview({
        type: 'single',
        options: [option('d1', false), option('d2', false)],
        visibleOptions: null,
        visibleOptionsDefault: 4,
        seed: 2,
      }).presentable,
    ).toBe(false);

    expect(
      composeQuestionPreview({
        type: 'single',
        options: [option('c1', true)],
        visibleOptions: null,
        visibleOptionsDefault: 4,
        seed: 2,
      }).presentable,
    ).toBe(false);
  });
});
