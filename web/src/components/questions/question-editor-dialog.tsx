import { useCallback } from 'react';

import { QuestionForm, type SaveMode } from '@web/components/questions/question-form';
import { AsyncResourceView } from '@web/components/state/async-resource-view';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@web/components/ui/dialog';
import { useAsyncResource } from '@web/hooks/use-async-resource';
import {
  getQuestion,
  type QuestionDetail,
  type QuestionInput,
  type Tag,
} from '@web/lib/api/questions';
import type { SubtopicPath } from '@web/lib/content-tree';

/**
 * El editor de una pregunta. El listado no trae lo que cuelga de ella —opciones,
 * recursos y etiquetas—, así que la ficha se pide al abrir: es la única forma de
 * editar el agregado entero sin haberlo cargado para cien filas que nadie mira.
 */

interface QuestionEditorDialogProps {
  /** `null` es un alta. */
  readonly questionId: number | null;
  readonly subtopics: readonly SubtopicPath[];
  readonly defaultSubtopicId: number | null;
  readonly tags: readonly Tag[];
  readonly visibleOptionsDefault: number;
  readonly onSubmit: (input: QuestionInput, mode: SaveMode) => Promise<void>;
  readonly onCreateTag: (input: { readonly slug: string; readonly name: string }) => Promise<Tag>;
  readonly onClose: () => void;
}

export function QuestionEditorDialog({
  questionId,
  subtopics,
  defaultSubtopicId,
  tags,
  visibleOptionsDefault,
  onSubmit,
  onCreateTag,
  onClose,
}: QuestionEditorDialogProps) {
  const load = useCallback(
    (signal: AbortSignal): Promise<QuestionDetail | null> =>
      questionId === null ? Promise.resolve(null) : getQuestion(questionId, signal),
    [questionId],
  );
  const detail = useAsyncResource(load);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{questionId === null ? 'Nueva pregunta' : 'Editar pregunta'}</DialogTitle>
          <DialogDescription>
            La pregunta se guarda entera —opciones, recursos y etiquetas— en una sola operación.
          </DialogDescription>
        </DialogHeader>

        <AsyncResourceView resource={detail} errorTitle="No se pudo cargar la pregunta">
          {(loaded) => (
            <QuestionForm
              key={loaded === null ? 'new' : `${String(loaded.id)}:${String(loaded.version)}`}
              detail={loaded}
              subtopics={subtopics}
              defaultSubtopicId={defaultSubtopicId}
              tags={tags}
              visibleOptionsDefault={visibleOptionsDefault}
              onSubmit={onSubmit}
              onCreateTag={onCreateTag}
              onClose={onClose}
            />
          )}
        </AsyncResourceView>
      </DialogContent>
    </Dialog>
  );
}
