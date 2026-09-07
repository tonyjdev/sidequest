import type { Random } from '@app/domain/random.js';
import type { SidequestSettings } from '@app/domain/settings.js';
import type { Difficulty } from '@app/domain/types.js';

/**
 * Selección ponderada (docs/especificacion.md §4.1 y §4.2): qué entra en el
 * sorteo, cuánto pesa cada candidata y cómo se decide la ganadora.
 *
 * Aquí solo hay aritmética. Quién recorre el catálogo y en qué orden es asunto
 * de `selection-service.ts`; de dónde salen las candidatas, del puerto
 * `questions.listSelectionCandidates`.
 */

/** Lo que la skill pide acotar. Una lista ausente no acota ese eje. */
export interface SelectionFilter {
  readonly subjectIds?: readonly number[] | undefined;
  readonly topicIds?: readonly number[] | undefined;
  readonly subtopicIds?: readonly number[] | undefined;
  readonly difficulties?: readonly Difficulty[] | undefined;
  readonly tagIds?: readonly number[] | undefined;
}

/**
 * Una candidata reducida a lo que la ponderación necesita: ni enunciado, ni
 * opciones, ni etiquetas. Es lo que permite recorrer un catálogo grande sin
 * traerlo entero a memoria; la pregunta elegida se lee después, y solo esa.
 */
export interface QuestionCandidate {
  readonly questionId: number;
  readonly subtopicId: number;
  readonly difficulty: Difficulty;
  readonly attemptCount: number;
  readonly correctCount: number;
  /** `null` cuando nunca se respondió. */
  readonly lastAnsweredAt: Date | null;
}

/**
 * El suelo de `factor_antiguedad`: una pregunta recién respondida pesa un quinto
 * de lo que pesará madura, pero nunca cero. Es una constante de la fórmula, no
 * un parámetro ajustable (docs/decisiones.md §3).
 */
export const MATURITY_FLOOR = 0.2;

/** Cuántas candidatas pide el motor por vuelta. */
export const CANDIDATE_PAGE_SIZE = 500;

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

/**
 * `peso = base × novedad × antigüedad × fallo × dificultad`. La base es 1, así
 * que la fórmula es el producto de los cuatro factores.
 *
 * Una pregunta sin intentos no tiene antigüedad ni ratio de acierto que medir:
 * sus dos factores valen 1 y toda su ventaja viene de `boost_nueva`. Esa es la
 * regla que no se negocia —lo nunca visto sale claramente más—, y por eso está
 * escrita como un camino aparte y no como un caso límite de la división.
 */
export function weightOf(
  candidate: QuestionCandidate,
  settings: SidequestSettings,
  now: Date,
): number {
  const difficulty = settings.weightDifficulty[candidate.difficulty];

  if (candidate.attemptCount === 0) return settings.weightNewBoost * difficulty;

  return maturityFactor(candidate, settings, now) * failureFactor(candidate, settings) * difficulty;
}

/**
 * El instante a partir del cual una respuesta todavía enfría: lo respondido
 * después queda fuera del sorteo. `null` cuando el enfriamiento está apagado,
 * porque entonces no hay nada que excluir ni nada que relajar.
 */
export function cooldownCutoff(settings: SidequestSettings, now: Date): Date | null {
  if (settings.cooldownHours <= 0) return null;

  return new Date(now.getTime() - settings.cooldownHours * MILLISECONDS_PER_HOUR);
}

/**
 * Carrera exponencial. Con `u` uniforme en (0, 1], la clave `−ln(u) / peso` es
 * la menor de todas con probabilidad `peso / Σpesos`: exactamente el muestreo
 * ponderado de §4.2, pero resuelto en una sola pasada y sin conocer la suma.
 *
 * Es lo que hace posible recorrer el catálogo por páginas: basta recordar la
 * mejor clave vista, no la lista de pesos.
 */
export function raceKey(weight: number, random: Random): number {
  return -Math.log(1 - random()) / weight;
}

/** Rampa lineal acotada, no un decaimiento exponencial (docs/decisiones.md §3). */
function maturityFactor(
  candidate: QuestionCandidate,
  settings: SidequestSettings,
  now: Date,
): number {
  if (candidate.lastAnsweredAt === null) return 1;

  const days = (now.getTime() - candidate.lastAnsweredAt.getTime()) / MILLISECONDS_PER_DAY;

  return clamp(days / settings.weightMaturityDays, MATURITY_FLOOR, 1);
}

function failureFactor(candidate: QuestionCandidate, settings: SidequestSettings): number {
  const accuracy = clamp(candidate.correctCount / candidate.attemptCount, 0, 1);

  return 1 + settings.weightFailure * (1 - accuracy);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
