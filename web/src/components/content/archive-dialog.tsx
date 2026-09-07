import { useState } from 'react';

import { ErrorState } from '@web/components/state/error-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@web/components/ui/alert-dialog';
import type { ContentLevel, ContentNode } from '@web/lib/api/content';
import { asApiClientError, type ApiClientError } from '@web/lib/api/errors';
import { LEVEL_WORDS } from '@web/lib/content-labels';

/**
 * Archivar se confirma porque **no tiene vuelta**: el histórico depende de que
 * lo retirado siga retirado, así que no hay desarchivar (docs/decisiones.md §6).
 * La confirmación dice además hasta dónde baja el archivado, que es lo que no se
 * ve desde la fila.
 */

interface ArchiveDialogProps {
  readonly level: ContentLevel;
  readonly node: ContentNode;
  readonly onConfirm: () => Promise<void>;
  readonly onClose: () => void;
}

const CASCADE = {
  subjects: 'Se archivarán con ella todos sus temas y todos sus subtemas.',
  topics: 'Se archivarán con él todos sus subtemas.',
  subtopics: 'Sus preguntas dejan de ser candidatas al sorteo, pero no se borran.',
} as const satisfies Record<ContentLevel, string>;

export function ArchiveDialog({ level, node, onConfirm, onClose }: ArchiveDialogProps) {
  const words = LEVEL_WORDS[level];
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(): Promise<void> {
    setError(null);
    setBusy(true);

    try {
      await onConfirm();
    } catch (cause) {
      setError(asApiClientError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`¿Archivar ${words.article} «${node.name}»?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {`${CASCADE[level]} Nada se borra, pero archivar no tiene vuelta.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && <ErrorState error={error} title="No se pudo archivar" />}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              // El diálogo se cierra solo al confirmar; aquí se cierra cuando la
              // API responde, para poder enseñar el rechazo si lo hay.
              event.preventDefault();
              void confirm();
            }}
          >
            Archivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
