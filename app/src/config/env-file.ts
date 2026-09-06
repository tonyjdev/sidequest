import { fileURLToPath } from 'node:url';

/**
 * Carga el `.env` de la raíz del repositorio en `process.env`.
 *
 * Lo necesitan las herramientas que se ejecutan a mano —migraciones, reversión,
 * sembrado y pruebas de integración—, no el servidor: en Compose las variables
 * vienen ya del entorno del contenedor.
 *
 * La ruta se resuelve desde este módulo y no desde el directorio de trabajo,
 * para que dé igual desde dónde se invoque. Lo que ya venga del entorno tiene
 * precedencia sobre el archivo, que es el comportamiento de `--env-file`.
 */
export function loadRootEnvFile(): void {
  const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));

  try {
    process.loadEnvFile(envFile);
  } catch {
    // Sin `.env` no se falla aquí: puede que las variables ya estén puestas, y
    // quien las necesite fallará nombrando la que falta.
  }
}
