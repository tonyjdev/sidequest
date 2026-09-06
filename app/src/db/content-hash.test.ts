import { describe, expect, it } from 'vitest';

import { contentHashOf } from '@app/db/content-hash.js';

describe('contentHashOf', () => {
  it('devuelve un sha256 en hexadecimal', () => {
    expect(contentHashOf('¿Cuánto es 2 + 2?')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignora los espacios de más, los saltos de línea y las mayúsculas', () => {
    const hash = contentHashOf('¿Cuánto es 2 + 2?');

    expect(contentHashOf('  ¿Cuánto es 2 + 2?  ')).toBe(hash);
    expect(contentHashOf('¿Cuánto\n  es 2 + 2?')).toBe(hash);
    expect(contentHashOf('¿CUÁNTO ES 2 + 2?')).toBe(hash);
  });

  it('distingue enunciados que no dicen lo mismo', () => {
    expect(contentHashOf('¿Cuánto es 2 + 2?')).not.toBe(contentHashOf('¿Cuánto es 2 + 3?'));
  });
});
