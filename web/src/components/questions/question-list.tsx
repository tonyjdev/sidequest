import { Archive, Pencil, Send, Undo2 } from 'lucide-react';

import type { QuestionIntent } from '@web/components/questions/intents';
import { transitionsFor } from '@web/components/questions/intents';
import { EmptyState } from '@web/components/state/empty-state';
import { Badge } from '@web/components/ui/badge';
import { Button } from '@web/components/ui/button';
import type { Question, QuestionTransition } from '@web/lib/api/questions';
import {
  DIFFICULTY_WORDS,
  QUESTION_STATUS_WORDS,
  QUESTION_TYPE_WORDS,
  TRANSITION_WORDS,
} from '@web/lib/question-labels';

/**
 * El listado de preguntas. La API devuelve la pregunta a secas —las opciones se
 * piden abriendo la ficha—, así que la fila enseña lo que se puede leer sin
 * abrirla: enunciado, de qué subtema cuelga, tipo, dificultad y estado.
 *
 * Como el árbol de contenido, no habla con la API: cada acción sale como
 * intención y la resuelve la pantalla.
 */

const TRANSITION_ICONS = {
  publish: Send,
  unpublish: Undo2,
  archive: Archive,
} as const satisfies Record<QuestionTransition, typeof Send>;

interface QuestionListProps {
  readonly questions: readonly Question[];
  /** La ruta del subtema, por id: «Matemáticas › Álgebra › Ecuaciones». */
  readonly paths: ReadonlyMap<number, string>;
  readonly onIntent: (intent: QuestionIntent) => void;
  readonly busy: boolean;
}

export function QuestionList({ questions, paths, onIntent, busy }: QuestionListProps) {
  if (questions.length === 0) {
    return (
      <EmptyState
        title="Ninguna pregunta con este filtro"
        description="Cambia el subtema, el estado, la dificultad o la búsqueda para ver el resto."
      />
    );
  }

  return (
    <ul className="divide-y">
      {questions.map((question) => (
        <li key={question.id} className="flex flex-wrap items-start gap-3 py-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium break-words">{question.statement}</p>
            <p className="text-xs text-muted-foreground">
              {paths.get(question.subtopic_id) ?? 'Subtema desconocido'}
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant={question.status === 'published' ? 'secondary' : 'outline'}>
                {QUESTION_STATUS_WORDS[question.status]}
              </Badge>
              <Badge variant="outline">{QUESTION_TYPE_WORDS[question.type]}</Badge>
              <Badge variant="outline">{DIFFICULTY_WORDS[question.difficulty]}</Badge>
              {question.visible_options !== null && (
                <Badge variant="ghost">{String(question.visible_options)} opciones visibles</Badge>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              title={`Editar «${question.statement}»`}
              aria-label={`Editar «${question.statement}»`}
              onClick={() => {
                onIntent({ kind: 'edit', question });
              }}
            >
              <Pencil aria-hidden="true" />
            </Button>

            {transitionsFor(question).map((transition) => {
              const Icon = TRANSITION_ICONS[transition];
              const label = `${TRANSITION_WORDS[transition]} «${question.statement}»`;

              return (
                <Button
                  key={transition}
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  title={label}
                  aria-label={label}
                  onClick={() => {
                    onIntent({ kind: 'transition', question, transition });
                  }}
                >
                  <Icon aria-hidden="true" />
                </Button>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
