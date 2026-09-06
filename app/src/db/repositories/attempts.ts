import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '@app/db/client.js';
import { requireRow } from '@app/db/repositories/shared.js';
import { attempts } from '@app/db/schema.js';
import type { Attempt, AttemptDraft, PresentedOption } from '@app/domain/attempts.js';
import type { AttemptQuery, AttemptRepository } from '@app/domain/repositories.js';

const NOT_FOUND = 'El intento no existe';

/**
 * Las dos columnas JSON van en `snake_case` dentro del documento
 * (docs/especificacion.md §3.9), así que la traducción a los nombres del
 * dominio se hace aquí y solo aquí. Se leen con esquema en vez de con un cast:
 * un intento antiguo con otra forma tiene que fallar al leerse, no propagar
 * campos vacíos.
 */
const presentedOptionsSchema = z.array(
  z.object({ option_id: z.number(), text: z.string(), is_correct: z.boolean() }),
);

const selectedOptionIdsSchema = z.array(z.number());

type AttemptRow = typeof attempts.$inferSelect;

export function createAttemptRepository(db: Database): AttemptRepository {
  return {
    async record(draft: AttemptDraft): Promise<Attempt> {
      const [inserted] = await db.insert(attempts).values({
        questionId: draft.questionId,
        sessionId: draft.sessionId,
        questionVersion: draft.questionVersion,
        subjectName: draft.subjectName,
        topicName: draft.topicName,
        subtopicName: draft.subtopicName,
        questionStatement: draft.questionStatement,
        questionType: draft.questionType,
        difficulty: draft.difficulty,
        presentedOptions: draft.presentedOptions.map((option) => ({
          option_id: option.optionId,
          text: option.text,
          is_correct: option.isCorrect,
        })),
        selectedOptionIds: [...draft.selectedOptionIds],
        isCorrect: draft.isCorrect,
      });

      return requireRow(await findAttempt(inserted.insertId), NOT_FOUND, {
        attemptId: inserted.insertId,
      });
    },

    async findById(id: number): Promise<Attempt | null> {
      return (await findAttempt(id)) ?? null;
    },

    async list(query?: AttemptQuery): Promise<Attempt[]> {
      const { questionIds, sessionId, answeredSince, limit } = query ?? {};

      if (questionIds?.length === 0) return [];

      let rows = db
        .select()
        .from(attempts)
        .where(
          and(
            questionIds === undefined ? undefined : inArray(attempts.questionId, [...questionIds]),
            sessionId === undefined ? undefined : eq(attempts.sessionId, sessionId),
            answeredSince === undefined ? undefined : gte(attempts.answeredAt, answeredSince),
          ),
        )
        .orderBy(desc(attempts.answeredAt), desc(attempts.id))
        .$dynamic();

      if (limit !== undefined) rows = rows.limit(limit);

      return (await rows).map(toAttempt);
    },
  };

  async function findAttempt(id: number): Promise<Attempt | undefined> {
    const [row] = await db.select().from(attempts).where(eq(attempts.id, id)).limit(1);

    return row === undefined ? undefined : toAttempt(row);
  }
}

function toAttempt(row: AttemptRow): Attempt {
  const presented: PresentedOption[] = presentedOptionsSchema
    .parse(row.presentedOptions)
    .map((option) => ({
      optionId: option.option_id,
      text: option.text,
      isCorrect: option.is_correct,
    }));

  return {
    id: row.id,
    questionId: row.questionId,
    sessionId: row.sessionId,
    questionVersion: row.questionVersion,
    subjectName: row.subjectName,
    topicName: row.topicName,
    subtopicName: row.subtopicName,
    questionStatement: row.questionStatement,
    questionType: row.questionType,
    difficulty: row.difficulty,
    presentedOptions: presented,
    selectedOptionIds: selectedOptionIdsSchema.parse(row.selectedOptionIds),
    isCorrect: row.isCorrect,
    answeredAt: row.answeredAt,
  };
}
