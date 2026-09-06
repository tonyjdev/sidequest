import { readFileSync } from 'node:fs';

import { z } from 'zod';

/** Nombre corto de la aplicación. Lo usan el registro de peticiones y la sonda de salud. */
export const APP_NAME = 'sidequest';

// La versión sale del manifiesto y no de una constante aparte: duplicarla
// garantizaría que un día la sonda informe de una versión que no es la desplegada.
// La ruta vale igual desde `src` que desde `dist`, y la imagen copia el manifiesto.
const manifest = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));

export const APP_VERSION = manifest.version;
