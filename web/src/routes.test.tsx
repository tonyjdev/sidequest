import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@web/components/theme-provider';
import { navigationItems } from '@web/navigation';
import { panelRoutes } from '@web/routes';

const healthDocument = {
  status: 'ok',
  app: 'sidequest',
  version: '0.1.0',
  uptime_s: 30,
  checks: { database: { status: 'ok', latency_ms: 2 } },
};

function renderPanel(path = '/') {
  const router = createMemoryRouter(panelRoutes, { initialEntries: [path] });

  render(
    <ThemeProvider defaultTheme="light">
      <RouterProvider router={router} />
    </ThemeProvider>,
  );

  return router;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(healthDocument), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rutas del panel', () => {
  it('abre las cinco secciones desde la navegación sin recargar la página', async () => {
    const user = userEvent.setup();

    renderPanel();

    // El armazón se monta una vez: si navegar recargara, la cabecera sería otra.
    const shell = screen.getByRole('banner');

    for (const item of navigationItems) {
      await user.click(screen.getByRole('link', { name: item.label }));

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(item.label);
      expect(screen.getByRole('banner')).toBe(shell);
    }
  });

  it('marca la sección abierta en la navegación', async () => {
    const user = userEvent.setup();

    renderPanel();
    await user.click(screen.getByRole('link', { name: 'Preguntas' }));

    expect(screen.getByRole('link', { name: 'Preguntas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Temas' })).not.toHaveAttribute('aria-current');
  });

  it('cada sección dice qué tarea trae su contenido', () => {
    renderPanel('/importacion');

    expect(screen.getByText('SQST-0019')).toBeInTheDocument();
  });

  it('una dirección que no existe se resuelve dentro del panel', () => {
    renderPanel('/no-existe');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sección no encontrada');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
