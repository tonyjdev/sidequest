import { eq } from 'drizzle-orm';

import type { Database } from '@app/db/client.js';
import { contentHashOf } from '@app/db/content-hash.js';
import {
  questionOptions,
  questionResources,
  questionTag,
  questions,
  subjects,
  subtopics,
  tags,
  topics,
} from '@app/db/schema.js';
import {
  seedQuestions,
  seedSubject,
  seedSubtopics,
  seedTags,
  seedTopic,
} from '@app/db/seed-data.js';

/**
 * Sembrado de desarrollo. Escribe el contenido de `seed-data.ts` y deja la base
 * en un estado con el que trabajar; no toca `settings`, cuyos valores iniciales
 * viajan en la migración.
 *
 * Es idempotente por lo bruto: si la materia ya está, no escribe nada. Basta
 * para lo que hace falta —volver a sembrar tras migrar en limpio— sin inventar
 * una reconciliación que nadie ha pedido.
 */
export type SeedOutcome = 'seeded' | 'skipped';

export async function seedDevelopmentContent(db: Database): Promise<SeedOutcome> {
  const existing = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.slug, seedSubject.slug))
    .limit(1);

  if (existing.length > 0) {
    return 'skipped';
  }

  await db.transaction(async (tx) => {
    const [subject] = await tx.insert(subjects).values({
      slug: seedSubject.slug,
      name: seedSubject.name,
      description: seedSubject.description,
      status: 'published',
      position: 1,
    });

    const [topic] = await tx.insert(topics).values({
      subjectId: subject.insertId,
      slug: seedTopic.slug,
      name: seedTopic.name,
      description: seedTopic.description,
      status: 'published',
      position: 1,
    });

    const subtopicIds = new Map<string, number>();

    for (const subtopic of seedSubtopics) {
      const [inserted] = await tx.insert(subtopics).values({
        topicId: topic.insertId,
        slug: subtopic.slug,
        name: subtopic.name,
        description: subtopic.description,
        status: 'published',
        position: subtopic.position,
      });

      subtopicIds.set(subtopic.slug, inserted.insertId);
    }

    const tagIds = new Map<string, number>();

    for (const tag of seedTags) {
      const [inserted] = await tx.insert(tags).values({ slug: tag.slug, name: tag.name });

      tagIds.set(tag.slug, inserted.insertId);
    }

    for (const question of seedQuestions) {
      const subtopicId = subtopicIds.get(question.subtopicSlug);

      if (subtopicId === undefined) {
        throw new Error(
          `El sembrado referencia un subtema que no define: ${question.subtopicSlug}`,
        );
      }

      // Borrador primero: los disparadores de 0001 impiden crear una pregunta
      // ya publicada, porque en ese instante todavía no tiene opciones.
      const [inserted] = await tx.insert(questions).values({
        subtopicId,
        type: question.type,
        statement: question.statement,
        explanation: question.explanation,
        difficulty: question.difficulty,
        status: 'draft',
        visibleOptions: question.visibleOptions ?? null,
        contentHash: contentHashOf(question.statement),
      });

      const questionId = inserted.insertId;

      await tx.insert(questionOptions).values(
        question.options.map((option, index) => ({
          questionId,
          text: option.text,
          isCorrect: option.isCorrect,
          position: index + 1,
        })),
      );

      const resources = question.resources ?? [];

      if (resources.length > 0) {
        await tx.insert(questionResources).values(
          resources.map((resource, index) => ({
            questionId,
            kind: resource.kind,
            url: resource.url,
            label: resource.label,
            position: index + 1,
          })),
        );
      }

      const tagSlugs = question.tagSlugs ?? [];

      if (tagSlugs.length > 0) {
        await tx.insert(questionTag).values(
          tagSlugs.map((slug) => {
            const tagId = tagIds.get(slug);

            if (tagId === undefined) {
              throw new Error(`El sembrado referencia una etiqueta que no define: ${slug}`);
            }

            return { questionId, tagId };
          }),
        );
      }

      await tx.update(questions).set({ status: 'published' }).where(eq(questions.id, questionId));
    }
  });

  return 'seeded';
}
