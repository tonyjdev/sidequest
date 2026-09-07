import { Shuffle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@web/components/ui/alert';
import { Button } from '@web/components/ui/button';
import type { DraftOption, DraftResource } from '@web/components/questions/draft';
import type { QuestionType } from '@web/lib/api/questions';
import { composeQuestionPreview } from '@web/lib/question-preview';
import { RESOURCE_KIND_WORDS } from '@web/lib/question-labels';

/**
 * Cómo se vería la pregunta en la terminal, con las opciones que se mostrarían.
 * La terminal no dibuja los recursos: enseña sus enlaces.
 *
 * La composición es la de `question-preview.ts` —copia deliberada de la regla de
 * dominio, ver ese módulo—, y es reproducible: la misma semilla da el mismo
 * sorteo, así que la vista no baila mientras se escribe. «Otro sorteo» pide otra
 * combinación cuando se quiere ver una distinta.
 */

interface QuestionPreviewProps {
  readonly statement: string;
  readonly type: QuestionType;
  readonly options: readonly DraftOption[];
  readonly resources: readonly DraftResource[];
  /** El de la pregunta, ya interpretado; `null` usa el global. */
  readonly visibleOptions: number | null;
  readonly visibleOptionsDefault: number;
  readonly seed: number;
  readonly onReshuffle: () => void;
}

export function QuestionPreview({
  statement,
  type,
  options,
  resources,
  visibleOptions,
  visibleOptionsDefault,
  seed,
  onReshuffle,
}: QuestionPreviewProps) {
  const filled = options.filter((option) => option.text.trim() !== '');
  const preview = composeQuestionPreview({
    type,
    options: filled.map((option) => ({
      key: option.key,
      text: option.text.trim(),
      isCorrect: option.isCorrect,
    })),
    visibleOptions,
    visibleOptionsDefault,
    seed,
  });
  const correctShown = preview.options.filter((option) => option.isCorrect).length;
  const links = resources.filter((resource) => resource.url.trim() !== '');

  return (
    <section className="space-y-2" aria-label="Vista previa en la terminal">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Vista previa</h3>
        <Button type="button" variant="outline" size="sm" onClick={onReshuffle}>
          <Shuffle aria-hidden="true" />
          Otro sorteo
        </Button>
      </div>

      <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs whitespace-pre-wrap">
        {renderTerminal(statement, preview.options, links)}
      </pre>

      <p className="text-xs text-muted-foreground">
        Se mostrarían {String(preview.options.length)} de {String(filled.length)} opciones —
        {preview.visibleOptions === visibleOptions
          ? ' las que pide la pregunta'
          : ` el valor global es ${String(visibleOptionsDefault)}`}
        —, {correctShown === 1 ? 'una correcta' : `${String(correctShown)} correctas`}.
      </p>

      {!preview.presentable && (
        <Alert variant="destructive">
          <AlertTitle>Todavía no entraría en el sorteo</AlertTitle>
          <AlertDescription>
            Un intento necesita al menos dos opciones mostradas y una correcta entre ellas.
          </AlertDescription>
        </Alert>
      )}

      {preview.presentable && preview.trivial && (
        <Alert>
          <AlertTitle>Pregunta trivial</AlertTitle>
          <AlertDescription>
            Todas las opciones que se mostrarían son correctas. Es válida, pero no distingue quién
            la sabe.
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

/**
 * El bloque tal como lo escribiría el agente: el enunciado, las opciones
 * numeradas en el orden sorteado y los enlaces de los recursos. No marca cuáles
 * son las correctas, porque en la terminal tampoco se ven.
 */
function renderTerminal(
  statement: string,
  options: readonly { readonly key: string; readonly text: string }[],
  resources: readonly DraftResource[],
): string {
  const lines = [statement.trim() === '' ? '(sin enunciado)' : statement.trim(), ''];

  if (options.length === 0) lines.push('  (sin opciones que mostrar)');
  else options.forEach((option, index) => lines.push(`  ${String(index + 1)}) ${option.text}`));

  if (resources.length > 0) {
    lines.push('', 'Recursos:');

    for (const resource of resources) {
      const label =
        resource.label.trim() === '' ? RESOURCE_KIND_WORDS[resource.kind] : resource.label.trim();

      lines.push(`  - ${label}: ${resource.url.trim()}`);
    }
  }

  return lines.join('\n');
}
