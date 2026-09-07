import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { settingsBody, settingsSchema } from '@app/api/schemas/settings.js';
import type { Repositories } from '@app/domain/repositories.js';
import { readSettings } from '@app/domain/settings-service.js';

/**
 * Los parámetros globales que gobiernan el sorteo (docs/especificacion.md §5).
 *
 * De momento solo se leen. El panel los necesita para una cosa concreta: enseñar
 * cuántas opciones se mostrarán cuando la pregunta no lo sobrescribe, que es el
 * valor de referencia del editor (docs/decisiones.md §7). El `PATCH` llega con
 * la pantalla que los edita; adelantarlo sería escribir una superficie que
 * todavía no tiene quien la use.
 *
 * La lectura es tolerante por debajo: una fila que falte deja su valor por
 * defecto en su sitio, así que la ruta nunca responde a medias.
 */

export interface SettingsDependencies {
  readonly repositories: Repositories;
}

export function settingsRoutes({ repositories }: SettingsDependencies): FastifyPluginAsyncZod {
  return (app) => {
    app.get('/settings', { schema: { response: { 200: settingsSchema } } }, async () =>
      settingsBody(await readSettings(repositories)),
    );

    return Promise.resolve();
  };
}
