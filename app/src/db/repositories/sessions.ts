import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Database } from '@app/db/client.js';
import { requireRow } from '@app/db/repositories/shared.js';
import { sessions } from '@app/db/schema.js';
import type { SessionRepository } from '@app/domain/repositories.js';
import type { Session, SessionKey, SessionPause } from '@app/domain/sessions.js';

const NOT_FOUND = 'La sesión no existe';

export function createSessionRepository(db: Database): SessionRepository {
  return {
    /**
     * `(agent, external_ref)` es único, así que la segunda llamada con la misma
     * referencia continúa la sesión en vez de abrir otra y partir los contadores.
     */
    async openOrReuse(key: SessionKey): Promise<Session> {
      const [existing] = await db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.agent, key.agent),
            key.externalRef === null
              ? isNull(sessions.externalRef)
              : eq(sessions.externalRef, key.externalRef),
          ),
        )
        .limit(1);

      if (existing !== undefined) {
        await db
          .update(sessions)
          .set({ lastSeenAt: new Date() })
          .where(eq(sessions.id, existing.id));

        return requireRow(await findSession(existing.id), NOT_FOUND, { sessionId: existing.id });
      }

      const [inserted] = await db
        .insert(sessions)
        .values({ agent: key.agent, externalRef: key.externalRef });

      return requireRow(await findSession(inserted.insertId), NOT_FOUND, {
        sessionId: inserted.insertId,
      });
    },

    async findById(id: number): Promise<Session | null> {
      return (await findSession(id)) ?? null;
    },

    async registerAsked(id: number): Promise<Session> {
      await db
        .update(sessions)
        .set({ askedCount: sql`${sessions.askedCount} + 1`, lastSeenAt: new Date() })
        .where(eq(sessions.id, id));

      return requireRow(await findSession(id), NOT_FOUND, { sessionId: id });
    },

    async pause(id: number, pause: SessionPause): Promise<Session> {
      await db
        .update(sessions)
        .set({
          pausedUntil: pause.until,
          pausedForQuestions: pause.forQuestions,
          lastSeenAt: new Date(),
        })
        .where(eq(sessions.id, id));

      return requireRow(await findSession(id), NOT_FOUND, { sessionId: id });
    },
  };

  async function findSession(id: number): Promise<Session | undefined> {
    const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);

    return row;
  }
}
