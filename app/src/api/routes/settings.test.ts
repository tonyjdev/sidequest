import { describe, expect, it } from 'vitest';

import { settingsSchema } from '@app/api/schemas/settings.js';
import { buildServer } from '@app/api/server.js';
import { loadConfig } from '@app/config/env.js';
import { DEFAULT_SETTINGS, SETTING_KEYS } from '@app/domain/settings.js';
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';

/**
 * `GET /settings` con los repositorios en memoria detrás: se ejerce la ruta real
 * y su esquema, que es lo que el panel lee para saber cuántas opciones se
 * mostrarán cuando la pregunta no lo dice.
 */

const config = loadConfig({
  DATABASE_URL: 'mysql://sidequest:secreta@mysql:3306/sidequest',
  SIDEQUEST_ATTEMPT_SECRET: 'a'.repeat(64),
  LOG_LEVEL: 'silent',
});

const app = await buildServer({
  config,
  repositories: createInMemoryRepositories(),
  checkDatabase: () => Promise.resolve({ status: 'ok' as const, latency_ms: 1 }),
});

describe('GET /settings', () => {
  it('devuelve los diez parámetros con sus valores vigentes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/settings' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      visible_options_default: DEFAULT_SETTINGS.visibleOptionsDefault,
      weight_new_boost: DEFAULT_SETTINGS.weightNewBoost,
      weight_maturity_days: DEFAULT_SETTINGS.weightMaturityDays,
      weight_failure: DEFAULT_SETTINGS.weightFailure,
      weight_difficulty_easy: DEFAULT_SETTINGS.weightDifficulty.easy,
      weight_difficulty_medium: DEFAULT_SETTINGS.weightDifficulty.medium,
      weight_difficulty_hard: DEFAULT_SETTINGS.weightDifficulty.hard,
      cooldown_hours: DEFAULT_SETTINGS.cooldownHours,
      attempt_token_ttl_seconds: DEFAULT_SETTINGS.attemptTokenTtlSeconds,
      session_max_questions: DEFAULT_SETTINGS.sessionMaxQuestions,
    });
  });

  // El esquema repite las claves del dominio porque el serializador las necesita
  // sueltas; esto es lo que impide que las dos listas se separen.
  it('expone exactamente las claves que declara el dominio', () => {
    expect(Object.keys(settingsSchema.shape).sort()).toEqual([...SETTING_KEYS].sort());
  });
});
