import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Localización y lectura de las migraciones. Lo comparten el migrador, la
 * reversión y las pruebas de integración, para que los tres miren la misma
 * carpeta.
 */

/** Carpeta que genera drizzle-kit, resuelta desde este módulo y no desde el cwd. */
export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Tabla donde drizzle anota lo aplicado. El nombre lo fija drizzle-orm. */
export const migrationsTable = '__drizzle_migrations';

/** Separador con el que drizzle parte un archivo en sentencias. */
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

interface JournalEntry {
  readonly idx: number;
  readonly when: number;
  readonly tag: string;
}

interface Journal {
  readonly entries: readonly JournalEntry[];
}

/** Migraciones declaradas, en orden de aplicación. */
export function readJournal(): readonly JournalEntry[] {
  const journal = JSON.parse(
    readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8'),
  ) as Journal;

  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

/**
 * Sentencias de la reversión de una migración.
 *
 * drizzle-kit no genera el `down`: cada migración lleva el suyo escrito a mano
 * en `drizzle/down/`, y su ausencia es un error, no una migración irreversible
 * en silencio.
 */
export function readDownStatements(tag: string): readonly string[] {
  const path = `${migrationsFolder}/down/${tag}.down.sql`;

  let content: string;

  try {
    content = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`La migración ${tag} no tiene reversión: falta ${path}`);
  }

  return splitStatements(content);
}

/** Parte el contenido de un archivo SQL en sentencias ejecutables. */
export function splitStatements(content: string): readonly string[] {
  return content
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => stripComments(statement).trim())
    .filter((statement) => statement !== '');
}

// Los comentarios de línea se quitan antes de medir si la sentencia está vacía:
// un archivo que solo comenta no debe llegar al servidor como sentencia.
function stripComments(statement: string): string {
  return statement
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}
