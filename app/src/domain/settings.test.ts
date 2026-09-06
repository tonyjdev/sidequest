import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { InvariantError } from '@app/domain/errors.js';
import {
  DEFAULT_SETTINGS,
  settingRowsFrom,
  settingsFromRows,
  settingsToRows,
  SETTING_KEYS,
  type SettingRow,
} from '@app/domain/settings.js';

const MIGRATION = new URL('../../drizzle/0002_parametros_por_defecto.sql', import.meta.url);
const VALUES_ROW = /\('([a-z_]+)',\s*'([^']+)',\s*'([a-z]+)'\)/gu;

describe('valores por defecto', () => {
  /**
   * La migración es la fuente real: la aplicación arranca con lo que hay en la
   * base. Los valores de aquí solo cubren la fila que falte, así que separarse
   * de la migración los volvería una mentira silenciosa.
   */
  it('coinciden con los que siembra la migración', () => {
    const inMigration = [...readFileSync(MIGRATION, 'utf8').matchAll(VALUES_ROW)]
      .map(([, key, value, type]) => ({ key, value, type }))
      .sort((a, b) => (a.key ?? '').localeCompare(b.key ?? ''));

    const inDomain = settingsToRows(DEFAULT_SETTINGS).sort((a, b) => a.key.localeCompare(b.key));

    expect(inMigration).toEqual(inDomain);
  });

  it('cubre los diez parámetros de la especificación', () => {
    expect(SETTING_KEYS).toHaveLength(10);
  });
});

describe('lectura', () => {
  it('devuelve los valores por defecto sin ninguna fila', () => {
    expect(settingsFromRows([])).toEqual(DEFAULT_SETTINGS);
  });

  it('aplica lo que sí está', () => {
    const rows: SettingRow[] = [
      { key: 'cooldown_hours', value: '6', type: 'number' },
      { key: 'weight_difficulty_hard', value: '2.5', type: 'number' },
    ];

    const settings = settingsFromRows(rows);

    expect(settings.cooldownHours).toBe(6);
    expect(settings.weightDifficulty).toEqual({ easy: 1, medium: 1, hard: 2.5 });
  });

  it('deja el valor por defecto cuando la fila es ilegible, en vez de romper el arranque', () => {
    const rows: SettingRow[] = [{ key: 'weight_new_boost', value: 'muchísimo', type: 'number' }];

    expect(settingsFromRows(rows).weightNewBoost).toBe(DEFAULT_SETTINGS.weightNewBoost);
  });

  it('ignora una clave que ya no existe', () => {
    const rows: SettingRow[] = [{ key: 'weight_semivida', value: '3', type: 'number' }];

    expect(settingsFromRows(rows)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('escritura', () => {
  it('convierte lo recibido en filas', () => {
    expect(settingRowsFrom({ cooldown_hours: 12, session_max_questions: 5 })).toEqual([
      { key: 'cooldown_hours', value: '12', type: 'number' },
      { key: 'session_max_questions', value: '5', type: 'number' },
    ]);
  });

  it('rechaza una clave desconocida', () => {
    expect(() => settingRowsFrom({ cooldown_minutes: 30 })).toThrow(InvariantError);
  });

  it.each([
    ['visible_options_default', 1],
    ['attempt_token_ttl_seconds', 0],
    ['weight_maturity_days', -3],
    ['session_max_questions', 2.5],
    ['cooldown_hours', 'muchas'],
  ])('rechaza %s = %s', (key, value) => {
    expect(() => settingRowsFrom({ [key]: value })).toThrow(/no es válido/);
  });

  it('admite un enfriamiento de cero horas, que es desactivarlo', () => {
    expect(settingRowsFrom({ cooldown_hours: 0 })).toEqual([
      { key: 'cooldown_hours', value: '0', type: 'number' },
    ]);
  });
});
