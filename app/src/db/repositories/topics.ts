import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Database } from '@app/db/client.js';
import { contentPatchValues, requireRow, type Executor } from '@app/db/repositories/shared.js';
import { subtopics, topics } from '@app/db/schema.js';
import type { ContentPatch, NewTopic, Topic } from '@app/domain/content.js';
import type { TopicQuery, TopicRepository } from '@app/domain/repositories.js';
import type { ContentStatus } from '@app/domain/types.js';

const NOT_FOUND = 'El tema no existe';

export function createTopicRepository(db: Database): TopicRepository {
  return {
    list(query?: TopicQuery): Promise<Topic[]> {
      const { statuses, subjectIds } = query ?? {};

      if (statuses?.length === 0 || subjectIds?.length === 0) return Promise.resolve([]);

      return db
        .select()
        .from(topics)
        .where(
          and(
            statuses === undefined ? undefined : inArray(topics.status, [...statuses]),
            subjectIds === undefined ? undefined : inArray(topics.subjectId, [...subjectIds]),
          ),
        )
        .orderBy(asc(topics.position), asc(topics.id));
    },

    async findById(id: number): Promise<Topic | null> {
      return (await findTopic(db, id)) ?? null;
    },

    async findBySlug(subjectId: number, slug: string): Promise<Topic | null> {
      const [row] = await db
        .select()
        .from(topics)
        .where(and(eq(topics.subjectId, subjectId), eq(topics.slug, slug)))
        .limit(1);

      return row ?? null;
    },

    async create(input: NewTopic): Promise<Topic> {
      const [inserted] = await db.insert(topics).values(input);

      return requireRow(await findTopic(db, inserted.insertId), NOT_FOUND, {
        topicId: inserted.insertId,
      });
    },

    async update(id: number, patch: ContentPatch): Promise<Topic> {
      const values = contentPatchValues(patch);

      if (Object.keys(values).length > 0) {
        await db.update(topics).set(values).where(eq(topics.id, id));
      }

      return requireRow(await findTopic(db, id), NOT_FOUND, { topicId: id });
    },

    async setStatus(id: number, status: ContentStatus): Promise<Topic> {
      await db.update(topics).set({ status }).where(eq(topics.id, id));

      return requireRow(await findTopic(db, id), NOT_FOUND, { topicId: id });
    },

    async archiveTree(id: number): Promise<Topic> {
      return db.transaction(async (tx) => {
        await tx.update(subtopics).set({ status: 'archived' }).where(eq(subtopics.topicId, id));
        await tx.update(topics).set({ status: 'archived' }).where(eq(topics.id, id));

        return requireRow(await findTopic(tx, id), NOT_FOUND, { topicId: id });
      });
    },

    /**
     * La materia va en el `where` además del id: reordenar no puede mover un
     * tema de otra materia aunque llegue su id por error.
     */
    reorder(subjectId: number, ids: readonly number[]): Promise<Topic[]> {
      return db.transaction(async (tx) => {
        for (const [index, id] of ids.entries()) {
          await tx
            .update(topics)
            .set({ position: index + 1 })
            .where(and(eq(topics.id, id), eq(topics.subjectId, subjectId)));
        }

        return tx
          .select()
          .from(topics)
          .where(eq(topics.subjectId, subjectId))
          .orderBy(asc(topics.position), asc(topics.id));
      });
    },
  };
}

async function findTopic(executor: Executor, id: number): Promise<Topic | undefined> {
  const [row] = await executor.select().from(topics).where(eq(topics.id, id)).limit(1);

  return row;
}
