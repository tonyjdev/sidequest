import { beforeEach, describe, expect, it } from 'vitest';

import { InvariantError } from '@app/domain/errors.js';
import { DEFAULT_SETTINGS } from '@app/domain/settings.js';
import { readSettings, updateSettings } from '@app/domain/settings-service.js';
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';

const repos = createInMemoryRepositories();

beforeEach(() => {
  repos.reset();
});

describe('configuración', () => {
  it('parte de los valores por defecto', async () => {
    expect(await readSettings(repos)).toEqual(DEFAULT_SETTINGS);
  });

  it('escribe solo lo que cambia', async () => {
    const settings = await updateSettings(repos, { cooldown_hours: 6 });

    expect(settings.cooldownHours).toBe(6);
    expect(settings.weightNewBoost).toBe(DEFAULT_SETTINGS.weightNewBoost);
  });

  it('no escribe nada si una clave del lote es inválida', async () => {
    await expect(
      updateSettings(repos, { cooldown_hours: 6, session_max_questions: 0 }),
    ).rejects.toThrow(InvariantError);

    expect((await readSettings(repos)).cooldownHours).toBe(DEFAULT_SETTINGS.cooldownHours);
  });
});
