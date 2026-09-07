import type { Random } from '@app/domain/random.js';

/**
 * mulberry32: un generador de 32 bits, corto y de buena distribución, para que
 * una prueba con semilla fija describa siempre el mismo sorteo.
 *
 * Vive aquí, y no junto a `random.ts`, porque la aplicación no siembra nunca: el
 * azar reproducible es una herramienta de prueba. `tsconfig.build.json` excluye
 * esta carpeta de `dist`.
 */
export function createSeededRandom(seed: number): Random {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);

    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}
