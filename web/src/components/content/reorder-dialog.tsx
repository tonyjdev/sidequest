import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import type { ParentRef } from '@web/components/content/intents';
import { ErrorState } from '@web/components/state/error-state';
import { Badge } from '@web/components/ui/badge';
import { Button } from '@web/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@web/components/ui/dialog';
import type { ContentLevel, ContentNode } from '@web/lib/api/content';
import { asApiClientError, type ApiClientError } from '@web/lib/api/errors';
import { LEVEL_WORDS, STATUS_WORDS } from '@web/lib/content-labels';

/**
 * Orden manual de un conjunto de hermanos. La lista llega **completa y sin
 * filtrar, archivados incluidos**, porque `POST /{nivel}/reorder` reparte
 * `position` 1..n y rechaza un subconjunto: dejaría posiciones repetidas con los
 * hermanos que no vinieron (docs/development/api.md).
 */

interface ReorderDialogProps {
  readonly level: ContentLevel;
  /** El padre de los hermanos; las materias no tienen. */
  readonly parent: ParentRef | null;
  readonly siblings: readonly ContentNode[];
  readonly onSubmit: (ids: readonly number[]) => Promise<void>;
  readonly onClose: () => void;
}

export function ReorderDialog({ level, parent, siblings, onSubmit, onClose }: ReorderDialogProps) {
  const words = LEVEL_WORDS[level];
  const [order, setOrder] = useState<readonly ContentNode[]>(siblings);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState(false);

  function move(index: number, step: -1 | 1): void {
    const target = index + step;
    const moved = [...order];
    const [node] = moved.splice(index, 1);

    if (node === undefined) return;

    moved.splice(target, 0, node);
    setOrder(moved);
  }

  async function save(): Promise<void> {
    setError(null);
    setBusy(true);

    try {
      await onSubmit(order.map((node) => node.id));
    } catch (cause) {
      setError(asApiClientError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {parent === null
              ? `Ordenar ${words.articleMany}`
              : `Ordenar ${words.articleMany} de «${parent.name}»`}
          </DialogTitle>
          <DialogDescription>
            El orden se reparte entre todos los hermanos, archivados incluidos.
          </DialogDescription>
        </DialogHeader>

        {error && <ErrorState error={error} title="No se pudo guardar el orden" />}

        <ol className="divide-y rounded-lg border">
          {order.map((node, index) => (
            <li key={node.id} className="flex items-center gap-2 px-3 py-2">
              <span className="w-5 text-xs text-muted-foreground">{index + 1}</span>
              <span className="font-medium">{node.name}</span>
              <Badge variant={node.status === 'published' ? 'secondary' : 'outline'}>
                {STATUS_WORDS[level][node.status]}
              </Badge>
              <div className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  title={`Subir ${node.name}`}
                  aria-label={`Subir ${node.name}`}
                  onClick={() => {
                    move(index, -1);
                  }}
                >
                  <ChevronUp aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === order.length - 1}
                  title={`Bajar ${node.name}`}
                  aria-label={`Bajar ${node.name}`}
                  onClick={() => {
                    move(index, 1);
                  }}
                >
                  <ChevronDown aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ol>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              void save();
            }}
          >
            Guardar orden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
