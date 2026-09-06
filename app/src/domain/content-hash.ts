import { createHash } from 'node:crypto';

/**
 * `questions.content_hash`: sha256 del enunciado normalizado
 * (docs/especificacion.md §3.4).
 *
 * Sirve para avisar de duplicados al importar, no para impedirlos: el índice
 * `(subtopic_id, content_hash)` no es único a propósito. La normalización
 * absorbe las diferencias que no cambian la pregunta —espacios de más, saltos
 * de línea, mayúsculas— y nada más: dos enunciados con distinta puntuación son
 * dos preguntas distintas.
 */
export function contentHashOf(statement: string): string {
  return createHash('sha256').update(normalize(statement)).digest('hex');
}

function normalize(statement: string): string {
  return statement.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}
