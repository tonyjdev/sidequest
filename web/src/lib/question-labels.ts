import type { ContentStatus } from '@web/lib/api/content';
import type { Difficulty, QuestionType, ResourceKind } from '@web/lib/api/questions';

/**
 * Cómo se nombra en español lo que la API dice en inglés. La pregunta es
 * femenina, así que sus estados no son los del tema ni los de la materia:
 * `content-labels.ts` tiene los suyos.
 */

export const QUESTION_TYPE_WORDS = {
  single: 'Selección única',
  multiple: 'Selección múltiple',
} as const satisfies Record<QuestionType, string>;

export const QUESTION_TYPE_HINTS = {
  single: 'Se muestra una correcta y el resto son distractores.',
  multiple: 'Se muestran todas las correctas; el recorte solo afecta a los distractores.',
} as const satisfies Record<QuestionType, string>;

export const DIFFICULTY_WORDS = {
  easy: 'Fácil',
  medium: 'Media',
  hard: 'Difícil',
} as const satisfies Record<Difficulty, string>;

export const QUESTION_STATUS_WORDS = {
  draft: 'Borrador',
  published: 'Publicada',
  archived: 'Archivada',
} as const satisfies Record<ContentStatus, string>;

export const RESOURCE_KIND_WORDS = {
  image: 'Imagen',
  video: 'Vídeo',
  page: 'Página',
  document: 'Documento',
} as const satisfies Record<ResourceKind, string>;

/** El filtro de estado del listado: «Todo» no manda el parámetro. */
export const QUESTION_STATUS_FILTERS = [
  { value: 'all', label: 'Todo' },
  { value: 'draft', label: 'Borradores' },
  { value: 'published', label: 'Publicadas' },
  { value: 'archived', label: 'Archivadas' },
] as const;

export type QuestionStatusFilter = (typeof QUESTION_STATUS_FILTERS)[number]['value'];

/** Qué transiciones ofrece la fila según dónde esté; archivada es terminal. */
export const TRANSITION_WORDS = {
  publish: 'Publicar',
  unpublish: 'Volver a borrador',
  archive: 'Archivar',
} as const;
