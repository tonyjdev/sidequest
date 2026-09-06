/**
 * Errores del dominio. Llevan la razón por la que la operación no es válida, no
 * el estado HTTP con el que se contesta: la traducción está en un único punto,
 * `toApiError` de `api/server.ts`, y el MCP hará la suya sin repetir reglas.
 */

/**
 * - `invalid`: los datos rompen una invariante del modelo.
 * - `not_found`: se referencia algo que no existe.
 * - `conflict`: choca con el estado actual —un slug repetido, publicar bajo un
 *   padre que aún no está publicado—.
 */
export type DomainErrorKind = 'invalid' | 'not_found' | 'conflict';

export class DomainError extends Error {
  constructor(
    readonly kind: DomainErrorKind,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Una invariante del modelo no se cumple. */
export class InvariantError extends DomainError {
  constructor(message: string, details: unknown = null) {
    super('invalid', message, details);
    this.name = 'InvariantError';
  }
}

/** Se referencia contenido que no existe. */
export class NotFoundError extends DomainError {
  constructor(message: string, details: unknown = null) {
    super('not_found', message, details);
    this.name = 'NotFoundError';
  }
}

/** La operación choca con el estado actual del contenido. */
export class ConflictError extends DomainError {
  constructor(message: string, details: unknown = null) {
    super('conflict', message, details);
    this.name = 'ConflictError';
  }
}
