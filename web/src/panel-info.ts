/** Título del panel, mostrado en la cabecera y en el título del documento. */
export const PANEL_TITLE = 'Sidequest';

/**
 * Único comportamiento del andamiaje del panel. La navegación y las pantallas
 * llegan en SQST-0009.
 */
export function describePanel(): string {
  return `${PANEL_TITLE}: andamiaje del panel, todavía sin navegación`;
}
