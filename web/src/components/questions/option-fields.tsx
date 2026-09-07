import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import { emptyOption, moveAt, type DraftOption } from '@web/components/questions/draft';
import { Alert, AlertDescription, AlertTitle } from '@web/components/ui/alert';
import { Badge } from '@web/components/ui/badge';
import { Button } from '@web/components/ui/button';
import { Checkbox } from '@web/components/ui/checkbox';
import { Input } from '@web/components/ui/input';
import { Label } from '@web/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@web/components/ui/radio-group';
import type { QuestionType } from '@web/lib/api/questions';
import { QUESTION_TYPE_HINTS } from '@web/lib/question-labels';

/**
 * Las opciones de la pregunta, con su marcado de correctas **coherente con el
 * tipo**: botón de radio en selección única, casilla en múltiple.
 *
 * Cambiar de múltiple a única con más de una correcta marcada **avisa y no toca
 * nada**. Desmarcar por su cuenta perdería en silencio el trabajo de quien
 * escribió la pregunta; elegir cuál es la buena es una decisión suya, y marcar
 * un radio la resuelve dejando esa como única correcta.
 */

interface OptionFieldsProps {
  readonly options: readonly DraftOption[];
  readonly type: QuestionType;
  readonly onChange: (options: readonly DraftOption[]) => void;
  readonly issueFor: (field: string) => string | undefined;
}

export function OptionFields({ options, type, onChange, issueFor }: OptionFieldsProps) {
  const correct = options.filter((option) => option.isCorrect);
  const singleConflict = type === 'single' && correct.length > 1;
  // Sin exactamente una correcta no hay radio que marcar: el grupo queda vacío y
  // las que sí lo están se señalan una a una, para que se vea lo que hay.
  const selected = type === 'single' && correct.length === 1 ? (correct[0]?.key ?? '') : '';

  function patch(index: number, changes: Partial<DraftOption>): void {
    onChange(options.map((option, at) => (at === index ? { ...option, ...changes } : option)));
  }

  function markOnly(key: string): void {
    onChange(options.map((option) => ({ ...option, isCorrect: option.key === key })));
  }

  const rows = options.map((option, index) => (
    <li key={option.key} className="flex flex-wrap items-center gap-2 py-2">
      <span className="w-5 text-xs text-muted-foreground">{index + 1}</span>

      <div className="flex min-w-50 flex-1 flex-col gap-1">
        <Input
          value={option.text}
          aria-label={`Texto de la opción ${String(index + 1)}`}
          aria-invalid={issueFor(`options.${String(index)}.text`) !== undefined}
          onChange={(event) => {
            patch(index, { text: event.target.value });
          }}
        />
        {issueFor(`options.${String(index)}.text`) !== undefined && (
          <p className="text-xs text-destructive" role="alert">
            {issueFor(`options.${String(index)}.text`)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {type === 'single' ? (
          <RadioGroupItem
            value={option.key}
            id={`correct-${option.key}`}
            aria-label={`La opción ${String(index + 1)} es la correcta`}
          />
        ) : (
          <Checkbox
            id={`correct-${option.key}`}
            checked={option.isCorrect}
            aria-label={`La opción ${String(index + 1)} es correcta`}
            onCheckedChange={(checked) => {
              patch(index, { isCorrect: checked === true });
            }}
          />
        )}
        <Label htmlFor={`correct-${option.key}`}>Correcta</Label>
        {singleConflict && option.isCorrect && <Badge variant="outline">marcada</Badge>}
      </div>

      <div className="ml-auto flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={index === 0}
          title={`Subir la opción ${String(index + 1)}`}
          aria-label={`Subir la opción ${String(index + 1)}`}
          onClick={() => {
            onChange(moveAt(options, index, -1));
          }}
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={index === options.length - 1}
          title={`Bajar la opción ${String(index + 1)}`}
          aria-label={`Bajar la opción ${String(index + 1)}`}
          onClick={() => {
            onChange(moveAt(options, index, 1));
          }}
        >
          <ChevronDown aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={`Quitar la opción ${String(index + 1)}`}
          aria-label={`Quitar la opción ${String(index + 1)}`}
          onClick={() => {
            onChange(options.filter((_, at) => at !== index));
          }}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  ));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Opciones</legend>
      <p className="text-xs text-muted-foreground">{QUESTION_TYPE_HINTS[type]}</p>

      {singleConflict && (
        <Alert>
          <AlertTitle>Hay {String(correct.length)} opciones marcadas como correctas</AlertTitle>
          <AlertDescription>
            La selección única admite una sola. No se ha desmarcado ninguna: elige con el botón cuál
            es la correcta y las demás se desmarcarán.
          </AlertDescription>
        </Alert>
      )}

      {issueFor('options') !== undefined && (
        <p className="text-xs text-destructive" role="alert">
          {issueFor('options')}
        </p>
      )}

      {type === 'single' ? (
        <RadioGroup value={selected} onValueChange={markOnly} aria-label="Opción correcta">
          <ul className="divide-y">{rows}</ul>
        </RadioGroup>
      ) : (
        <ul className="divide-y">{rows}</ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          onChange([...options, emptyOption()]);
        }}
      >
        <Plus aria-hidden="true" />
        Añadir opción
      </Button>
    </fieldset>
  );
}
