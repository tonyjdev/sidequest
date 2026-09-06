import { assertName, assertSlug } from '@app/domain/content.js';
import { requireSubtopic } from '@app/domain/content-service.js';
import { contentHashOf } from '@app/domain/content-hash.js';
import { ConflictError, NotFoundError } from '@app/domain/errors.js';
import {
  assertOptionTexts,
  assertPublishableQuestion,
  assertQuestionStatement,
  assertResourceUrls,
  assertVisibleOptions,
  type NewQuestionOption,
  type NewQuestionResource,
  type Question,
  type QuestionDetail,
  type QuestionOption,
  type QuestionPatch,
  type QuestionResource,
  type Tag,
} from '@app/domain/questions.js';
import type { Repositories } from '@app/domain/repositories.js';
import type { ContentStatus, Difficulty, QuestionType } from '@app/domain/types.js';

/**
 * Casos de uso de la pregunta. Aquí es donde las tres invariantes de
 * publicación se comprueban antes de escribir: la base las repite con
 * disparadores, pero llegar hasta ella para enterarse daría un error de MySQL en
 * vez de uno que el panel pueda enseñar.
 *
 * El `content_hash` no se pide nunca desde fuera: se deriva del enunciado, para
 * que no exista la forma de guardar una pregunta con un hash que no le
 * corresponde.
 */

export interface QuestionInput {
  readonly subtopicId: number;
  readonly type: QuestionType;
  readonly statement: string;
  readonly explanation?: string | null | undefined;
  readonly difficulty?: Difficulty | undefined;
  readonly visibleOptions?: number | null | undefined;
  readonly options: readonly NewQuestionOption[];
  readonly resources?: readonly NewQuestionResource[] | undefined;
  readonly tagIds?: readonly number[] | undefined;
  /** Se crea en borrador salvo que se pida publicada, y entonces se exige que lo pueda estar. */
  readonly publish?: boolean | undefined;
}

export async function createQuestion(
  repos: Repositories,
  input: QuestionInput,
): Promise<QuestionDetail> {
  const resources = input.resources ?? [];
  const tagIds = input.tagIds ?? [];
  const status: ContentStatus = input.publish === true ? 'published' : 'draft';

  assertQuestionStatement(input.statement);
  assertVisibleOptions(input.visibleOptions ?? null);
  assertOptionTexts(input.options);
  assertResourceUrls(resources);

  if (status === 'published') {
    assertPublishableQuestion(input.type, input.options);
  }

  await requireSubtopic(repos, input.subtopicId);
  await requireTags(repos, tagIds);

  return repos.questions.create({
    question: {
      subtopicId: input.subtopicId,
      type: input.type,
      statement: input.statement,
      explanation: input.explanation ?? null,
      difficulty: input.difficulty ?? 'medium',
      visibleOptions: input.visibleOptions ?? null,
    },
    status,
    options: input.options,
    resources,
    tagIds,
  });
}

export async function updateQuestion(
  repos: Repositories,
  id: number,
  patch: QuestionPatch,
): Promise<Question> {
  const detail = await requireQuestion(repos, id);

  if (patch.statement !== undefined) assertQuestionStatement(patch.statement);
  if (patch.visibleOptions !== undefined) assertVisibleOptions(patch.visibleOptions);
  if (patch.subtopicId !== undefined) await requireSubtopic(repos, patch.subtopicId);

  // Cambiar de `multiple` a `single` puede dejar publicada una pregunta con dos
  // correctas: se comprueba contra las opciones que ya tiene.
  if (detail.question.status === 'published') {
    assertPublishableQuestion(patch.type ?? detail.question.type, detail.options);
  }

  return repos.questions.update(id, patch);
}

export async function replaceQuestionOptions(
  repos: Repositories,
  id: number,
  options: readonly NewQuestionOption[],
): Promise<QuestionOption[]> {
  const detail = await requireQuestion(repos, id);

  assertOptionTexts(options);

  if (detail.question.status === 'published') {
    assertPublishableQuestion(detail.question.type, options);
  }

  return repos.questions.replaceOptions(id, options);
}

export async function replaceQuestionResources(
  repos: Repositories,
  id: number,
  resources: readonly NewQuestionResource[],
): Promise<QuestionResource[]> {
  await requireQuestion(repos, id);
  assertResourceUrls(resources);

  return repos.questions.replaceResources(id, resources);
}

export async function setQuestionTags(
  repos: Repositories,
  id: number,
  tagIds: readonly number[],
): Promise<Tag[]> {
  await requireQuestion(repos, id);
  await requireTags(repos, tagIds);

  return repos.questions.setTags(id, tagIds);
}

/**
 * Publicar exige las tres invariantes; archivar y volver a borrador, no. Que los
 * tres antecesores estén publicados es criterio de candidatura al sorteo
 * (docs/especificacion.md §4.1), no condición para publicar la pregunta.
 */
export async function changeQuestionStatus(
  repos: Repositories,
  id: number,
  status: ContentStatus,
): Promise<Question> {
  const detail = await requireQuestion(repos, id);

  if (status === 'published') {
    assertPublishableQuestion(detail.question.type, detail.options);
  }

  return repos.questions.setStatus(id, status);
}

/**
 * Preguntas del mismo subtema con el mismo enunciado normalizado. La
 * importación las marca como duplicadas; nada las impide
 * (docs/especificacion.md §3.4).
 */
export async function findDuplicateQuestions(
  repos: Repositories,
  subtopicId: number,
  statement: string,
): Promise<Question[]> {
  return repos.questions.findByContentHash(subtopicId, contentHashOf(statement));
}

export async function createTag(
  repos: Repositories,
  input: { readonly slug: string; readonly name: string },
): Promise<Tag> {
  assertSlug(input.slug);
  assertName(input.name);

  if ((await repos.tags.findBySlug(input.slug)) !== null) {
    throw new ConflictError(`Ya existe una etiqueta con el slug «${input.slug}»`, [
      { field: 'slug', message: 'ya en uso' },
    ]);
  }

  return repos.tags.create(input);
}

export async function updateTag(
  repos: Repositories,
  id: number,
  patch: { readonly slug?: string | undefined; readonly name?: string | undefined },
): Promise<Tag> {
  const tag = await requireTag(repos, id);

  if (patch.slug !== undefined) assertSlug(patch.slug);
  if (patch.name !== undefined) assertName(patch.name);

  if (patch.slug !== undefined && patch.slug !== tag.slug) {
    if ((await repos.tags.findBySlug(patch.slug)) !== null) {
      throw new ConflictError(`Ya existe una etiqueta con el slug «${patch.slug}»`, [
        { field: 'slug', message: 'ya en uso' },
      ]);
    }
  }

  return repos.tags.update(id, patch);
}

export async function requireQuestion(repos: Repositories, id: number): Promise<QuestionDetail> {
  const detail = await repos.questions.findById(id);

  if (detail === null) throw new NotFoundError('La pregunta no existe', { questionId: id });

  return detail;
}

export async function requireTag(repos: Repositories, id: number): Promise<Tag> {
  const tag = await repos.tags.findById(id);

  if (tag === null) throw new NotFoundError('La etiqueta no existe', { tagId: id });

  return tag;
}

async function requireTags(repos: Repositories, tagIds: readonly number[]): Promise<void> {
  for (const tagId of tagIds) {
    await requireTag(repos, tagId);
  }
}
