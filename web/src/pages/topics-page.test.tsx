import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TopicsPage } from '@web/pages/topics-page';

/**
 * La pantalla de contenido contra la API, con `fetch` sustituido: se comprueba
 * lo que se dibuja, lo que se envía y qué se enseña cuando el servidor rechaza.
 */

const subjects = [
  {
    id: 1,
    slug: 'matematicas',
    name: 'Matemáticas',
    description: null,
    status: 'published',
    position: 1,
  },
];

const topics = [
  {
    id: 10,
    slug: 'algebra',
    name: 'Álgebra',
    description: null,
    status: 'draft',
    position: 1,
    subject_id: 1,
  },
  {
    id: 11,
    slug: 'geometria',
    name: 'Geometría',
    description: null,
    status: 'archived',
    position: 2,
    subject_id: 1,
  },
];

const subtopics = [
  {
    id: 100,
    slug: 'ecuaciones',
    name: 'Ecuaciones',
    description: null,
    status: 'draft',
    position: 1,
    topic_id: 10,
    question_count: 12,
  },
];

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

let calls: Call[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Las lecturas devuelven el catálogo; las escrituras, un nodo, salvo que la prueba diga otra cosa. */
function stubApi(reject?: (url: string, method: string) => Response | undefined): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      calls.push({
        url: input,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      });

      const rejected = reject?.(input, method);

      if (rejected) return Promise.resolve(rejected);

      if (method === 'GET') {
        if (input.startsWith('/api/v1/subjects'))
          return Promise.resolve(jsonResponse({ items: subjects }));
        if (input.startsWith('/api/v1/topics'))
          return Promise.resolve(jsonResponse({ items: topics }));

        return Promise.resolve(jsonResponse({ items: subtopics }));
      }

      if (input.endsWith('/reorder')) return Promise.resolve(jsonResponse({ items: topics }));

      return Promise.resolve(jsonResponse(subjects[0]));
    }),
  );
}

function writes(): Call[] {
  return calls.filter((call) => call.method !== 'GET');
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gestión de temas y subtemas', () => {
  it('dibuja los tres niveles con su estado y su recuento de preguntas', async () => {
    stubApi();

    render(<TopicsPage />);

    expect(await screen.findByText('Matemáticas')).toBeInTheDocument();
    expect(screen.getByText('Álgebra')).toBeInTheDocument();
    expect(screen.getByText('Ecuaciones')).toBeInTheDocument();
    // El recuento sale dos veces: en el subtema y en el tema, que suma los suyos.
    expect(screen.getAllByText('12 preguntas')).toHaveLength(2);
    expect(screen.getByText('Archivado')).toBeInTheDocument();
  });

  it('enseña el motivo del servidor cuando la cadena de publicación lo impide', async () => {
    const user = userEvent.setup();
    const motivo = 'No se puede publicar un subtema cuyo tema no está publicado';

    stubApi((url) =>
      url.endsWith('/subtopics/100/publish')
        ? jsonResponse({ error: { code: 'conflict', message: motivo, details: null } }, 409)
        : undefined,
    );

    render(<TopicsPage />);

    await user.click(await screen.findByRole('button', { name: 'Publicar el subtema Ecuaciones' }));

    expect(await screen.findByText(motivo)).toBeInTheDocument();
  });

  it('propone el slug a partir del nombre y crea la materia', async () => {
    const user = userEvent.setup();

    stubApi();

    render(<TopicsPage />);

    await user.click(await screen.findByRole('button', { name: 'Nueva materia' }));
    await user.type(screen.getByLabelText('Nombre'), 'Ciencias Naturales');

    expect(screen.getByLabelText('Slug')).toHaveValue('ciencias-naturales');

    await user.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => {
      expect(writes()).toHaveLength(1);
    });

    expect(writes()[0]).toMatchObject({
      url: '/api/v1/subjects',
      method: 'POST',
      body: { slug: 'ciencias-naturales', name: 'Ciencias Naturales', description: null },
    });
  });

  it('rechaza en el formulario lo que el servidor rechazaría, sin gastar la petición', async () => {
    const user = userEvent.setup();

    stubApi();

    render(<TopicsPage />);

    await user.click(await screen.findByRole('button', { name: 'Nuevo tema' }));
    await user.type(screen.getByLabelText('Nombre'), 'Álgebra lineal');
    await user.clear(screen.getByLabelText('Slug'));
    await user.type(screen.getByLabelText('Slug'), 'Con Espacios');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(
      await screen.findByText(
        'El slug solo admite minúsculas, dígitos y guiones simples, sin empezar ni terminar en guión',
      ),
    ).toBeInTheDocument();
    expect(writes()).toEqual([]);
  });

  it('archiva desde el listado avisando de hasta dónde baja', async () => {
    const user = userEvent.setup();

    stubApi();

    render(<TopicsPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Archivar la materia Matemáticas' }),
    );

    expect(
      await screen.findByText(/Se archivarán con ella todos sus temas y todos sus subtemas/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Archivar' }));

    await waitFor(() => {
      expect(writes()).toHaveLength(1);
    });

    expect(writes()[0]).toMatchObject({ url: '/api/v1/subjects/1/archive', method: 'POST' });
  });

  it('reordena enviando todos los hermanos, archivados incluidos, y recarga el listado', async () => {
    const user = userEvent.setup();

    stubApi();

    render(<TopicsPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Ordenar los temas de Matemáticas' }),
    );
    await user.click(screen.getByRole('button', { name: 'Bajar Álgebra' }));
    await user.click(screen.getByRole('button', { name: 'Guardar orden' }));

    await waitFor(() => {
      expect(writes()).toHaveLength(1);
    });

    expect(writes()[0]).toMatchObject({
      url: '/api/v1/topics/reorder',
      method: 'POST',
      body: { subject_id: 1, ids: [11, 10] },
    });

    // El listado se vuelve a pedir: lo que se ve sale de la API, no del cliente.
    await waitFor(() => {
      expect(calls.filter((call) => call.url === '/api/v1/topics')).toHaveLength(2);
    });
  });

  it('el filtro por estado esconde lo que no casa y lo dice', async () => {
    const user = userEvent.setup();

    stubApi();

    render(<TopicsPage />);

    await user.click(await screen.findByRole('button', { name: 'Publicados' }));

    expect(screen.getByText('Matemáticas')).toBeInTheDocument();
    expect(screen.queryByText('Ecuaciones')).not.toBeInTheDocument();
    expect(screen.getByText('Ningún tema con ese estado.')).toBeInTheDocument();
  });

  it('explica qué falta cuando no hay ni una materia', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ items: [] }))),
    );

    render(<TopicsPage />);

    expect(await screen.findByText('Todavía no hay materias')).toBeInTheDocument();
  });
});
