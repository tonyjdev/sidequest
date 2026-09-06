/**
 * Contrato de error de la API: un único envelope
 * `{ error: { code, message, details } }` para toda respuesta que no sea 2xx.
 * Ver docs/especificacion.md §5.
 *
 * El mapa es cerrado a propósito. Añadir un código es una decisión de contrato,
 * no un detalle de implementación de un endpoint.
 */
export const ERROR_STATUS = {
  validation_failed: 422,
  not_found: 404,
  conflict: 409,
  internal_error: 500,
} as const;

export type ApiErrorCode = keyof typeof ERROR_STATUS;

/** Detalle de un campo que no pasó la validación. */
export interface FieldIssue {
  readonly field: string;
  readonly message: string;
}

export interface ErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly details: unknown;
  };
}

/**
 * Error que el manejador único traduce a su estado HTTP y a su envelope. El
 * dominio y los repositorios lo lanzan; los controladores no capturan nada.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get statusCode(): number {
    return ERROR_STATUS[this.code];
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}
