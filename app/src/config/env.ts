import { z } from 'zod';

/**
 * Configuración del proceso, leída del entorno y validada una sola vez al
 * arrancar. Nada la lee de `process.env` por su cuenta: quien la necesita la
 * recibe, para que una variable ausente falle en el arranque y no en la primera
 * petición que la use.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  APP_HOST: z.string().min(1, { error: 'no puede estar vacía' }).default('0.0.0.0'),
  APP_PORT: z.coerce
    .number({ error: 'debe ser un número de puerto' })
    .int({ error: 'debe ser un número entero' })
    .min(1, { error: 'debe estar entre 1 y 65535' })
    .max(65535, { error: 'debe estar entre 1 y 65535' })
    .default(3000),
  APP_PUBLIC_URL: z.url({ error: 'debe ser una URL absoluta' }).default('http://localhost:3000'),

  // Único origen al que la API abre CORS: el panel. Ver docs/especificacion.md §5.
  WEB_PUBLIC_URL: z.url({ error: 'debe ser una URL absoluta' }).default('http://localhost:5173'),

  DATABASE_URL: z
    .string({ error: 'es obligatoria' })
    .refine((value) => value.startsWith('mysql://'), { error: 'debe ser una URL mysql://' }),

  // Firma del attempt_token (docs/especificacion.md §4.4). La consume SQST-0013,
  // pero se exige ya porque compose.yaml también la declara obligatoria: si solo
  // fallara al llegar a esa tarea, el entorno estaría mal desde mucho antes.
  SIDEQUEST_ATTEMPT_SECRET: z
    .string({ error: 'es obligatoria' })
    .min(32, { error: 'debe tener al menos 32 caracteres; genérala con `openssl rand -hex 32`' }),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly publicUrl: string;
  readonly webPublicUrl: string;
  readonly databaseUrl: string;
  readonly attemptSecret: string;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}

/** Falla de configuración: enumera todas las variables mal puestas, no solo la primera. */
export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      [
        'Configuración inválida. Revisa el archivo .env:',
        ...issues.map((issue) => `  - ${issue}`),
      ].join('\n'),
    );
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const values = result.data;

  return {
    env: values.NODE_ENV,
    host: values.APP_HOST,
    port: values.APP_PORT,
    publicUrl: values.APP_PUBLIC_URL,
    webPublicUrl: values.WEB_PUBLIC_URL,
    databaseUrl: values.DATABASE_URL,
    attemptSecret: values.SIDEQUEST_ATTEMPT_SECRET,
    logLevel: values.LOG_LEVEL,
  };
}
