import { z } from 'zod';

import { InvariantError } from '@app/domain/errors.js';
import { MIN_PRESENTED_OPTIONS } from '@app/domain/questions.js';
import type { Difficulty, SettingType } from '@app/domain/types.js';

/**
 * Parámetros ajustables (docs/especificacion.md §3.10). Gobiernan la selección
 * ponderada, el enfriamiento y la frecuencia, y se editan desde el panel sin
 * desplegar.
 *
 * Los valores iniciales viajan en `0002_parametros_por_defecto.sql`, no en el
 * sembrado: sin ellos la ponderación no tiene con qué calcular. Los de aquí son
 * la red por si una fila falta o se vuelve ilegible; `settings.test.ts`
 * comprueba que ambas listas coincidan.
 */

export interface SidequestSettings {
  readonly visibleOptionsDefault: number;
  readonly weightNewBoost: number;
  readonly weightMaturityDays: number;
  readonly weightFailure: number;
  readonly weightDifficulty: Readonly<Record<Difficulty, number>>;
  readonly cooldownHours: number;
  readonly attemptTokenTtlSeconds: number;
  readonly sessionMaxQuestions: number;
}

/** Una fila de `settings` tal cual está en la base. */
export interface SettingRow {
  readonly key: string;
  readonly value: string;
  readonly type: SettingType;
}

export const DEFAULT_SETTINGS: SidequestSettings = {
  visibleOptionsDefault: 4,
  weightNewBoost: 10,
  weightMaturityDays: 30,
  weightFailure: 1.5,
  weightDifficulty: { easy: 1, medium: 1, hard: 1 },
  cooldownHours: 24,
  attemptTokenTtlSeconds: 300,
  sessionMaxQuestions: 20,
};

const positive = z.number().positive();
const nonNegative = z.number().min(0);
const positiveInt = z.number().int().positive();

/**
 * Cada parámetro con su validación y con las dos lentes que lo unen a la fila:
 * la clave de la base y de la API es la misma, y es la que ve quien edita.
 */
const SETTING_SPECS = {
  visible_options_default: {
    schema: z.number().int().min(MIN_PRESENTED_OPTIONS),
    read: (settings: SidequestSettings) => settings.visibleOptionsDefault,
    write: (settings: SidequestSettings, value: number) => ({
      ...settings,
      visibleOptionsDefault: value,
    }),
  },
  weight_new_boost: {
    schema: positive,
    read: (settings: SidequestSettings) => settings.weightNewBoost,
    write: (settings: SidequestSettings, value: number) => ({ ...settings, weightNewBoost: value }),
  },
  weight_maturity_days: {
    schema: positive,
    read: (settings: SidequestSettings) => settings.weightMaturityDays,
    write: (settings: SidequestSettings, value: number) => ({
      ...settings,
      weightMaturityDays: value,
    }),
  },
  weight_failure: {
    schema: nonNegative,
    read: (settings: SidequestSettings) => settings.weightFailure,
    write: (settings: SidequestSettings, value: number) => ({ ...settings, weightFailure: value }),
  },
  weight_difficulty_easy: {
    schema: positive,
    read: (settings: SidequestSettings) => settings.weightDifficulty.easy,
    write: (settings: SidequestSettings, value: number) =>
      withDifficultyWeight(settings, 'easy', value),
  },
  weight_difficulty_medium: {
    schema: positive,
    read: (settings: SidequestSettings) => settings.weightDifficulty.medium,
    write: (settings: SidequestSettings, value: number) =>
      withDifficultyWeight(settings, 'medium', value),
  },
  weight_difficulty_hard: {
    schema: positive,
    read: (settings: SidequestSettings) => settings.weightDifficulty.hard,
    write: (settings: SidequestSettings, value: number) =>
      withDifficultyWeight(settings, 'hard', value),
  },
  cooldown_hours: {
    schema: nonNegative,
    read: (settings: SidequestSettings) => settings.cooldownHours,
    write: (settings: SidequestSettings, value: number) => ({ ...settings, cooldownHours: value }),
  },
  attempt_token_ttl_seconds: {
    schema: positiveInt,
    read: (settings: SidequestSettings) => settings.attemptTokenTtlSeconds,
    write: (settings: SidequestSettings, value: number) => ({
      ...settings,
      attemptTokenTtlSeconds: value,
    }),
  },
  session_max_questions: {
    schema: positiveInt,
    read: (settings: SidequestSettings) => settings.sessionMaxQuestions,
    write: (settings: SidequestSettings, value: number) => ({
      ...settings,
      sessionMaxQuestions: value,
    }),
  },
} as const;

export type SettingKey = keyof typeof SETTING_SPECS;

export const SETTING_KEYS = Object.keys(SETTING_SPECS) as readonly SettingKey[];

/**
 * Lectura tolerante: una fila que falta o que no se puede leer deja el valor por
 * defecto en su sitio. La configuración se valida al escribirla; que el panel
 * guardara una vez un número imposible no puede dejar la aplicación sin arrancar.
 */
export function settingsFromRows(rows: readonly SettingRow[]): SidequestSettings {
  let settings = DEFAULT_SETTINGS;

  for (const row of rows) {
    if (!isSettingKey(row.key)) continue;

    const spec = SETTING_SPECS[row.key];
    const parsed = spec.schema.safeParse(Number(row.value));

    if (parsed.success) {
      settings = spec.write(settings, parsed.data);
    }
  }

  return settings;
}

/** Las diez filas que representan una configuración completa. */
export function settingsToRows(settings: SidequestSettings): SettingRow[] {
  return SETTING_KEYS.map((key) => ({
    key,
    value: String(SETTING_SPECS[key].read(settings)),
    type: 'number',
  }));
}

/**
 * Escritura estricta: `PATCH /settings` manda un subconjunto de claves y aquí se
 * rechaza lo que no encaje, con la clave que falla en `details`.
 */
export function settingRowsFrom(input: Readonly<Record<string, unknown>>): SettingRow[] {
  const rows: SettingRow[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (!isSettingKey(key)) {
      throw new InvariantError(`El parámetro «${key}» no existe`, [
        { field: key, message: 'parámetro desconocido' },
      ]);
    }

    const parsed = SETTING_SPECS[key].schema.safeParse(value);

    if (!parsed.success) {
      throw new InvariantError(`El valor de «${key}» no es válido`, [
        { field: key, message: parsed.error.issues[0]?.message ?? 'valor no válido' },
      ]);
    }

    rows.push({ key, value: String(parsed.data), type: 'number' });
  }

  return rows;
}

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTING_SPECS, key);
}

function withDifficultyWeight(
  settings: SidequestSettings,
  difficulty: Difficulty,
  value: number,
): SidequestSettings {
  return { ...settings, weightDifficulty: { ...settings.weightDifficulty, [difficulty]: value } };
}
