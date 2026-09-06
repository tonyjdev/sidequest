import { describe, expect, it } from 'vitest';

import { seedQuestions, seedSubtopics, seedTags } from '@app/db/seed-data.js';

/**
 * El lote del sembrado cumple las mismas invariantes que impone la base. Aquí
 * se comprueban sin MySQL delante: si alguna se rompe, `pnpm db:seed` fallaría
 * contra un disparador y el mensaje sería mucho menos claro que este.
 */
describe('lote del sembrado', () => {
  const subtopicSlugs = new Set(seedSubtopics.map((subtopic) => subtopic.slug));
  const tagSlugs = new Set(seedTags.map((tag) => tag.slug));

  it('trae varias preguntas de cada tipo repartidas por los dos subtemas', () => {
    expect(seedQuestions.filter((question) => question.type === 'single').length).toBeGreaterThan(
      1,
    );
    expect(seedQuestions.filter((question) => question.type === 'multiple').length).toBeGreaterThan(
      1,
    );
    expect(new Set(seedQuestions.map((question) => question.subtopicSlug))).toEqual(subtopicSlugs);
  });

  it.each(seedQuestions.map((question) => [question.statement, question] as const))(
    'cumple las invariantes de publicación: %s',
    (_statement, question) => {
      const correct = question.options.filter((option) => option.isCorrect);

      expect(question.options.length).toBeGreaterThanOrEqual(2);
      expect(correct.length).toBeGreaterThanOrEqual(1);

      if (question.type === 'single') {
        expect(correct).toHaveLength(1);
      }
    },
  );

  it('deja siempre distractores que recortar', () => {
    for (const question of seedQuestions) {
      const distractors = question.options.filter((option) => !option.isCorrect);

      expect(distractors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('solo referencia subtemas y etiquetas que define', () => {
    for (const question of seedQuestions) {
      expect(subtopicSlugs).toContain(question.subtopicSlug);

      for (const slug of question.tagSlugs ?? []) {
        expect(tagSlugs).toContain(slug);
      }
    }
  });

  it('no repite enunciados, que compartirían `content_hash`', () => {
    const statements = seedQuestions.map((question) => question.statement);

    expect(new Set(statements).size).toBe(statements.length);
  });
});
