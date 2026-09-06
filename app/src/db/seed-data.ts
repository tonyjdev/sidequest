import type { Difficulty, QuestionType, ResourceKind } from '@app/db/schema.js';

/**
 * Contenido del sembrado de desarrollo (`pnpm db:seed`).
 *
 * Datos, no ejecución: así las invariantes del lote se pueden comprobar sin
 * MySQL delante. Una materia, un tema, dos subtemas y varias preguntas de cada
 * tipo, con distintas dificultades, para que las tareas siguientes —selección,
 * composición, estadísticas— tengan con qué trabajar desde el primer día.
 */

export interface SeedOption {
  readonly text: string;
  readonly isCorrect: boolean;
}

export interface SeedResource {
  readonly kind: ResourceKind;
  readonly url: string;
  readonly label: string;
}

export interface SeedQuestion {
  readonly subtopicSlug: string;
  readonly type: QuestionType;
  readonly statement: string;
  readonly explanation: string;
  readonly difficulty: Difficulty;
  /** Sin valor, la pregunta usa `settings.visible_options_default`. */
  readonly visibleOptions?: number;
  readonly options: readonly SeedOption[];
  readonly resources?: readonly SeedResource[];
  readonly tagSlugs?: readonly string[];
}

export const seedSubject = {
  slug: 'matematicas',
  name: 'Matemáticas',
  description: 'Materia de ejemplo del sembrado de desarrollo.',
} as const;

export const seedTopic = {
  slug: 'algebra',
  name: 'Álgebra',
  description: 'Operaciones con expresiones simbólicas.',
} as const;

export const seedSubtopics = [
  {
    slug: 'ecuaciones',
    name: 'Ecuaciones',
    description: 'Igualdades con incógnitas y sus soluciones.',
    position: 1,
  },
  {
    slug: 'polinomios',
    name: 'Polinomios',
    description: 'Expresiones formadas por sumas de monomios.',
    position: 2,
  },
] as const;

export const seedTags = [
  { slug: 'algebra', name: 'Álgebra' },
  { slug: 'grado-1', name: 'Primer grado' },
  { slug: 'definiciones', name: 'Definiciones' },
] as const;

export const seedQuestions: readonly SeedQuestion[] = [
  {
    subtopicSlug: 'ecuaciones',
    type: 'single',
    statement: '¿Cuál es la solución de la ecuación 2x + 6 = 0?',
    explanation: 'Se despeja la incógnita: 2x = −6, luego x = −3.',
    difficulty: 'easy',
    // Cinco opciones configuradas y cuatro visibles: el sorteo de distractores
    // de SQST-0013 tiene así algo que recortar de verdad.
    options: [
      { text: 'x = −3', isCorrect: true },
      { text: 'x = 3', isCorrect: false },
      { text: 'x = −6', isCorrect: false },
      { text: 'x = 6', isCorrect: false },
      { text: 'x = 0', isCorrect: false },
    ],
    tagSlugs: ['algebra', 'grado-1'],
  },
  {
    subtopicSlug: 'ecuaciones',
    type: 'single',
    statement: '¿Cuántas soluciones reales tiene la ecuación x² + 1 = 0?',
    explanation: 'Ningún número real elevado al cuadrado da −1; las dos soluciones son complejas.',
    difficulty: 'medium',
    options: [
      { text: 'Ninguna', isCorrect: true },
      { text: 'Una', isCorrect: false },
      { text: 'Dos', isCorrect: false },
      { text: 'Infinitas', isCorrect: false },
    ],
    resources: [
      {
        kind: 'page',
        url: 'https://es.wikipedia.org/wiki/Ecuaci%C3%B3n_de_segundo_grado',
        label: 'Ecuación de segundo grado',
      },
    ],
    tagSlugs: ['algebra'],
  },
  {
    subtopicSlug: 'ecuaciones',
    type: 'multiple',
    statement: '¿Cuáles de estas ecuaciones son de primer grado?',
    explanation:
      'Son de primer grado las que, una vez simplificadas, tienen la incógnita elevada a 1.',
    difficulty: 'medium',
    options: [
      { text: '3x − 5 = 0', isCorrect: true },
      { text: '7 − x = 2', isCorrect: true },
      { text: '2(x + 1) = 5', isCorrect: true },
      { text: 'x² − 4 = 0', isCorrect: false },
      { text: 'x³ = 8', isCorrect: false },
    ],
    tagSlugs: ['algebra', 'grado-1'],
  },
  {
    subtopicSlug: 'polinomios',
    type: 'single',
    statement: '¿Cuál es el grado del polinomio 4x³ − 2x⁵ + 7?',
    explanation: 'El grado es el mayor exponente de la variable, aquí el del término −2x⁵.',
    difficulty: 'hard',
    options: [
      { text: '5', isCorrect: true },
      { text: '3', isCorrect: false },
      { text: '7', isCorrect: false },
      { text: '2', isCorrect: false },
    ],
    tagSlugs: ['definiciones'],
  },
  {
    subtopicSlug: 'polinomios',
    type: 'multiple',
    statement: '¿Cuáles de las siguientes expresiones son polinomios?',
    explanation:
      'Un polinomio solo admite exponentes enteros no negativos: ni divisiones por la variable ni raíces.',
    difficulty: 'easy',
    options: [
      { text: 'x² + 1', isCorrect: true },
      { text: '3', isCorrect: true },
      { text: '2x − 7', isCorrect: true },
      { text: '1/x', isCorrect: false },
      { text: '√x', isCorrect: false },
    ],
    resources: [
      {
        kind: 'page',
        url: 'https://es.wikipedia.org/wiki/Polinomio',
        label: 'Polinomio',
      },
    ],
    tagSlugs: ['definiciones'],
  },
  {
    subtopicSlug: 'polinomios',
    type: 'multiple',
    statement:
      '¿Qué afirmaciones sobre un polinomio de grado n con coeficientes reales son ciertas?',
    explanation:
      'El teorema fundamental del álgebra garantiza n raíces contando multiplicidades, pero en los complejos: en los reales puede no haber ninguna.',
    difficulty: 'hard',
    // Seis opciones y solo tres visibles por defecto: al ser múltiple, las tres
    // correctas se muestran siempre y el recorte cae sobre los distractores.
    visibleOptions: 3,
    options: [
      { text: 'Tiene exactamente n raíces complejas contando multiplicidades', isCorrect: true },
      { text: 'Puede no tener ninguna raíz real', isCorrect: true },
      { text: 'Su derivada tiene grado n − 1 si n ≥ 1', isCorrect: true },
      { text: 'Tiene siempre n raíces reales distintas', isCorrect: false },
      { text: 'Su grado cambia al sumarle una constante', isCorrect: false },
      { text: 'Solo puede factorizarse si n es par', isCorrect: false },
    ],
    tagSlugs: ['definiciones'],
  },
];
