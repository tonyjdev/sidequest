import { useState, type FormEvent } from 'react';

import type { ParentRef } from '@web/components/content/intents';
import { ErrorState } from '@web/components/state/error-state';
import { Button } from '@web/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@web/components/ui/dialog';
import { Input } from '@web/components/ui/input';
import { Label } from '@web/components/ui/label';
import { Textarea } from '@web/components/ui/textarea';
import type { ContentInput, ContentLevel, ContentNode } from '@web/lib/api/content';
import { asApiClientError, type ApiClientError, type FieldIssue } from '@web/lib/api/errors';
import { LEVEL_WORDS } from '@web/lib/content-labels';
import { slugFromName, validateContentInput } from '@web/lib/content-rules';

/**
 * Alta y edición de un nivel de la jerarquía. Es el mismo formulario para los
 * tres: cambian el título y de quién cuelga.
 *
 * Lo que el servidor rechaza se enseña con su mensaje, no con uno propio, y lo
 * que ya se sabe imposible —un slug con espacios, un nombre vacío— se rechaza
 * antes de gastar la petición (`content-rules.ts`).
 */

interface ContentFormDialogProps {
  readonly level: ContentLevel;
  /** El padre del alta; en la edición y en las materias no hay. */
  readonly parent: ParentRef | null;
  /** El nodo que se edita, o `null` si es un alta. */
  readonly node: ContentNode | null;
  readonly onSubmit: (input: ContentInput) => Promise<void>;
  readonly onClose: () => void;
}

const SLUG_SCOPE = {
  subjects: 'El slug es único en todo el catálogo.',
  topics: 'El slug es único dentro de su materia.',
  subtopics: 'El slug es único dentro de su tema.',
} as const satisfies Record<ContentLevel, string>;

export function ContentFormDialog({
  level,
  parent,
  node,
  onSubmit,
  onClose,
}: ContentFormDialogProps) {
  const words = LEVEL_WORDS[level];
  const [name, setName] = useState(node?.name ?? '');
  const [slug, setSlug] = useState(node?.slug ?? '');
  const [description, setDescription] = useState(node?.description ?? '');
  // Mientras no se toque a mano, el slug sigue al nombre; en cuanto se edita,
  // deja de moverse solo para no pisar lo que se acaba de escribir.
  const [slugTouched, setSlugTouched] = useState(node !== null);
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState(false);

  const serverIssues = error?.fieldIssues ?? [];
  const issueFor = (field: string): string | undefined =>
    issues.find((issue) => issue.field === field)?.message;
  const invalid = (field: string): boolean =>
    issueFor(field) !== undefined || serverIssues.some((issue) => issue.field === field);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const input: ContentInput = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() === '' ? null : description.trim(),
    };
    const found = validateContentInput(input);

    setIssues(found);

    if (found.length > 0) return;

    setError(null);
    setBusy(true);

    try {
      await onSubmit(input);
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
            {node === null
              ? parent === null
                ? words.newOne
                : `${words.newOne} en «${parent.name}»`
              : `Editar ${words.article} «${node.name}»`}
          </DialogTitle>
          <DialogDescription>{SLUG_SCOPE[level]}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          {error && <ErrorState error={error} title="No se pudo guardar" />}

          <div className="space-y-1.5">
            <Label htmlFor="content-name">Nombre</Label>
            <Input
              id="content-name"
              value={name}
              autoFocus
              aria-invalid={invalid('name')}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugTouched) setSlug(slugFromName(event.target.value));
              }}
            />
            {issueFor('name') !== undefined && <FieldError message={issueFor('name')} />}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content-slug">Slug</Label>
            <Input
              id="content-slug"
              value={slug}
              aria-invalid={invalid('slug')}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
            />
            {issueFor('slug') !== undefined && <FieldError message={issueFor('slug')} />}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content-description">Descripción</Label>
            <Textarea
              id="content-description"
              value={description}
              rows={3}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {node === null ? 'Crear' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ message }: { readonly message: string | undefined }) {
  return (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}
