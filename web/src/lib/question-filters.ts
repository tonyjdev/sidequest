import type { Difficulty } from '@web/lib/api/questions';
import type { QuestionStatusFilter } from '@web/lib/question-labels';

/**
 * Los cinco filtros del listado de preguntas, que son los que la API admite
 * (docs/development/api.md): subtema, estado, dificultad, etiqueta y texto.
 *
 * `ANY` es la ausencia de filtro, no un valor del dominio: Radix no admite una
 * opción con valor vacío, así que el «cualquiera» necesita nombre propio.
 */

export const ANY = 'any';

export interface QuestionFilterState {
  readonly status: QuestionStatusFilter;
  readonly subtopicId: number | null;
  readonly difficulty: Difficulty | null;
  readonly tagId: number | null;
  readonly search: string;
}

export const EMPTY_FILTERS: QuestionFilterState = {
  status: 'all',
  subtopicId: null,
  difficulty: null,
  tagId: null,
  search: '',
};

/** Si no hay filtro activo, una lista vacía significa que no hay preguntas todavía. */
export function isFiltered(filters: QuestionFilterState): boolean {
  return (
    filters.status !== 'all' ||
    filters.subtopicId !== null ||
    filters.difficulty !== null ||
    filters.tagId !== null ||
    filters.search.trim() !== ''
  );
}
