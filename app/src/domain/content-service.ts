import {
  assertContentFields,
  assertName,
  assertPosition,
  assertPublishableUnder,
  assertReorderIds,
  assertSlug,
  assertStatusTransition,
  type ContentFields,
  type ContentPatch,
  type ContentTransition,
  type Subject,
  type Subtopic,
  type Topic,
} from '@app/domain/content.js';
import { ConflictError, NotFoundError } from '@app/domain/errors.js';
import type {
  ContentQuery,
  Repositories,
  SubtopicQuery,
  TopicQuery,
} from '@app/domain/repositories.js';

/**
 * Casos de uso de la jerarquía de contenido. La API y el MCP llaman aquí; no
 * repiten ni una de estas comprobaciones.
 *
 * Dos reglas gobiernan todo el archivo:
 *
 * - **Se crea en borrador.** Publicar es un paso aparte, porque es el paso que
 *   comprueba la cadena de tres eslabones.
 * - **Archivar baja, publicar no sube.** Archivar una materia archiva sus temas
 *   y sus subtemas; publicarla no publica nada por su cuenta.
 */

/** Un subtema con lo que el panel necesita saber de él sin abrir su ficha. */
export interface SubtopicSummary {
  readonly subtopic: Subtopic;
  readonly questionCount: number;
}

export interface ContentInput {
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly position?: number | undefined;
}

export function listSubjects(repos: Repositories, query?: ContentQuery): Promise<Subject[]> {
  return repos.subjects.list(query);
}

export function listTopics(repos: Repositories, query?: TopicQuery): Promise<Topic[]> {
  return repos.topics.list(query);
}

/**
 * Los subtemas llegan con su recuento de preguntas: es lo que distingue en el
 * panel un subtema vacío de uno que ya tiene con qué preguntar. Se pide en una
 * sola consulta para toda la página, no una por fila.
 */
export async function listSubtopics(
  repos: Repositories,
  query?: SubtopicQuery,
): Promise<SubtopicSummary[]> {
  const subtopics = await repos.subtopics.list(query);
  const counts = await repos.questions.countBySubtopic(subtopics.map((subtopic) => subtopic.id));

  return subtopics.map((subtopic) => ({
    subtopic,
    questionCount: counts.get(subtopic.id) ?? 0,
  }));
}

export async function createSubject(repos: Repositories, input: ContentInput): Promise<Subject> {
  const fields = toDraftFields(input);

  assertContentFields(fields);

  if ((await repos.subjects.findBySlug(fields.slug)) !== null) {
    throw new ConflictError(`Ya existe una materia con el slug «${fields.slug}»`, [
      { field: 'slug', message: 'ya en uso' },
    ]);
  }

  return repos.subjects.create(fields);
}

export async function createTopic(
  repos: Repositories,
  subjectId: number,
  input: ContentInput,
): Promise<Topic> {
  const fields = toDraftFields(input);

  assertContentFields(fields);
  await requireSubject(repos, subjectId);

  if ((await repos.topics.findBySlug(subjectId, fields.slug)) !== null) {
    throw new ConflictError(`Ya existe un tema con el slug «${fields.slug}» en esa materia`, [
      { field: 'slug', message: 'ya en uso' },
    ]);
  }

  return repos.topics.create({ ...fields, subjectId });
}

export async function createSubtopic(
  repos: Repositories,
  topicId: number,
  input: ContentInput,
): Promise<Subtopic> {
  const fields = toDraftFields(input);

  assertContentFields(fields);
  await requireTopic(repos, topicId);

  if ((await repos.subtopics.findBySlug(topicId, fields.slug)) !== null) {
    throw new ConflictError(`Ya existe un subtema con el slug «${fields.slug}» en ese tema`, [
      { field: 'slug', message: 'ya en uso' },
    ]);
  }

  return repos.subtopics.create({ ...fields, topicId });
}

export async function updateSubject(
  repos: Repositories,
  id: number,
  patch: ContentPatch,
): Promise<Subject> {
  const subject = await requireSubject(repos, id);

  assertPatch(patch);

  if (patch.slug !== undefined && patch.slug !== subject.slug) {
    const clash = await repos.subjects.findBySlug(patch.slug);

    if (clash !== null) {
      throw new ConflictError(`Ya existe una materia con el slug «${patch.slug}»`, [
        { field: 'slug', message: 'ya en uso' },
      ]);
    }
  }

  return repos.subjects.update(id, patch);
}

export async function updateTopic(
  repos: Repositories,
  id: number,
  patch: ContentPatch,
): Promise<Topic> {
  const topic = await requireTopic(repos, id);

  assertPatch(patch);

  if (patch.slug !== undefined && patch.slug !== topic.slug) {
    const clash = await repos.topics.findBySlug(topic.subjectId, patch.slug);

    if (clash !== null) {
      throw new ConflictError(`Ya existe un tema con el slug «${patch.slug}» en esa materia`, [
        { field: 'slug', message: 'ya en uso' },
      ]);
    }
  }

  return repos.topics.update(id, patch);
}

export async function updateSubtopic(
  repos: Repositories,
  id: number,
  patch: ContentPatch,
): Promise<Subtopic> {
  const subtopic = await requireSubtopic(repos, id);

  assertPatch(patch);

  if (patch.slug !== undefined && patch.slug !== subtopic.slug) {
    const clash = await repos.subtopics.findBySlug(subtopic.topicId, patch.slug);

    if (clash !== null) {
      throw new ConflictError(`Ya existe un subtema con el slug «${patch.slug}» en ese tema`, [
        { field: 'slug', message: 'ya en uso' },
      ]);
    }
  }

  return repos.subtopics.update(id, patch);
}

export async function changeSubjectStatus(
  repos: Repositories,
  id: number,
  status: ContentTransition,
): Promise<Subject> {
  const subject = await requireSubject(repos, id);

  assertStatusTransition('subject', subject.status, status);

  return status === 'archived'
    ? repos.subjects.archiveTree(id)
    : repos.subjects.setStatus(id, status);
}

export async function changeTopicStatus(
  repos: Repositories,
  id: number,
  status: ContentTransition,
): Promise<Topic> {
  const topic = await requireTopic(repos, id);

  assertStatusTransition('topic', topic.status, status);

  if (status === 'published') {
    assertPublishableUnder('topic', await requireSubject(repos, topic.subjectId));
  }

  return status === 'archived' ? repos.topics.archiveTree(id) : repos.topics.setStatus(id, status);
}

export async function changeSubtopicStatus(
  repos: Repositories,
  id: number,
  status: ContentTransition,
): Promise<Subtopic> {
  const subtopic = await requireSubtopic(repos, id);

  assertStatusTransition('subtopic', subtopic.status, status);

  if (status === 'published') {
    assertPublishableUnder('subtopic', await requireTopic(repos, subtopic.topicId));
  }

  return status === 'archived'
    ? repos.subtopics.archive(id)
    : repos.subtopics.setStatus(id, status);
}

/**
 * Reordenar es repartir `position` 1..n entre los hermanos, así que llega la
 * lista completa: `assertReorderIds` rechaza el subconjunto antes de escribir.
 */
export async function reorderSubjects(
  repos: Repositories,
  ids: readonly number[],
): Promise<Subject[]> {
  const current = await repos.subjects.list();

  assertReorderIds(
    current.map((subject) => subject.id),
    ids,
  );

  return repos.subjects.reorder(ids);
}

export async function reorderTopics(
  repos: Repositories,
  subjectId: number,
  ids: readonly number[],
): Promise<Topic[]> {
  await requireSubject(repos, subjectId);

  const current = await repos.topics.list({ subjectIds: [subjectId] });

  assertReorderIds(
    current.map((topic) => topic.id),
    ids,
  );

  return repos.topics.reorder(subjectId, ids);
}

export async function reorderSubtopics(
  repos: Repositories,
  topicId: number,
  ids: readonly number[],
): Promise<Subtopic[]> {
  await requireTopic(repos, topicId);

  const current = await repos.subtopics.list({ topicIds: [topicId] });

  assertReorderIds(
    current.map((subtopic) => subtopic.id),
    ids,
  );

  return repos.subtopics.reorder(topicId, ids);
}

export async function requireSubject(repos: Repositories, id: number): Promise<Subject> {
  const subject = await repos.subjects.findById(id);

  if (subject === null) throw new NotFoundError('La materia no existe', { subjectId: id });

  return subject;
}

export async function requireTopic(repos: Repositories, id: number): Promise<Topic> {
  const topic = await repos.topics.findById(id);

  if (topic === null) throw new NotFoundError('El tema no existe', { topicId: id });

  return topic;
}

export async function requireSubtopic(repos: Repositories, id: number): Promise<Subtopic> {
  const subtopic = await repos.subtopics.findById(id);

  if (subtopic === null) throw new NotFoundError('El subtema no existe', { subtopicId: id });

  return subtopic;
}

function toDraftFields(input: ContentInput): ContentFields {
  return {
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    status: 'draft',
    position: input.position ?? 0,
  };
}

function assertPatch(patch: ContentPatch): void {
  if (patch.slug !== undefined) assertSlug(patch.slug);
  if (patch.name !== undefined) assertName(patch.name);

  if (patch.position !== undefined) assertPosition(patch.position);
}
