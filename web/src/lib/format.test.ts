import { describe, expect, it } from 'vitest';

import { formatDuration } from '@web/lib/format';

describe('formatDuration', () => {
  it('usa segundos por debajo del minuto', () => {
    expect(formatDuration(45)).toBe('45 s');
  });

  it('usa minutos por debajo de la hora', () => {
    expect(formatDuration(12 * 60 + 30)).toBe('12 min');
  });

  it('usa horas y minutos por encima', () => {
    expect(formatDuration(3 * 3600 + 7 * 60)).toBe('3 h 07 min');
  });

  it('no baja de cero', () => {
    expect(formatDuration(-10)).toBe('0 s');
  });
});
