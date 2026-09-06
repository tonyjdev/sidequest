/**
 * Tema del panel. Tres valores porque el que manda por defecto no es una
 * elección del usuario: hasta que toca el interruptor se sigue al sistema, y esa
 * diferencia hay que poder guardarla.
 */
export const themes = ['light', 'dark', 'system'] as const;

export type Theme = (typeof themes)[number];
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'sidequest.theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isTheme(value: unknown): value is Theme {
  return themes.includes(value as Theme);
}

export function readStoredTheme(storage: Pick<Storage, 'getItem'>): Theme {
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);

    return isTheme(stored) ? stored : 'system';
  } catch {
    // Un navegador con el almacenamiento bloqueado no debe dejar el panel a oscuras.
    return 'system';
  }
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';

  return theme;
}

/** shadcn/ui pinta el tema oscuro con la clase `dark` en la raíz del documento. */
export function applyTheme(root: HTMLElement, resolved: ResolvedTheme): void {
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

export function prefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}
