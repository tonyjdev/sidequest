import { createContext, use } from 'react';

import type { ResolvedTheme, Theme } from '@web/lib/theme/theme';

export interface ThemeContextValue {
  readonly theme: Theme;
  readonly resolved: ResolvedTheme;
  readonly setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = use(ThemeContext);

  if (!value) throw new Error('useTheme necesita estar dentro de <ThemeProvider>');

  return value;
}
