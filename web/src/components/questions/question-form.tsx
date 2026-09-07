import { useState, type FormEvent } from 'react';

import {
  draftFromDetail,
  newQuestionDraft,
  type DraftOption,
  type DraftResource,
  type QuestionDraft,
} from '@web/components/questions/draft';
import { OptionFields } from '@web/components/questions/option-fields';
import { QuestionPreview } from '@web/components/questions/question-preview';
import { ResourceFields } from '@web/components/questions/resource-fields';
import { TagField } from '@web/components/questions/tag-field';
import { ErrorState } from '@web/components/state/error-state';
import { Button } from '@web/components/ui/button';
import { DialogFooter } from '@web/components/ui/dialog';
import { Input } from '@web/components/ui/input';
import { Label } from '@web/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@web/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/components/ui/select';
import { Textarea } from '@web/components/ui/textarea';
import { asApiClientError, type ApiClientError, type FieldIssue } from '@web/lib/api/errors';
import {
  difficulties,
  questionTypes,
  type Difficulty,
  type QuestionDetail,
  type QuestionInput,
  type QuestionType,
  type Tag,
} from '@web/lib/api/questions';
import type { SubtopicPath } from '@web/lib/content-tree';
import { DIFFICULTY_WORDS, QUESTION_TYPE_WORDS } from '@web/lib/question-labels';
import {
  parseVisibleOptions,
  validatePublishable,
  validateQuestionDraft,
} from '@web/lib/question-rules';

/**
 * El editor del agregado: enunciado, tipo, dificultad, explicación, opciones,
 * recursos, etiquetas y cuántas opciones se muestran. Todo se guarda en una sola
 * llamada, porque la pregunta se escribe entera o no se escribe
 * (docs/development/api.md).
 *
 * Si el servidor rechaza, **el formulario se queda como estaba** y enseña el
 * motivo: perder lo escrito por un `422` sería el peor momento para hacerlo.
 */

/** `null` es una edición; el alta dice con qué estado nace. */
export type SaveMode = 'draft' | 'published' | null;

interface QuestionFormProps {
  readonly detail: QuestionDetail | null;
  readonly subtopics: readonly SubtopicPath[];
  /** El subtema del filtro, para que dar de alta desde él no obligue a elegirlo otra vez. */
  readonly defaultSubtopicId: number | null;
  readonly tags: readonly Tag[];
  readonly visibleOptionsDefault: number;
  readonly onSubmit: (input: QuestionInput, mode: SaveMode) => Promise<void>;
  readonly onCreateTag: (input: { readonly slug: string; readonly name: string }) => Promise<Tag>;
  readonly onClose: () => void;
}

export function QuestionForm({
  detail,
  subtopics,
  defaultSubtopicId,
  tags,
  visibleOptionsDefault,
  onSubmit,
  onCreateTag,
  onClose,
}: QuestionFormProps) {
  const [draft, setDraft] = useState<QuestionDraft>(() =>
    detail === null
      ? newQuestionDraft(defaultSubtopicId ?? subtopics[0]?.subtopic.id ?? null)
      : draftFromDetail(detail),
  );
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(1);

  const serverIssues = error?.fieldIssues ?? [];
  const issueFor = (field: string): string | undefined =>
    issues.find((issue) => issue.field === field)?.message ??
    serverIssues.find((issue) => issue.field === field)?.message;

  function patch(changes: Partial<QuestionDraft>): void {
    setDraft((current) => ({ ...current, ...changes }));
  }

  async function save(mode: SaveMode): Promise<void> {
    // Una pregunta ya publicada tiene que seguir cumpliendo sus invariantes
    // después de editarla: el disparador de la base la rechazaría igual.
    const mustBePublishable = mode === 'published' || detail?.status === 'published';
    const shape = {
      statement: draft.statement,
      type: draft.type,
      visibleOptions: draft.visibleOptions,
      options: draft.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })),
      resources: draft.resources.map((resource) => ({ url: resource.url })),
    };
    const found = [
      ...(draft.subtopicId === null
        ? [{ field: 'subtopic_id', message: 'Elige el subtema del que cuelga la pregunta' }]
        : []),
      ...validateQuestionDraft(shape),
      ...(mustBePublishable ? validatePublishable(shape) : []),
    ];

    setIssues(found);

    if (found.length > 0 || draft.subtopicId === null) return;

    setError(null);
    setBusy(true);

    try {
      await onSubmit(inputFrom(draft, draft.subtopicId), mode);
    } catch (cause) {
      setError(asApiClientError(cause));
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void save(detail === null ? 'draft' : null);
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && <ErrorState error={error} title="No se pudo guardar la pregunta" />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="question-subtopic">Subtema</Label>
          <Select
            value={draft.subtopicId === null ? '' : String(draft.subtopicId)}
            onValueChange={(next) => {
              patch({ subtopicId: Number(next) });
            }}
          >
            <SelectTrigger id="question-subtopic" className="w-full">
              <SelectValue placeholder="Elige el subtema" />
            </SelectTrigger>
            <SelectContent>
              {subtopics.map((path) => (
                <SelectItem key={path.subtopic.id} value={String(path.subtopic.id)}>
                  {path.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={issueFor('subtopic_id')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="question-difficulty">Dificultad</Label>
          <Select
            value={draft.difficulty}
            onValueChange={(next) => {
              patch({ difficulty: next as Difficulty });
            }}
          >
            <SelectTrigger id="question-difficulty" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {difficulties.map((difficulty) => (
                <SelectItem key={difficulty} value={difficulty}>
                  {DIFFICULTY_WORDS[difficulty]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tipo</legend>
        <RadioGroup
          className="flex flex-wrap gap-4"
          value={draft.type}
          onValueChange={(next) => {
            patch({ type: next as QuestionType });
          }}
        >
          {questionTypes.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <RadioGroupItem value={type} id={`type-${type}`} />
              <Label htmlFor={`type-${type}`}>{QUESTION_TYPE_WORDS[type]}</Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="question-statement">Enunciado</Label>
        <Textarea
          id="question-statement"
          value={draft.statement}
          rows={3}
          autoFocus
          aria-invalid={issueFor('statement') !== undefined}
          onChange={(event) => {
            patch({ statement: event.target.value });
          }}
        />
        <FieldError message={issueFor('statement')} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="question-explanation">Explicación</Label>
        <Textarea
          id="question-explanation"
          value={draft.explanation}
          rows={2}
          onChange={(event) => {
            patch({ explanation: event.target.value });
          }}
        />
        <p className="text-xs text-muted-foreground">Se muestra después de responder.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="question-visible-options">Opciones visibles</Label>
        <Input
          id="question-visible-options"
          className="w-32"
          inputMode="numeric"
          value={draft.visibleOptions}
          placeholder={String(visibleOptionsDefault)}
          aria-invalid={issueFor('visible_options') !== undefined}
          onChange={(event) => {
            patch({ visibleOptions: event.target.value });
          }}
        />
        <p className="text-xs text-muted-foreground">
          En blanco usa el valor global, que ahora es {String(visibleOptionsDefault)}.
        </p>
        <FieldError message={issueFor('visible_options')} />
      </div>

      <OptionFields
        options={draft.options}
        type={draft.type}
        issueFor={issueFor}
        onChange={(options: readonly DraftOption[]) => {
          patch({ options });
        }}
      />

      <ResourceFields
        resources={draft.resources}
        issueFor={issueFor}
        onChange={(resources: readonly DraftResource[]) => {
          patch({ resources });
        }}
      />

      <TagField
        tags={tags}
        selected={draft.tagIds}
        onCreate={onCreateTag}
        onChange={(tagIds) => {
          patch({ tagIds });
        }}
      />

      <QuestionPreview
        statement={draft.statement}
        type={draft.type}
        options={draft.options}
        resources={draft.resources}
        visibleOptions={visibleOptionsOf(draft.visibleOptions)}
        visibleOptionsDefault={visibleOptionsDefault}
        seed={seed}
        onReshuffle={() => {
          setSeed((current) => current + 1);
        }}
      />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        {detail === null ? (
          <>
            <Button type="submit" variant="outline" disabled={busy}>
              Guardar borrador
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                void save('published');
              }}
            >
              Guardar y publicar
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={busy}>
            Guardar
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}

/** Para la vista previa, un valor a medio escribir vale tanto como no haberlo puesto. */
function visibleOptionsOf(value: string): number | null {
  const parsed = parseVisibleOptions(value);

  return parsed === 'invalid' ? null : parsed;
}

function inputFrom(draft: QuestionDraft, subtopicId: number): QuestionInput {
  const visibleOptions = parseVisibleOptions(draft.visibleOptions);

  return {
    subtopic_id: subtopicId,
    type: draft.type,
    statement: draft.statement.trim(),
    explanation: draft.explanation.trim() === '' ? null : draft.explanation.trim(),
    difficulty: draft.difficulty,
    visible_options: visibleOptions === 'invalid' ? null : visibleOptions,
    options: draft.options.map((option) => ({
      text: option.text.trim(),
      is_correct: option.isCorrect,
    })),
    resources: draft.resources.map((resource) => ({
      kind: resource.kind,
      url: resource.url.trim(),
      label: resource.label.trim() === '' ? null : resource.label.trim(),
    })),
    tag_ids: draft.tagIds,
  };
}

function FieldError({ message }: { readonly message: string | undefined }) {
  if (message === undefined) return null;

  return (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}
