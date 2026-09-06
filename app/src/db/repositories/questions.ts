import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Database } from '@app/db/client.js';
import { requireRow, type Executor } from '@app/db/repositories/shared.js';
import {
  questionOptions,
  questionResources,
  questionTag,
  questions,
  tags,
} from '@app/db/schema.js';
import { contentHashOf } from '@app/domain/content-hash.js';
import type {
  NewQuestionOption,
  NewQuestionResource,
  Question,
  QuestionDetail,
  QuestionOption,
  QuestionPatch,
  QuestionResource,
  Tag,
} from '@app/domain/questions.js';
import type {
  NewQuestionInput,
  QuestionQuery,
  QuestionRepository,
} from '@app/domain/repositories.js';
import type { ContentStatus } from '@app/domain/types.js';

const NOT_FOUND = 'La pregunta no existe';

interface QuestionValues {
  subtopicId?: number;
  type?: 'single' | 'multiple';
  statement?: string;
  explanation?: string | null;
  difficulty?: 'easy' | 'medium' | 'hard';
  visibleOptions?: number | null;
  contentHash?: string;
}

export function createQuestionRepository(db: Database): QuestionRepository {
  return {
    list(query?: QuestionQuery): Promise<Question[]> {
      const { statuses, subtopicIds, difficulties, tagIds } = query ?? {};

      if (
        statuses?.length === 0 ||
        subtopicIds?.length === 0 ||
        difficulties?.length === 0 ||
        tagIds?.length === 0
      ) {
        return Promise.resolve([]);
      }

      const taggedQuestions =
        tagIds === undefined
          ? undefined
          : db
              .select({ questionId: questionTag.questionId })
              .from(questionTag)
              .where(inArray(questionTag.tagId, [...tagIds]));

      let rows = db
        .select()
        .from(questions)
        .where(
          and(
            statuses === undefined ? undefined : inArray(questions.status, [...statuses]),
            subtopicIds === undefined ? undefined : inArray(questions.subtopicId, [...subtopicIds]),
            difficulties === undefined
              ? undefined
              : inArray(questions.difficulty, [...difficulties]),
            taggedQuestions === undefined ? undefined : inArray(questions.id, taggedQuestions),
          ),
        )
        .orderBy(asc(questions.id))
        .$dynamic();

      if (query?.limit !== undefined) rows = rows.limit(query.limit);
      if (query?.offset !== undefined) rows = rows.offset(query.offset);

      return rows;
    },

    findById(id: number): Promise<QuestionDetail | null> {
      return loadDetail(db, id);
    },

    findByContentHash(subtopicId: number, contentHash: string): Promise<Question[]> {
      return db
        .select()
        .from(questions)
        .where(and(eq(questions.subtopicId, subtopicId), eq(questions.contentHash, contentHash)))
        .orderBy(asc(questions.id));
    },

    /**
     * Borrador → opciones → publicar, dentro de una transacción. No es una
     * preferencia: los disparadores impiden crear una pregunta ya publicada,
     * porque en ese instante todavía no tiene opciones.
     */
    async create(input: NewQuestionInput): Promise<QuestionDetail> {
      return db.transaction(async (tx) => {
        const [inserted] = await tx.insert(questions).values({
          subtopicId: input.question.subtopicId,
          type: input.question.type,
          statement: input.question.statement,
          explanation: input.question.explanation,
          difficulty: input.question.difficulty,
          status: 'draft',
          visibleOptions: input.question.visibleOptions,
          contentHash: contentHashOf(input.question.statement),
        });

        const id = inserted.insertId;

        await writeOptions(tx, id, input.options);
        await writeResources(tx, id, input.resources);
        await writeTags(tx, id, input.tagIds);

        if (input.status !== 'draft') {
          await tx.update(questions).set({ status: input.status }).where(eq(questions.id, id));
        }

        return requireRow(await loadDetail(tx, id), NOT_FOUND, { questionId: id });
      });
    },

    async update(id: number, patch: QuestionPatch): Promise<Question> {
      const values = toQuestionValues(patch);

      if (Object.keys(values).length > 0) {
        await db.update(questions).set(values).where(eq(questions.id, id));
      }

      return requireRow(await findQuestion(db, id), NOT_FOUND, { questionId: id });
    },

    /**
     * La pregunta pasa por borrador dentro de la transacción: los disparadores
     * cuentan las opciones una a una, así que vaciarlas con la pregunta
     * publicada fallaría al borrar la penúltima. Al volver a publicarla, las
     * invariantes se comprueban de nuevo sobre las opciones nuevas.
     */
    async replaceOptions(
      id: number,
      values: readonly NewQuestionOption[],
    ): Promise<QuestionOption[]> {
      return db.transaction(async (tx) => {
        const question = requireRow(await findQuestion(tx, id), NOT_FOUND, { questionId: id });
        const published = question.status === 'published';

        if (published) {
          await tx.update(questions).set({ status: 'draft' }).where(eq(questions.id, id));
        }

        await tx.delete(questionOptions).where(eq(questionOptions.questionId, id));
        await writeOptions(tx, id, values);

        if (published) {
          await tx.update(questions).set({ status: 'published' }).where(eq(questions.id, id));
        }

        return loadOptions(tx, id);
      });
    },

    async replaceResources(
      id: number,
      values: readonly NewQuestionResource[],
    ): Promise<QuestionResource[]> {
      return db.transaction(async (tx) => {
        requireRow(await findQuestion(tx, id), NOT_FOUND, { questionId: id });
        await tx.delete(questionResources).where(eq(questionResources.questionId, id));
        await writeResources(tx, id, values);

        return loadResources(tx, id);
      });
    },

    async setTags(id: number, tagIds: readonly number[]): Promise<Tag[]> {
      return db.transaction(async (tx) => {
        requireRow(await findQuestion(tx, id), NOT_FOUND, { questionId: id });
        await tx.delete(questionTag).where(eq(questionTag.questionId, id));
        await writeTags(tx, id, tagIds);

        return loadTags(tx, id);
      });
    },

    async setStatus(id: number, status: ContentStatus): Promise<Question> {
      await db.update(questions).set({ status }).where(eq(questions.id, id));

      return requireRow(await findQuestion(db, id), NOT_FOUND, { questionId: id });
    },
  };
}

function toQuestionValues(patch: QuestionPatch): QuestionValues {
  const values: QuestionValues = {};

  if (patch.subtopicId !== undefined) values.subtopicId = patch.subtopicId;
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.explanation !== undefined) values.explanation = patch.explanation;
  if (patch.difficulty !== undefined) values.difficulty = patch.difficulty;
  if (patch.visibleOptions !== undefined) values.visibleOptions = patch.visibleOptions;

  // El hash se deriva siempre del enunciado: no hay forma de guardar uno que no
  // le corresponda.
  if (patch.statement !== undefined) {
    values.statement = patch.statement;
    values.contentHash = contentHashOf(patch.statement);
  }

  return values;
}

async function writeOptions(
  executor: Executor,
  questionId: number,
  values: readonly NewQuestionOption[],
): Promise<void> {
  if (values.length === 0) return;

  await executor.insert(questionOptions).values(
    values.map((option, index) => ({
      questionId,
      text: option.text,
      isCorrect: option.isCorrect,
      position: index + 1,
    })),
  );
}

async function writeResources(
  executor: Executor,
  questionId: number,
  values: readonly NewQuestionResource[],
): Promise<void> {
  if (values.length === 0) return;

  await executor.insert(questionResources).values(
    values.map((resource, index) => ({
      questionId,
      kind: resource.kind,
      url: resource.url,
      label: resource.label,
      storageKind: resource.storageKind,
      position: index + 1,
    })),
  );
}

async function writeTags(
  executor: Executor,
  questionId: number,
  tagIds: readonly number[],
): Promise<void> {
  if (tagIds.length === 0) return;

  await executor.insert(questionTag).values(tagIds.map((tagId) => ({ questionId, tagId })));
}

async function findQuestion(executor: Executor, id: number): Promise<Question | undefined> {
  const [row] = await executor.select().from(questions).where(eq(questions.id, id)).limit(1);

  return row;
}

function loadOptions(executor: Executor, questionId: number): Promise<QuestionOption[]> {
  return executor
    .select()
    .from(questionOptions)
    .where(eq(questionOptions.questionId, questionId))
    .orderBy(asc(questionOptions.position), asc(questionOptions.id));
}

function loadResources(executor: Executor, questionId: number): Promise<QuestionResource[]> {
  return executor
    .select()
    .from(questionResources)
    .where(eq(questionResources.questionId, questionId))
    .orderBy(asc(questionResources.position), asc(questionResources.id));
}

function loadTags(executor: Executor, questionId: number): Promise<Tag[]> {
  return executor
    .select({ id: tags.id, slug: tags.slug, name: tags.name, createdAt: tags.createdAt })
    .from(questionTag)
    .innerJoin(tags, eq(tags.id, questionTag.tagId))
    .where(eq(questionTag.questionId, questionId))
    .orderBy(asc(tags.id));
}

async function loadDetail(executor: Executor, id: number): Promise<QuestionDetail | null> {
  const question = await findQuestion(executor, id);

  if (question === undefined) return null;

  return {
    question,
    options: await loadOptions(executor, id),
    resources: await loadResources(executor, id),
    tags: await loadTags(executor, id),
  };
}
