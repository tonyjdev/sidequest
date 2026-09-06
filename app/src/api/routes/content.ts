import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import {
  createContentSchema,
  parentIdSchema,
  patchContentSchema,
  reorderSubjectsSchema,
  reorderSubtopicsSchema,
  reorderTopicsSchema,
  subjectBody,
  subjectQuerySchema,
  subjectSchema,
  subtopicBody,
  subtopicQuerySchema,
  subtopicSchema,
  subtopicSummaryBody,
  subtopicSummarySchema,
  topicBody,
  topicQuerySchema,
  topicSchema,
} from '@app/api/schemas/content.js';
import { idParamsSchema, itemsOf } from '@app/api/schemas/shared.js';
import {
  changeSubjectStatus,
  changeSubtopicStatus,
  changeTopicStatus,
  createSubject,
  createSubtopic,
  createTopic,
  listSubjects,
  listSubtopics,
  listTopics,
  reorderSubjects,
  reorderSubtopics,
  reorderTopics,
  requireSubject,
  requireSubtopic,
  requireTopic,
  updateSubject,
  updateSubtopic,
  updateTopic,
} from '@app/domain/content-service.js';
import type { Repositories } from '@app/domain/repositories.js';

/**
 * La jerarquía de contenido en la API: materias, temas y subtemas
 * (docs/especificacion.md §5).
 *
 * Los tres niveles exponen la misma superficie —listar, leer, crear, editar,
 * publicar, archivar y reordenar— porque son la misma cosa a distinta altura.
 * Las rutas son finas a propósito: traducen JSON a la llamada del dominio y
 * vuelven. Ni una comprobación vive aquí, para que el MCP entre por la misma
 * puerta sin copiarla.
 *
 * Tres decisiones del contrato, cerradas en SQST-0007:
 *
 * - **El estado no se edita con `PATCH`.** Cada transición tiene su ruta,
 *   `publish` y `archive`, y solo existen esas dos: no se vuelve a borrador ni
 *   se desarchiva.
 * - **Reordenar es un lote.** `reorder` recibe todos los hermanos en el orden
 *   nuevo y reparte `position` 1..n; un subconjunto dejaría posiciones
 *   repetidas con los que no vinieron.
 * - **El recuento de preguntas solo va en el listado de subtemas**, que es
 *   donde el panel lo enseña.
 */

export interface ContentDependencies {
  readonly repositories: Repositories;
}

export function subjectRoutes({ repositories }: ContentDependencies): FastifyPluginAsyncZod {
  return (app) => {
    app.get(
      '/subjects',
      { schema: { querystring: subjectQuerySchema, response: { 200: itemsOf(subjectSchema) } } },
      async ({ query }) => ({
        items: (await listSubjects(repositories, { statuses: query.status })).map(subjectBody),
      }),
    );

    app.get(
      '/subjects/:id',
      { schema: { params: idParamsSchema, response: { 200: subjectSchema } } },
      async ({ params }) => subjectBody(await requireSubject(repositories, params.id)),
    );

    app.post(
      '/subjects',
      { schema: { body: createContentSchema, response: { 201: subjectSchema } } },
      async ({ body }, reply) =>
        reply.code(201).send(subjectBody(await createSubject(repositories, body))),
    );

    app.patch(
      '/subjects/:id',
      {
        schema: {
          params: idParamsSchema,
          body: patchContentSchema,
          response: { 200: subjectSchema },
        },
      },
      async ({ params, body }) => subjectBody(await updateSubject(repositories, params.id, body)),
    );

    app.post(
      '/subjects/:id/publish',
      { schema: { params: idParamsSchema, response: { 200: subjectSchema } } },
      async ({ params }) =>
        subjectBody(await changeSubjectStatus(repositories, params.id, 'published')),
    );

    app.post(
      '/subjects/:id/archive',
      { schema: { params: idParamsSchema, response: { 200: subjectSchema } } },
      async ({ params }) =>
        subjectBody(await changeSubjectStatus(repositories, params.id, 'archived')),
    );

    app.post(
      '/subjects/reorder',
      { schema: { body: reorderSubjectsSchema, response: { 200: itemsOf(subjectSchema) } } },
      async ({ body }) => ({
        items: (await reorderSubjects(repositories, body.ids)).map(subjectBody),
      }),
    );

    return Promise.resolve();
  };
}

export function topicRoutes({ repositories }: ContentDependencies): FastifyPluginAsyncZod {
  return (app) => {
    app.get(
      '/topics',
      { schema: { querystring: topicQuerySchema, response: { 200: itemsOf(topicSchema) } } },
      async ({ query }) => ({
        items: (
          await listTopics(repositories, {
            statuses: query.status,
            subjectIds: query.subject_id,
          })
        ).map(topicBody),
      }),
    );

    app.get(
      '/topics/:id',
      { schema: { params: idParamsSchema, response: { 200: topicSchema } } },
      async ({ params }) => topicBody(await requireTopic(repositories, params.id)),
    );

    app.post(
      '/topics',
      {
        schema: {
          body: createContentSchema.extend({ subject_id: parentIdSchema }),
          response: { 201: topicSchema },
        },
      },
      async ({ body }, reply) => {
        const { subject_id: subjectId, ...input } = body;

        return reply.code(201).send(topicBody(await createTopic(repositories, subjectId, input)));
      },
    );

    app.patch(
      '/topics/:id',
      {
        schema: {
          params: idParamsSchema,
          body: patchContentSchema,
          response: { 200: topicSchema },
        },
      },
      async ({ params, body }) => topicBody(await updateTopic(repositories, params.id, body)),
    );

    app.post(
      '/topics/:id/publish',
      { schema: { params: idParamsSchema, response: { 200: topicSchema } } },
      async ({ params }) =>
        topicBody(await changeTopicStatus(repositories, params.id, 'published')),
    );

    app.post(
      '/topics/:id/archive',
      { schema: { params: idParamsSchema, response: { 200: topicSchema } } },
      async ({ params }) => topicBody(await changeTopicStatus(repositories, params.id, 'archived')),
    );

    app.post(
      '/topics/reorder',
      { schema: { body: reorderTopicsSchema, response: { 200: itemsOf(topicSchema) } } },
      async ({ body }) => ({
        items: (await reorderTopics(repositories, body.subject_id, body.ids)).map(topicBody),
      }),
    );

    return Promise.resolve();
  };
}

export function subtopicRoutes({ repositories }: ContentDependencies): FastifyPluginAsyncZod {
  return (app) => {
    app.get(
      '/subtopics',
      {
        schema: {
          querystring: subtopicQuerySchema,
          response: { 200: itemsOf(subtopicSummarySchema) },
        },
      },
      async ({ query }) => ({
        items: (
          await listSubtopics(repositories, {
            statuses: query.status,
            topicIds: query.topic_id,
          })
        ).map(subtopicSummaryBody),
      }),
    );

    app.get(
      '/subtopics/:id',
      { schema: { params: idParamsSchema, response: { 200: subtopicSchema } } },
      async ({ params }) => subtopicBody(await requireSubtopic(repositories, params.id)),
    );

    app.post(
      '/subtopics',
      {
        schema: {
          body: createContentSchema.extend({ topic_id: parentIdSchema }),
          response: { 201: subtopicSchema },
        },
      },
      async ({ body }, reply) => {
        const { topic_id: topicId, ...input } = body;

        return reply
          .code(201)
          .send(subtopicBody(await createSubtopic(repositories, topicId, input)));
      },
    );

    app.patch(
      '/subtopics/:id',
      {
        schema: {
          params: idParamsSchema,
          body: patchContentSchema,
          response: { 200: subtopicSchema },
        },
      },
      async ({ params, body }) => subtopicBody(await updateSubtopic(repositories, params.id, body)),
    );

    app.post(
      '/subtopics/:id/publish',
      { schema: { params: idParamsSchema, response: { 200: subtopicSchema } } },
      async ({ params }) =>
        subtopicBody(await changeSubtopicStatus(repositories, params.id, 'published')),
    );

    app.post(
      '/subtopics/:id/archive',
      { schema: { params: idParamsSchema, response: { 200: subtopicSchema } } },
      async ({ params }) =>
        subtopicBody(await changeSubtopicStatus(repositories, params.id, 'archived')),
    );

    app.post(
      '/subtopics/reorder',
      { schema: { body: reorderSubtopicsSchema, response: { 200: itemsOf(subtopicSchema) } } },
      async ({ body }) => ({
        items: (await reorderSubtopics(repositories, body.topic_id, body.ids)).map(subtopicBody),
      }),
    );

    return Promise.resolve();
  };
}
