import type { ContentPatch } from '@app/domain/content.js';
import type { Database } from '@app/db/client.js';
import { NotFoundError } from '@app/domain/errors.js';

/**
 * Piezas comunes a los adaptadores Drizzle.
 *
 * `Executor` es lo que permite que una misma función de lectura sirva dentro y
 * fuera de una transacción: las escrituras que tocan varias tablas —crear una
 * pregunta, archivar un árbol— leen su resultado con la misma transacción que
 * las escribió.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Transaction;

/** Campos de un nodo de contenido que un `PATCH` puede tocar. */
export interface ContentValues {
  slug?: string;
  name?: string;
  description?: string | null;
  position?: number;
}

export function contentPatchValues(patch: ContentPatch): ContentValues {
  const values: ContentValues = {};

  if (patch.slug !== undefined) values.slug = patch.slug;
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.position !== undefined) values.position = patch.position;

  return values;
}

/**
 * MySQL no devuelve la fila que acaba de escribir, así que todo camino de
 * escritura la relee. Si no está, es que el id no existía.
 */
export function requireRow<T>(row: T | undefined | null, message: string, details: unknown): T {
  if (row === undefined || row === null) throw new NotFoundError(message, details);

  return row;
}
