import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeToggle } from '@web/components/layout/theme-toggle';
import { ThemeProvider } from '@web/components/theme-provider';
import { THEME_STORAGE_KEY } from '@web/lib/theme/theme';

afterEach(() => {
  window.localStorage.removeItem(THEME_STORAGE_KEY);
  window.document.documentElement.classList.remove('dark');
});

describe('tema del panel', () => {
  it('cambia a oscuro y recuerda la elección', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider defaultTheme="light">
        <ThemeToggle />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Activar el tema oscuro' }));

    expect(window.document.documentElement).toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'Activar el tema claro' })).toBeInTheDocument();
  });

  it('arranca en el tema guardado', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(window.document.documentElement).toHaveClass('dark');
  });
});
