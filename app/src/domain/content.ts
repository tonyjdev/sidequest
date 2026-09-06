import { ConflictError, InvariantError } from '@app/domain/errors.js';
import type { ContentLevel, ContentStatus } from '@app/domain/types.js';

/**
 * Jerarquía de contenido: materia → tema → subtema (docs/decisiones.md §1).
 *
 * Los tres niveles comparten forma y reglas, así que comparten modelo: lo único
 * que los distingue es de quién cuelgan y dónde es único su slug.
 */

/** Longitudes de `subjects`, `topics` y `subtopics` en docs/especificacion.md §3.1. */
export const SLUG_MAX_LENGTH = 120;
export const NAME_MAX_LENGTH = 160;

// Minúsculas, dígitos y guiones simples: el slug viaja en la ruta de tres
// niveles del lote de importación, donde `/` y los espacios no valen.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export interface ContentNode {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ContentStatus;
  readonly position: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type Subject = ContentNode;

export interface Topic extends ContentNode {
  readonly subjectId: number;
}

export interface Subtopic extends ContentNode {
  readonly topicId: number;
}

/** Campos escribibles comunes a los tres niveles. */
export interface ContentFields {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ContentStatus;
  readonly position: number;
}

export type NewSubject = ContentFields;

export interface NewTopic extends ContentFields {
  readonly subjectId: number;
}

export interface NewSubtopic extends ContentFields {
  readonly topicId: number;
}

/**
 * Cambios parciales: lo ausente no se toca. El estado no está aquí a propósito
 * —se mueve con `changeStatus`, que es quien comprueba la cadena de publicación
 * y arrastra el archivado—.
 */
export interface ContentPatch {
  readonly slug?: string | undefined;
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly position?: number | undefined;
}

/**
 * Los tres nombres que `attempts` copia en vez de referenciar, para que un
 * intento antiguo siga siendo legible aunque el contenido cambie después.
 */
export interface ContentPath {
  readonly subjectName: string;
  readonly topicName: string;
  readonly subtopicName: string;
}

export function assertSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new InvariantError(
      'El slug solo admite minúsculas, dígitos y guiones simples, sin empezar ni terminar en guión',
      [{ field: 'slug', message: 'formato no válido' }],
    );
  }

  if (slug.length > SLUG_MAX_LENGTH) {
    throw new InvariantError(`El slug no puede pasar de ${SLUG_MAX_LENGTH} caracteres`, [
      { field: 'slug', message: 'demasiado largo' },
    ]);
  }
}

export function assertName(name: string): void {
  if (name.trim() === '') {
    throw new InvariantError('El nombre no puede estar vacío', [
      { field: 'name', message: 'obligatorio' },
    ]);
  }

  if (name.length > NAME_MAX_LENGTH) {
    throw new InvariantError(`El nombre no puede pasar de ${NAME_MAX_LENGTH} caracteres`, [
      { field: 'name', message: 'demasiado largo' },
    ]);
  }
}

export function assertPosition(position: number): void {
  if (!Number.isInteger(position) || position < 0) {
    throw new InvariantError('La posición debe ser un entero no negativo', [
      { field: 'position', message: 'entero no negativo' },
    ]);
  }
}

export function assertContentFields(fields: ContentFields): void {
  assertSlug(fields.slug);
  assertName(fields.name);
  assertPosition(fields.position);
}

/**
 * Cada eslabón de la cadena de publicación, con su mensaje propio: el género de
 * «materia» y de «tema» no admite una plantilla común.
 */
const PUBLICATION_CHAIN = {
  topic: {
    parentLevel: 'subject',
    message: 'No se puede publicar un tema cuya materia no está publicada',
  },
  subtopic: {
    parentLevel: 'topic',
    message: 'No se puede publicar un subtema cuyo tema no está publicado',
  },
} as const satisfies Record<
  Exclude<ContentLevel, 'subject'>,
  { parentLevel: ContentLevel; message: string }
>;

/**
 * Un nivel solo se publica si su padre ya está publicado: la cadena tiene tres
 * eslabones y se comprueba eslabón a eslabón, tanto al crear como al cambiar de
 * estado (docs/decisiones.md §1 y §6).
 */
export function assertPublishableUnder(
  level: Exclude<ContentLevel, 'subject'>,
  parent: ContentNode,
): void {
  if (parent.status === 'published') return;

  const link = PUBLICATION_CHAIN[level];

  throw new ConflictError(link.message, {
    level,
    parentLevel: link.parentLevel,
    parentStatus: parent.status,
  });
}
