import type { FieldIssue } from '@web/lib/api/errors';
import type { QuestionType } from '@web/lib/api/questions';

/**
 * Las reglas de la pregunta, escritas también aquí para rechazar antes de gastar
 * una petición lo que ya se sabe imposible. **El dominio sigue mandando**
 * (`app/src/domain/questions.ts`): esto es una copia deliberada, con los mismos
 * límites y los mismos mensajes, para que el formulario diga exactamente lo que
 * diría el servidor y no una versión suya. Es la misma copia que
 * `content-rules.ts` hace con el slug y el nombre.
 */

/** Mínimo absoluto de opciones mostradas en un intento (docs/decisiones.md §7). */
export const MIN_PRESENTED_OPTIONS = 2;

export const NOT_ENOUGH_OPTIONS = 'Una pregunta publicada necesita al menos dos opciones';
export const NO_CORRECT_OPTION = 'Una pregunta publicada necesita al menos una opción correcta';
export const SINGLE_NEEDS_ONE_CORRECT =
  'Una pregunta de selección única publicada necesita exactamente una opción correcta';

export interface QuestionDraft {
  readonly statement: string;
  readonly type: QuestionType;
  readonly visibleOptions: string;
  readonly options: readonly { readonly text: string; readonly isCorrect: boolean }[];
  readonly resources: readonly { readonly url: string }[];
}

/**
 * Lo que se comprueba siempre, se publique o no. Las invariantes de publicación
 * van aparte: una pregunta en borrador puede estar a medias, que es lo que
 * permite el camino borrador → opciones → publicar.
 */
export function validateQuestionDraft(draft: QuestionDraft): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (draft.statement.trim() === '') {
    issues.push({ field: 'statement', message: 'El enunciado no puede estar vacío' });
  }

  if (parseVisibleOptions(draft.visibleOptions) === 'invalid') {
    issues.push({
      field: 'visible_options',
      message: `Las opciones visibles de una pregunta deben ser un entero de al menos ${String(MIN_PRESENTED_OPTIONS)}`,
    });
  }

  for (const [index, option] of draft.options.entries()) {
    if (option.text.trim() === '') {
      issues.push({
        field: `options.${String(index)}.text`,
        message: 'El texto de una opción no puede estar vacío',
      });
    }
  }

  for (const [index, resource] of draft.resources.entries()) {
    if (!URL.canParse(resource.url.trim())) {
      issues.push({
        field: `resources.${String(index)}.url`,
        message: 'La URL de un recurso debe ser absoluta',
      });
    }
  }

  return issues;
}

/**
 * Las tres invariantes de publicación, con los mensajes literales del dominio y
 * de los disparadores de la base, para que romperlas suene igual venga de donde
 * venga.
 */
export function validatePublishable(draft: QuestionDraft): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];
  const correct = draft.options.filter((option) => option.isCorrect).length;

  if (draft.options.length < MIN_PRESENTED_OPTIONS) {
    issues.push({ field: 'options', message: NOT_ENOUGH_OPTIONS });
  }

  if (correct < 1) {
    issues.push({ field: 'options', message: NO_CORRECT_OPTION });
  } else if (draft.type === 'single' && correct !== 1) {
    issues.push({ field: 'options', message: SINGLE_NEEDS_ONE_CORRECT });
  }

  return issues;
}

/**
 * El campo vacío significa «usa el valor global», que es justo lo que guarda un
 * `null`. Cualquier otra cosa que no sea un entero de al menos dos es un error,
 * no un cero silencioso.
 */
export function parseVisibleOptions(value: string): number | null | 'invalid' {
  const text = value.trim();

  if (text === '') return null;

  const parsed = Number(text);

  if (!Number.isInteger(parsed) || parsed < MIN_PRESENTED_OPTIONS) return 'invalid';

  return parsed;
}
