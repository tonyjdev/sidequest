import { asc, eq, inArray } from 'drizzle-orm';

import type { Database } from '@app/db/client.js';
import { contentPatchValues, requireRow, type Executor } from '@app/db/repositories/shared.js';
import { subjects, subtopics, topics } from '@app/db/schema.js';
import type { ContentPatch, NewSubject, Subject } from '@app/domain/content.js';
import type { ContentQuery, SubjectRepository } from '@app/domain/repositories.js';
import type { ContentStatus } from '@app/domain/types.js';

const NOT_FOUND = 'La materia no existe';

export function createSubjectRepository(db: Database): SubjectRepository {
  return {
    list(query?: ContentQuery): Promise<Subject[]> {
      const statuses = query?.statuses;

      if (statuses?.length === 0) return Promise.resolve([]);

      return db
        .select()
        .from(subjects)
        .where(statuses === undefined ? undefined : inArray(subjects.status, [...statuses]))
        .orderBy(asc(subjects.position), asc(subjects.id));
    },

    async findById(id: number): Promise<Subject | null> {
      return (await findSubject(db, id)) ?? null;
    },

    async findBySlug(slug: string): Promise<Subject | null> {
      const [row] = await db.select().from(subjects).where(eq(subjects.slug, slug)).limit(1);

      return row ?? null;
    },

    async create(input: NewSubject): Promise<Subject> {
      const [inserted] = await db.insert(subjects).values(input);

      return requireRow(await findSubject(db, inserted.insertId), NOT_FOUND, {
        subjectId: inserted.insertId,
      });
    },

    async update(id: number, patch: ContentPatch): Promise<Subject> {
      const values = contentPatchValues(patch);

      if (Object.keys(values).length > 0) {
        await db.update(subjects).set(values).where(eq(subjects.id, id));
      }

      return requireRow(await findSubject(db, id), NOT_FOUND, { subjectId: id });
    },

    async setStatus(id: number, status: ContentStatus): Promise<Subject> {
      await db.update(subjects).set({ status }).where(eq(subjects.id, id));

      return requireRow(await findSubject(db, id), NOT_FOUND, { subjectId: id });
    },

    /** Archivar baja los tres niveles, y baja de una pieza: nada se borra. */
    async archiveTree(id: number): Promise<Subject> {
      return db.transaction(async (tx) => {
        const children = await tx
          .select({ id: topics.id })
          .from(topics)
          .where(eq(topics.subjectId, id));
        const topicIds = children.map((topic) => topic.id);

        if (topicIds.length > 0) {
          await tx
            .update(subtopics)
            .set({ status: 'archived' })
            .where(inArray(subtopics.topicId, topicIds));
          await tx.update(topics).set({ status: 'archived' }).where(eq(topics.subjectId, id));
        }

        await tx.update(subjects).set({ status: 'archived' }).where(eq(subjects.id, id));

        return requireRow(await findSubject(tx, id), NOT_FOUND, { subjectId: id });
      });
    },
  };
}

async function findSubject(executor: Executor, id: number): Promise<Subject | undefined> {
  const [row] = await executor.select().from(subjects).where(eq(subjects.id, id)).limit(1);

  return row;
}
