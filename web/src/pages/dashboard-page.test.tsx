import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '@web/pages/dashboard-page';

const healthDocument = {
  status: 'ok',
  app: 'sidequest',
  version: '0.4.2',
  uptime_s: 3 * 3600,
  checks: { database: { status: 'ok', latency_ms: 4 } },
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('panel de control', () => {
  it('espera con un esqueleto y luego enseña el estado de la aplicación', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(healthDocument, 200))),
    );

    render(<DashboardPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    expect(await screen.findByText('Operativa')).toBeInTheDocument();
    expect(screen.getByText('Conectada')).toBeInTheDocument();
    expect(screen.getByText('0.4.2')).toBeInTheDocument();
    expect(screen.getByText('3 h 00 min')).toBeInTheDocument();
  });

  it('enseña el mensaje del servidor, no un fallo genérico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'internal_error',
                message: 'La base de datos no responde',
                details: null,
              },
            },
            500,
          ),
        ),
      ),
    );

    render(<DashboardPage />);

    expect(await screen.findByText('La base de datos no responde')).toBeInTheDocument();
  });

  it('reintenta la carga desde el estado de error', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'internal_error', message: 'Se cayó', details: null } }, 500),
      )
      .mockResolvedValue(jsonResponse(healthDocument, 200));

    vi.stubGlobal('fetch', fetchMock);

    render(<DashboardPage />);

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Operativa')).toBeInTheDocument();
  });
});
