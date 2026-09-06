import { z } from 'zod';

import { commaSeparated, idFilter, statusFilter } from '@app/api/schemas/shared.js';
import type {
  Question,
  QuestionDetail,
  QuestionOption,
  QuestionResource,
  Tag,
} from '@app/domain/questions.js';
import type { QuestionInput, QuestionUpdateInput } from '@app/domain/questions-service.js';
import {
  contentStatuses,
  difficulties,
  questionTypes,
  resourceKinds,
  storageKinds,
} from '@app/domain/types.js';

/**
 * La pregunta en la API (docs/especificacion.md §3.4 a §3.7). Es un agregado:
 * sus opciones, sus recursos y sus etiquetas viajan con ella, en el mismo
 * cuerpo, y se escriben en la misma llamada.
 *
 * El reparto con el dominio es el de siempre: **aquí la forma —qué campos hay y
 * de qué tipo—, y en `domain/questions.ts` las reglas**. Por eso `url` es una
 * cadena y no `z.url()`: que el recurso apunte a una URL absoluta lo decide
 * `assertResourceUrls`, y tenerlo escrito también aquí sería la misma regla en
 * dos sitios.
 */

/** Claves de la API en inglés y `snake_case`, como el resto del contrato. */
export const questionSchema = z.object({
  id: z.number().int().positive(),
  subtopic_id: z.number().int().positive(),
  type: z.enum(questionTypes),
  statement: z.string(),
  explanation: z.string().nullable(),
  difficulty: z.enum(difficulties),
  status: z.enum(contentStatuses),
  visible_options: z.number().int().nullable(),
  version: z.number().int().positive(),
  content_hash: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

const optionSchema = z.object({
  id: z.number().int().positive(),
  text: z.string(),
  is_correct: z.boolean(),
  position: z.number().int(),
});

const resourceSchema = z.object({
  id: z.number().int().positive(),
  kind: z.enum(resourceKinds),
  url: z.string(),
  label: z.string().nullable(),
  storage_kind: z.enum(storageKinds),
  position: z.number().int(),
});

export const tagSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string(),
  name: z.string(),
  created_at: z.iso.datetime(),
});

/** La ficha: la pregunta con todo lo que cuelga de ella. */
export const questionDetailSchema = questionSchema.extend({
  options: z.array(optionSchema),
  resources: z.array(resourceSchema),
  tags: z.array(tagSchema),
});

const newOptionSchema = z.strictObject({ text: z.string(), is_correct: z.boolean() });

/**
 * `storage_kind` no se acepta: en esta versión los recursos son URL externas
 * (docs/decisiones.md §2). La columna ya admite `upload`, pero mientras no haya
 * subida no hay forma de escribir una fila que lo diga.
 */
const newResourceSchema = z.strictObject({
  kind: z.enum(resourceKinds),
  url: z.string(),
  label: z.string().nullish(),
});

const tagIdsSchema = z.array(z.number().int().positive());

/**
 * A diferencia del contenido, la pregunta **sí puede nacer publicada**: el alta
 * lleva sus opciones en el mismo cuerpo, así que las tres invariantes ya se
 * pueden comprobar. Quien la pide publicada sin opción correcta recibe un 422 y
 * no se escribe nada.
 */
export const createQuestionSchema = z.strictObject({
  subtopic_id: z.number().int().positive(),
  type: z.enum(questionTypes),
  statement: z.string(),
  explanation: z.string().nullish(),
  difficulty: z.enum(difficulties).optional(),
  visible_options: z.number().int().nullish(),
  status: z.enum(['draft', 'published']).optional(),
  options: z.array(newOptionSchema).optional(),
  resources: z.array(newResourceSchema).optional(),
  tag_ids: tagIdsSchema.optional(),
});

/**
 * Lo que no viene no se toca; una colección que viene sustituye entera a la
 * anterior. El cuerpo es estricto para que un `PATCH` con `status` no se pierda
 * en silencio: el estado se mueve por sus propias rutas.
 */
export const patchQuestionSchema = z.strictObject({
  subtopic_id: z.number().int().positive().optional(),
  type: z.enum(questionTypes).optional(),
  statement: z.string().optional(),
  explanation: z.string().nullish(),
  difficulty: z.enum(difficulties).optional(),
  visible_options: z.number().int().nullish(),
  options: z.array(newOptionSchema).optional(),
  resources: z.array(newResourceSchema).optional(),
  tag_ids: tagIdsSchema.optional(),
});

export const questionQuerySchema = z.object({
  status: statusFilter,
  subtopic_id: idFilter,
  difficulty: commaSeparated(z.enum(difficulties)),
  tag_id: idFilter,
  /** Coincidencia parcial en el enunciado, sin distinguir mayúsculas ni acentos. */
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const createTagSchema = z.strictObject({ slug: z.string(), name: z.string() });
export const patchTagSchema = z.strictObject({
  slug: z.string().optional(),
  name: z.string().optional(),
});

/**
 * De las claves del contrato a las del dominio. Vive aquí y no en la ruta
 * porque es la otra mitad del mismo contrato: `questionBody` traduce en un
 * sentido y esto en el otro.
 */
export function questionInputFrom(body: z.infer<typeof createQuestionSchema>): QuestionInput {
  return {
    subtopicId: body.subtopic_id,
    type: body.type,
    statement: body.statement,
    explanation: body.explanation,
    difficulty: body.difficulty,
    visibleOptions: body.visible_options,
    options: (body.options ?? []).map(newOptionFrom),
    resources: (body.resources ?? []).map(newResourceFrom),
    tagIds: body.tag_ids,
    publish: body.status === 'published',
  };
}

/** Lo que no viene queda `undefined`, que es como el dominio lee «no se toca». */
export function questionUpdateFrom(body: z.infer<typeof patchQuestionSchema>): QuestionUpdateInput {
  return {
    subtopicId: body.subtopic_id,
    type: body.type,
    statement: body.statement,
    explanation: body.explanation,
    difficulty: body.difficulty,
    visibleOptions: body.visible_options,
    options: body.options?.map(newOptionFrom),
    resources: body.resources?.map(newResourceFrom),
    tagIds: body.tag_ids,
  };
}

function newOptionFrom(option: z.infer<typeof newOptionSchema>) {
  return { text: option.text, isCorrect: option.is_correct };
}

function newResourceFrom(resource: z.infer<typeof newResourceSchema>) {
  return {
    kind: resource.kind,
    url: resource.url,
    label: resource.label ?? null,
    storageKind: 'external' as const,
  };
}

export function questionBody(question: Question): z.infer<typeof questionSchema> {
  return {
    id: question.id,
    subtopic_id: question.subtopicId,
    type: question.type,
    statement: question.statement,
    explanation: question.explanation,
    difficulty: question.difficulty,
    status: question.status,
    visible_options: question.visibleOptions,
    version: question.version,
    content_hash: question.contentHash,
    created_at: question.createdAt.toISOString(),
    updated_at: question.updatedAt.toISOString(),
  };
}

export function questionDetailBody(detail: QuestionDetail): z.infer<typeof questionDetailSchema> {
  return {
    ...questionBody(detail.question),
    options: detail.options.map(optionBody),
    resources: detail.resources.map(resourceBody),
    tags: detail.tags.map(tagBody),
  };
}

export function tagBody(tag: Tag): z.infer<typeof tagSchema> {
  return {
    id: tag.id,
    slug: tag.slug,
    name: tag.name,
    created_at: tag.createdAt.toISOString(),
  };
}

function optionBody(option: QuestionOption): z.infer<typeof optionSchema> {
  return {
    id: option.id,
    text: option.text,
    is_correct: option.isCorrect,
    position: option.position,
  };
}

function resourceBody(resource: QuestionResource): z.infer<typeof resourceSchema> {
  return {
    id: resource.id,
    kind: resource.kind,
    url: resource.url,
    label: resource.label,
    storage_kind: resource.storageKind,
    position: resource.position,
  };
}
