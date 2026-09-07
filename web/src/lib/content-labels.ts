import type { ContentLevel, ContentStatus } from '@web/lib/api/content';
import type { StatusFilter } from '@web/lib/content-tree';

/**
 * Cómo se nombra cada nivel y cada estado en la interfaz, que es en español. El
 * género no es el mismo en los tres —«la materia» frente a «el tema»—, así que
 * no hay plantilla común que sirva: cada nivel lleva sus palabras, igual que en
 * `app/src/domain/content.ts`.
 */

interface LevelWords {
  readonly one: string;
  readonly many: string;
  /** Con artículo determinado, para las frases: «Editar el tema». */
  readonly article: string;
  /** El plural con su artículo: «Ordenar los temas de Matemáticas». */
  readonly articleMany: string;
  readonly newOne: string;
}

export const LEVEL_WORDS = {
  subjects: {
    one: 'materia',
    many: 'materias',
    article: 'la materia',
    articleMany: 'las materias',
    newOne: 'Nueva materia',
  },
  topics: {
    one: 'tema',
    many: 'temas',
    article: 'el tema',
    articleMany: 'los temas',
    newOne: 'Nuevo tema',
  },
  subtopics: {
    one: 'subtema',
    many: 'subtemas',
    article: 'el subtema',
    articleMany: 'los subtemas',
    newOne: 'Nuevo subtema',
  },
} as const satisfies Record<ContentLevel, LevelWords>;

/** De quién cuelga el nivel siguiente; el subtema ya no tiene hijos. */
export const CHILD_LEVEL = {
  subjects: 'topics',
  topics: 'subtopics',
  subtopics: null,
} as const satisfies Record<ContentLevel, ContentLevel | null>;

export const STATUS_WORDS = {
  subjects: { draft: 'Borrador', published: 'Publicada', archived: 'Archivada' },
  topics: { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' },
  subtopics: { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' },
} as const satisfies Record<ContentLevel, Record<ContentStatus, string>>;

export const STATUS_FILTERS = [
  { value: 'all', label: 'Todo' },
  { value: 'draft', label: 'Borradores' },
  { value: 'published', label: 'Publicados' },
  { value: 'archived', label: 'Archivados' },
] as const satisfies readonly { value: StatusFilter; label: string }[];

/** «12 preguntas», «1 pregunta», «Sin preguntas». */
export function formatQuestionCount(count: number): string {
  if (count === 0) return 'Sin preguntas';

  return count === 1 ? '1 pregunta' : `${String(count)} preguntas`;
}
