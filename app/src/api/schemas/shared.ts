import { z } from 'zod';

import { contentStatuses } from '@app/domain/types.js';

/**
 * Piezas que comparten todos los esquemas de la API: el envoltorio del listado,
 * el id de la ruta y la forma en que se leen los filtros repetibles.
 */

export const itemsOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });

export const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * `?status=draft,published` y `?status=draft&status=published` significan lo
 * mismo: Fastify entrega una cadena o un array según cuántas veces aparezca el
 * parámetro, y quien escribe la URL a mano no tiene por qué saber cuál toca.
 */
export function commaSeparated<T extends z.ZodType>(item: T) {
  return z.preprocess((value) => {
    if (value === undefined) return undefined;

    return (Array.isArray(value) ? value : [value])
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '');
  }, z.array(item).nonempty().optional());
}

export const statusFilter = commaSeparated(z.enum(contentStatuses));
export const idFilter = commaSeparated(z.coerce.number().int().positive());
