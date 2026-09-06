import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import {
  createQuestionSchema,
  createTagSchema,
  patchQuestionSchema,
  patchTagSchema,
  questionBody,
  questionDetailBody,
  questionDetailSchema,
  questionInputFrom,
  questionQuerySchema,
  questionSchema,
  questionUpdateFrom,
  tagBody,
  tagSchema,
} from '@app/api/schemas/questions.js';
import { idParamsSchema, itemsOf } from '@app/api/schemas/shared.js';
import {
  changeQuestionStatus,
  createQuestion,
  createTag,
  listQuestions,
  listTags,
  requireQuestion,
  updateQuestion,
  updateTag,
} from '@app/domain/questions-service.js';
import type { Repositories } from '@app/domain/repositories.js';

/**
 * Las preguntas y sus etiquetas en la API (docs/especificacion.md §5).
 *
 * **La pregunta es un agregado**: sus opciones, sus recursos y sus etiquetas se
 * crean y se editan con ella, en la misma llamada y dentro de la misma
 * transacción. No hay `/questions/{id}/options`, y no por falta de tiempo: una
 * pregunta a medio editar —opciones nuevas con el enunciado viejo— no es un
 * estado que deba existir.
 *
 * Tres decisiones del contrato, cerradas en SQST-0008:
 *
 * - **La pregunta sí nace publicada si se pide.** A diferencia del contenido,
 *   el alta lleva sus opciones, así que las tres invariantes ya se pueden
 *   comprobar. Debajo sigue siendo borrador → opciones → publicar, porque los
 *   disparadores no admiten otra cosa.
 * - **El estado no se edita con `PATCH`.** Tiene tres rutas —`publish`,
 *   `unpublish` y `archive`—: la pregunta vuelve a borrador para arreglarla,
 *   pero archivada es terminal.
 * - **El listado devuelve la pregunta a secas.** Las opciones se piden abriendo
 *   la ficha; cargarlas para una tabla de cien filas no las mira nadie.
 */

export interface QuestionDependencies {
  readonly repositories: Repositories;
}

export function questionRoutes({ repositories }: QuestionDependencies): FastifyPluginAsyncZod {
  return (app) => {
    app.get(
      '/questions',
      { schema: { querystring: questionQuerySchema, response: { 200: itemsOf(questionSchema) } } },
      async ({ query }) => ({
        items: (
          await listQuestions(repositories, {
            statuses: query.status,
            subtopicIds: query.subtopic_id,
            difficulties: query.difficulty,
            tagIds: query.tag_id,
            search: query.search,
            limit: query.limit,
            offset: query.offset,
          })
        ).map(questionBody),
      }),
    );

    app.get(
      '/questions/:id',
      { schema: { params: idParamsSchema, response: { 200: questionDetailSchema } } },
      async ({ params }) => questionDetailBody(await requireQuestion(repositories, params.id)),
    );

    app.post(
      '/questions',
      { schema: { body: createQuestionSchema, response: { 201: questionDetailSchema } } },
      async ({ body }, reply) =>
        reply
          .code(201)
          .send(questionDetailBody(await createQuestion(repositories, questionInputFrom(body)))),
    );

    app.patch(
      '/questions/:id',
      {
        schema: {
          params: idParamsSchema,
          body: patchQuestionSchema,
          response: { 200: questionDetailSchema },
        },
      },
      async ({ params, body }) =>
        questionDetailBody(await updateQuestion(repositories, params.id, questionUpdateFrom(body))),
    );

    app.post(
      '/questions/:id/publish',
      { schema: { params: idParamsSchema, response: { 200: questionSchema } } },
      async ({ params }) =>
        questionBody(await changeQuestionStatus(repositories, params.id, 'published')),
    );

    app.post(
      '/questions/:id/unpublish',
      { schema: { params: idParamsSchema, response: { 200: questionSchema } } },
      async ({ params }) =>
        questionBody(await changeQuestionStatus(repositories, params.id, 'draft')),
    );

    app.post(
      '/questions/:id/archive',
      { schema: { params: idParamsSchema, response: { 200: questionSchema } } },
      async ({ params }) =>
        questionBody(await changeQuestionStatus(repositories, params.id, 'archived')),
    );

    return Promise.resolve();
  };
}

export function tagRoutes({ repositories }: QuestionDependencies): FastifyPluginAsyncZod {
  return (app) => {
    app.get('/tags', { schema: { response: { 200: itemsOf(tagSchema) } } }, async () => ({
      items: (await listTags(repositories)).map(tagBody),
    }));

    app.post(
      '/tags',
      { schema: { body: createTagSchema, response: { 201: tagSchema } } },
      async ({ body }, reply) => reply.code(201).send(tagBody(await createTag(repositories, body))),
    );

    app.patch(
      '/tags/:id',
      { schema: { params: idParamsSchema, body: patchTagSchema, response: { 200: tagSchema } } },
      async ({ params, body }) => tagBody(await updateTag(repositories, params.id, body)),
    );

    return Promise.resolve();
  };
}
