import type { ContentPatch } from '@app/domain/content.js';
import type { Database } from '@app/db/client.js';
import { ConflictError, DomainError, NotFoundError } from '@app/domain/errors.js';

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

/**
 * Los disparadores de `0001_invariantes_de_la_pregunta` hablan con
 * `SIGNAL SQLSTATE '45000'`. Que uno salte significa que una escritura rompió
 * una invariante que el dominio ya comprueba antes: llega hasta aquí solo en una
 * carrera entre dos escrituras o por un camino que no pasó por el servicio.
 *
 * Su mensaje viene en castellano y es el mismo que el del dominio, así que se
 * propaga como conflicto —el estado actual no admite la escritura— en vez de
 * como el 500 que sería un error de MySQL sin traducir.
 */
export async function withDatabaseInvariants<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const signal = findSignal(error);

    if (signal === null || error instanceof DomainError) throw error;

    throw new ConflictError(signal, { sqlState: SIGNAL_SQL_STATE });
  }
}

const SIGNAL_SQL_STATE = '45000';

/** El error de mysql2 viaja envuelto por Drizzle, así que se recorre la cadena de causas. */
function findSignal(error: unknown): string | null {
  for (let current = error; current instanceof Error; current = current.cause) {
    const { sqlState, sqlMessage } = current as { sqlState?: unknown; sqlMessage?: unknown };

    if (sqlState === SIGNAL_SQL_STATE && typeof sqlMessage === 'string') return sqlMessage;
  }

  return null;
}
