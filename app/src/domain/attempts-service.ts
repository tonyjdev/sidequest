import { assertAttemptDraft, type Attempt, type AttemptDraft } from '@app/domain/attempts.js';
import type { Repositories } from '@app/domain/repositories.js';

/**
 * Registro de un intento. La única puerta por la que se escribe en `attempts`,
 * para que ninguna quede sin pasar por la invariante: un intento sin correcta
 * entre las mostradas sería imposible de acertar y contaría como fallo, y el
 * histórico dejaría de ser comparable.
 */
export async function recordAttempt(repos: Repositories, draft: AttemptDraft): Promise<Attempt> {
  assertAttemptDraft(draft);

  return repos.attempts.record(draft);
}
