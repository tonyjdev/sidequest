import { ArrowUpDown, FolderTree, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { ArchiveDialog } from '@web/components/content/archive-dialog';
import { ContentFormDialog } from '@web/components/content/content-form-dialog';
import { ContentTreeView } from '@web/components/content/content-tree-view';
import type { ContentIntent, ParentRef } from '@web/components/content/intents';
import { ReorderDialog } from '@web/components/content/reorder-dialog';
import { PageHeader } from '@web/components/layout/page-header';
import { AsyncResourceView } from '@web/components/state/async-resource-view';
import { EmptyState } from '@web/components/state/empty-state';
import { ErrorState } from '@web/components/state/error-state';
import { Button } from '@web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@web/components/ui/card';
import {
  archiveContent,
  createContent,
  getContentCatalog,
  publishContent,
  reorderContent,
  updateContent,
  type ContentInput,
  type ContentLevel,
  type ContentNode,
} from '@web/lib/api/content';
import { asApiClientError, type ApiClientError } from '@web/lib/api/errors';
import { STATUS_FILTERS } from '@web/lib/content-labels';
import { buildContentTree, filterContentTree, type StatusFilter } from '@web/lib/content-tree';
import { useAsyncResource } from '@web/hooks/use-async-resource';

/**
 * Gestión de la jerarquía de contenido: materias, temas y subtemas
 * (docs/especificacion.md §8.2). Los tres niveles se ven a la vez, en un árbol,
 * porque la pregunta cuelga del subtema y el resto se deriva de él.
 *
 * La pantalla no tiene reglas propias: publica, archiva y reordena llamando a la
 * API, y cuando el dominio rechaza una acción —publicar un subtema cuyo tema
 * sigue en borrador— enseña **el motivo del servidor**, que es la parte
 * accionable.
 */

type DialogState =
  | {
      readonly kind: 'form';
      readonly level: ContentLevel;
      readonly parent: ParentRef | null;
      readonly node: ContentNode | null;
    }
  | { readonly kind: 'archive'; readonly level: ContentLevel; readonly node: ContentNode }
  | {
      readonly kind: 'reorder';
      readonly level: ContentLevel;
      readonly parent: ParentRef | null;
      readonly siblings: readonly ContentNode[];
    };

export function TopicsPage() {
  const load = useCallback((signal: AbortSignal) => getContentCatalog(signal), []);
  const catalog = useAsyncResource(load);
  const { reload } = catalog;

  const [status, setStatus] = useState<StatusFilter>('all');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [actionError, setActionError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState(false);

  const data = catalog.state.status === 'ready' ? catalog.state.data : null;
  const tree = useMemo(() => (data === null ? [] : buildContentTree(data)), [data]);
  const visibleTree = useMemo(() => filterContentTree(tree, status), [tree, status]);

  /**
   * Los hermanos salen del catálogo sin filtrar: la reordenación los necesita a
   * todos, y el árbol que se ve puede estar filtrado por estado.
   */
  function siblingsOf(level: ContentLevel, parent: ParentRef | null): readonly ContentNode[] {
    if (data === null) return [];
    if (level === 'subjects') return data.subjects;
    if (level === 'topics') return data.topics.filter((topic) => topic.subject_id === parent?.id);

    return data.subtopics.filter((subtopic) => subtopic.topic_id === parent?.id);
  }

  /** Las acciones de fila enseñan su rechazo arriba; las del diálogo, dentro. */
  async function runFromRow(action: () => Promise<unknown>): Promise<void> {
    setActionError(null);
    setBusy(true);

    try {
      await action();
      reload();
    } catch (error) {
      setActionError(asApiClientError(error));
    } finally {
      setBusy(false);
    }
  }

  async function runFromDialog(action: () => Promise<unknown>): Promise<void> {
    await action();
    setDialog(null);
    setActionError(null);
    reload();
  }

  function handleIntent(intent: ContentIntent): void {
    setActionError(null);

    switch (intent.kind) {
      case 'create':
        setDialog({ kind: 'form', level: intent.level, parent: intent.parent, node: null });
        break;
      case 'edit':
        setDialog({ kind: 'form', level: intent.level, parent: null, node: intent.node });
        break;
      case 'archive':
        setDialog({ kind: 'archive', level: intent.level, node: intent.node });
        break;
      case 'reorder':
        setDialog({
          kind: 'reorder',
          level: intent.level,
          parent: intent.parent,
          siblings: siblingsOf(intent.level, intent.parent),
        });
        break;
      case 'publish':
        void runFromRow(() => publishContent(intent.level, intent.node.id));
        break;
    }
  }

  function toggle(key: string): void {
    setCollapsed((current) => {
      const next = new Set(current);

      if (!next.delete(key)) next.add(key);

      return next;
    });
  }

  function submitForm(state: Extract<DialogState, { kind: 'form' }>, input: ContentInput) {
    return runFromDialog(() =>
      state.node === null
        ? createContent(state.level, state.parent?.id ?? null, input)
        : updateContent(state.level, state.node.id, input),
    );
  }

  const newSubject = (): void => {
    handleIntent({ kind: 'create', level: 'subjects', parent: null });
  };

  return (
    <>
      <PageHeader
        title="Temas"
        description="Materias, temas y subtemas: los tres niveles de los que cuelga cada pregunta."
      >
        <div className="flex flex-wrap gap-2">
          {(data?.subjects.length ?? 0) > 1 && (
            <Button
              variant="outline"
              onClick={() => {
                handleIntent({ kind: 'reorder', level: 'subjects', parent: null });
              }}
            >
              <ArrowUpDown aria-hidden="true" />
              Ordenar materias
            </Button>
          )}
          <Button onClick={newSubject}>
            <Plus aria-hidden="true" />
            Nueva materia
          </Button>
        </div>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Jerarquía de contenido</CardTitle>
          <CardDescription>
            Cada pregunta cuelga de un subtema. Un nivel solo se publica si su padre ya está
            publicado, y nada se borra: se archiva.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
            {STATUS_FILTERS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={option.value === status ? 'secondary' : 'ghost'}
                aria-pressed={option.value === status}
                onClick={() => {
                  setStatus(option.value);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {actionError && <ErrorState error={actionError} title="No se pudo completar la acción" />}

          <AsyncResourceView
            resource={catalog}
            errorTitle="No se pudo cargar el contenido"
            loadingLines={6}
            isEmpty={(loaded) => loaded.subjects.length === 0}
            empty={
              <EmptyState
                icon={FolderTree}
                title="Todavía no hay materias"
                description="La jerarquía tiene tres niveles: materia, tema y subtema. Empieza por una materia y cuelga de ella lo demás."
              >
                <Button className="mt-2" onClick={newSubject}>
                  <Plus aria-hidden="true" />
                  Nueva materia
                </Button>
              </EmptyState>
            }
          >
            {() => (
              <ContentTreeView
                tree={visibleTree}
                collapsed={collapsed}
                onToggle={toggle}
                onIntent={handleIntent}
                filtered={status !== 'all'}
                busy={busy}
              />
            )}
          </AsyncResourceView>
        </CardContent>
      </Card>

      {dialog?.kind === 'form' && (
        <ContentFormDialog
          level={dialog.level}
          parent={dialog.parent}
          node={dialog.node}
          onSubmit={(input) => submitForm(dialog, input)}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}

      {dialog?.kind === 'archive' && (
        <ArchiveDialog
          level={dialog.level}
          node={dialog.node}
          onConfirm={() => runFromDialog(() => archiveContent(dialog.level, dialog.node.id))}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}

      {dialog?.kind === 'reorder' && (
        <ReorderDialog
          level={dialog.level}
          parent={dialog.parent}
          siblings={dialog.siblings}
          onSubmit={(ids) =>
            runFromDialog(() => reorderContent(dialog.level, dialog.parent?.id ?? null, ids))
          }
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </>
  );
}
