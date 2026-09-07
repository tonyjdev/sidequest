/**
 * El azar del dominio, detrás de una función.
 *
 * La selección ponderada sortea, y una prueba no puede afirmar nada sobre un
 * sorteo que no controla: quien llama puede pasar su propio generador y fijar la
 * secuencia. `domain/testing/random.ts` trae el de semilla.
 */

/** Uniforme en [0, 1), como `Math.random`. */
export type Random = () => number;

export const defaultRandom: Random = () => Math.random();
