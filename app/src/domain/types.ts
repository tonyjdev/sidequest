/**
 * Vocabulario del dominio: los conjuntos cerrados de valores que gobiernan el
 * contenido, las preguntas y los intentos.
 *
 * Están declarados aquí y no en `db/schema.ts` porque son una decisión de
 * producto (docs/decisiones.md §6, §2), no de persistencia. El esquema los
 * repite porque drizzle-kit lo empaqueta suelto y no resuelve los alias
 * `@app/*`; `types.test.ts` comprueba que las dos listas no se separen.
 */

/** Estados del contenido. Solo `published` entra en el sorteo. */
export const contentStatuses = ['draft', 'published', 'archived'] as const;
export const questionTypes = ['single', 'multiple'] as const;
export const difficulties = ['easy', 'medium', 'hard'] as const;
export const resourceKinds = ['image', 'video', 'page', 'document'] as const;
export const storageKinds = ['external', 'upload'] as const;
export const settingTypes = ['string', 'number', 'boolean', 'json'] as const;

export type ContentStatus = (typeof contentStatuses)[number];
export type QuestionType = (typeof questionTypes)[number];
export type Difficulty = (typeof difficulties)[number];
export type ResourceKind = (typeof resourceKinds)[number];
export type StorageKind = (typeof storageKinds)[number];
export type SettingType = (typeof settingTypes)[number];

/** Los tres niveles fijos de la jerarquía de contenido (docs/decisiones.md §1). */
export const contentLevels = ['subject', 'topic', 'subtopic'] as const;
export type ContentLevel = (typeof contentLevels)[number];
