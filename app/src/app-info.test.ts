import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { APP_NAME, APP_VERSION } from '@app/app-info.js';

describe('identidad de la aplicación', () => {
  it('expone el nombre corto que devuelve la sonda de salud', () => {
    expect(APP_NAME).toBe('sidequest');
  });

  it('expone la versión del manifiesto del paquete, no una constante duplicada', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    expect(APP_VERSION).toBe(manifest.version);
  });
});
