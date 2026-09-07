import { defaultRandom, type Random } from '@app/domain/random.js';
import type { Repositories } from '@app/domain/repositories.js';
import {
  CANDIDATE_PAGE_SIZE,
  cooldownCutoff,
  raceKey,
  weightOf,
  type QuestionCandidate,
  type SelectionFilter,
} from '@app/domain/selection.js';
import type { SidequestSettings } from '@app/domain/settings.js';

/**
 * El caso de uso del sorteo: qué pregunta se muestra a continuación
 * (docs/especificacion.md §4.1 y §4.2).
 *
 * No escribe nada. `/quiz/next` no consume: una pregunta servida y abandonada no
 * deja rastro y puede volver a salir, porque el enfriamiento se mide sobre lo
 * respondido.
 *
 * Devuelve la candidata, no la pregunta entera. Componer las opciones que se
 * mostrarán es otra regla y va en SQST-0013.
 */

export interface SelectionCriteria {
  readonly filter?: SelectionFilter | undefined;
  /** El reloj y el azar se inyectan para que una prueba pueda fijar los dos. */
  readonly now?: Date | undefined;
  readonly random?: Random | undefined;
}

export interface SelectedQuestion {
  readonly kind: 'selected';
  readonly candidate: QuestionCandidate;
  readonly weight: number;
  /** `true` cuando la pregunta salió solo porque se levantó el enfriamiento. */
  readonly cooldownRelaxed: boolean;
}

/** No hay error que dar: que el filtro no encuentre nada es una respuesta. */
export interface NoQuestionAvailable {
  readonly kind: 'empty';
}

export type SelectionResult = SelectedQuestion | NoQuestionAvailable;

export async function selectNextQuestion(
  repos: Repositories,
  criteria: SelectionCriteria = {},
): Promise<SelectionResult> {
  const settings = await repos.settings.read();
  const filter = criteria.filter ?? {};
  const now = criteria.now ?? new Date();
  const random = criteria.random ?? defaultRandom;

  const cutoff = cooldownCutoff(settings, now);
  const picked = await draw(repos, filter, cutoff, settings, now, random);

  if (picked !== null) return { kind: 'selected', ...picked, cooldownRelaxed: false };
  if (cutoff === null) return { kind: 'empty' };

  // Relajación controlada: se levanta el enfriamiento, y solo el enfriamiento.
  // El filtro es lo que pidió quien llama; devolver algo de fuera sería
  // responder a otra pregunta.
  const relaxed = await draw(repos, filter, null, settings, now, random);

  if (relaxed === null) return { kind: 'empty' };

  return { kind: 'selected', ...relaxed, cooldownRelaxed: true };
}

interface Contender {
  readonly candidate: QuestionCandidate;
  readonly weight: number;
}

/**
 * Una vuelta al conjunto de candidatas, página a página, quedándose con la mejor
 * clave de la carrera. El catálogo nunca está entero en memoria: de cada página
 * solo sobrevive la ganadora provisional.
 */
async function draw(
  repos: Repositories,
  filter: SelectionFilter,
  cooldownSince: Date | null,
  settings: SidequestSettings,
  now: Date,
  random: Random,
): Promise<Contender | null> {
  let best: (Contender & { key: number }) | null = null;
  let afterId: number | undefined;

  for (;;) {
    const page = await repos.questions.listSelectionCandidates({
      filter,
      cooldownSince,
      afterId,
      limit: CANDIDATE_PAGE_SIZE,
    });

    for (const candidate of page.candidates) {
      const weight = weightOf(candidate, settings, now);

      // Un peso nulo o sin sentido deja a la candidata fuera en vez de colarla
      // con clave infinita: al sorteo solo entra lo que puede salir.
      if (!(weight > 0)) continue;

      const key = raceKey(weight, random);

      if (best === null || key < best.key) best = { candidate, weight, key };
    }

    // El cursor tiene que avanzar. Si no lo hace, la página era la última pase
    // lo que pase: nada justifica volver a pedir la misma.
    if (page.nextCursor === null || (afterId !== undefined && page.nextCursor <= afterId)) {
      return best === null ? null : { candidate: best.candidate, weight: best.weight };
    }

    afterId = page.nextCursor;
  }
}
