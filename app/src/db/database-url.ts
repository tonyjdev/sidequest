/**
 * URL de conexión para las herramientas que se ejecutan **en la máquina
 * anfitriona**: migraciones, reversión, sembrado, `drizzle-kit` y las pruebas
 * de integración.
 *
 * `DATABASE_URL` no sirve para eso: apunta al servicio `mysql` dentro de la red
 * de Compose, un nombre que solo resuelve dentro de un contenedor. Fuera se
 * llega por el puerto publicado, que es justo para lo que existe
 * `MYSQL_HOST_PORT` (ver docs/development/docker.md).
 *
 * Sin dependencias del resto de la aplicación: `drizzle.config.ts` importa este
 * módulo y drizzle-kit lo empaqueta por su cuenta.
 */

const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_HOST_PORT = '3306';

/** Base separada para las pruebas: nunca se toca la base de desarrollo. */
export const TEST_DATABASE_NAME = 'sidequest_test';

export type Env = Record<string, string | undefined>;

/** Falta configuración para construir la URL. Nombra todas las variables, no la primera. */
export class DatabaseUrlError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      [
        'No se puede construir la URL de conexión desde la máquina anfitriona.',
        'Faltan variables en el archivo .env:',
        ...missing.map((name) => `  - ${name}`),
      ].join('\n'),
    );
    this.name = 'DatabaseUrlError';
  }
}

/**
 * URL de la base de la aplicación vista desde fuera de Compose.
 *
 * `DATABASE_URL_HOST` la sobrescribe entera, para quien ejecute las migraciones
 * desde otro sitio —un contenedor, un servidor de integración— sin publicar el
 * puerto.
 */
export function resolveHostDatabaseUrl(env: Env): string {
  const override = trimmed(env.DATABASE_URL_HOST);

  if (override !== undefined) {
    return override;
  }

  const user = trimmed(env.MYSQL_USER);
  const password = trimmed(env.MYSQL_PASSWORD);
  const database = trimmed(env.MYSQL_DATABASE);

  const missing = [
    ['MYSQL_USER', user],
    ['MYSQL_PASSWORD', password],
    ['MYSQL_DATABASE', database],
  ]
    .filter(([, value]) => value === undefined)
    .map(([name]) => name as string);

  if (missing.length > 0) {
    throw new DatabaseUrlError(missing);
  }

  return buildUrl({
    user: user as string,
    password: password as string,
    port: hostPort(env),
    database: database as string,
  });
}

/**
 * URL para las pruebas de integración: usuario `root`, porque crea y borra su
 * propia base. Devuelve `null` cuando no hay con qué construirla, y así las
 * pruebas se saltan en lugar de fallar en un entorno sin MySQL.
 */
export function resolveTestDatabaseUrl(env: Env): string | null {
  const override = trimmed(env.TEST_DATABASE_URL);

  if (override !== undefined) {
    return override;
  }

  const password = trimmed(env.MYSQL_ROOT_PASSWORD);

  if (password === undefined) {
    return null;
  }

  return buildUrl({
    user: 'root',
    password,
    port: hostPort(env),
    database: TEST_DATABASE_NAME,
  });
}

/**
 * La misma URL apuntando a otra base, o a ninguna con `null`, que es como se
 * conecta quien va a crearla o borrarla.
 */
export function withDatabase(url: string, database: string | null): string {
  const parsed = new URL(url);

  parsed.pathname = database === null ? '/' : `/${encodeURIComponent(database)}`;

  return parsed.toString();
}

function buildUrl(parts: {
  user: string;
  password: string;
  port: string;
  database: string;
}): string {
  // Las credenciales se codifican: una contraseña con `@` o `/` partiría la URL.
  const user = encodeURIComponent(parts.user);
  const password = encodeURIComponent(parts.password);

  return `mysql://${user}:${password}@${LOOPBACK_HOST}:${parts.port}/${parts.database}`;
}

function hostPort(env: Env): string {
  return trimmed(env.MYSQL_HOST_PORT) ?? DEFAULT_HOST_PORT;
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();

  return result === undefined || result === '' ? undefined : result;
}
