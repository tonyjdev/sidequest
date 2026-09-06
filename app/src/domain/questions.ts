import { InvariantError } from '@app/domain/errors.js';
import type {
  ContentStatus,
  Difficulty,
  QuestionType,
  ResourceKind,
  StorageKind,
} from '@app/domain/types.js';

/**
 * Pregunta, opciones y recursos (docs/especificacion.md §3.4 a §3.6), con las
 * invariantes que la base impone con disparadores.
 *
 * Están escritas dos veces a propósito, y solo estas: aquí para poder rechazar
 * la operación antes de escribir y con un error que el cliente entienda, y en
 * MySQL para que ninguna escritura por otro camino se las salte. Los mensajes
 * son literalmente los mismos que los de `0001_invariantes_de_la_pregunta.sql`,
 * de modo que romper la invariante suene igual venga de donde venga.
 */

/** Mínimo absoluto de opciones mostradas en un intento (docs/decisiones.md §7). */
export const MIN_PRESENTED_OPTIONS = 2;

export const NOT_ENOUGH_OPTIONS = 'Una pregunta publicada necesita al menos dos opciones';
export const NO_CORRECT_OPTION = 'Una pregunta publicada necesita al menos una opción correcta';
export const SINGLE_NEEDS_ONE_CORRECT =
  'Una pregunta de selección única publicada necesita exactamente una opción correcta';

export interface Question {
  readonly id: number;
  readonly subtopicId: number;
  readonly type: QuestionType;
  readonly statement: string;
  readonly explanation: string | null;
  readonly difficulty: Difficulty;
  readonly status: ContentStatus;
  /** `null` usa `settings.visible_options_default`. */
  readonly visibleOptions: number | null;
  readonly version: number;
  readonly contentHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface QuestionOption {
  readonly id: number;
  readonly questionId: number;
  readonly text: string;
  readonly isCorrect: boolean;
  /** Orden de autoría. El de presentación se sortea en cada intento. */
  readonly position: number;
}

export interface QuestionResource {
  readonly id: number;
  readonly questionId: number;
  readonly kind: ResourceKind;
  readonly url: string;
  readonly label: string | null;
  readonly storageKind: StorageKind;
  readonly position: number;
}

export interface Tag {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly createdAt: Date;
}

/** La pregunta con todo lo que cuelga de ella. Es la unidad que se lee y se escribe. */
export interface QuestionDetail {
  readonly question: Question;
  readonly options: readonly QuestionOption[];
  readonly resources: readonly QuestionResource[];
  readonly tags: readonly Tag[];
}

export interface NewQuestion {
  readonly subtopicId: number;
  readonly type: QuestionType;
  readonly statement: string;
  readonly explanation: string | null;
  readonly difficulty: Difficulty;
  readonly visibleOptions: number | null;
}

export interface QuestionPatch {
  readonly subtopicId?: number | undefined;
  readonly type?: QuestionType | undefined;
  readonly statement?: string | undefined;
  readonly explanation?: string | null | undefined;
  readonly difficulty?: Difficulty | undefined;
  readonly visibleOptions?: number | null | undefined;
}

export interface NewQuestionOption {
  readonly text: string;
  readonly isCorrect: boolean;
}

export interface NewQuestionResource {
  readonly kind: ResourceKind;
  readonly url: string;
  readonly label: string | null;
  readonly storageKind: StorageKind;
}

/** Lo mínimo que hace falta de una opción para decidir si la pregunta es publicable. */
export interface OptionCorrectness {
  readonly isCorrect: boolean;
}

/**
 * Las tres invariantes de publicación, juntas y en un solo sitio. Se comprueban
 * al publicar la pregunta y cada vez que cambian sus opciones mientras está
 * publicada; sobre una pregunta en borrador no aplican, que es lo que permite
 * el camino borrador → opciones → publicar.
 */
export function assertPublishableQuestion(
  type: QuestionType,
  options: readonly OptionCorrectness[],
): void {
  if (options.length < MIN_PRESENTED_OPTIONS) {
    throw new InvariantError(NOT_ENOUGH_OPTIONS, { total: options.length });
  }

  const correct = options.filter((option) => option.isCorrect).length;

  if (correct < 1) {
    throw new InvariantError(NO_CORRECT_OPTION, { total: options.length, correct });
  }

  if (type === 'single' && correct !== 1) {
    throw new InvariantError(SINGLE_NEEDS_ONE_CORRECT, { total: options.length, correct });
  }
}

export function assertQuestionStatement(statement: string): void {
  if (statement.trim() === '') {
    throw new InvariantError('El enunciado no puede estar vacío', [
      { field: 'statement', message: 'obligatorio' },
    ]);
  }
}

export function assertVisibleOptions(visibleOptions: number | null): void {
  if (visibleOptions === null) return;

  if (!Number.isInteger(visibleOptions) || visibleOptions < MIN_PRESENTED_OPTIONS) {
    throw new InvariantError(
      `Las opciones visibles de una pregunta deben ser un entero de al menos ${MIN_PRESENTED_OPTIONS}`,
      [{ field: 'visible_options', message: 'entero >= 2' }],
    );
  }
}

export function assertOptionTexts(options: readonly NewQuestionOption[]): void {
  for (const [index, option] of options.entries()) {
    if (option.text.trim() === '') {
      throw new InvariantError('El texto de una opción no puede estar vacío', [
        { field: `options.${index}.text`, message: 'obligatorio' },
      ]);
    }
  }
}

export function assertResourceUrls(resources: readonly NewQuestionResource[]): void {
  for (const [index, resource] of resources.entries()) {
    if (!URL.canParse(resource.url)) {
      throw new InvariantError('La URL de un recurso debe ser absoluta', [
        { field: `resources.${index}.url`, message: 'URL no válida' },
      ]);
    }
  }
}

/**
 * Cuántas opciones se muestran: manda la pregunta y, si no lo dice, el valor
 * global (docs/decisiones.md §7). El recorte en sí es de la composición del
 * intento; aquí solo se resuelve el número.
 */
export function resolveVisibleOptions(
  questionVisibleOptions: number | null,
  visibleOptionsDefault: number,
): number {
  return Math.max(questionVisibleOptions ?? visibleOptionsDefault, MIN_PRESENTED_OPTIONS);
}
