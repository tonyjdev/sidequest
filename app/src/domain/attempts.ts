import { InvariantError } from '@app/domain/errors.js';
import type { ContentPath } from '@app/domain/content.js';
import { MIN_PRESENTED_OPTIONS } from '@app/domain/questions.js';
import type { Difficulty, QuestionType } from '@app/domain/types.js';

/**
 * Intento: el registro inmutable del histórico (docs/especificacion.md §3.9).
 *
 * Copia el enunciado, la ruta de contenido y las opciones que se mostraron. Un
 * intento nunca se reconstruye leyendo la pregunta actual: si la pregunta se
 * editó, esa lectura sería falsa.
 */

/** Una opción tal y como se mostró, en el orden en que se mostró. */
export interface PresentedOption {
  readonly optionId: number;
  readonly text: string;
  readonly isCorrect: boolean;
}

export interface AttemptDraft extends ContentPath {
  /** `null` cuando la pregunta se borró; el intento le sobrevive. */
  readonly questionId: number | null;
  readonly sessionId: number | null;
  readonly questionVersion: number;
  readonly questionStatement: string;
  readonly questionType: QuestionType;
  readonly difficulty: Difficulty;
  readonly presentedOptions: readonly PresentedOption[];
  readonly selectedOptionIds: readonly number[];
  readonly isCorrect: boolean;
}

export interface Attempt extends AttemptDraft {
  readonly id: number;
  readonly answeredAt: Date;
}

/**
 * Nunca se presenta un intento sin al menos una respuesta correcta, ni con
 * menos de dos opciones (docs/especificacion.md §4.3). Es la invariante que
 * hace comparable el histórico: sin ella, un intento podría ser imposible de
 * acertar y contaría como fallo.
 */
export function assertPresentedOptions(presented: readonly PresentedOption[]): void {
  if (presented.length < MIN_PRESENTED_OPTIONS) {
    throw new InvariantError(
      `Un intento necesita al menos ${MIN_PRESENTED_OPTIONS} opciones mostradas`,
      { presented: presented.length },
    );
  }

  if (!presented.some((option) => option.isCorrect)) {
    throw new InvariantError(
      'Un intento necesita al menos una opción correcta entre las mostradas',
      { presented: presented.length },
    );
  }

  const ids = new Set(presented.map((option) => option.optionId));

  if (ids.size !== presented.length) {
    throw new InvariantError('Un intento no puede mostrar la misma opción dos veces', {
      presented: presented.length,
    });
  }
}

/** Solo se puede elegir entre lo que se mostró: es la otra mitad de la inmutabilidad. */
export function assertSelectionWithinPresented(
  presented: readonly PresentedOption[],
  selectedOptionIds: readonly number[],
): void {
  const shown = new Set(presented.map((option) => option.optionId));
  const unknown = selectedOptionIds.filter((id) => !shown.has(id));

  if (unknown.length > 0) {
    throw new InvariantError('La respuesta elige opciones que no se mostraron', { unknown });
  }
}

export function assertAttemptDraft(draft: AttemptDraft): void {
  assertPresentedOptions(draft.presentedOptions);
  assertSelectionWithinPresented(draft.presentedOptions, draft.selectedOptionIds);
}
