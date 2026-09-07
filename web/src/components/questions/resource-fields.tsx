import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import { emptyResource, moveAt, type DraftResource } from '@web/components/questions/draft';
import { Button } from '@web/components/ui/button';
import { Input } from '@web/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/components/ui/select';
import { resourceKinds, type ResourceKind } from '@web/lib/api/questions';
import { RESOURCE_KIND_WORDS } from '@web/lib/question-labels';

/**
 * Los recursos enlazados de la pregunta: su tipo, su URL y su etiqueta. En esta
 * versión son siempre enlaces externos (docs/decisiones.md §2), y la terminal no
 * los dibuja: enseña sus enlaces, así que el orden es el de presentación.
 */

interface ResourceFieldsProps {
  readonly resources: readonly DraftResource[];
  readonly onChange: (resources: readonly DraftResource[]) => void;
  readonly issueFor: (field: string) => string | undefined;
}

export function ResourceFields({ resources, onChange, issueFor }: ResourceFieldsProps) {
  function patch(index: number, changes: Partial<DraftResource>): void {
    onChange(
      resources.map((resource, at) => (at === index ? { ...resource, ...changes } : resource)),
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Recursos</legend>
      <p className="text-xs text-muted-foreground">
        Enlaces externos que acompañan a la pregunta. La terminal muestra el enlace, no el
        contenido.
      </p>

      <ul className="divide-y">
        {resources.map((resource, index) => (
          <li key={resource.key} className="flex flex-wrap items-start gap-2 py-2">
            <Select
              value={resource.kind}
              onValueChange={(next) => {
                patch(index, { kind: next as ResourceKind });
              }}
            >
              <SelectTrigger className="w-36" aria-label={`Tipo del recurso ${String(index + 1)}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resourceKinds.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {RESOURCE_KIND_WORDS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex min-w-50 flex-1 flex-col gap-1">
              <Input
                value={resource.url}
                placeholder="https://…"
                aria-label={`URL del recurso ${String(index + 1)}`}
                aria-invalid={issueFor(`resources.${String(index)}.url`) !== undefined}
                onChange={(event) => {
                  patch(index, { url: event.target.value });
                }}
              />
              {issueFor(`resources.${String(index)}.url`) !== undefined && (
                <p className="text-xs text-destructive" role="alert">
                  {issueFor(`resources.${String(index)}.url`)}
                </p>
              )}
            </div>

            <Input
              className="w-44"
              value={resource.label}
              placeholder="Etiqueta"
              aria-label={`Etiqueta del recurso ${String(index + 1)}`}
              onChange={(event) => {
                patch(index, { label: event.target.value });
              }}
            />

            <div className="ml-auto flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === 0}
                title={`Subir el recurso ${String(index + 1)}`}
                aria-label={`Subir el recurso ${String(index + 1)}`}
                onClick={() => {
                  onChange(moveAt(resources, index, -1));
                }}
              >
                <ChevronUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === resources.length - 1}
                title={`Bajar el recurso ${String(index + 1)}`}
                aria-label={`Bajar el recurso ${String(index + 1)}`}
                onClick={() => {
                  onChange(moveAt(resources, index, 1));
                }}
              >
                <ChevronDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={`Quitar el recurso ${String(index + 1)}`}
                aria-label={`Quitar el recurso ${String(index + 1)}`}
                onClick={() => {
                  onChange(resources.filter((_, at) => at !== index));
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          onChange([...resources, emptyResource()]);
        }}
      >
        <Plus aria-hidden="true" />
        Añadir recurso
      </Button>
    </fieldset>
  );
}
