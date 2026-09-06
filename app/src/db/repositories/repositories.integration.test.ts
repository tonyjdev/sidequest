import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadRootEnvFile } from '@app/config/env-file.js';
import { createDb } from '@app/db/client.js';
import { resolveTestDatabaseUrl, TEST_DATABASE_NAME, withDatabase } from '@app/db/database-url.js';
import { applyMigrations } from '@app/db/migrator.js';
import { createRepositories } from '@app/db/repositories/index.js';
import { canConnect } from '@app/db/testing/mysql.js';
import { recordAttempt } from '@app/domain/attempts-service.js';
import {
  changeSubjectStatus,
  changeSubtopicStatus,
  changeTopicStatus,
  createSubject,
  createSubtopic,
  createTopic,
} from '@app/domain/content-service.js';
import {
  changeQuestionStatus,
  createQuestion,
  createTag,
  findDuplicateQuestions,
  replaceQuestionOptions,
  setQuestionTags,
  updateQuestion,
} from '@app/domain/questions-service.js';
import type { Repositories } from '@app/domain/repositories.js';
import { DEFAULT_SETTINGS, settingsToRows } from '@app/domain/settings.js';
import { readSettings, updateSettings } from '@app/domain/settings-service.js';

/**
 * Los adaptadores Drizzle contra MySQL de verdad.
 *
 * Lo que se prueba aquí es justo lo que un doble en memoria no puede demostrar:
 * que las transacciones recorren el camino borrador → opciones → publicar sin
 * despertar los disparadores, que un lote roto no deja media pregunta escrita, y
 * que las columnas JSON del intento van y vuelven con la forma acordada.
 *
 * Usa su propia base —de ahí el usuario `root`— para no cruzarse con la suite
 * del esquema, y se salta entera sin MySQL delante.
 */
loadRootEnvFile();

const DATABASE_NAME = `${TEST_DATABASE_NAME}_repositorios`;

const baseUrl = resolveTestDatabaseUrl(process.env);
const adminUrl = baseUrl === null ? '' : withDatabase(baseUrl, null);
const testUrl = baseUrl === null ? '' : withDatabase(baseUrl, DATABASE_NAME);
const available = baseUrl !== null && (await canConnect(adminUrl));

if (!available) {
  console.warn(
    '[integración] MySQL no responde en la máquina anfitriona: se saltan las pruebas de los repositorios. Levántalo con `docker compose up -d`.',
  );
}

const CONTENT_TABLES = [
  'attempts',
  'question_tag',
  'question_options',
  'question_resources',
  'questions',
  'subtopics',
  'topics',
  'subjects',
  'tags',
  'sessions',
];

describe.skipIf(!available)('repositorios sobre MySQL', () => {
  let admin: Connection;
  let connection: Connection;
  let repos: Repositories;

  beforeAll(async () => {
    admin = await createConnection(adminUrl);
    await admin.query(`drop database if exists \`${DATABASE_NAME}\``);
    await admin.query(`create database \`${DATABASE_NAME}\``);

    connection = await createConnection(testUrl);
    await applyMigrations(connection);
    repos = createRepositories(createDb(connection));
  }, 60_000);

  afterAll(async () => {
    await connection.end();
    await admin.query(`drop database if exists \`${DATABASE_NAME}\``);
    await admin.end();
  });

  beforeEach(async () => {
    // `truncate` no dispara los disparadores de borrado, así que vaciar no
    // tropieza con las invariantes de la pregunta.
    await connection.query('set foreign_key_checks = 0');

    for (const table of CONTENT_TABLES) {
      await connection.query(`truncate table \`${table}\``);
    }

    await connection.query('set foreign_key_checks = 1');
    await repos.settings.write(settingsToRows(DEFAULT_SETTINGS));
  });

  describe('jerarquía de contenido', () => {
    it('crea en borrador y publica eslabón a eslabón', async () => {
      const subject = await createSubject(repos, { slug: 'matematicas', name: 'Matemáticas' });
      const topic = await createTopic(repos, subject.id, { slug: 'algebra', name: 'Álgebra' });

      expect(subject.status).toBe('draft');
      await expect(changeTopicStatus(repos, topic.id, 'published')).rejects.toThrow(
        /cuya materia no está publicada/,
      );

      await changeSubjectStatus(repos, subject.id, 'published');

      await expect(changeTopicStatus(repos, topic.id, 'published')).resolves.toMatchObject({
        status: 'published',
      });
    });

    it('archiva la materia y, en la misma transacción, sus temas y subtemas', async () => {
      const { subjectId, topicId, subtopicId } = await publishedPath();

      await changeSubjectStatus(repos, subjectId, 'archived');

      expect(await statusOf('subjects', subjectId)).toBe('archived');
      expect(await statusOf('topics', topicId)).toBe('archived');
      expect(await statusOf('subtopics', subtopicId)).toBe('archived');
    });

    it('exige el slug único dentro de su padre', async () => {
      const { subjectId } = await publishedPath();

      await expect(
        createTopic(repos, subjectId, { slug: 'algebra', name: 'Otra álgebra' }),
      ).rejects.toThrow(/Ya existe un tema/);
    });

    it('filtra el listado por estado', async () => {
      const { subjectId } = await publishedPath();
      await createSubject(repos, { slug: 'fisica', name: 'Física' });

      const published = await repos.subjects.list({ statuses: ['published'] });

      expect(published.map((subject) => subject.id)).toEqual([subjectId]);
    });

    it('reparte las posiciones de una sola vez y en el orden recibido', async () => {
      const { subjectId } = await publishedPath();
      const geometry = await createTopic(repos, subjectId, {
        slug: 'geometria',
        name: 'Geometría',
      });
      const analysis = await createTopic(repos, subjectId, {
        slug: 'analisis',
        name: 'Análisis',
      });
      const [algebra] = await repos.topics.list({ subjectIds: [subjectId] });

      const reordered = await repos.topics.reorder(subjectId, [
        analysis.id,
        algebra?.id ?? 0,
        geometry.id,
      ]);

      expect(reordered.map((topic) => [topic.slug, topic.position])).toEqual([
        ['analisis', 1],
        ['algebra', 2],
        ['geometria', 3],
      ]);
    });

    it('no mueve un tema de otra materia aunque llegue su id', async () => {
      const { subjectId } = await publishedPath();
      const other = await createSubject(repos, { slug: 'fisica', name: 'Física' });
      const alien = await createTopic(repos, other.id, {
        slug: 'cinematica',
        name: 'Cinemática',
      });

      await repos.topics.reorder(subjectId, [alien.id]);

      expect((await repos.topics.findById(alien.id))?.position).toBe(0);
    });

    it('cuenta las preguntas de cada subtema en una sola consulta', async () => {
      const { subtopicId } = await publishedQuestion();
      const empty = await createSubtopic(repos, await requireTopicId(subtopicId), {
        slug: 'polinomios',
        name: 'Polinomios',
      });

      const counts = await repos.questions.countBySubtopic([subtopicId, empty.id]);

      expect(counts.get(subtopicId)).toBe(1);
      expect(counts.get(empty.id)).toBeUndefined();
    });
  });

  describe('preguntas', () => {
    it('crea la pregunta publicada pasando por borrador, sin despertar los disparadores', async () => {
      const { subtopicId } = await publishedPath();

      const detail = await createQuestion(repos, {
        subtopicId,
        type: 'single',
        statement: '¿Cuál es la solución de 2x + 6 = 0?',
        options: [
          { text: 'x = −3', isCorrect: true },
          { text: 'x = 3', isCorrect: false },
        ],
        publish: true,
      });

      expect(detail.question.status).toBe('published');
      expect(detail.question.version).toBe(1);
      expect(detail.options.map((option) => option.position)).toEqual([1, 2]);
    });

    it('no deja media pregunta escrita cuando el lote rompe una invariante', async () => {
      const { subtopicId } = await publishedPath();

      // Se llama al repositorio directamente, saltándose la comprobación del
      // servicio: lo que se prueba es que la transacción se deshace entera.
      const failure = await rejectionOf(
        repos.questions.create({
          question: {
            subtopicId,
            type: 'single',
            statement: 'Una pregunta que no llega a publicarse',
            explanation: null,
            difficulty: 'medium',
            visibleOptions: null,
          },
          status: 'published',
          options: [{ text: 'única', isCorrect: true }],
          resources: [],
          tagIds: [],
        }),
      );

      expect(messageChain(failure)).toMatch(/al menos dos opciones/);
      expect(await repos.questions.list()).toEqual([]);
      expect(await countRows('question_options')).toBe(0);
    });

    it('reemplaza las opciones de una pregunta publicada', async () => {
      const { questionId } = await publishedQuestion();

      const options = await replaceQuestionOptions(repos, questionId, [
        { text: 'nueva correcta', isCorrect: true },
        { text: 'nuevo distractor', isCorrect: false },
        { text: 'otro distractor', isCorrect: false },
      ]);

      expect(options).toHaveLength(3);
      expect(await statusOf('questions', questionId)).toBe('published');
    });

    it('deja intactas las opciones cuando el reemplazo rompe la invariante', async () => {
      const { questionId } = await publishedQuestion();

      await expect(
        replaceQuestionOptions(repos, questionId, [
          { text: 'a', isCorrect: false },
          { text: 'b', isCorrect: false },
        ]),
      ).rejects.toThrow(/al menos una opción correcta/);

      const detail = await repos.questions.findById(questionId);

      expect(detail?.options.map((option) => option.text)).toEqual(['x = −3', 'x = 3']);
      expect(await statusOf('questions', questionId)).toBe('published');
    });

    it('sube la versión y rehace el hash al editar el enunciado', async () => {
      const { questionId, contentHash } = await publishedQuestion();

      const updated = await updateQuestion(repos, questionId, {
        statement: 'Un enunciado completamente distinto',
      });

      expect(updated.version).toBe(2);
      expect(updated.contentHash).not.toBe(contentHash);
    });

    it('no sube la versión al archivar', async () => {
      const { questionId } = await publishedQuestion();

      const archived = await changeQuestionStatus(repos, questionId, 'archived');

      expect(archived.version).toBe(1);
    });

    it('encuentra el duplicado por enunciado normalizado dentro del subtema', async () => {
      const { questionId, subtopicId } = await publishedQuestion();

      const found = await findDuplicateQuestions(
        repos,
        subtopicId,
        '  ¿CUÁL   es la solución de 2x + 6 = 0?  ',
      );

      expect(found.map((question) => question.id)).toEqual([questionId]);
    });

    it('reemplaza las etiquetas y filtra el listado por ellas', async () => {
      const { questionId } = await publishedQuestion();
      const algebra = await createTag(repos, { slug: 'algebra', name: 'Álgebra' });
      const definiciones = await createTag(repos, { slug: 'definiciones', name: 'Definiciones' });

      await setQuestionTags(repos, questionId, [algebra.id, definiciones.id]);

      expect(await setQuestionTags(repos, questionId, [definiciones.id])).toEqual([definiciones]);
      expect(await repos.questions.list({ tagIds: [algebra.id] })).toEqual([]);
      expect(
        (await repos.questions.list({ tagIds: [definiciones.id] })).map((row) => row.id),
      ).toEqual([questionId]);
    });

    it('guarda los recursos con su orden de presentación', async () => {
      const { subtopicId } = await publishedPath();

      const detail = await createQuestion(repos, {
        subtopicId,
        type: 'single',
        statement: '¿Qué es un polinomio?',
        options: [
          { text: 'a', isCorrect: true },
          { text: 'b', isCorrect: false },
        ],
        resources: [
          {
            kind: 'page',
            url: 'https://es.wikipedia.org/wiki/Polinomio',
            label: 'Polinomio',
            storageKind: 'external',
          },
        ],
      });

      expect(detail.resources[0]).toMatchObject({ position: 1, storageKind: 'external' });
    });
  });

  describe('sesiones', () => {
    it('reutiliza la sesión de la misma referencia en vez de partir los contadores', async () => {
      const first = await repos.sessions.openOrReuse({ agent: 'claude', externalRef: 'abc' });
      const again = await repos.sessions.openOrReuse({ agent: 'claude', externalRef: 'abc' });

      expect(again.id).toBe(first.id);

      await repos.sessions.registerAsked(first.id);

      expect((await repos.sessions.findById(first.id))?.askedCount).toBe(1);
    });

    it('separa las sesiones de agentes distintos', async () => {
      const claude = await repos.sessions.openOrReuse({ agent: 'claude', externalRef: null });
      const codex = await repos.sessions.openOrReuse({ agent: 'codex', externalRef: null });

      expect(codex.id).not.toBe(claude.id);
    });

    it('persiste la pausa', async () => {
      const session = await repos.sessions.openOrReuse({ agent: 'claude', externalRef: 'pausa' });
      const until = new Date(Date.now() + 60_000);

      const paused = await repos.sessions.pause(session.id, { until, forQuestions: 3 });

      expect(paused.pausedForQuestions).toBe(3);
      expect(paused.pausedUntil).not.toBeNull();
    });
  });

  describe('intentos', () => {
    it('guarda y devuelve las opciones mostradas', async () => {
      const { questionId } = await publishedQuestion();
      const session = await repos.sessions.openOrReuse({ agent: 'claude', externalRef: 'sesion' });

      const attempt = await recordAttempt(repos, {
        questionId,
        sessionId: session.id,
        questionVersion: 1,
        subjectName: 'Matemáticas',
        topicName: 'Álgebra',
        subtopicName: 'Ecuaciones',
        questionStatement: '¿Cuál es la solución de 2x + 6 = 0?',
        questionType: 'single',
        difficulty: 'medium',
        presentedOptions: [
          { optionId: 1, text: 'x = −3', isCorrect: true },
          { optionId: 2, text: 'x = 3', isCorrect: false },
        ],
        selectedOptionIds: [1],
        isCorrect: true,
      });

      const stored = await repos.attempts.findById(attempt.id);

      expect(stored?.presentedOptions).toEqual([
        { optionId: 1, text: 'x = −3', isCorrect: true },
        { optionId: 2, text: 'x = 3', isCorrect: false },
      ]);
      expect(stored?.selectedOptionIds).toEqual([1]);
    });

    it('escribe el JSON con las claves acordadas en la especificación', async () => {
      const { questionId } = await publishedQuestion();

      await recordAttempt(repos, {
        questionId,
        sessionId: null,
        questionVersion: 1,
        subjectName: 'Matemáticas',
        topicName: 'Álgebra',
        subtopicName: 'Ecuaciones',
        questionStatement: 'Enunciado tal como se mostró',
        questionType: 'single',
        difficulty: 'medium',
        presentedOptions: [
          { optionId: 9, text: 'x = −3', isCorrect: true },
          { optionId: 10, text: 'x = 3', isCorrect: false },
        ],
        selectedOptionIds: [9],
        isCorrect: true,
      });

      const [row] = await select<{ presented: string }>(
        'select json_extract(`presented_options`, "$[0].option_id") as presented from `attempts` limit 1',
      );

      expect(Number(row?.presented)).toBe(9);
    });

    it('sobrevive a la edición y al archivado de la pregunta', async () => {
      const { questionId } = await publishedQuestion();

      const attempt = await recordAttempt(repos, {
        questionId,
        sessionId: null,
        questionVersion: 1,
        subjectName: 'Matemáticas',
        topicName: 'Álgebra',
        subtopicName: 'Ecuaciones',
        questionStatement: 'Enunciado tal como se mostró',
        questionType: 'single',
        difficulty: 'medium',
        presentedOptions: [
          { optionId: 1, text: 'x = −3', isCorrect: true },
          { optionId: 2, text: 'x = 3', isCorrect: false },
        ],
        selectedOptionIds: [1],
        isCorrect: true,
      });

      await updateQuestion(repos, questionId, { statement: 'Enunciado editado después' });
      await changeQuestionStatus(repos, questionId, 'archived');

      const stored = await repos.attempts.findById(attempt.id);

      expect(stored?.questionStatement).toBe('Enunciado tal como se mostró');
      expect(stored?.questionVersion).toBe(1);
    });

    it('filtra por pregunta y por fecha', async () => {
      const { questionId } = await publishedQuestion();

      await recordAttempt(repos, {
        questionId,
        sessionId: null,
        questionVersion: 1,
        subjectName: 'Matemáticas',
        topicName: 'Álgebra',
        subtopicName: 'Ecuaciones',
        questionStatement: 'Enunciado',
        questionType: 'single',
        difficulty: 'medium',
        presentedOptions: [
          { optionId: 1, text: 'a', isCorrect: true },
          { optionId: 2, text: 'b', isCorrect: false },
        ],
        selectedOptionIds: [2],
        isCorrect: false,
      });

      expect(await repos.attempts.list({ questionIds: [questionId] })).toHaveLength(1);
      expect(
        await repos.attempts.list({ answeredSince: new Date(Date.now() + 60_000) }),
      ).toHaveLength(0);
    });
  });

  describe('parámetros', () => {
    it('lee los valores que sembró la migración', async () => {
      expect(await readSettings(repos)).toEqual(DEFAULT_SETTINGS);
    });

    it('escribe solo las claves recibidas', async () => {
      const settings = await updateSettings(repos, { cooldown_hours: 6 });

      expect(settings.cooldownHours).toBe(6);
      expect((await readSettings(repos)).weightNewBoost).toBe(DEFAULT_SETTINGS.weightNewBoost);
    });
  });

  // --- Utilidades ---------------------------------------------------------

  /**
   * Drizzle envuelve el fallo de MySQL en «Failed query: …» y deja el motivo en
   * `cause`, así que el mensaje del disparador se busca en toda la cadena.
   */
  function messageChain(error: unknown): string {
    const messages: string[] = [];

    for (let current = error; current instanceof Error; current = current.cause) {
      messages.push(current.message);
    }

    return messages.join(' | ');
  }

  async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error) {
      return error;
    }

    throw new Error('Se esperaba que la operación fallara y no falló');
  }

  async function select<Row>(sql: string, values: unknown[] = []): Promise<Row[]> {
    const [rows] = await connection.query<RowDataPacket[]>(sql, values);

    return rows as Row[];
  }

  async function statusOf(table: string, id: number): Promise<string | undefined> {
    const rows = await select<{ status: string }>(
      `select \`status\` from \`${table}\` where \`id\` = ?`,
      [id],
    );

    return rows[0]?.status;
  }

  async function countRows(table: string): Promise<number> {
    const rows = await select<{ total: number }>(`select count(*) as total from \`${table}\``);

    return Number(rows[0]?.total ?? 0);
  }

  async function publishedPath(): Promise<{
    subjectId: number;
    topicId: number;
    subtopicId: number;
  }> {
    const subject = await createSubject(repos, { slug: 'matematicas', name: 'Matemáticas' });
    await changeSubjectStatus(repos, subject.id, 'published');

    const topic = await createTopic(repos, subject.id, { slug: 'algebra', name: 'Álgebra' });
    await changeTopicStatus(repos, topic.id, 'published');

    const subtopic = await createSubtopic(repos, topic.id, {
      slug: 'ecuaciones',
      name: 'Ecuaciones',
    });
    await changeSubtopicStatus(repos, subtopic.id, 'published');

    return { subjectId: subject.id, topicId: topic.id, subtopicId: subtopic.id };
  }

  async function requireTopicId(subtopicId: number): Promise<number> {
    const subtopic = await repos.subtopics.findById(subtopicId);

    return subtopic?.topicId ?? 0;
  }

  async function publishedQuestion(): Promise<{
    questionId: number;
    subtopicId: number;
    contentHash: string;
  }> {
    const { subtopicId } = await publishedPath();

    const detail = await createQuestion(repos, {
      subtopicId,
      type: 'single',
      statement: '¿Cuál es la solución de 2x + 6 = 0?',
      options: [
        { text: 'x = −3', isCorrect: true },
        { text: 'x = 3', isCorrect: false },
      ],
      publish: true,
    });

    return {
      questionId: detail.question.id,
      subtopicId,
      contentHash: detail.question.contentHash,
    };
  }
});
