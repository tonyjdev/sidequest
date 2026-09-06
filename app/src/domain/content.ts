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

/**
 * Los dos únicos destinos de una transición de estado (SQST-0007). Volver a
 * borrador no existe: se publica desde borrador y se archiva desde donde sea.
 */
export type ContentTransition = Extract<ContentStatus, 'published' | 'archived'>;

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

/**
 * Cómo se nombra cada nivel dentro de un mensaje. El género no es el mismo en
 * los tres —«la materia» frente a «el tema»—, así que no hay plantilla común que
 * sirva: cada uno lleva sus palabras.
 */
const LEVEL_WORDS = {
  subject: {
    subject: 'La materia',
    object: 'una materia',
    published: 'publicada',
    archived: 'archivada',
  },
  topic: { subject: 'El tema', object: 'un tema', published: 'publicado', archived: 'archivado' },
  subtopic: {
    subject: 'El subtema',
    object: 'un subtema',
    published: 'publicado',
    archived: 'archivado',
  },
} as const satisfies Record<
  ContentLevel,
  { subject: string; object: string; published: string; archived: string }
>;

/**
 * Las transiciones son explícitas y son dos: `draft → published` y
 * `cualquiera → archived`. Lo demás choca con el estado actual.
 *
 * Que archivar no tenga vuelta es deliberado: el histórico depende de que lo
 * retirado siga retirado, y desarchivar en cascada dejaría publicado un árbol
 * que nadie revisó (docs/decisiones.md §6).
 */
export function assertStatusTransition(
  level: ContentLevel,
  from: ContentStatus,
  to: ContentTransition,
): void {
  const words = LEVEL_WORDS[level];

  if (from === to) {
    throw new ConflictError(`${words.subject} ya está ${words[to]}`, { level, from, to });
  }

  if (from === 'archived') {
    throw new ConflictError(
      `No se puede publicar ${words.object} ${words.archived}: solo se publica desde borrador`,
      { level, from, to },
    );
  }
}

/**
 * La reordenación recibe la lista completa de hermanos, en el orden nuevo, y no
 * un subconjunto: repartir 1..n entre unos pocos dejaría posiciones repetidas
 * con los que no vinieron. Se exige el mismo conjunto —sin repetidos, sin
 * ausentes y sin extraños—, en cualquier orden.
 */
export function assertReorderIds(current: readonly number[], requested: readonly number[]): void {
  const currentSet = new Set(current);
  const seen = new Set<number>();
  const duplicated: number[] = [];
  const unknown: number[] = [];

  for (const id of requested) {
    if (seen.has(id)) duplicated.push(id);
    else if (!currentSet.has(id)) unknown.push(id);

    seen.add(id);
  }

  const missing = current.filter((id) => !seen.has(id));

  if (duplicated.length === 0 && unknown.length === 0 && missing.length === 0) return;

  throw new InvariantError(
    'La reordenación necesita todos los hermanos exactamente una vez, sin ids ajenos',
    { duplicated, unknown, missing },
  );
}
