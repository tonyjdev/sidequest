import type { Attempt, AttemptDraft } from '@app/domain/attempts.js';
import type {
  ContentFields,
  ContentPatch,
  NewSubject,
  NewSubtopic,
  NewTopic,
  Subject,
  Subtopic,
  Topic,
} from '@app/domain/content.js';
import { contentHashOf } from '@app/domain/content-hash.js';
import { NotFoundError } from '@app/domain/errors.js';
import {
  assertPublishableQuestion,
  type NewQuestionOption,
  type NewQuestionResource,
  type Question,
  type QuestionDetail,
  type QuestionOption,
  type QuestionPatch,
  type QuestionResource,
  type Tag,
} from '@app/domain/questions.js';
import type {
  AttemptQuery,
  CandidatePage,
  CandidateQuery,
  ContentQuery,
  NewQuestionInput,
  QuestionQuery,
  QuestionUpdate,
  Repositories,
  SubtopicQuery,
  TopicQuery,
} from '@app/domain/repositories.js';
import type { QuestionCandidate, SelectionFilter } from '@app/domain/selection.js';
import type { Session, SessionKey, SessionPause } from '@app/domain/sessions.js';
import {
  settingsFromRows,
  settingsToRows,
  DEFAULT_SETTINGS,
  type SettingRow,
  type SidequestSettings,
} from '@app/domain/settings.js';
import type { ContentStatus } from '@app/domain/types.js';

/**
 * Repositorios en memoria: los mismos puertos, sin MySQL delante.
 *
 * Existen para que el dominio se pueda probar entero sin base de datos, que es
 * uno de los criterios de aceptación de SQST-0006. Imitan a propósito lo que la
 * base impone por su cuenta —el `content_hash` derivado, la versión que sube
 * sola al editar contenido, las invariantes de publicación—, de modo que una
 * prueba que pasa aquí no se caiga contra MySQL.
 *
 * No se empaquetan en `dist`: `tsconfig.build.json` los excluye.
 */

export interface InMemoryRepositories extends Repositories {
  /** Vacía los almacenes y reinicia los contadores de id. */
  reset(): void;
}

export function createInMemoryRepositories(): InMemoryRepositories {
  let sequence = 0;
  const nextId = (): number => ++sequence;

  let subjects: Subject[] = [];
  let topics: Topic[] = [];
  let subtopics: Subtopic[] = [];
  let questions: Question[] = [];
  let options: QuestionOption[] = [];
  let resources: QuestionResource[] = [];
  let tags: Tag[] = [];
  let questionTags: { questionId: number; tagId: number }[] = [];
  let sessions: Session[] = [];
  let attempts: Attempt[] = [];
  let settingRows: SettingRow[] = settingsToRows(DEFAULT_SETTINGS);

  const now = (): Date => new Date();

  function byStatus<T extends { status: ContentStatus }>(
    rows: readonly T[],
    query: ContentQuery | undefined,
  ): T[] {
    const statuses = query?.statuses;

    return rows.filter((row) => statuses === undefined || statuses.includes(row.status));
  }

  function ordered<T extends { position: number; id: number }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.position - b.position || a.id - b.id);
  }

  /** Reparte `position` 1..n entre los ids recibidos y deja quietos a los demás. */
  function withPositions<T extends { id: number; position: number; updatedAt: Date }>(
    rows: T[],
    ids: readonly number[],
    belongs: (row: T) => boolean,
  ): T[] {
    const positions = new Map(ids.map((id, index) => [id, index + 1]));

    return rows.map((row) => {
      const position = positions.get(row.id);

      return position === undefined || !belongs(row) ? row : { ...row, position, updatedAt: now() };
    });
  }

  function patched<T extends ContentFields>(row: T, patch: ContentPatch): T {
    return {
      ...row,
      slug: patch.slug ?? row.slug,
      name: patch.name ?? row.name,
      description: patch.description === undefined ? row.description : patch.description,
      position: patch.position ?? row.position,
      updatedAt: now(),
    };
  }

  function replace<T extends { id: number }>(rows: T[], updated: T): T {
    const index = rows.findIndex((row) => row.id === updated.id);

    rows[index] = updated;

    return updated;
  }

  function requireRow<T extends { id: number }>(rows: readonly T[], id: number, label: string): T {
    const row = rows.find((candidate) => candidate.id === id);

    if (row === undefined) throw new NotFoundError(label, { id });

    return row;
  }

  function detailOf(question: Question): QuestionDetail {
    const tagIds = new Set(
      questionTags.filter((link) => link.questionId === question.id).map((link) => link.tagId),
    );

    return {
      question,
      options: ordered(options.filter((option) => option.questionId === question.id)),
      resources: ordered(resources.filter((resource) => resource.questionId === question.id)),
      tags: tags.filter((tag) => tagIds.has(tag.id)).sort((a, b) => a.id - b.id),
    };
  }

  // Mismo criterio que el disparador `questions_before_update`: publicar,
  // archivar o mover la pregunta de subtema no son ediciones de contenido.
  function nextVersion(question: Question, patch: QuestionPatch): number {
    const edited =
      (patch.statement !== undefined && patch.statement !== question.statement) ||
      (patch.explanation !== undefined && patch.explanation !== question.explanation) ||
      (patch.type !== undefined && patch.type !== question.type) ||
      (patch.difficulty !== undefined && patch.difficulty !== question.difficulty) ||
      (patch.visibleOptions !== undefined && patch.visibleOptions !== question.visibleOptions);

    return edited ? question.version + 1 : question.version;
  }

  function insertOptions(
    questionId: number,
    values: readonly NewQuestionOption[],
  ): QuestionOption[] {
    const inserted = values.map((value, index) => ({
      id: nextId(),
      questionId,
      text: value.text,
      isCorrect: value.isCorrect,
      position: index + 1,
    }));

    options.push(...inserted);

    return inserted;
  }

  function insertResources(
    questionId: number,
    values: readonly NewQuestionResource[],
  ): QuestionResource[] {
    const inserted = values.map((value, index) => ({
      id: nextId(),
      questionId,
      kind: value.kind,
      url: value.url,
      label: value.label,
      storageKind: value.storageKind,
      position: index + 1,
    }));

    resources.push(...inserted);

    return inserted;
  }

  /**
   * La transacción del adaptador real, imitada: una escritura del agregado que
   * rompa una invariante a mitad no puede dejar rastro, o la prueba en memoria
   * diría que sí se puede.
   */
  function atomically<T>(run: () => T): Promise<T> {
    const snapshot = {
      questions: [...questions],
      options: [...options],
      resources: [...resources],
      questionTags: [...questionTags],
    };

    try {
      return Promise.resolve(run());
    } catch (error) {
      questions = snapshot.questions;
      options = snapshot.options;
      resources = snapshot.resources;
      questionTags = snapshot.questionTags;

      // Rechazo y no excepción: el adaptador real tampoco falla antes de
      // devolver la promesa, y quien llama al puerto no debería notar cuál de
      // los dos tiene delante.
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Lo mismo que hace el `LIKE` del adaptador sobre una cotejación
   * `utf8mb4_0900_ai_ci`: ni mayúsculas ni acentos cuentan.
   */
  function matchesSearch(statement: string, search: string | undefined): boolean {
    const term = search?.trim() ?? '';

    return term === '' || folded(statement).includes(folded(term));
  }

  function folded(text: string): string {
    return text
      .normalize('NFD')
      .replaceAll(/\p{Diacritic}/gu, '')
      .toLowerCase();
  }

  /** El equivalente de los disparadores de `0001`, para que la prueba falle igual aquí. */
  function assertStillPublishable(questionId: number): void {
    const question = requireRow(questions, questionId, 'La pregunta no existe');

    if (question.status !== 'published') return;

    assertPublishableQuestion(
      question.type,
      options.filter((option) => option.questionId === questionId),
    );
  }

  /**
   * La cadena de tres eslabones publicada, con el tema y la materia de cada
   * subtema: el equivalente de los tres `inner join` del adaptador.
   */
  function publishedPaths(): Map<number, { subjectId: number; topicId: number }> {
    const openSubjects = new Set(
      subjects.filter((subject) => subject.status === 'published').map((subject) => subject.id),
    );
    const openTopics = new Map(
      topics
        .filter((topic) => topic.status === 'published' && openSubjects.has(topic.subjectId))
        .map((topic) => [topic.id, topic.subjectId]),
    );
    const paths = new Map<number, { subjectId: number; topicId: number }>();

    for (const subtopic of subtopics) {
      const subjectId = openTopics.get(subtopic.topicId);

      if (subtopic.status !== 'published' || subjectId === undefined) continue;

      paths.set(subtopic.id, { subjectId, topicId: subtopic.topicId });
    }

    return paths;
  }

  function matchesSelectionFilter(
    question: Question,
    path: { subjectId: number; topicId: number },
    filter: SelectionFilter,
  ): boolean {
    const tagged = new Set(
      questionTags.filter((link) => link.questionId === question.id).map((link) => link.tagId),
    );

    return (
      (filter.subjectIds?.includes(path.subjectId) ?? true) &&
      (filter.topicIds?.includes(path.topicId) ?? true) &&
      (filter.subtopicIds?.includes(question.subtopicId) ?? true) &&
      (filter.difficulties?.includes(question.difficulty) ?? true) &&
      (filter.tagIds === undefined || filter.tagIds.some((tagId) => tagged.has(tagId)))
    );
  }

  /** El `group by` del adaptador: cuántos intentos, cuántos aciertos y el último. */
  function attemptStats(
    questionId: number,
  ): Pick<QuestionCandidate, 'attemptCount' | 'correctCount' | 'lastAnsweredAt'> {
    let attemptCount = 0;
    let correctCount = 0;
    let lastAnsweredAt: Date | null = null;

    for (const attempt of attempts) {
      if (attempt.questionId !== questionId) continue;

      attemptCount += 1;

      if (attempt.isCorrect) correctCount += 1;
      if (lastAnsweredAt === null || attempt.answeredAt > lastAnsweredAt) {
        lastAnsweredAt = attempt.answeredAt;
      }
    }

    return { attemptCount, correctCount, lastAnsweredAt };
  }

  function newContentNode(fields: ContentFields): Subject {
    const timestamp = now();

    return {
      id: nextId(),
      slug: fields.slug,
      name: fields.name,
      description: fields.description,
      status: fields.status,
      position: fields.position,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  return {
    reset(): void {
      sequence = 0;
      subjects = [];
      topics = [];
      subtopics = [];
      questions = [];
      options = [];
      resources = [];
      tags = [];
      questionTags = [];
      sessions = [];
      attempts = [];
      settingRows = settingsToRows(DEFAULT_SETTINGS);
    },

    subjects: {
      list(query?: ContentQuery): Promise<Subject[]> {
        return Promise.resolve(ordered(byStatus(subjects, query)));
      },
      findById(id: number): Promise<Subject | null> {
        return Promise.resolve(subjects.find((subject) => subject.id === id) ?? null);
      },
      findBySlug(slug: string): Promise<Subject | null> {
        return Promise.resolve(subjects.find((subject) => subject.slug === slug) ?? null);
      },
      create(input: NewSubject): Promise<Subject> {
        const subject = newContentNode(input);

        subjects.push(subject);

        return Promise.resolve(subject);
      },
      update(id: number, patch: ContentPatch): Promise<Subject> {
        const subject = requireRow(subjects, id, 'La materia no existe');

        return Promise.resolve(replace(subjects, patched(subject, patch)));
      },
      setStatus(id: number, status: ContentStatus): Promise<Subject> {
        const subject = requireRow(subjects, id, 'La materia no existe');

        return Promise.resolve(replace(subjects, { ...subject, status, updatedAt: now() }));
      },
      archiveTree(id: number): Promise<Subject> {
        const subject = requireRow(subjects, id, 'La materia no existe');
        const topicIds = topics.filter((topic) => topic.subjectId === id).map((topic) => topic.id);

        subtopics = subtopics.map((subtopic) =>
          topicIds.includes(subtopic.topicId)
            ? { ...subtopic, status: 'archived', updatedAt: now() }
            : subtopic,
        );
        topics = topics.map((topic) =>
          topic.subjectId === id ? { ...topic, status: 'archived', updatedAt: now() } : topic,
        );

        return Promise.resolve(
          replace(subjects, { ...subject, status: 'archived', updatedAt: now() }),
        );
      },
      reorder(ids: readonly number[]): Promise<Subject[]> {
        subjects = withPositions(subjects, ids, () => true);

        return Promise.resolve(ordered(subjects));
      },
    },

    topics: {
      list(query?: TopicQuery): Promise<Topic[]> {
        const subjectIds = query?.subjectIds;

        return Promise.resolve(
          ordered(
            byStatus(topics, query).filter(
              (topic) => subjectIds === undefined || subjectIds.includes(topic.subjectId),
            ),
          ),
        );
      },
      findById(id: number): Promise<Topic | null> {
        return Promise.resolve(topics.find((topic) => topic.id === id) ?? null);
      },
      findBySlug(subjectId: number, slug: string): Promise<Topic | null> {
        return Promise.resolve(
          topics.find((topic) => topic.subjectId === subjectId && topic.slug === slug) ?? null,
        );
      },
      create(input: NewTopic): Promise<Topic> {
        const topic = { ...newContentNode(input), subjectId: input.subjectId };

        topics.push(topic);

        return Promise.resolve(topic);
      },
      update(id: number, patch: ContentPatch): Promise<Topic> {
        const topic = requireRow(topics, id, 'El tema no existe');

        return Promise.resolve(replace(topics, patched(topic, patch)));
      },
      setStatus(id: number, status: ContentStatus): Promise<Topic> {
        const topic = requireRow(topics, id, 'El tema no existe');

        return Promise.resolve(replace(topics, { ...topic, status, updatedAt: now() }));
      },
      archiveTree(id: number): Promise<Topic> {
        const topic = requireRow(topics, id, 'El tema no existe');

        subtopics = subtopics.map((subtopic) =>
          subtopic.topicId === id
            ? { ...subtopic, status: 'archived', updatedAt: now() }
            : subtopic,
        );

        return Promise.resolve(replace(topics, { ...topic, status: 'archived', updatedAt: now() }));
      },
      reorder(subjectId: number, ids: readonly number[]): Promise<Topic[]> {
        topics = withPositions(topics, ids, (topic) => topic.subjectId === subjectId);

        return Promise.resolve(ordered(topics.filter((topic) => topic.subjectId === subjectId)));
      },
    },

    subtopics: {
      list(query?: SubtopicQuery): Promise<Subtopic[]> {
        const topicIds = query?.topicIds;

        return Promise.resolve(
          ordered(
            byStatus(subtopics, query).filter(
              (subtopic) => topicIds === undefined || topicIds.includes(subtopic.topicId),
            ),
          ),
        );
      },
      findById(id: number): Promise<Subtopic | null> {
        return Promise.resolve(subtopics.find((subtopic) => subtopic.id === id) ?? null);
      },
      findBySlug(topicId: number, slug: string): Promise<Subtopic | null> {
        return Promise.resolve(
          subtopics.find((subtopic) => subtopic.topicId === topicId && subtopic.slug === slug) ??
            null,
        );
      },
      create(input: NewSubtopic): Promise<Subtopic> {
        const subtopic = { ...newContentNode(input), topicId: input.topicId };

        subtopics.push(subtopic);

        return Promise.resolve(subtopic);
      },
      update(id: number, patch: ContentPatch): Promise<Subtopic> {
        const subtopic = requireRow(subtopics, id, 'El subtema no existe');

        return Promise.resolve(replace(subtopics, patched(subtopic, patch)));
      },
      setStatus(id: number, status: ContentStatus): Promise<Subtopic> {
        const subtopic = requireRow(subtopics, id, 'El subtema no existe');

        return Promise.resolve(replace(subtopics, { ...subtopic, status, updatedAt: now() }));
      },
      archive(id: number): Promise<Subtopic> {
        const subtopic = requireRow(subtopics, id, 'El subtema no existe');

        return Promise.resolve(
          replace(subtopics, { ...subtopic, status: 'archived', updatedAt: now() }),
        );
      },
      reorder(topicId: number, ids: readonly number[]): Promise<Subtopic[]> {
        subtopics = withPositions(subtopics, ids, (subtopic) => subtopic.topicId === topicId);

        return Promise.resolve(
          ordered(subtopics.filter((subtopic) => subtopic.topicId === topicId)),
        );
      },
    },

    questions: {
      list(query?: QuestionQuery): Promise<Question[]> {
        const tagged = new Set(
          questionTags
            .filter((link) => query?.tagIds?.includes(link.tagId) ?? false)
            .map((link) => link.questionId),
        );

        const rows = questions
          .filter((question) => query?.statuses?.includes(question.status) ?? true)
          .filter((question) => query?.subtopicIds?.includes(question.subtopicId) ?? true)
          .filter((question) => query?.difficulties?.includes(question.difficulty) ?? true)
          .filter((question) => query?.tagIds === undefined || tagged.has(question.id))
          .filter((question) => matchesSearch(question.statement, query?.search))
          .sort((a, b) => a.id - b.id);

        const offset = query?.offset ?? 0;

        return Promise.resolve(rows.slice(offset, offset + (query?.limit ?? rows.length)));
      },
      findById(id: number): Promise<QuestionDetail | null> {
        const question = questions.find((candidate) => candidate.id === id);

        return Promise.resolve(question === undefined ? null : detailOf(question));
      },
      findByContentHash(subtopicId: number, contentHash: string): Promise<Question[]> {
        return Promise.resolve(
          questions.filter(
            (question) =>
              question.subtopicId === subtopicId && question.contentHash === contentHash,
          ),
        );
      },
      countBySubtopic(subtopicIds: readonly number[]): Promise<ReadonlyMap<number, number>> {
        const counts = new Map<number, number>();

        for (const question of questions) {
          if (!subtopicIds.includes(question.subtopicId)) continue;

          counts.set(question.subtopicId, (counts.get(question.subtopicId) ?? 0) + 1);
        }

        return Promise.resolve(counts);
      },
      listSelectionCandidates(query: CandidateQuery): Promise<CandidatePage> {
        const { filter, cooldownSince, afterId, limit } = query;
        const paths = publishedPaths();
        const candidates: QuestionCandidate[] = [];

        for (const question of [...questions].sort((a, b) => a.id - b.id)) {
          const path = paths.get(question.subtopicId);

          if (question.status !== 'published' || path === undefined) continue;
          if (afterId !== undefined && question.id <= afterId) continue;
          if (!matchesSelectionFilter(question, path, filter)) continue;

          const stats = attemptStats(question.id);

          if (
            cooldownSince !== null &&
            stats.lastAnsweredAt !== null &&
            stats.lastAnsweredAt > cooldownSince
          ) {
            continue;
          }

          candidates.push({
            questionId: question.id,
            subtopicId: question.subtopicId,
            difficulty: question.difficulty,
            ...stats,
          });

          if (candidates.length === limit) break;
        }

        return Promise.resolve({
          candidates,
          nextCursor: candidates.length < limit ? null : (candidates.at(-1)?.questionId ?? null),
        });
      },

      create(input: NewQuestionInput): Promise<QuestionDetail> {
        const timestamp = now();
        // Nace en borrador aunque se pida publicada, igual que contra MySQL: la
        // publicación es el último paso, cuando ya tiene opciones.
        const question: Question = {
          id: nextId(),
          subtopicId: input.question.subtopicId,
          type: input.question.type,
          statement: input.question.statement,
          explanation: input.question.explanation,
          difficulty: input.question.difficulty,
          status: 'draft',
          visibleOptions: input.question.visibleOptions,
          version: 1,
          contentHash: contentHashOf(input.question.statement),
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        questions.push(question);
        insertOptions(question.id, input.options);
        insertResources(question.id, input.resources);
        questionTags.push(...input.tagIds.map((tagId) => ({ questionId: question.id, tagId })));

        if (input.status === 'draft') return Promise.resolve(detailOf(question));

        assertPublishableQuestion(question.type, input.options);

        return Promise.resolve(
          detailOf(replace(questions, { ...question, status: input.status, updatedAt: now() })),
        );
      },
      update(id: number, update: QuestionUpdate): Promise<QuestionDetail> {
        const { patch } = update;

        return atomically(() => {
          const question = requireRow(questions, id, 'La pregunta no existe');
          const updated: Question = {
            ...question,
            subtopicId: patch.subtopicId ?? question.subtopicId,
            type: patch.type ?? question.type,
            statement: patch.statement ?? question.statement,
            explanation: patch.explanation === undefined ? question.explanation : patch.explanation,
            difficulty: patch.difficulty ?? question.difficulty,
            visibleOptions:
              patch.visibleOptions === undefined ? question.visibleOptions : patch.visibleOptions,
            version: nextVersion(question, patch),
            contentHash:
              patch.statement === undefined ? question.contentHash : contentHashOf(patch.statement),
            updatedAt: now(),
          };

          replace(questions, updated);

          if (update.options !== undefined) {
            options = options.filter((option) => option.questionId !== id);
            insertOptions(id, update.options);
          }

          if (update.resources !== undefined) {
            resources = resources.filter((resource) => resource.questionId !== id);
            insertResources(id, update.resources);
          }

          if (update.tagIds !== undefined) {
            questionTags = questionTags.filter((link) => link.questionId !== id);
            questionTags.push(...update.tagIds.map((tagId) => ({ questionId: id, tagId })));
          }

          assertStillPublishable(id);

          return detailOf(updated);
        });
      },

      setStatus(id: number, status: ContentStatus): Promise<Question> {
        const question = requireRow(questions, id, 'La pregunta no existe');
        const updated = replace(questions, { ...question, status, updatedAt: now() });

        assertStillPublishable(id);

        return Promise.resolve(updated);
      },
    },

    tags: {
      list(): Promise<Tag[]> {
        return Promise.resolve([...tags].sort((a, b) => a.id - b.id));
      },
      findById(id: number): Promise<Tag | null> {
        return Promise.resolve(tags.find((tag) => tag.id === id) ?? null);
      },
      findBySlug(slug: string): Promise<Tag | null> {
        return Promise.resolve(tags.find((tag) => tag.slug === slug) ?? null);
      },
      create(input: { slug: string; name: string }): Promise<Tag> {
        const tag: Tag = { id: nextId(), slug: input.slug, name: input.name, createdAt: now() };

        tags.push(tag);

        return Promise.resolve(tag);
      },
      update(
        id: number,
        patch: { slug?: string | undefined; name?: string | undefined },
      ): Promise<Tag> {
        const tag = requireRow(tags, id, 'La etiqueta no existe');

        return Promise.resolve(
          replace(tags, { ...tag, slug: patch.slug ?? tag.slug, name: patch.name ?? tag.name }),
        );
      },
    },

    sessions: {
      openOrReuse(key: SessionKey): Promise<Session> {
        const existing = sessions.find(
          (session) => session.agent === key.agent && session.externalRef === key.externalRef,
        );

        if (existing !== undefined) {
          return Promise.resolve(replace(sessions, { ...existing, lastSeenAt: now() }));
        }

        const timestamp = now();
        const session: Session = {
          id: nextId(),
          agent: key.agent,
          externalRef: key.externalRef,
          startedAt: timestamp,
          lastSeenAt: timestamp,
          askedCount: 0,
          pausedUntil: null,
          pausedForQuestions: null,
        };

        sessions.push(session);

        return Promise.resolve(session);
      },
      findById(id: number): Promise<Session | null> {
        return Promise.resolve(sessions.find((session) => session.id === id) ?? null);
      },
      registerAsked(id: number): Promise<Session> {
        const session = requireRow(sessions, id, 'La sesión no existe');

        return Promise.resolve(
          replace(sessions, {
            ...session,
            askedCount: session.askedCount + 1,
            lastSeenAt: now(),
          }),
        );
      },
      pause(id: number, pause: SessionPause): Promise<Session> {
        const session = requireRow(sessions, id, 'La sesión no existe');

        return Promise.resolve(
          replace(sessions, {
            ...session,
            pausedUntil: pause.until,
            pausedForQuestions: pause.forQuestions,
            lastSeenAt: now(),
          }),
        );
      },
    },

    attempts: {
      record(draft: AttemptDraft): Promise<Attempt> {
        const attempt: Attempt = { ...draft, id: nextId(), answeredAt: now() };

        attempts.push(attempt);

        return Promise.resolve(attempt);
      },
      findById(id: number): Promise<Attempt | null> {
        return Promise.resolve(attempts.find((attempt) => attempt.id === id) ?? null);
      },
      list(query?: AttemptQuery): Promise<Attempt[]> {
        const rows = attempts
          .filter(
            (attempt) =>
              query?.questionIds === undefined ||
              (attempt.questionId !== null && query.questionIds.includes(attempt.questionId)),
          )
          .filter(
            (attempt) => query?.sessionId === undefined || attempt.sessionId === query.sessionId,
          )
          .filter(
            (attempt) =>
              query?.answeredSince === undefined || attempt.answeredAt >= query.answeredSince,
          )
          .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime() || b.id - a.id);

        return Promise.resolve(query?.limit === undefined ? rows : rows.slice(0, query.limit));
      },
    },

    settings: {
      read(): Promise<SidequestSettings> {
        return Promise.resolve(settingsFromRows(settingRows));
      },
      write(rows: readonly SettingRow[]): Promise<SidequestSettings> {
        for (const row of rows) {
          const index = settingRows.findIndex((existing) => existing.key === row.key);

          if (index === -1) settingRows.push(row);
          else settingRows[index] = row;
        }

        return Promise.resolve(settingsFromRows(settingRows));
      },
    },
  };
}
