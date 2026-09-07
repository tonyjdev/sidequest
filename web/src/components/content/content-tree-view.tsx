import { Archive, ArrowUpDown, ChevronDown, ChevronRight, Pencil, Send } from 'lucide-react';

import type { ContentIntent } from '@web/components/content/intents';
import { EmptyState } from '@web/components/state/empty-state';
import { Badge } from '@web/components/ui/badge';
import { Button } from '@web/components/ui/button';
import type { ContentLevel, ContentNode } from '@web/lib/api/content';
import {
  CHILD_LEVEL,
  formatQuestionCount,
  LEVEL_WORDS,
  STATUS_WORDS,
} from '@web/lib/content-labels';
import { countQuestions, type ContentTree } from '@web/lib/content-tree';
import { cn } from '@web/lib/utils';

/**
 * El árbol de contenido: materias que despliegan sus temas, y temas que
 * despliegan sus subtemas con su recuento de preguntas. Es la misma fila a tres
 * alturas, así que es un solo componente con su nivel y su sangría.
 *
 * No sabe hablar con la API: cada acción sale como intención y la resuelve la
 * pantalla (`intents.ts`).
 */

interface ContentTreeViewProps {
  readonly tree: ContentTree;
  /** Nodos plegados, por clave `nivel:id`; lo que no está aquí se ve desplegado. */
  readonly collapsed: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly onIntent: (intent: ContentIntent) => void;
  /** Si hay filtro de estado, un hueco no significa que no haya contenido. */
  readonly filtered: boolean;
  readonly busy: boolean;
}

function nodeKey(level: ContentLevel, id: number): string {
  return `${level}:${String(id)}`;
}

export function ContentTreeView({
  tree,
  collapsed,
  onToggle,
  onIntent,
  filtered,
  busy,
}: ContentTreeViewProps) {
  if (tree.length === 0) {
    return (
      <EmptyState
        title="Nada con ese estado"
        description="Ninguna materia, tema o subtema está en el estado elegido. Cambia el filtro para ver el resto."
      />
    );
  }

  return (
    <ul className="divide-y">
      {tree.map((branch) => {
        const subjectKey = nodeKey('subjects', branch.subject.id);
        const subjectOpen = !collapsed.has(subjectKey);

        return (
          <li key={subjectKey}>
            <ContentRow
              level="subjects"
              node={branch.subject}
              depth={0}
              childCount={branch.topics.length}
              expanded={subjectOpen}
              onToggle={() => {
                onToggle(subjectKey);
              }}
              onIntent={onIntent}
              busy={busy}
            />

            {subjectOpen && (
              <ul>
                {branch.topics.map((topicBranch) => {
                  const topicKey = nodeKey('topics', topicBranch.topic.id);
                  const topicOpen = !collapsed.has(topicKey);

                  return (
                    <li key={topicKey}>
                      <ContentRow
                        level="topics"
                        node={topicBranch.topic}
                        depth={1}
                        childCount={topicBranch.subtopics.length}
                        expanded={topicOpen}
                        meta={formatQuestionCount(countQuestions(topicBranch))}
                        onToggle={() => {
                          onToggle(topicKey);
                        }}
                        onIntent={onIntent}
                        busy={busy}
                      />

                      {topicOpen && (
                        <ul>
                          {topicBranch.subtopics.map((subtopic) => (
                            <li key={nodeKey('subtopics', subtopic.id)}>
                              <ContentRow
                                level="subtopics"
                                node={subtopic}
                                depth={2}
                                childCount={0}
                                meta={formatQuestionCount(subtopic.question_count)}
                                onIntent={onIntent}
                                busy={busy}
                              />
                            </li>
                          ))}
                          {topicBranch.subtopics.length === 0 && (
                            <BranchHint
                              depth={2}
                              text={
                                filtered
                                  ? 'Ningún subtema con ese estado.'
                                  : 'Este tema todavía no tiene subtemas.'
                              }
                            />
                          )}
                        </ul>
                      )}
                    </li>
                  );
                })}
                {branch.topics.length === 0 && (
                  <BranchHint
                    depth={1}
                    text={
                      filtered
                        ? 'Ningún tema con ese estado.'
                        : 'Esta materia todavía no tiene temas.'
                    }
                  />
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface ContentRowProps {
  readonly level: ContentLevel;
  readonly node: ContentNode;
  readonly depth: 0 | 1 | 2;
  readonly childCount: number;
  readonly expanded?: boolean;
  readonly meta?: string;
  readonly onToggle?: () => void;
  readonly onIntent: (intent: ContentIntent) => void;
  readonly busy: boolean;
}

const INDENT = ['pl-2', 'pl-8', 'pl-14'] as const;

function ContentRow({
  level,
  node,
  depth,
  childCount,
  expanded,
  meta,
  onToggle,
  onIntent,
  busy,
}: ContentRowProps) {
  const words = LEVEL_WORDS[level];
  const childLevel = CHILD_LEVEL[level];
  const parent = { id: node.id, name: node.name };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-2 hover:bg-muted/40',
        INDENT[depth],
      )}
    >
      {onToggle ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={expanded}
          aria-label={`${expanded === true ? 'Plegar' : 'Desplegar'} ${words.article} ${node.name}`}
          onClick={onToggle}
        >
          {expanded === true ? (
            <ChevronDown aria-hidden="true" />
          ) : (
            <ChevronRight aria-hidden="true" />
          )}
        </Button>
      ) : (
        <span className="size-7" aria-hidden="true" />
      )}

      <span className={cn('font-medium', depth === 0 && 'font-heading')}>{node.name}</span>
      <code className="text-xs text-muted-foreground">{node.slug}</code>
      <Badge variant={node.status === 'published' ? 'secondary' : 'outline'}>
        {STATUS_WORDS[level][node.status]}
      </Badge>
      {meta !== undefined && <span className="text-xs text-muted-foreground">{meta}</span>}

      <div className="ml-auto flex items-center gap-1">
        {childLevel !== null && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              onIntent({ kind: 'create', level: childLevel, parent });
            }}
          >
            {LEVEL_WORDS[childLevel].newOne}
          </Button>
        )}
        {childLevel !== null && childCount > 1 && (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            title={`Ordenar ${LEVEL_WORDS[childLevel].articleMany} de ${node.name}`}
            aria-label={`Ordenar ${LEVEL_WORDS[childLevel].articleMany} de ${node.name}`}
            onClick={() => {
              onIntent({ kind: 'reorder', level: childLevel, parent });
            }}
          >
            <ArrowUpDown aria-hidden="true" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          title={`Editar ${words.article} ${node.name}`}
          aria-label={`Editar ${words.article} ${node.name}`}
          onClick={() => {
            onIntent({ kind: 'edit', level, node });
          }}
        >
          <Pencil aria-hidden="true" />
        </Button>
        {node.status === 'draft' && (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            title={`Publicar ${words.article} ${node.name}`}
            aria-label={`Publicar ${words.article} ${node.name}`}
            onClick={() => {
              onIntent({ kind: 'publish', level, node });
            }}
          >
            <Send aria-hidden="true" />
          </Button>
        )}
        {node.status !== 'archived' && (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            title={`Archivar ${words.article} ${node.name}`}
            aria-label={`Archivar ${words.article} ${node.name}`}
            onClick={() => {
              onIntent({ kind: 'archive', level, node });
            }}
          >
            <Archive aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

function BranchHint({ depth, text }: { readonly depth: 1 | 2; readonly text: string }) {
  return (
    <li className={cn('py-2 text-xs text-muted-foreground', INDENT[depth])}>
      <span className="pl-9">{text}</span>
    </li>
  );
}
