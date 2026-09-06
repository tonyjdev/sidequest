import { describe, expect, it } from 'vitest';

import { ApiError, ERROR_STATUS } from '@app/api/errors.js';

describe('mapa de códigos de error', () => {
  it('es el mapa inicial de la especificación, sin códigos de más', () => {
    expect(ERROR_STATUS).toEqual({
      validation_failed: 422,
      not_found: 404,
      conflict: 409,
      internal_error: 500,
    });
  });
});

describe('ApiError', () => {
  it('deriva el estado HTTP de su código', () => {
    expect(new ApiError('not_found', 'No está').statusCode).toBe(404);
    expect(new ApiError('conflict', 'Ya existe').statusCode).toBe(409);
    expect(new ApiError('validation_failed', 'Mal').statusCode).toBe(422);
    expect(new ApiError('internal_error', 'Vaya').statusCode).toBe(500);
  });

  it('serializa al envelope de tres claves, con details nulo cuando no hay nada que añadir', () => {
    expect(new ApiError('conflict', 'Ya existe').toBody()).toEqual({
      error: { code: 'conflict', message: 'Ya existe', details: null },
    });
  });

  it('conserva los detalles por campo cuando los lleva', () => {
    const details = [{ field: 'name', message: 'es obligatorio' }];

    expect(new ApiError('validation_failed', 'Datos inválidos', details).toBody()).toEqual({
      error: { code: 'validation_failed', message: 'Datos inválidos', details },
    });
  });

  it('sigue siendo un Error, para poder lanzarlo desde el dominio', () => {
    expect(new ApiError('not_found', 'No está')).toBeInstanceOf(Error);
  });
});
