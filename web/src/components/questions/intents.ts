import type { Question, QuestionTransition } from '@web/lib/api/questions';

/**
 * Lo que el listado pide y la pantalla resuelve. La fila no llama a la API ni
 * abre diálogos: solo dice qué se ha pedido y sobre qué pregunta, igual que en
 * el árbol de contenido.
 */
export type QuestionIntent =
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly question: Question }
  | {
      readonly kind: 'transition';
      readonly question: Question;
      readonly transition: QuestionTransition;
    };

/** Archivada es terminal; publicada vuelve a borrador para arreglarla. */
export function transitionsFor(question: Question): readonly QuestionTransition[] {
  if (question.status === 'draft') return ['publish', 'archive'];
  if (question.status === 'published') return ['unpublish', 'archive'];

  return [];
}
