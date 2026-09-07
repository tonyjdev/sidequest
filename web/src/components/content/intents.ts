import type { ContentLevel, ContentNode } from '@web/lib/api/content';

/**
 * Lo que el árbol pide y la pantalla resuelve. El listado no llama a la API ni
 * abre diálogos: solo dice qué se ha pedido y sobre qué nodo, para que quien
 * decide siga siendo uno —`TopicsPage`— y no cada fila por su cuenta.
 */

/** El padre sobre el que se actúa, con su nombre para poder titular el diálogo. */
export interface ParentRef {
  readonly id: number;
  readonly name: string;
}

export type ContentIntent =
  | { readonly kind: 'create'; readonly level: ContentLevel; readonly parent: ParentRef | null }
  | { readonly kind: 'edit'; readonly level: ContentLevel; readonly node: ContentNode }
  | { readonly kind: 'publish'; readonly level: ContentLevel; readonly node: ContentNode }
  | { readonly kind: 'archive'; readonly level: ContentLevel; readonly node: ContentNode }
  | { readonly kind: 'reorder'; readonly level: ContentLevel; readonly parent: ParentRef | null };
