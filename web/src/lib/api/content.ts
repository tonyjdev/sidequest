import { apiRequest } from '@web/lib/api/client';
import { ApiClientError, isRecord } from '@web/lib/api/errors';

/**
 * La jerarquía de contenido en el panel: materias, temas y subtemas
 * (docs/development/api.md). Los tres niveles comparten superficie —listar,
 * crear, editar, publicar, archivar y reordenar—, así que comparten módulo: lo
 * único que los distingue es de quién cuelgan.
 *
 * Las claves son las de la API, en inglés y `snake_case`, y no se traducen aquí:
 * el panel enseña etiquetas en español, pero lo que viaja es el contrato.
 */

export const contentStatuses = ['draft', 'published', 'archived'] as const;

export type ContentStatus = (typeof contentStatuses)[number];

/** El nivel es el segmento de la ruta, tal cual: `/subjects`, `/topics`, `/subtopics`. */
export const contentLevels = ['subjects', 'topics', 'subtopics'] as const;

export type ContentLevel = (typeof contentLevels)[number];

export interface ContentNode {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ContentStatus;
  readonly position: number;
}

export interface TopicNode extends ContentNode {
  readonly subject_id: number;
}

/**
 * El recuento solo llega en el listado de subtemas: es lo que distingue en el
 * panel un subtema vacío de uno con contenido, y la API no lo devuelve en las
 * respuestas de escritura.
 */
export interface SubtopicNode extends ContentNode {
  readonly topic_id: number;
  readonly question_count: number;
}

/** Los tres listados completos, que es de lo que se arma el árbol. */
export interface ContentCatalog {
  readonly subjects: readonly ContentNode[];
  readonly topics: readonly TopicNode[];
  readonly subtopics: readonly SubtopicNode[];
}

export interface ContentInput {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
}

/** De quién cuelga cada nivel en el cuerpo del alta y de la reordenación. */
const PARENT_KEY = {
  subjects: null,
  topics: 'subject_id',
  subtopics: 'topic_id',
} as const satisfies Record<ContentLevel, string | null>;

/**
 * El catálogo se pide entero y sin filtrar, en las tres peticiones que hacen
 * falta y a la vez. Filtrar en el servidor por estado dejaría huérfano lo que
 * cuelga de un nodo que no casa con el filtro, y la reordenación necesita de
 * todos modos la lista completa de hermanos, archivados incluidos
 * (docs/development/api.md).
 */
export async function getContentCatalog(signal?: AbortSignal): Promise<ContentCatalog> {
  const [subjects, topics, subtopics] = await Promise.all([
    listContent('/subjects', parseSubject, signal),
    listContent('/topics', parseTopic, signal),
    listContent('/subtopics', parseSubtopic, signal),
  ]);

  return { subjects, topics, subtopics };
}

export function createContent(
  level: ContentLevel,
  parentId: number | null,
  input: ContentInput,
): Promise<ContentNode> {
  const parentKey = PARENT_KEY[level];

  return apiRequest(`/${level}`, {
    method: 'POST',
    body: parentKey === null || parentId === null ? input : { ...input, [parentKey]: parentId },
    parse: parseSubject,
  });
}

/** Lo que llega sustituye; `description: null` la vacía, que es lo que hace el formulario. */
export function updateContent(
  level: ContentLevel,
  id: number,
  input: ContentInput,
): Promise<ContentNode> {
  return apiRequest(`/${level}/${String(id)}`, {
    method: 'PATCH',
    body: input,
    parse: parseSubject,
  });
}

/** El estado no se edita con `PATCH`: cada transición tiene su ruta. */
export function publishContent(level: ContentLevel, id: number): Promise<ContentNode> {
  return apiRequest(`/${level}/${String(id)}/publish`, { method: 'POST', parse: parseSubject });
}

export function archiveContent(level: ContentLevel, id: number): Promise<ContentNode> {
  return apiRequest(`/${level}/${String(id)}/archive`, { method: 'POST', parse: parseSubject });
}

/**
 * Reordenar es un lote: viaja la lista completa de hermanos en el orden nuevo y
 * el servidor reparte `position` 1..n. Un subconjunto lo rechaza con `422`.
 */
export function reorderContent(
  level: ContentLevel,
  parentId: number | null,
  ids: readonly number[],
): Promise<readonly ContentNode[]> {
  const parentKey = PARENT_KEY[level];

  return apiRequest(`/${level}/reorder`, {
    method: 'POST',
    body: parentKey === null || parentId === null ? { ids } : { [parentKey]: parentId, ids },
    parse: (body) => parseItems(body, parseSubject),
  });
}

function listContent<T>(
  path: string,
  parse: (value: unknown) => T,
  signal?: AbortSignal,
): Promise<readonly T[]> {
  return apiRequest(path, {
    parse: (body) => parseItems(body, parse),
    ...(signal ? { signal } : {}),
  });
}

function parseItems<T>(body: unknown, parse: (value: unknown) => T): readonly T[] {
  if (!isRecord(body) || !Array.isArray(body['items'])) throw invalidContent();

  return body['items'].map(parse);
}

function parseSubject(value: unknown): ContentNode {
  if (!isRecord(value)) throw invalidContent();

  const { id, slug, name, description, status, position } = value;

  if (
    typeof id !== 'number' ||
    typeof slug !== 'string' ||
    typeof name !== 'string' ||
    !(description === null || typeof description === 'string') ||
    !isContentStatus(status) ||
    typeof position !== 'number'
  ) {
    throw invalidContent();
  }

  return { id, slug, name, description, status, position };
}

function parseTopic(value: unknown): TopicNode {
  const node = parseSubject(value);
  const subjectId = isRecord(value) ? value['subject_id'] : undefined;

  if (typeof subjectId !== 'number') throw invalidContent();

  return { ...node, subject_id: subjectId };
}

function parseSubtopic(value: unknown): SubtopicNode {
  const node = parseSubject(value);
  const topicId = isRecord(value) ? value['topic_id'] : undefined;
  const count = isRecord(value) ? value['question_count'] : undefined;

  if (typeof topicId !== 'number' || typeof count !== 'number') throw invalidContent();

  return { ...node, topic_id: topicId, question_count: count };
}

function isContentStatus(value: unknown): value is ContentStatus {
  return contentStatuses.includes(value as ContentStatus);
}

function invalidContent(): ApiClientError {
  return new ApiClientError(
    'invalid_response',
    'El listado de contenido no llegó con la forma esperada',
  );
}
