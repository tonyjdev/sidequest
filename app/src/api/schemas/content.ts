import { z } from 'zod';

import { idFilter, statusFilter } from '@app/api/schemas/shared.js';
import type { ContentNode, Subtopic, Topic } from '@app/domain/content.js';
import type { SubtopicSummary } from '@app/domain/content-service.js';
import { contentStatuses } from '@app/domain/types.js';

/**
 * Las piezas que comparten los tres niveles de la jerarquía en la API: materia,
 * tema y subtema tienen la misma forma y solo se diferencian en de quién
 * cuelgan (docs/especificacion.md §3).
 *
 * El reparto de responsabilidades con el dominio es deliberado: **aquí se
 * comprueba la forma —qué campos hay y de qué tipo—, y en `domain/content.ts`
 * las reglas**: el formato del slug, las longitudes, la cadena de publicación.
 * Repetir aquí el patrón del slug sería tener la misma regla en dos sitios, y
 * el MCP acabaría teniéndola en un tercero.
 */

/** Claves de la API en inglés y `snake_case`, como el resto del contrato. */
const contentNodeSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(contentStatuses),
  position: z.number().int(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const subjectSchema = contentNodeSchema;
export const topicSchema = contentNodeSchema.extend({ subject_id: z.number().int().positive() });
export const subtopicSchema = contentNodeSchema.extend({ topic_id: z.number().int().positive() });

/**
 * El recuento acompaña al subtema solo en el listado: es lo que el panel
 * necesita para distinguir un subtema vacío de uno con contenido, y pedirlo en
 * cada escritura costaría una consulta que nadie mira.
 */
export const subtopicSummarySchema = subtopicSchema.extend({
  question_count: z.number().int().nonnegative(),
});

export const subjectQuerySchema = z.object({ status: statusFilter });
export const topicQuerySchema = z.object({ status: statusFilter, subject_id: idFilter });
export const subtopicQuerySchema = z.object({ status: statusFilter, topic_id: idFilter });

/** El padre viaja en el cuerpo del alta: un tema sin materia no existe. */
export const parentIdSchema = z.number().int().positive();

/**
 * El alta no admite `status`: todo nace en borrador y se publica aparte, que es
 * el paso donde se comprueba la cadena de tres eslabones.
 */
export const createContentSchema = z.strictObject({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  position: z.number().int().optional(),
});

/**
 * Lo que no viene no se toca; `description: null` sí la vacía. El cuerpo es
 * estricto para que un `PATCH` con `status` no se pierda en silencio: el estado
 * se mueve por su propia ruta.
 */
export const patchContentSchema = z.strictObject({
  slug: z.string().optional(),
  name: z.string().optional(),
  description: z.string().nullish(),
  position: z.number().int().optional(),
});

const idListSchema = z.array(z.number().int().positive());

export const reorderSubjectsSchema = z.strictObject({ ids: idListSchema });
export const reorderTopicsSchema = z.strictObject({
  subject_id: z.number().int().positive(),
  ids: idListSchema,
});
export const reorderSubtopicsSchema = z.strictObject({
  topic_id: z.number().int().positive(),
  ids: idListSchema,
});

export function subjectBody(node: ContentNode): z.infer<typeof subjectSchema> {
  return {
    id: node.id,
    slug: node.slug,
    name: node.name,
    description: node.description,
    status: node.status,
    position: node.position,
    created_at: node.createdAt.toISOString(),
    updated_at: node.updatedAt.toISOString(),
  };
}

export function topicBody(topic: Topic): z.infer<typeof topicSchema> {
  return { ...subjectBody(topic), subject_id: topic.subjectId };
}

export function subtopicBody(subtopic: Subtopic): z.infer<typeof subtopicSchema> {
  return { ...subjectBody(subtopic), topic_id: subtopic.topicId };
}

export function subtopicSummaryBody(
  summary: SubtopicSummary,
): z.infer<typeof subtopicSummarySchema> {
  return { ...subtopicBody(summary.subtopic), question_count: summary.questionCount };
}
