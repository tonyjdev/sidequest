import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * El panel construido lo sirve el mismo proceso que la API: un solo contenedor,
 * un solo puerto y ninguna configuración añadida para verlo (SQST-0009).
 *
 * En desarrollo el panel lo sirve Vite y aquí no hay nada que servir; por eso el
 * servidor comprueba si está construido en vez de darlo por hecho.
 */
export const PANEL_INDEX = 'index.html';

/** `web/dist`, junto a la aplicación, tanto en el repositorio como en la imagen. */
export function defaultPanelRoot(): string {
  return fileURLToPath(new URL('../../../web/dist', import.meta.url));
}

export async function panelIsBuilt(root: string): Promise<boolean> {
  try {
    await access(join(root, PANEL_INDEX));

    return true;
  } catch {
    return false;
  }
}

export async function registerPanel(app: FastifyInstance, root: string): Promise<void> {
  await app.register(fastifyStatic, { root, prefix: '/', index: [PANEL_INDEX] });
}

/**
 * Si la petición que no encontró ruta es la de un navegador pidiendo una página,
 * la resuelve el enrutador del panel y hay que devolverle su `index.html`.
 *
 * Lo que cae fuera —la API, el MCP, un recurso que falta, cualquier método que no
 * sea de lectura— sigue recibiendo el envoltorio de error en JSON: un `404` de la
 * API disfrazado de página sería indistinguible de una respuesta correcta.
 */
export function wantsPanelDocument(
  request: FastifyRequest,
  reservedPrefixes: readonly string[],
): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;

  const path = request.url.split('?')[0] ?? request.url;

  if (reservedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }

  return request.headers.accept?.includes('text/html') ?? false;
}
