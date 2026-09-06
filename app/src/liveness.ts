import { createServer, type Server } from 'node:http';

import { APP_NAME } from '@app/app-info.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

/**
 * Sonda de vida provisional. El contenedor necesita un proceso que no termine y
 * una ruta que probar; SQST-0004 la sustituye por Fastify y por
 * `GET /api/v1/health`, que además comprobará la base de datos.
 */
export function createLivenessServer(): Server {
  return createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, JSON_HEADERS);
      response.end(JSON.stringify({ status: 'ok', app: APP_NAME }));
      return;
    }

    response.writeHead(404, JSON_HEADERS);
    response.end(JSON.stringify({ error: { code: 'not_found', message: 'Ruta no encontrada' } }));
  });
}
