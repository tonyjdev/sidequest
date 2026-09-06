import type { Repositories } from '@app/domain/repositories.js';
import { settingRowsFrom, type SidequestSettings } from '@app/domain/settings.js';

/** Configuración vigente, con los valores por defecto donde falte una fila. */
export function readSettings(repos: Repositories): Promise<SidequestSettings> {
  return repos.settings.read();
}

/**
 * Escritura parcial: `PATCH /settings` manda solo lo que cambia. Se valida clave
 * a clave antes de tocar nada, así que un lote con un valor imposible no deja la
 * configuración a medias.
 */
export async function updateSettings(
  repos: Repositories,
  input: Readonly<Record<string, unknown>>,
): Promise<SidequestSettings> {
  return repos.settings.write(settingRowsFrom(input));
}
