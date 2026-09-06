import { describe, expect, it } from 'vitest';

import * as schema from '@app/db/schema.js';
import {
  contentStatuses,
  difficulties,
  questionTypes,
  resourceKinds,
  settingTypes,
  storageKinds,
} from '@app/domain/types.js';

/**
 * El vocabulario está escrito dos veces —aquí y en el esquema— porque
 * drizzle-kit empaqueta `schema.ts` suelto y no resuelve los alias del
 * proyecto. Esta prueba es lo que impide que las dos copias se separen.
 */
describe('vocabulario del dominio', () => {
  it.each([
    ['estados de contenido', contentStatuses, schema.contentStatuses],
    ['tipos de pregunta', questionTypes, schema.questionTypes],
    ['dificultades', difficulties, schema.difficulties],
    ['tipos de recurso', resourceKinds, schema.resourceKinds],
    ['tipos de almacenamiento', storageKinds, schema.storageKinds],
    ['tipos de parámetro', settingTypes, schema.settingTypes],
  ])('coincide con el esquema en %s', (_name, domain, persisted) => {
    expect([...domain]).toEqual([...persisted]);
  });
});
