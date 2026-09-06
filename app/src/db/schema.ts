/**
 * Esquema de base de datos de Sidequest (docs/especificacion.md §3).
 *
 * Un único archivo a propósito: drizzle-kit empaqueta este módulo para generar
 * las migraciones y no resuelve los alias `@app/*` del proyecto. Sin imports
 * internos, el esquema se puede leer entero y generar sin sorpresas.
 *
 * Tres reglas gobiernan las decisiones de aquí:
 *
 * - **Nada se borra.** Todas las claves ajenas de contenido son `restrict`; el
 *   retirado se hace con `status = 'archived'`.
 * - **Los intentos son inmutables.** `attempts` copia los nombres, el enunciado
 *   y las opciones mostradas en vez de referenciarlos.
 * - **La jerarquía tiene tres niveles fijos**: `subjects` → `topics` →
 *   `subtopics`. La pregunta cuelga siempre de un subtema.
 */

import {
  bigint,
  boolean,
  char,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/** Estados del contenido (docs/decisiones.md §6). Solo `published` entra en el sorteo. */
export const contentStatuses = ['draft', 'published', 'archived'] as const;
export const questionTypes = ['single', 'multiple'] as const;
export const difficulties = ['easy', 'medium', 'hard'] as const;
export const resourceKinds = ['image', 'video', 'page', 'document'] as const;

/**
 * `upload` ya está en el enum aunque v1 solo use `external`: admitir subidas más
 * adelante no debe obligar a migrar (docs/decisiones.md §2).
 */
export const storageKinds = ['external', 'upload'] as const;

/** Tipo declarado del valor de un parámetro, para que el panel sepa cómo editarlo. */
export const settingTypes = ['string', 'number', 'boolean', 'json'] as const;

export type ContentStatus = (typeof contentStatuses)[number];
export type QuestionType = (typeof questionTypes)[number];
export type Difficulty = (typeof difficulties)[number];
export type ResourceKind = (typeof resourceKinds)[number];
export type StorageKind = (typeof storageKinds)[number];
export type SettingType = (typeof settingTypes)[number];

// --- Jerarquía de contenido -------------------------------------------------

export const subjects = mysqlTable(
  'subjects',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    slug: varchar('slug', { length: 120 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    status: mysqlEnum('status', contentStatuses).notNull().default('draft'),
    position: int('position').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex('subjects_slug_unq').on(table.slug),
    index('subjects_status_idx').on(table.status, table.position),
  ],
);

export const topics = mysqlTable(
  'topics',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    subjectId: bigint('subject_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    slug: varchar('slug', { length: 120 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    status: mysqlEnum('status', contentStatuses).notNull().default('draft'),
    position: int('position').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // El slug es único por materia, no globalmente: dos materias pueden tener
    // un tema «introduccion» sin chocar.
    uniqueIndex('topics_subject_slug_unq').on(table.subjectId, table.slug),
    index('topics_status_idx').on(table.status, table.position),
  ],
);

export const subtopics = mysqlTable(
  'subtopics',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    topicId: bigint('topic_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => topics.id, { onDelete: 'restrict' }),
    slug: varchar('slug', { length: 120 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    status: mysqlEnum('status', contentStatuses).notNull().default('draft'),
    position: int('position').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex('subtopics_topic_slug_unq').on(table.topicId, table.slug),
    index('subtopics_status_idx').on(table.status, table.position),
  ],
);

// --- Preguntas --------------------------------------------------------------

export const questions = mysqlTable(
  'questions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    subtopicId: bigint('subtopic_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => subtopics.id, { onDelete: 'restrict' }),
    type: mysqlEnum('type', questionTypes).notNull(),
    statement: text('statement').notNull(),
    explanation: text('explanation'),
    difficulty: mysqlEnum('difficulty', difficulties).notNull().default('medium'),
    status: mysqlEnum('status', contentStatuses).notNull().default('draft'),
    // `null` usa el valor global de `settings.visible_options_default`.
    visibleOptions: tinyint('visible_options', { unsigned: true }),
    version: int('version').notNull().default(1),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // Candidatas al sorteo: estado primero, que es la igualdad que siempre está.
    index('questions_status_subtopic_idx').on(table.status, table.subtopicId),
    // No único a propósito: un duplicado es una advertencia de la importación,
    // no una violación de integridad (docs/especificacion.md §3.4).
    index('questions_subtopic_hash_idx').on(table.subtopicId, table.contentHash),
  ],
);

export const questionOptions = mysqlTable('question_options', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  questionId: bigint('question_id', { mode: 'number', unsigned: true })
    .notNull()
    .references(() => questions.id, { onDelete: 'restrict' }),
  text: text('text').notNull(),
  isCorrect: boolean('is_correct').notNull().default(false),
  // Orden de autoría. El de presentación se sortea en cada intento.
  position: int('position').notNull().default(0),
});

export const questionResources = mysqlTable('question_resources', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  questionId: bigint('question_id', { mode: 'number', unsigned: true })
    .notNull()
    .references(() => questions.id, { onDelete: 'restrict' }),
  kind: mysqlEnum('kind', resourceKinds).notNull(),
  url: varchar('url', { length: 2048 }).notNull(),
  label: varchar('label', { length: 160 }),
  storageKind: mysqlEnum('storage_kind', storageKinds).notNull().default('external'),
  position: int('position').notNull().default(0),
});

// --- Etiquetas --------------------------------------------------------------

export const tags = mysqlTable(
  'tags',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    slug: varchar('slug', { length: 120 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('tags_slug_unq').on(table.slug)],
);

export const questionTag = mysqlTable(
  'question_tag',
  {
    questionId: bigint('question_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    tagId: bigint('tag_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ name: 'question_tag_pk', columns: [table.questionId, table.tagId] }),
    // La clave primaria ya resuelve «etiquetas de una pregunta»; este índice
    // resuelve el camino contrario, «preguntas de una etiqueta».
    index('question_tag_tag_idx').on(table.tagId),
  ],
);

// --- Sesiones de trabajo ----------------------------------------------------

export const sessions = mysqlTable(
  'sessions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    agent: varchar('agent', { length: 60 }).notNull(),
    externalRef: varchar('external_ref', { length: 190 }),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
    askedCount: int('asked_count').notNull().default(0),
    pausedUntil: timestamp('paused_until'),
    pausedForQuestions: int('paused_for_questions'),
  },
  (table) => [
    // `POST /sessions` abre o **reutiliza** una sesión: sin unicidad, dos
    // llamadas con la misma referencia partirían los contadores en dos. MySQL
    // permite varias filas con `external_ref` nulo, que son sesiones anónimas.
    uniqueIndex('sessions_agent_ref_unq').on(table.agent, table.externalRef),
  ],
);

// --- Intentos ---------------------------------------------------------------

/**
 * Registro inmutable y única fuente de verdad del histórico. Guarda copia del
 * enunciado, de la ruta de contenido y de las opciones mostradas, para que un
 * intento antiguo siga siendo interpretable si la pregunta se edita o se
 * archiva después (docs/especificacion.md §3.9).
 */
export const attempts = mysqlTable(
  'attempts',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    // `set null` en vez de `restrict`: el intento sobrevive a la pregunta. Que
    // las preguntas no se borren es política de la aplicación, no de esta FK.
    questionId: bigint('question_id', { mode: 'number', unsigned: true }).references(
      () => questions.id,
      { onDelete: 'set null' },
    ),
    sessionId: bigint('session_id', { mode: 'number', unsigned: true }).references(
      () => sessions.id,
      { onDelete: 'set null' },
    ),
    questionVersion: int('question_version').notNull(),
    subjectName: varchar('subject_name', { length: 160 }).notNull(),
    topicName: varchar('topic_name', { length: 160 }).notNull(),
    subtopicName: varchar('subtopic_name', { length: 160 }).notNull(),
    questionStatement: text('question_statement').notNull(),
    questionType: mysqlEnum('question_type', questionTypes).notNull(),
    difficulty: mysqlEnum('difficulty', difficulties).notNull(),
    /** `[{ option_id, text, is_correct }]`, en el orden en que se mostraron. */
    presentedOptions: json('presented_options').notNull(),
    /** Ids elegidos por quien responde, dentro de los mostrados. */
    selectedOptionIds: json('selected_option_ids').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    answeredAt: timestamp('answered_at').notNull().defaultNow(),
  },
  (table) => [
    index('attempts_question_answered_idx').on(table.questionId, table.answeredAt),
    // Evolución temporal y ventana de enfriamiento.
    index('attempts_answered_at_idx').on(table.answeredAt),
    // Agregados por contenido: el nivel pedido es el prefijo del índice.
    index('attempts_content_idx').on(table.subjectName, table.topicName, table.subtopicName),
    index('attempts_difficulty_idx').on(table.difficulty),
  ],
);

// --- Parámetros -------------------------------------------------------------

/** Clave/valor, **una fila por parámetro** (docs/especificacion.md §3.10). */
export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 120 }).primaryKey(),
  value: text('value').notNull(),
  type: mysqlEnum('type', settingTypes).notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});
