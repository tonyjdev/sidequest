import {
  assertContentFields,
  assertName,
  assertPosition,
  assertPublishableUnder,
  assertSlug,
  type ContentFields,
  type ContentPatch,
  type Subject,
  type Subtopic,
  type Topic,
} from '@app/domain/content.js';
import { ConflictError, NotFoundError } from '@app/domain/errors.js';
import type { Repositories } from '@app/domain/repositories.js';
import type { ContentStatus } from '@app/domain/types.js';

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

export interface ContentInput {
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly position?: number | undefined;
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
  status: ContentStatus,
): Promise<Subject> {
  await requireSubject(repos, id);

  return status === 'archived'
    ? repos.subjects.archiveTree(id)
    : repos.subjects.setStatus(id, status);
}

export async function changeTopicStatus(
  repos: Repositories,
  id: number,
  status: ContentStatus,
): Promise<Topic> {
  const topic = await requireTopic(repos, id);

  if (status === 'published') {
    assertPublishableUnder('topic', await requireSubject(repos, topic.subjectId));
  }

  return status === 'archived' ? repos.topics.archiveTree(id) : repos.topics.setStatus(id, status);
}

export async function changeSubtopicStatus(
  repos: Repositories,
  id: number,
  status: ContentStatus,
): Promise<Subtopic> {
  const subtopic = await requireSubtopic(repos, id);

  if (status === 'published') {
    assertPublishableUnder('subtopic', await requireTopic(repos, subtopic.topicId));
  }

  return status === 'archived'
    ? repos.subtopics.archive(id)
    : repos.subtopics.setStatus(id, status);
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
