import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Database } from '@app/db/client.js';
import { contentPatchValues, requireRow } from '@app/db/repositories/shared.js';
import { subtopics } from '@app/db/schema.js';
import type { ContentPatch, NewSubtopic, Subtopic } from '@app/domain/content.js';
import type { SubtopicQuery, SubtopicRepository } from '@app/domain/repositories.js';
import type { ContentStatus } from '@app/domain/types.js';

const NOT_FOUND = 'El subtema no existe';

export function createSubtopicRepository(db: Database): SubtopicRepository {
  return {
    list(query?: SubtopicQuery): Promise<Subtopic[]> {
      const { statuses, topicIds } = query ?? {};

      if (statuses?.length === 0 || topicIds?.length === 0) return Promise.resolve([]);

      return db
        .select()
        .from(subtopics)
        .where(
          and(
            statuses === undefined ? undefined : inArray(subtopics.status, [...statuses]),
            topicIds === undefined ? undefined : inArray(subtopics.topicId, [...topicIds]),
          ),
        )
        .orderBy(asc(subtopics.position), asc(subtopics.id));
    },

    async findById(id: number): Promise<Subtopic | null> {
      return (await findSubtopic(id)) ?? null;
    },

    async findBySlug(topicId: number, slug: string): Promise<Subtopic | null> {
      const [row] = await db
        .select()
        .from(subtopics)
        .where(and(eq(subtopics.topicId, topicId), eq(subtopics.slug, slug)))
        .limit(1);

      return row ?? null;
    },

    async create(input: NewSubtopic): Promise<Subtopic> {
      const [inserted] = await db.insert(subtopics).values(input);

      return requireRow(await findSubtopic(inserted.insertId), NOT_FOUND, {
        subtopicId: inserted.insertId,
      });
    },

    async update(id: number, patch: ContentPatch): Promise<Subtopic> {
      const values = contentPatchValues(patch);

      if (Object.keys(values).length > 0) {
        await db.update(subtopics).set(values).where(eq(subtopics.id, id));
      }

      return requireRow(await findSubtopic(id), NOT_FOUND, { subtopicId: id });
    },

    async setStatus(id: number, status: ContentStatus): Promise<Subtopic> {
      await db.update(subtopics).set({ status }).where(eq(subtopics.id, id));

      return requireRow(await findSubtopic(id), NOT_FOUND, { subtopicId: id });
    },

    /** El último nivel no tiene descendientes que arrastrar: las preguntas se archivan aparte. */
    async archive(id: number): Promise<Subtopic> {
      await db.update(subtopics).set({ status: 'archived' }).where(eq(subtopics.id, id));

      return requireRow(await findSubtopic(id), NOT_FOUND, { subtopicId: id });
    },

    reorder(topicId: number, ids: readonly number[]): Promise<Subtopic[]> {
      return db.transaction(async (tx) => {
        for (const [index, id] of ids.entries()) {
          await tx
            .update(subtopics)
            .set({ position: index + 1 })
            .where(and(eq(subtopics.id, id), eq(subtopics.topicId, topicId)));
        }

        return tx
          .select()
          .from(subtopics)
          .where(eq(subtopics.topicId, topicId))
          .orderBy(asc(subtopics.position), asc(subtopics.id));
      });
    },
  };

  async function findSubtopic(id: number): Promise<Subtopic | undefined> {
    const [row] = await db.select().from(subtopics).where(eq(subtopics.id, id)).limit(1);

    return row;
  }
}
