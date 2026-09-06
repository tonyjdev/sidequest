/** Nombre corto de la aplicación. Lo usarán el registro de peticiones y la sonda de salud. */
export const APP_NAME = 'sidequest';

/**
 * Único comportamiento del andamiaje: confirma que el paquete compila y se ejecuta.
 * Las superficies HTTP y MCP llegan en SQST-0004 y SQST-0020.
 */
export function describeApp(): string {
  return `${APP_NAME}: andamiaje listo, todavía sin superficies HTTP`;
}
