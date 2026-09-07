import { z } from 'zod';

import { settingsToRows, type SidequestSettings } from '@app/domain/settings.js';

/**
 * Los parámetros globales en la API (docs/especificacion.md §3.10). Salen con la
 * clave de la base, que es también la de la API y la que ve quien los edita:
 * traducirlos aquí obligaría a mantener un tercer nombre para lo mismo.
 *
 * Las diez claves están escritas una a una en vez de derivarse de `SETTING_KEYS`
 * porque el serializador de Fastify necesita el objeto con sus propiedades, no
 * un registro abierto. Que las dos listas no se separen lo comprueba
 * `settings.test.ts`, igual que `types.test.ts` hace con el vocabulario.
 */
export const settingsSchema = z.object({
  visible_options_default: z.number().int(),
  weight_new_boost: z.number(),
  weight_maturity_days: z.number(),
  weight_failure: z.number(),
  weight_difficulty_easy: z.number(),
  weight_difficulty_medium: z.number(),
  weight_difficulty_hard: z.number(),
  cooldown_hours: z.number(),
  attempt_token_ttl_seconds: z.number().int(),
  session_max_questions: z.number().int(),
});

/** El valor sale del dominio ya aplanado: `settingsToRows` es quien sabe leer cada parámetro. */
export function settingsBody(settings: SidequestSettings): z.infer<typeof settingsSchema> {
  const values = Object.fromEntries(
    settingsToRows(settings).map((row) => [row.key, Number(row.value)]),
  );

  return settingsSchema.parse(values);
}
