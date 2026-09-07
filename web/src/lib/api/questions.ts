import { apiRequest, type QueryValue } from '@web/lib/api/client';
import type { ContentStatus } from '@web/lib/api/content';
import { contentStatuses } from '@web/lib/api/content';
import { ApiClientError, isRecord } from '@web/lib/api/errors';

/**
 * Preguntas y etiquetas en el panel (docs/development/api.md).
 *
 * **La pregunta es un agregado**: sus opciones, sus recursos y sus etiquetas
 * viajan con ella en la misma llamada. No hay `/questions/{id}/options`, así que
 * este módulo tampoco tiene por dónde escribir media pregunta.
 *
 * El listado devuelve la pregunta a secas —las opciones se piden abriendo la
 * ficha—, y el estado no se edita con `PATCH`: tiene sus tres rutas.
 */

export const questionTypes = ['single', 'multiple'] as const;
export const difficulties = ['easy', 'medium', 'hard'] as const;
export const resourceKinds = ['image', 'video', 'page', 'document'] as const;

export type QuestionType = (typeof questionTypes)[number];
export type Difficulty = (typeof difficulties)[number];
export type ResourceKind = (typeof resourceKinds)[number];

/** Las tres rutas de transición de la pregunta; la única que vuelve atrás es `unpublish`. */
export const questionTransitions = ['publish', 'unpublish', 'archive'] as const;

export type QuestionTransition = (typeof questionTransitions)[number];

export interface Question {
  readonly id: number;
  readonly subtopic_id: number;
  readonly type: QuestionType;
  readonly statement: string;
  readonly explanation: string | null;
  readonly difficulty: Difficulty;
  readonly status: ContentStatus;
  /** `null` usa `settings.visible_options_default`. */
  readonly visible_options: number | null;
  readonly version: number;
}

export interface QuestionOption {
  readonly id: number;
  readonly text: string;
  readonly is_correct: boolean;
  readonly position: number;
}

export interface QuestionResource {
  readonly id: number;
  readonly kind: ResourceKind;
  readonly url: string;
  readonly label: string | null;
  readonly position: number;
}

export interface Tag {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
}

/** La ficha: la pregunta con todo lo que cuelga de ella. */
export interface QuestionDetail extends Question {
  readonly options: readonly QuestionOption[];
  readonly resources: readonly QuestionResource[];
  readonly tags: readonly Tag[];
}

export interface NewOption {
  readonly text: string;
  readonly is_correct: boolean;
}

export interface NewResource {
  readonly kind: ResourceKind;
  readonly url: string;
  readonly label: string | null;
}

/** El agregado entero, tal como se escribe: una colección que llega sustituye a la anterior. */
export interface QuestionInput {
  readonly subtopic_id: number;
  readonly type: QuestionType;
  readonly statement: string;
  readonly explanation: string | null;
  readonly difficulty: Difficulty;
  readonly visible_options: number | null;
  readonly options: readonly NewOption[];
  readonly resources: readonly NewResource[];
  readonly tag_ids: readonly number[];
}

export interface QuestionFilters {
  readonly status?: readonly ContentStatus[] | undefined;
  readonly subtopic_id?: number | undefined;
  readonly difficulty?: Difficulty | undefined;
  readonly tag_id?: number | undefined;
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export function listQuestions(
  filters: QuestionFilters,
  signal?: AbortSignal,
): Promise<readonly Question[]> {
  return apiRequest('/questions', {
    query: queryFrom(filters),
    parse: (body) => parseItems(body, parseQuestion),
    ...(signal ? { signal } : {}),
  });
}

export function getQuestion(id: number, signal?: AbortSignal): Promise<QuestionDetail> {
  return apiRequest(`/questions/${String(id)}`, {
    parse: parseQuestionDetail,
    ...(signal ? { signal } : {}),
  });
}

/**
 * A diferencia del contenido, la pregunta **sí puede nacer publicada**: el alta
 * lleva sus opciones, así que las tres invariantes ya se pueden comprobar. Si no
 * las cumple, la API responde `422` y no se escribe nada.
 */
export function createQuestion(
  input: QuestionInput,
  status: 'draft' | 'published' = 'draft',
): Promise<QuestionDetail> {
  return apiRequest('/questions', {
    method: 'POST',
    body: { ...input, status },
    parse: parseQuestionDetail,
  });
}

export function updateQuestion(id: number, input: QuestionInput): Promise<QuestionDetail> {
  return apiRequest(`/questions/${String(id)}`, {
    method: 'PATCH',
    body: input,
    parse: parseQuestionDetail,
  });
}

export function changeQuestionStatus(
  id: number,
  transition: QuestionTransition,
): Promise<Question> {
  return apiRequest(`/questions/${String(id)}/${transition}`, {
    method: 'POST',
    parse: parseQuestion,
  });
}

export function listTags(signal?: AbortSignal): Promise<readonly Tag[]> {
  return apiRequest('/tags', {
    parse: (body) => parseItems(body, parseTag),
    ...(signal ? { signal } : {}),
  });
}

/** Las etiquetas no se archivan ni se borran: se desenganchan editando la pregunta. */
export function createTag(input: { readonly slug: string; readonly name: string }): Promise<Tag> {
  return apiRequest('/tags', { method: 'POST', body: input, parse: parseTag });
}

/** `status` admite varios valores; el resto del filtro es de uno en uno. */
function queryFrom(filters: QuestionFilters): Record<string, QueryValue> {
  const search = filters.search?.trim();

  return {
    status: filters.status && filters.status.length > 0 ? filters.status.join(',') : undefined,
    subtopic_id: filters.subtopic_id,
    difficulty: filters.difficulty,
    tag_id: filters.tag_id,
    search: search === '' ? undefined : search,
    limit: filters.limit,
    offset: filters.offset,
  };
}

function parseItems<T>(body: unknown, parse: (value: unknown) => T): readonly T[] {
  if (!isRecord(body) || !Array.isArray(body['items'])) throw invalidQuestion();

  return body['items'].map(parse);
}

function parseQuestion(value: unknown): Question {
  if (!isRecord(value)) throw invalidQuestion();

  const { id, subtopic_id, statement, explanation, visible_options, version } = value;

  if (
    typeof id !== 'number' ||
    typeof subtopic_id !== 'number' ||
    typeof statement !== 'string' ||
    !(explanation === null || typeof explanation === 'string') ||
    !(visible_options === null || typeof visible_options === 'number') ||
    typeof version !== 'number' ||
    !isMember(value['type'], questionTypes) ||
    !isMember(value['difficulty'], difficulties) ||
    !isMember(value['status'], contentStatuses)
  ) {
    throw invalidQuestion();
  }

  return {
    id,
    subtopic_id,
    type: value['type'],
    statement,
    explanation,
    difficulty: value['difficulty'],
    status: value['status'],
    visible_options,
    version,
  };
}

function parseQuestionDetail(value: unknown): QuestionDetail {
  const question = parseQuestion(value);

  if (!isRecord(value)) throw invalidQuestion();

  return {
    ...question,
    options: parseList(value['options'], parseOption),
    resources: parseList(value['resources'], parseResource),
    tags: parseList(value['tags'], parseTag),
  };
}

function parseList<T>(value: unknown, parse: (entry: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw invalidQuestion();

  return value.map(parse);
}

function parseOption(value: unknown): QuestionOption {
  if (!isRecord(value)) throw invalidQuestion();

  const { id, text, is_correct, position } = value;

  if (
    typeof id !== 'number' ||
    typeof text !== 'string' ||
    typeof is_correct !== 'boolean' ||
    typeof position !== 'number'
  ) {
    throw invalidQuestion();
  }

  return { id, text, is_correct, position };
}

function parseResource(value: unknown): QuestionResource {
  if (!isRecord(value)) throw invalidQuestion();

  const { id, url, label, position } = value;

  if (
    typeof id !== 'number' ||
    typeof url !== 'string' ||
    !(label === null || typeof label === 'string') ||
    typeof position !== 'number' ||
    !isMember(value['kind'], resourceKinds)
  ) {
    throw invalidQuestion();
  }

  return { id, kind: value['kind'], url, label, position };
}

function parseTag(value: unknown): Tag {
  if (!isRecord(value)) throw invalidQuestion();

  const { id, slug, name } = value;

  if (typeof id !== 'number' || typeof slug !== 'string' || typeof name !== 'string') {
    throw invalidQuestion();
  }

  return { id, slug, name };
}

function isMember<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function invalidQuestion(): ApiClientError {
  return new ApiClientError('invalid_response', 'Las preguntas no llegaron con la forma esperada');
}
