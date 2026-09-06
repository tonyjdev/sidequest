import type { Attempt, AttemptDraft } from '@app/domain/attempts.js';
import type {
  ContentPatch,
  NewSubject,
  NewSubtopic,
  NewTopic,
  Subject,
  Subtopic,
  Topic,
} from '@app/domain/content.js';
import type {
  NewQuestion,
  NewQuestionOption,
  NewQuestionResource,
  Question,
  QuestionDetail,
  QuestionPatch,
  Tag,
} from '@app/domain/questions.js';
import type { Session, SessionKey, SessionPause } from '@app/domain/sessions.js';
import type { SettingRow, SidequestSettings } from '@app/domain/settings.js';
import type { ContentStatus, Difficulty } from '@app/domain/types.js';

/**
 * Puertos de persistencia. El dominio habla con estas interfaces y no sabe si
 * detrás hay MySQL o un mapa en memoria: `db/repositories/` trae la
 * implementación real y `domain/testing/in-memory.ts` la que usan las pruebas.
 *
 * Los puertos guardan y leen; no deciden. Las invariantes se comprueban antes de
 * llamarlos, en los servicios del dominio. Lo único que sí les pertenece es la
 * atomicidad: cuando una operación exige varias escrituras —crear una pregunta
 * con sus opciones, archivar un árbol— el puerto la ofrece como una sola, y cada
 * implementación la hace indivisible con lo que tenga.
 */

export interface ContentQuery {
  readonly statuses?: readonly ContentStatus[] | undefined;
}

export interface TopicQuery extends ContentQuery {
  readonly subjectIds?: readonly number[] | undefined;
}

export interface SubtopicQuery extends ContentQuery {
  readonly topicIds?: readonly number[] | undefined;
}

export interface SubjectRepository {
  list(query?: ContentQuery): Promise<Subject[]>;
  findById(id: number): Promise<Subject | null>;
  findBySlug(slug: string): Promise<Subject | null>;
  create(input: NewSubject): Promise<Subject>;
  update(id: number, patch: ContentPatch): Promise<Subject>;
  setStatus(id: number, status: ContentStatus): Promise<Subject>;
  /** Archiva la materia y, en la misma operación, sus temas y sus subtemas. */
  archiveTree(id: number): Promise<Subject>;
  /** Reparte `position` 1..n en el orden recibido, de una sola vez. */
  reorder(ids: readonly number[]): Promise<Subject[]>;
}

export interface TopicRepository {
  list(query?: TopicQuery): Promise<Topic[]>;
  findById(id: number): Promise<Topic | null>;
  findBySlug(subjectId: number, slug: string): Promise<Topic | null>;
  create(input: NewTopic): Promise<Topic>;
  update(id: number, patch: ContentPatch): Promise<Topic>;
  setStatus(id: number, status: ContentStatus): Promise<Topic>;
  /** Archiva el tema y sus subtemas. */
  archiveTree(id: number): Promise<Topic>;
  reorder(subjectId: number, ids: readonly number[]): Promise<Topic[]>;
}

export interface SubtopicRepository {
  list(query?: SubtopicQuery): Promise<Subtopic[]>;
  findById(id: number): Promise<Subtopic | null>;
  findBySlug(topicId: number, slug: string): Promise<Subtopic | null>;
  create(input: NewSubtopic): Promise<Subtopic>;
  update(id: number, patch: ContentPatch): Promise<Subtopic>;
  setStatus(id: number, status: ContentStatus): Promise<Subtopic>;
  archive(id: number): Promise<Subtopic>;
  reorder(topicId: number, ids: readonly number[]): Promise<Subtopic[]>;
}

export interface QuestionQuery {
  readonly statuses?: readonly ContentStatus[] | undefined;
  readonly subtopicIds?: readonly number[] | undefined;
  readonly difficulties?: readonly Difficulty[] | undefined;
  readonly tagIds?: readonly number[] | undefined;
  /** Coincidencia parcial en el enunciado, sin distinguir mayúsculas ni acentos. */
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

/**
 * Lo que hace falta para crear una pregunta completa. Se pide el estado final:
 * la base impide crear una pregunta ya publicada —en ese instante todavía no
 * tiene opciones—, así que el camino borrador → opciones → publicar lo recorre
 * el repositorio dentro de una sola transacción.
 */
export interface NewQuestionInput {
  readonly question: NewQuestion;
  readonly status: ContentStatus;
  readonly options: readonly NewQuestionOption[];
  readonly resources: readonly NewQuestionResource[];
  readonly tagIds: readonly number[];
}

/**
 * La edición del agregado, en una sola operación. Lo que no viene no se toca, y
 * la colección que viene sustituye entera a la anterior.
 *
 * Es una y no cuatro porque una pregunta a medio editar —opciones nuevas con el
 * enunciado viejo, o al revés— no es un estado que deba llegar a existir: la
 * pregunta se lee y se escribe como una unidad.
 */
export interface QuestionUpdate {
  readonly patch: QuestionPatch;
  readonly options?: readonly NewQuestionOption[] | undefined;
  readonly resources?: readonly NewQuestionResource[] | undefined;
  readonly tagIds?: readonly number[] | undefined;
}

export interface QuestionRepository {
  list(query?: QuestionQuery): Promise<Question[]>;
  findById(id: number): Promise<QuestionDetail | null>;
  /** Duplicados dentro del mismo subtema: es una advertencia de la importación, no un veto. */
  findByContentHash(subtopicId: number, contentHash: string): Promise<Question[]>;
  /**
   * Cuántas preguntas cuelgan de cada subtema, en cualquier estado: el panel
   * cuenta lo que hay, no lo que está publicado. Los subtemas sin ninguna no
   * aparecen en el mapa.
   */
  countBySubtopic(subtopicIds: readonly number[]): Promise<ReadonlyMap<number, number>>;
  create(input: NewQuestionInput): Promise<QuestionDetail>;
  update(id: number, update: QuestionUpdate): Promise<QuestionDetail>;
  setStatus(id: number, status: ContentStatus): Promise<Question>;
}

export interface TagRepository {
  list(): Promise<Tag[]>;
  findById(id: number): Promise<Tag | null>;
  findBySlug(slug: string): Promise<Tag | null>;
  create(input: { readonly slug: string; readonly name: string }): Promise<Tag>;
  update(
    id: number,
    patch: { readonly slug?: string | undefined; readonly name?: string | undefined },
  ): Promise<Tag>;
}

export interface SessionRepository {
  /** Abre la sesión o continúa la que ya existía para `(agent, external_ref)`. */
  openOrReuse(key: SessionKey): Promise<Session>;
  findById(id: number): Promise<Session | null>;
  /** Suma una pregunta servida y actualiza `last_seen_at`. */
  registerAsked(id: number): Promise<Session>;
  pause(id: number, pause: SessionPause): Promise<Session>;
}

export interface AttemptQuery {
  readonly questionIds?: readonly number[] | undefined;
  readonly sessionId?: number | undefined;
  readonly answeredSince?: Date | undefined;
  readonly limit?: number | undefined;
}

export interface AttemptRepository {
  record(draft: AttemptDraft): Promise<Attempt>;
  findById(id: number): Promise<Attempt | null>;
  list(query?: AttemptQuery): Promise<Attempt[]>;
}

export interface SettingsRepository {
  read(): Promise<SidequestSettings>;
  /** Escribe solo las filas recibidas y devuelve la configuración resultante. */
  write(rows: readonly SettingRow[]): Promise<SidequestSettings>;
}

/** Todo lo que el dominio necesita de la persistencia, en un solo objeto. */
export interface Repositories {
  readonly subjects: SubjectRepository;
  readonly topics: TopicRepository;
  readonly subtopics: SubtopicRepository;
  readonly questions: QuestionRepository;
  readonly tags: TagRepository;
  readonly sessions: SessionRepository;
  readonly attempts: AttemptRepository;
  readonly settings: SettingsRepository;
}
