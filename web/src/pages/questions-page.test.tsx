import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuestionsPage } from '@web/pages/questions-page';

/**
 * La pantalla de preguntas contra la API, con `fetch` sustituido: se comprueba
 * lo que se dibuja, lo que se envía y qué pasa cuando el servidor rechaza.
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
    status: 'published',
    position: 1,
    subject_id: 1,
  },
];

const subtopics = [
  {
    id: 100,
    slug: 'ecuaciones',
    name: 'Ecuaciones',
    description: null,
    status: 'published',
    position: 1,
    topic_id: 10,
    question_count: 2,
  },
];

const tags = [{ id: 5, slug: 'basico', name: 'Básico', created_at: '2026-09-06T10:00:00.000Z' }];

const settings = {
  visible_options_default: 4,
  weight_new_boost: 10,
  weight_maturity_days: 30,
  weight_failure: 1.5,
  weight_difficulty_easy: 1,
  weight_difficulty_medium: 1,
  weight_difficulty_hard: 1,
  cooldown_hours: 24,
  attempt_token_ttl_seconds: 300,
  session_max_questions: 20,
};

const single = {
  id: 1,
  subtopic_id: 100,
  type: 'single',
  statement: '¿Cuál es la solución de 2x + 6 = 0?',
  explanation: null,
  difficulty: 'medium',
  status: 'draft',
  visible_options: null,
  version: 1,
  content_hash: 'a'.repeat(64),
  created_at: '2026-09-06T10:00:00.000Z',
  updated_at: '2026-09-06T10:00:00.000Z',
};

const multiple = {
  ...single,
  id: 2,
  type: 'multiple',
  statement: '¿Qué números son primos?',
  status: 'published',
  visible_options: 3,
};

const singleDetail = {
  ...single,
  options: [
    { id: 11, text: 'x = −3', is_correct: true, position: 1 },
    { id: 12, text: 'x = 3', is_correct: false, position: 2 },
  ],
  resources: [],
  tags: [],
};

const multipleDetail = {
  ...multiple,
  options: [
    { id: 21, text: '2', is_correct: true, position: 1 },
    { id: 22, text: '3', is_correct: true, position: 2 },
    { id: 23, text: '4', is_correct: false, position: 3 },
  ],
  resources: [],
  tags: [],
};

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

/** Las lecturas responden el catálogo; las escrituras devuelven la ficha, salvo que la prueba diga otra cosa. */
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
        if (input.startsWith('/api/v1/subtopics'))
          return Promise.resolve(jsonResponse({ items: subtopics }));
        if (input.startsWith('/api/v1/tags')) return Promise.resolve(jsonResponse({ items: tags }));
        if (input.startsWith('/api/v1/settings')) return Promise.resolve(jsonResponse(settings));
        if (input.startsWith('/api/v1/questions/2'))
          return Promise.resolve(jsonResponse(multipleDetail));
        if (input.startsWith('/api/v1/questions/1'))
          return Promise.resolve(jsonResponse(singleDetail));

        return Promise.resolve(jsonResponse({ items: [single, multiple] }));
      }

      if (input.startsWith('/api/v1/tags')) {
        return Promise.resolve(jsonResponse({ id: 6, slug: 'nuevo', name: 'Nuevo' }, 201));
      }

      if (
        input.includes('/publish') ||
        input.includes('/unpublish') ||
        input.includes('/archive')
      ) {
        return Promise.resolve(jsonResponse(single));
      }

      return Promise.resolve(jsonResponse(singleDetail));
    }),
  );
}

function writes(): Call[] {
  return calls.filter((call) => call.method !== 'GET');
}

function listCalls(): Call[] {
  return calls.filter((call) => call.method === 'GET' && call.url.startsWith('/api/v1/questions?'));
}

async function openEditor(name: RegExp): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name }));
  await screen.findByRole('dialog');
  await screen.findByLabelText('Enunciado');
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gestión de preguntas', () => {
  it('dibuja el listado con su ruta de subtema, su tipo y su estado', async () => {
    stubApi();
    render(<QuestionsPage />);

    expect(await screen.findByText('¿Cuál es la solución de 2x + 6 = 0?')).toBeInTheDocument();
    expect(screen.getAllByText('Matemáticas › Álgebra › Ecuaciones')).toHaveLength(2);
    expect(screen.getByText('Publicada')).toBeInTheDocument();
    expect(screen.getByText('Borrador')).toBeInTheDocument();
    expect(screen.getByText('Selección múltiple')).toBeInTheDocument();
    expect(screen.getByText('3 opciones visibles')).toBeInTheDocument();
  });

  it('filtra por estado y busca en el enunciado con el servidor', async () => {
    stubApi();
    render(<QuestionsPage />);

    await screen.findByText('¿Qué números son primos?');
    await userEvent.click(screen.getByRole('button', { name: 'Publicadas' }));

    await waitFor(() => {
      expect(listCalls().at(-1)?.url).toContain('status=published');
    });

    await userEvent.type(screen.getByLabelText('Buscar en el enunciado'), 'primos');

    await waitFor(() => {
      expect(listCalls().at(-1)?.url).toContain('search=primos');
    });
  });

  it('publica una pregunta desde su fila', async () => {
    stubApi();
    render(<QuestionsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /^Publicar «¿Cuál/u }));

    await waitFor(() => {
      expect(writes()[0]).toMatchObject({ url: '/api/v1/questions/1/publish', method: 'POST' });
    });
  });

  it('edita el agregado entero y lo guarda en una sola llamada', async () => {
    stubApi();
    render(<QuestionsPage />);
    await openEditor(/^Editar «¿Cuál/u);

    await userEvent.type(screen.getByLabelText('Texto de la opción 2'), ' exactamente');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(writes()[0]).toMatchObject({ url: '/api/v1/questions/1', method: 'PATCH' });
    });

    expect(writes()[0]?.body).toMatchObject({
      subtopic_id: 100,
      type: 'single',
      options: [
        { text: 'x = −3', is_correct: true },
        { text: 'x = 3 exactamente', is_correct: false },
      ],
      resources: [],
      tag_ids: [],
    });
  });

  it('avisa al pasar de múltiple a única con más de una correcta, sin desmarcar nada', async () => {
    stubApi();
    render(<QuestionsPage />);
    await openEditor(/^Editar «¿Qué números/u);

    expect(screen.getByLabelText('La opción 1 es correcta')).toBeChecked();
    await userEvent.click(screen.getByLabelText('Selección única'));

    expect(await screen.findByText('Hay 2 opciones marcadas como correctas')).toBeInTheDocument();
    expect(screen.getAllByText('marcada')).toHaveLength(2);

    // Elegir una la resuelve: esa queda como única correcta.
    await userEvent.click(screen.getByLabelText('La opción 3 es la correcta'));
    expect(screen.queryByText('Hay 2 opciones marcadas como correctas')).not.toBeInTheDocument();
  });

  it('conserva lo escrito cuando el servidor rechaza el guardado', async () => {
    stubApi((_url, method) =>
      method === 'PATCH'
        ? jsonResponse(
            {
              error: {
                code: 'validation_failed',
                message: 'El enunciado no puede estar vacío',
                details: [{ field: 'statement', message: 'obligatorio' }],
              },
            },
            422,
          )
        : undefined,
    );
    render(<QuestionsPage />);
    await openEditor(/^Editar «¿Cuál/u);

    await userEvent.type(screen.getByLabelText('Explicación'), 'Se despeja la x.');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El enunciado no puede estar vacío')).toBeInTheDocument();
    expect(screen.getByLabelText('Explicación')).toHaveValue('Se despeja la x.');
    expect(screen.getByLabelText('Enunciado')).toHaveValue('¿Cuál es la solución de 2x + 6 = 0?');
  });

  it('enseña la vista previa con las opciones que se mostrarían y el valor global', async () => {
    stubApi();
    render(<QuestionsPage />);
    await openEditor(/^Editar «¿Cuál/u);

    const preview = screen.getByLabelText('Vista previa en la terminal');

    expect(within(preview).getByText(/x = −3/u)).toBeInTheDocument();
    expect(within(preview).getByText(/Se mostrarían 2 de 2 opciones/u)).toBeInTheDocument();
    expect(screen.getByText('En blanco usa el valor global, que ahora es 4.')).toBeInTheDocument();
  });

  it('no deja crear preguntas sin invariantes de publicación cumplidas', async () => {
    stubApi();
    render(<QuestionsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Nueva pregunta' }));
    await screen.findByLabelText('Enunciado');

    await userEvent.type(screen.getByLabelText('Enunciado'), '¿Cuánto es 2 + 2?');
    await userEvent.type(screen.getByLabelText('Texto de la opción 1'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la opción 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y publicar' }));

    expect(
      await screen.findByText('Una pregunta publicada necesita al menos dos opciones'),
    ).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('crea una etiqueta desde el editor y la deja enganchada', async () => {
    stubApi();
    render(<QuestionsPage />);
    await openEditor(/^Editar «¿Cuál/u);

    await userEvent.type(screen.getByLabelText('Nueva etiqueta'), 'Nuevo');
    await userEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));

    await waitFor(() => {
      expect(writes()[0]).toMatchObject({ url: '/api/v1/tags', method: 'POST' });
    });

    expect(screen.getByRole('button', { name: 'Nuevo' })).toHaveAttribute('aria-pressed', 'true');
  });
});
