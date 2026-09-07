import { describe, expect, it } from 'vitest';

import {
  cooldownCutoff,
  raceKey,
  weightOf,
  MATURITY_FLOOR,
  type QuestionCandidate,
} from '@app/domain/selection.js';
import { DEFAULT_SETTINGS, type SidequestSettings } from '@app/domain/settings.js';
import { createSeededRandom } from '@app/domain/testing/random.js';

/**
 * La fórmula de §4.2, factor a factor. Aquí no hay repositorios ni sorteo: solo
 * se comprueba que el peso es el que dice la especificación y que la carrera
 * reparte en proporción a él.
 */

const NOW = new Date('2026-09-07T12:00:00.000Z');
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function candidate(overrides: Partial<QuestionCandidate> = {}): QuestionCandidate {
  return {
    questionId: 1,
    subtopicId: 1,
    difficulty: 'medium',
    attemptCount: 0,
    correctCount: 0,
    lastAnsweredAt: null,
    ...overrides,
  };
}

function answered(days: number, attemptCount: number, correctCount: number): QuestionCandidate {
  return candidate({
    attemptCount,
    correctCount,
    lastAnsweredAt: new Date(NOW.getTime() - days * MILLISECONDS_PER_DAY),
  });
}

function withSettings(overrides: Partial<SidequestSettings>): SidequestSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('peso de una candidata', () => {
  it('la nunca respondida solo lleva el impulso de novedad', () => {
    expect(weightOf(candidate(), DEFAULT_SETTINGS, NOW)).toBe(DEFAULT_SETTINGS.weightNewBoost);
  });

  it('sale claramente más que una madura acertada siempre', () => {
    const nueva = weightOf(candidate(), DEFAULT_SETTINGS, NOW);
    const vista = weightOf(answered(60, 4, 4), DEFAULT_SETTINGS, NOW);

    expect(nueva).toBe(10 * vista);
  });

  it('la antigüedad es una rampa lineal entre el suelo y uno', () => {
    // 30 días de maduración: recién respondida toca el suelo, a mitad va por la
    // mitad y pasado el periodo no sigue creciendo.
    expect(weightOf(answered(0, 1, 1), DEFAULT_SETTINGS, NOW)).toBeCloseTo(MATURITY_FLOOR);
    expect(weightOf(answered(15, 1, 1), DEFAULT_SETTINGS, NOW)).toBeCloseTo(0.5);
    expect(weightOf(answered(30, 1, 1), DEFAULT_SETTINGS, NOW)).toBeCloseTo(1);
    expect(weightOf(answered(300, 1, 1), DEFAULT_SETTINGS, NOW)).toBeCloseTo(1);
  });

  it('la tasa de fallo sube el peso y la de acierto lo deja quieto', () => {
    expect(weightOf(answered(60, 4, 0), DEFAULT_SETTINGS, NOW)).toBeCloseTo(2.5);
    expect(weightOf(answered(60, 4, 2), DEFAULT_SETTINGS, NOW)).toBeCloseTo(1.75);
    expect(weightOf(answered(60, 4, 4), DEFAULT_SETTINGS, NOW)).toBeCloseTo(1);
  });

  it('la dificultad multiplica, también la de la pregunta nueva', () => {
    const settings = withSettings({ weightDifficulty: { easy: 0.5, medium: 1, hard: 2 } });

    expect(weightOf(candidate({ difficulty: 'hard' }), settings, NOW)).toBeCloseTo(20);
    expect(weightOf(answered(60, 4, 0), settings, NOW)).toBeCloseTo(2.5);
    expect(weightOf({ ...answered(60, 4, 0), difficulty: 'easy' }, settings, NOW)).toBeCloseTo(
      1.25,
    );
  });
});

describe('ventana de enfriamiento', () => {
  it('se mide hacia atrás desde el instante recibido', () => {
    expect(cooldownCutoff(DEFAULT_SETTINGS, NOW)).toEqual(new Date('2026-09-06T12:00:00.000Z'));
  });

  it('apagada no excluye nada', () => {
    expect(cooldownCutoff(withSettings({ cooldownHours: 0 }), NOW)).toBeNull();
  });
});

describe('carrera exponencial', () => {
  it('cuanto más pesa una candidata, menor es su clave', () => {
    const draw = 0.5;

    expect(raceKey(3, () => draw)).toBeLessThan(raceKey(1, () => draw));
  });

  it('reparte en proporción al peso', () => {
    const random = createSeededRandom(20_120);
    let heavier = 0;

    for (let round = 0; round < 20_000; round += 1) {
      if (raceKey(3, random) < raceKey(1, random)) heavier += 1;
    }

    // 3 contra 1: la pesada gana tres de cada cuatro carreras.
    expect(heavier / 20_000).toBeCloseTo(0.75, 2);
  });
});
