import { ListChecks, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { PageHeader } from '@web/components/layout/page-header';
import type { QuestionIntent } from '@web/components/questions/intents';
import { QuestionEditorDialog } from '@web/components/questions/question-editor-dialog';
import { QuestionFilters } from '@web/components/questions/question-filters';
import { QuestionList } from '@web/components/questions/question-list';
import type { SaveMode } from '@web/components/questions/question-form';
import { AsyncResourceView } from '@web/components/state/async-resource-view';
import { EmptyState } from '@web/components/state/empty-state';
import { ErrorState } from '@web/components/state/error-state';
import { Button } from '@web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@web/components/ui/card';
import { useAsyncResource } from '@web/hooks/use-async-resource';
import { useDebouncedValue } from '@web/hooks/use-debounced-value';
import { getContentCatalog } from '@web/lib/api/content';
import { asApiClientError, type ApiClientError } from '@web/lib/api/errors';
import {
  changeQuestionStatus,
  createQuestion,
  createTag,
  listQuestions,
  listTags,
  updateQuestion,
  type QuestionInput,
  type Tag,
} from '@web/lib/api/questions';
import { getSettings } from '@web/lib/api/settings';
import { buildSubtopicPaths } from '@web/lib/content-tree';
import { EMPTY_FILTERS, isFiltered, type QuestionFilterState } from '@web/lib/question-filters';

/**
 * Gestión de preguntas (docs/especificacion.md §8.2). Es la pantalla más rica
 * del panel porque la pregunta es un agregado: se edita entera —con sus
 * opciones, sus recursos y sus etiquetas— y se guarda de una vez.
 *
 * Dos cargas separadas y una razón para cada una:
 *
 * - **El contexto** —catálogo, etiquetas y parámetros globales— se pide una vez:
 *   nombra los subtemas, llena los filtros y dice cuántas opciones se mostrarán
 *   cuando la pregunta no lo diga.
 * - **El listado** se vuelve a pedir con cada filtro, porque filtrar y paginar
 *   los hace el servidor (docs/development/api.md).
 */

const PAGE_SIZE = 25;

interface EditorState {
  /** `null` es un alta. */
  readonly questionId: number | null;
}

export function QuestionsPage() {
  const loadContext = useCallback(async (signal: AbortSignal) => {
    const [catalog, tags, settings] = await Promise.all([
      getContentCatalog(signal),
      listTags(signal),
      getSettings(signal),
    ]);

    return { catalog, tags, settings };
  }, []);
  const context = useAsyncResource(loadContext);

  const [filters, setFilters] = useState<QuestionFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [actionError, setActionError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState(false);
  // Crear una etiqueta no recarga el contexto: tirar el formulario a medio
  // escribir para releer un catálogo que solo ha crecido en una fila no compensa.
  const [freshTags, setFreshTags] = useState<readonly Tag[]>([]);

  const search = useDebouncedValue(filters.search);
  const { status, subtopicId, difficulty, tagId } = filters;

  const loadQuestions = useCallback(
    (signal: AbortSignal) =>
      listQuestions(
        {
          status: status === 'all' ? undefined : [status],
          subtopic_id: subtopicId ?? undefined,
          difficulty: difficulty ?? undefined,
          tag_id: tagId ?? undefined,
          search,
          // Una de más: el contrato no devuelve el total, así que es lo que
          // distingue «esta es la última página» de «hay otra detrás».
          limit: PAGE_SIZE + 1,
          offset: page * PAGE_SIZE,
        },
        signal,
      ),
    [status, subtopicId, difficulty, tagId, search, page],
  );
  const questions = useAsyncResource(loadQuestions);
  const { reload: reloadQuestions } = questions;

  const data = context.state.status === 'ready' ? context.state.data : null;
  const subtopics = useMemo(() => (data === null ? [] : buildSubtopicPaths(data.catalog)), [data]);
  const paths = useMemo(
    () => new Map(subtopics.map((path) => [path.subtopic.id, path.label])),
    [subtopics],
  );
  const tags = useMemo(() => {
    const known = new Set((data?.tags ?? []).map((tag) => tag.id));

    return [...(data?.tags ?? []), ...freshTags.filter((tag) => !known.has(tag.id))];
  }, [data, freshTags]);

  const page1 = questions.state.status === 'ready' ? questions.state.data : [];
  const hasNextPage = page1.length > PAGE_SIZE;
  const filtered = isFiltered({ ...filters, search });

  function changeFilters(next: QuestionFilterState): void {
    setFilters(next);
    setPage(0);
  }

  async function runTransition(intent: Extract<QuestionIntent, { kind: 'transition' }>) {
    setActionError(null);
    setBusy(true);

    try {
      await changeQuestionStatus(intent.question.id, intent.transition);
      reloadQuestions();
    } catch (error) {
      setActionError(asApiClientError(error));
    } finally {
      setBusy(false);
    }
  }

  function handleIntent(intent: QuestionIntent): void {
    setActionError(null);

    switch (intent.kind) {
      case 'create':
        setEditor({ questionId: null });
        break;
      case 'edit':
        setEditor({ questionId: intent.question.id });
        break;
      case 'transition':
        void runTransition(intent);
        break;
    }
  }

  /** Lo que rechaza el servidor sube al formulario, que se queda como estaba. */
  async function submit(input: QuestionInput, mode: SaveMode): Promise<void> {
    if (editor?.questionId == null) await createQuestion(input, mode ?? 'draft');
    else await updateQuestion(editor.questionId, input);

    setEditor(null);
    reloadQuestions();
  }

  async function addTag(input: { readonly slug: string; readonly name: string }): Promise<Tag> {
    const tag = await createTag(input);

    setFreshTags((current) => [...current, tag]);

    return tag;
  }

  const newQuestion = (): void => {
    handleIntent({ kind: 'create' });
  };

  return (
    <>
      <PageHeader
        title="Preguntas"
        description="Enunciados con sus opciones, recursos y etiquetas, agrupados por subtema."
      >
        <Button onClick={newQuestion} disabled={subtopics.length === 0}>
          <Plus aria-hidden="true" />
          Nueva pregunta
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo de preguntas</CardTitle>
          <CardDescription>
            La pregunta cuelga de un subtema y se guarda entera. Nada se borra: se archiva.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {actionError && <ErrorState error={actionError} title="No se pudo completar la acción" />}

          <AsyncResourceView
            resource={context}
            errorTitle="No se pudo cargar el contexto de las preguntas"
            loadingLines={4}
            isEmpty={() => subtopics.length === 0}
            empty={
              <EmptyState
                icon={ListChecks}
                title="Todavía no hay subtemas"
                description="Una pregunta cuelga siempre de un subtema. Crea la jerarquía en la sección de temas y vuelve aquí."
              />
            }
          >
            {(loaded) => (
              <>
                <QuestionFilters
                  value={filters}
                  onChange={changeFilters}
                  subtopics={subtopics}
                  tags={tags}
                />

                <AsyncResourceView
                  resource={questions}
                  errorTitle="No se pudieron cargar las preguntas"
                  loadingLines={6}
                  isEmpty={(items) => items.length === 0 && !filtered}
                  empty={
                    <EmptyState
                      icon={ListChecks}
                      title="Todavía no hay preguntas"
                      description="Escribe la primera aquí, o impórtalas en lote desde la sección de importación."
                    >
                      <Button className="mt-2" onClick={newQuestion}>
                        <Plus aria-hidden="true" />
                        Nueva pregunta
                      </Button>
                    </EmptyState>
                  }
                >
                  {(items) => (
                    <QuestionList
                      questions={items.slice(0, PAGE_SIZE)}
                      paths={paths}
                      onIntent={handleIntent}
                      busy={busy}
                    />
                  )}
                </AsyncResourceView>

                {(page > 0 || hasNextPage) && (
                  <nav className="flex items-center justify-between" aria-label="Paginación">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => {
                        setPage((current) => Math.max(current - 1, 0));
                      }}
                    >
                      Anterior
                    </Button>
                    <span className="text-xs text-muted-foreground">Página {String(page + 1)}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!hasNextPage}
                      onClick={() => {
                        setPage((current) => current + 1);
                      }}
                    >
                      Siguiente
                    </Button>
                  </nav>
                )}

                {editor && (
                  <QuestionEditorDialog
                    questionId={editor.questionId}
                    subtopics={subtopics}
                    defaultSubtopicId={filters.subtopicId}
                    tags={tags}
                    visibleOptionsDefault={loaded.settings.visible_options_default}
                    onSubmit={submit}
                    onCreateTag={addTag}
                    onClose={() => {
                      setEditor(null);
                    }}
                  />
                )}
              </>
            )}
          </AsyncResourceView>
        </CardContent>
      </Card>
    </>
  );
}
