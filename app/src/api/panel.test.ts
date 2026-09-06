import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ErrorBody } from '@app/api/errors.js';
import { defaultPanelRoot } from '@app/api/panel.js';
import { buildServer } from '@app/api/server.js';
import { loadConfig } from '@app/config/env.js';
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';

const config = loadConfig({
  DATABASE_URL: 'mysql://sidequest:secreta@mysql:3306/sidequest',
  SIDEQUEST_ATTEMPT_SECRET: 'a'.repeat(64),
  LOG_LEVEL: 'silent',
});

const PANEL_HTML = '<!doctype html><title>Sidequest</title>';
const BROWSER = { accept: 'text/html,application/xhtml+xml' };

let panelRoot: string;

async function buildWithPanel(root: string) {
  return buildServer({
    config,
    repositories: createInMemoryRepositories(),
    checkDatabase: () => Promise.resolve({ status: 'ok' as const, latency_ms: 1 }),
    panelRoot: root,
  });
}

beforeAll(async () => {
  panelRoot = await mkdtemp(join(tmpdir(), 'sidequest-panel-'));
  await writeFile(join(panelRoot, 'index.html'), PANEL_HTML);
  await mkdir(join(panelRoot, 'assets'));
  await writeFile(join(panelRoot, 'assets', 'panel.js'), 'export default 1;\n');
});

afterAll(async () => {
  await rm(panelRoot, { recursive: true, force: true });
});

describe('el panel servido por la aplicación', () => {
  it('sirve el documento del panel en la raíz', async () => {
    const app = await buildWithPanel(panelRoot);
    const response = await app.inject({ method: 'GET', url: '/', headers: BROWSER });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Sidequest');
  });

  it('sirve los recursos empaquetados', async () => {
    const app = await buildWithPanel(panelRoot);
    const response = await app.inject({ method: 'GET', url: '/assets/panel.js' });

    await app.close();

    expect(response.statusCode).toBe(200);
  });

  it('devuelve el mismo documento en las rutas del enrutador del panel', async () => {
    const app = await buildWithPanel(panelRoot);
    const response = await app.inject({ method: 'GET', url: '/preguntas', headers: BROWSER });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Sidequest');
  });

  it('no disfraza de página un 404 de la API', async () => {
    const app = await buildWithPanel(panelRoot);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/no-existe',
      headers: BROWSER,
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorBody>().error.code).toBe('not_found');
  });

  it('no disfraza de página un recurso que falta', async () => {
    const app = await buildWithPanel(panelRoot);
    const response = await app.inject({ method: 'GET', url: '/assets/ausente.js' });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorBody>().error.code).toBe('not_found');
  });

  it('solo responde con el panel a las lecturas del navegador', async () => {
    const app = await buildWithPanel(panelRoot);
    const response = await app.inject({ method: 'POST', url: '/preguntas', headers: BROWSER });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorBody>().error.code).toBe('not_found');
  });

  it('sin panel construido, la API sigue respondiendo por su cuenta', async () => {
    const app = await buildWithPanel(join(panelRoot, 'sin-construir'));

    const page = await app.inject({ method: 'GET', url: '/', headers: BROWSER });
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });

    await app.close();

    expect(page.statusCode).toBe(404);
    expect(page.json<ErrorBody>().error.code).toBe('not_found');
    expect(health.statusCode).toBe(200);
  });
});

describe('defaultPanelRoot', () => {
  it('apunta al panel construido que acompaña a la aplicación', () => {
    expect(defaultPanelRoot().endsWith(join('web', 'dist'))).toBe(true);
  });
});
