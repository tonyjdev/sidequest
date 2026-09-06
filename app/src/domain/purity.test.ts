import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

/**
 * El criterio de aceptación de SQST-0006 escrito como prueba: el dominio no
 * importa la API, ni el MCP, ni Drizzle. Si un día alguien mete un `import` de
 * `drizzle-orm` para «solo esta consulta», esta prueba lo dice antes que la
 * revisión.
 */
const FORBIDDEN = [/drizzle-orm/, /mysql2/, /fastify/, /@app\/db\//, /@app\/api\//, /@app\/mcp\//];

const IMPORT_LINE = /^\s*import[^;]*from\s+'([^']+)'/gmu;

describe('pureza de la capa de dominio', () => {
  it('no importa la persistencia, la API ni el MCP', async () => {
    const offenders: string[] = [];

    for (const file of await domainFiles()) {
      // Las pruebas sí pueden mirar al otro lado: comparan las dos copias del
      // vocabulario y ejercitan los adaptadores.
      if (file.endsWith('.test.ts')) continue;

      const source = await readFile(file, 'utf8');

      for (const [, specifier] of source.matchAll(IMPORT_LINE)) {
        if (specifier !== undefined && FORBIDDEN.some((pattern) => pattern.test(specifier))) {
          offenders.push(`${file}: ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

async function domainFiles(): Promise<string[]> {
  const root = new URL('.', import.meta.url).pathname;
  const entries = await readdir(root, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => `${entry.parentPath}/${entry.name}`);
}
