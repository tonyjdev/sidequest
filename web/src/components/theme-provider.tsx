import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ThemeContext } from '@web/lib/theme/theme-context';
import {
  DARK_QUERY,
  THEME_STORAGE_KEY,
  applyTheme,
  prefersDark,
  readStoredTheme,
  resolveTheme,
  type Theme,
} from '@web/lib/theme/theme';

interface ThemeProviderProps {
  readonly children: ReactNode;
  readonly defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => defaultTheme ?? readStoredTheme(window.localStorage),
  );
  const [systemDark, setSystemDark] = useState(prefersDark);

  // Mientras se sigue al sistema, un cambio de preferencia del sistema tiene que
  // llegar al panel sin recargarlo.
  useEffect(() => {
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };

    query.addEventListener('change', onChange);

    return () => {
      query.removeEventListener('change', onChange);
    };
  }, [theme]);

  const resolved = resolveTheme(theme, systemDark);

  useEffect(() => {
    applyTheme(document.documentElement, resolved);
  }, [resolved]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Sin almacenamiento el tema dura lo que la pestaña. No es motivo para fallar.
    }
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
