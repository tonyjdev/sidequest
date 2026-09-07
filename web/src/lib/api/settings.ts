import { apiRequest } from '@web/lib/api/client';
import { ApiClientError, isRecord } from '@web/lib/api/errors';

/**
 * Los parámetros globales del sorteo (docs/especificacion.md §3.10). La API los
 * devuelve todos; aquí se valida **solo el que el panel mira hoy**: cuántas
 * opciones se muestran cuando la pregunta no lo sobrescribe, que es el valor de
 * referencia del editor (docs/decisiones.md §7).
 *
 * Exigir los diez ataría la pantalla de preguntas a parámetros que no usa, y
 * cualquiera de ellos que cambiara la dejaría sin cargar. La pantalla de ajustes,
 * cuando exista, leerá los suyos.
 */
export interface PanelSettings {
  readonly visible_options_default: number;
}

export function getSettings(signal?: AbortSignal): Promise<PanelSettings> {
  return apiRequest('/settings', {
    parse: parseSettings,
    ...(signal ? { signal } : {}),
  });
}

function parseSettings(body: unknown): PanelSettings {
  const value = isRecord(body) ? body['visible_options_default'] : undefined;

  if (typeof value !== 'number') {
    throw new ApiClientError(
      'invalid_response',
      'Los parámetros globales no llegaron con la forma esperada',
    );
  }

  return { visible_options_default: value };
}
