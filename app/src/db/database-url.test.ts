import { describe, expect, it } from 'vitest';

import {
  DatabaseUrlError,
  resolveHostDatabaseUrl,
  resolveTestDatabaseUrl,
  TEST_DATABASE_NAME,
  withDatabase,
} from '@app/db/database-url.js';

const env = {
  MYSQL_USER: 'sidequest',
  MYSQL_PASSWORD: 'secreta',
  MYSQL_DATABASE: 'sidequest',
  MYSQL_ROOT_PASSWORD: 'raiz',
};

describe('resolveHostDatabaseUrl', () => {
  it('apunta al puerto publicado en la máquina anfitriona, no al servicio de Compose', () => {
    expect(resolveHostDatabaseUrl({ ...env, MYSQL_HOST_PORT: '3307' })).toBe(
      'mysql://sidequest:secreta@127.0.0.1:3307/sidequest',
    );
  });

  it('usa el 3306 cuando no se publica otro puerto', () => {
    expect(resolveHostDatabaseUrl(env)).toBe('mysql://sidequest:secreta@127.0.0.1:3306/sidequest');
  });

  it('codifica las credenciales para que un carácter reservado no parta la URL', () => {
    expect(resolveHostDatabaseUrl({ ...env, MYSQL_PASSWORD: 'p@ss/w:rd' })).toBe(
      'mysql://sidequest:p%40ss%2Fw%3Ard@127.0.0.1:3306/sidequest',
    );
  });

  it('deja que DATABASE_URL_HOST la sustituya entera', () => {
    expect(
      resolveHostDatabaseUrl({ ...env, DATABASE_URL_HOST: 'mysql://otro:otra@10.0.0.5:3306/otra' }),
    ).toBe('mysql://otro:otra@10.0.0.5:3306/otra');
  });

  it('enumera todas las variables que faltan, no solo la primera', () => {
    expect(() => resolveHostDatabaseUrl({ MYSQL_USER: 'sidequest' })).toThrow(DatabaseUrlError);

    try {
      resolveHostDatabaseUrl({ MYSQL_USER: 'sidequest' });
    } catch (error) {
      expect((error as DatabaseUrlError).missing).toEqual(['MYSQL_PASSWORD', 'MYSQL_DATABASE']);
    }
  });

  it('trata una variable vacía como ausente', () => {
    expect(() => resolveHostDatabaseUrl({ ...env, MYSQL_DATABASE: '   ' })).toThrow(
      /MYSQL_DATABASE/,
    );
  });
});

describe('resolveTestDatabaseUrl', () => {
  it('usa root y una base propia, para poder crearla y borrarla', () => {
    expect(resolveTestDatabaseUrl({ ...env, MYSQL_HOST_PORT: '3307' })).toBe(
      `mysql://root:raiz@127.0.0.1:3307/${TEST_DATABASE_NAME}`,
    );
  });

  it('devuelve null sin configuración, para que las pruebas se salten en vez de fallar', () => {
    expect(resolveTestDatabaseUrl({})).toBeNull();
  });
});

describe('withDatabase', () => {
  it('cambia la base de la URL', () => {
    expect(withDatabase('mysql://root:raiz@127.0.0.1:3306/una', 'otra')).toBe(
      'mysql://root:raiz@127.0.0.1:3306/otra',
    );
  });

  it('la quita para conectarse antes de crearla', () => {
    expect(withDatabase('mysql://root:raiz@127.0.0.1:3306/una', null)).toBe(
      'mysql://root:raiz@127.0.0.1:3306/',
    );
  });
});
