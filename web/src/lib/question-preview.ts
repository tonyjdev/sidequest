import type { QuestionType } from '@web/lib/api/questions';
import { MIN_PRESENTED_OPTIONS } from '@web/lib/question-rules';

/**
 * Cómo se vería la pregunta en la terminal: qué opciones se mostrarían y en qué
 * orden (docs/especificacion.md §4.3, docs/decisiones.md §7).
 *
 * **La composición de verdad vive en el dominio** y la implementa SQST-0013;
 * esto es una copia deliberada para el editor, del mismo tipo que la de
 * `content-rules.ts`, porque el paquete del panel no importa el de la
 * aplicación. Cuando el dominio exponga la composición, esta se sustituye por
 * una llamada.
 *
 * Se diferencia en una cosa a propósito: **el sorteo es reproducible**. Recibe
 * una semilla, de modo que la vista previa no baila sola mientras se escribe y
 * quien edita puede pedir otra combinación cuando quiera verla.
 */

export interface PreviewCandidate {
  /** Identidad estable de la opción dentro del formulario, que aún puede no tener id. */
  readonly key: string;
  readonly text: string;
  readonly isCorrect: boolean;
}

export interface QuestionPreview {
  /** Las opciones que se mostrarían, en el orden en que se mostrarían. */
  readonly options: readonly PreviewCandidate[];
  /** Cuántas se mostrarían: manda la pregunta y, si no lo dice, el valor global. */
  readonly visibleOptions: number;
  /** Una `multiple` cuyas opciones mostradas son todas correctas: válida, pero trivial. */
  readonly trivial: boolean;
  /** Llega a dos opciones y al menos una correcta; si no, no es candidata al sorteo. */
  readonly presentable: boolean;
}

export interface PreviewInput {
  readonly type: QuestionType;
  readonly options: readonly PreviewCandidate[];
  /** El de la pregunta; `null` usa el global. */
  readonly visibleOptions: number | null;
  readonly visibleOptionsDefault: number;
  readonly seed: number;
}

export function composeQuestionPreview({
  type,
  options,
  visibleOptions,
  visibleOptionsDefault,
  seed,
}: PreviewInput): QuestionPreview {
  const random = mulberry32(seed);
  const correct = options.filter((option) => option.isCorrect);
  const distractors = options.filter((option) => !option.isCorrect);

  const requested = Math.max(visibleOptions ?? visibleOptionsDefault, MIN_PRESENTED_OPTIONS);

  // Única: una correcta al azar. Múltiple: todas, porque mostrar solo una parte
  // convertiría una respuesta correcta en incorrecta según el sorteo.
  const shownCorrect = type === 'single' ? take(correct, 1, random) : correct;

  // Si las correctas no caben, se amplía el número de opciones mostradas hasta
  // que quepan; el recorte aleatorio solo alcanza a los distractores.
  const room = Math.max(requested, shownCorrect.length);
  const shown = shuffle(
    [...shownCorrect, ...take(distractors, room - shownCorrect.length, random)],
    random,
  );

  return {
    options: shown,
    visibleOptions: room,
    trivial: shown.length > 0 && shown.every((option) => option.isCorrect),
    presentable: shown.length >= MIN_PRESENTED_OPTIONS && shown.some((option) => option.isCorrect),
  };
}

/**
 * Nunca se rellena con opciones inventadas ni se repite ninguna: si hay menos
 * distractores de los pedidos, se muestran los que haya.
 */
function take<T>(values: readonly T[], count: number, random: () => number): T[] {
  return shuffle(values, random).slice(0, Math.max(count, 0));
}

/** Fisher–Yates con el generador que se le pasa, para que el orden sea reproducible. */
function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const swapped = shuffled[target];

    if (current !== undefined && swapped !== undefined) {
      shuffled[index] = swapped;
      shuffled[target] = current;
    }
  }

  return shuffled;
}

/** Generador pequeño y determinista: la misma semilla da siempre la misma vista previa. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let value = Math.imul(state ^ (state >>> 15), 1 | state);

    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
