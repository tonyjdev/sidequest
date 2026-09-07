import type {
  Difficulty,
  QuestionDetail,
  QuestionType,
  ResourceKind,
} from '@web/lib/api/questions';

/**
 * El agregado mientras se edita. Las opciones y los recursos llevan una clave
 * propia porque los nuevos todavía no tienen `id` y React necesita distinguirlos
 * para no reusar el campo de texto de uno en otro al reordenar.
 *
 * Los números viven como cadena —`visibleOptions`— porque un campo vacío
 * significa «usa el valor global», y un `0` accidental no es lo mismo que eso.
 */

export interface DraftOption {
  readonly key: string;
  readonly text: string;
  readonly isCorrect: boolean;
}

export interface DraftResource {
  readonly key: string;
  readonly kind: ResourceKind;
  readonly url: string;
  readonly label: string;
}

export interface QuestionDraft {
  readonly subtopicId: number | null;
  readonly type: QuestionType;
  readonly statement: string;
  readonly explanation: string;
  readonly difficulty: Difficulty;
  readonly visibleOptions: string;
  readonly options: readonly DraftOption[];
  readonly resources: readonly DraftResource[];
  readonly tagIds: readonly number[];
}

let counter = 0;

export function nextKey(): string {
  counter += 1;

  return `draft-${String(counter)}`;
}

export function emptyOption(): DraftOption {
  return { key: nextKey(), text: '', isCorrect: false };
}

export function emptyResource(): DraftResource {
  return { key: nextKey(), kind: 'page', url: '', label: '' };
}

/**
 * El alta empieza con las dos opciones que exige el mínimo y con la primera
 * marcada: una pregunta de selección única necesita exactamente una correcta, y
 * empezar sin ninguna solo obliga a marcarla después.
 */
export function newQuestionDraft(subtopicId: number | null): QuestionDraft {
  return {
    subtopicId,
    type: 'single',
    statement: '',
    explanation: '',
    difficulty: 'medium',
    visibleOptions: '',
    options: [{ ...emptyOption(), isCorrect: true }, emptyOption()],
    resources: [],
    tagIds: [],
  };
}

/** La ficha que llega de la API, tal cual, para que editar no reordene ni pierda nada. */
export function draftFromDetail(detail: QuestionDetail): QuestionDraft {
  return {
    subtopicId: detail.subtopic_id,
    type: detail.type,
    statement: detail.statement,
    explanation: detail.explanation ?? '',
    difficulty: detail.difficulty,
    visibleOptions: detail.visible_options === null ? '' : String(detail.visible_options),
    options: detail.options.map((option) => ({
      key: `option-${String(option.id)}`,
      text: option.text,
      isCorrect: option.is_correct,
    })),
    resources: detail.resources.map((resource) => ({
      key: `resource-${String(resource.id)}`,
      kind: resource.kind,
      url: resource.url,
      label: resource.label ?? '',
    })),
    tagIds: detail.tags.map((tag) => tag.id),
  };
}

/** Mover una entrada de la lista sin tocar las demás; es el orden de autoría. */
export function moveAt<T>(values: readonly T[], index: number, step: -1 | 1): readonly T[] {
  const moved = [...values];
  const [entry] = moved.splice(index, 1);

  if (entry === undefined) return values;

  moved.splice(index + step, 0, entry);

  return moved;
}
