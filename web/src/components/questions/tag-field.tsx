import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ErrorState } from '@web/components/state/error-state';
import { Button } from '@web/components/ui/button';
import { Input } from '@web/components/ui/input';
import { Label } from '@web/components/ui/label';
import type { Tag } from '@web/lib/api/questions';
import { asApiClientError, type ApiClientError } from '@web/lib/api/errors';
import { slugFromName } from '@web/lib/content-rules';

/**
 * Las etiquetas de la pregunta. Se enganchan y se desenganchan editándola, que
 * es lo único que hay: las etiquetas no se archivan ni se borran
 * (docs/development/api.md).
 *
 * El alta va aquí porque el panel no tiene otra pantalla que las cree, y una
 * etiqueta que no se puede crear no se puede usar para filtrar. El slug se
 * propone a partir del nombre, con la misma regla que en la jerarquía de
 * contenido.
 */

interface TagFieldProps {
  readonly tags: readonly Tag[];
  readonly selected: readonly number[];
  readonly onChange: (ids: readonly number[]) => void;
  readonly onCreate: (input: { readonly slug: string; readonly name: string }) => Promise<Tag>;
}

export function TagField({ tags, selected, onChange, onCreate }: TagFieldProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: number): void {
    onChange(selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id]);
  }

  async function create(): Promise<void> {
    const trimmed = name.trim();

    if (trimmed === '' || busy) return;

    setError(null);
    setBusy(true);

    try {
      const tag = await onCreate({ slug: slugFromName(trimmed), name: trimmed });

      onChange([...selected, tag.id]);
      setName('');
    } catch (cause) {
      setError(asApiClientError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Etiquetas</legend>

      {tags.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Todavía no hay etiquetas. Crea la primera aquí abajo.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Button
              key={tag.id}
              type="button"
              size="sm"
              variant={selected.includes(tag.id) ? 'secondary' : 'outline'}
              aria-pressed={selected.includes(tag.id)}
              onClick={() => {
                toggle(tag.id);
              }}
            >
              {tag.name}
            </Button>
          ))}
        </div>
      )}

      {error && <ErrorState error={error} title="No se pudo crear la etiqueta" />}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-50 flex-1 space-y-1.5">
          <Label htmlFor="new-tag">Nueva etiqueta</Label>
          <Input
            id="new-tag"
            value={name}
            placeholder="Ecuaciones de primer grado"
            onChange={(event) => {
              setName(event.target.value);
            }}
            onKeyDown={(event) => {
              // Enter dentro del formulario del editor lo enviaría; aquí crea la
              // etiqueta, que es lo que espera quien está escribiéndola.
              if (event.key === 'Enter') {
                event.preventDefault();
                void create();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || name.trim() === ''}
          onClick={() => {
            void create();
          }}
        >
          <Plus aria-hidden="true" />
          Crear etiqueta
        </Button>
      </div>
    </fieldset>
  );
}
