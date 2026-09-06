import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadRootEnvFile } from '@app/config/env-file.js';
import { createDb, type Database } from '@app/db/client.js';
import { resolveTestDatabaseUrl, TEST_DATABASE_NAME, withDatabase } from '@app/db/database-url.js';
import { applyMigrations, rollbackLast } from '@app/db/migrator.js';
import { seedDevelopmentContent } from '@app/db/seeder.js';
import { canConnect } from '@app/db/testing/mysql.js';

/**
 * Invariantes del esquema contra MySQL de verdad: los disparadores, las claves
 * ajenas y la unicidad de los slugs no se pueden probar sin servidor.
 *
 * Crea y borra su propia base —de ahí el usuario `root`—, así que nunca toca la
 * de desarrollo. Sin MySQL a la vista se salta entera en lugar de fallar, para
 * que `pnpm check` siga siendo ejecutable sin Docker.
 *
 * Las pruebas comparten una única base migrada y se ejecutan en orden: la de
 * reversión va la última porque deja el esquema y lo vuelve a levantar.
 */
loadRootEnvFile();

const baseUrl = resolveTestDatabaseUrl(process.env);
// Cadenas vacías cuando no hay configuración: el `describe` entero queda
// saltado, así que nunca se usan.
const adminUrl = baseUrl === null ? '' : withDatabase(baseUrl, null);
const testUrl = baseUrl === null ? '' : withDatabase(baseUrl, TEST_DATABASE_NAME);
const available = baseUrl !== null && (await canConnect(adminUrl));

if (!available) {
  console.warn(
    `[integración] MySQL no responde en la máquina anfitriona: se saltan las pruebas del esquema. Levántalo con \`docker compose up -d\`.`,
  );
}

describe.skipIf(!available)('esquema de base de datos', () => {
  let admin: Connection;
  let connection: Connection;
  let db: Database;

  beforeAll(async () => {
    admin = await createConnection(adminUrl);
    await admin.query(`drop database if exists \`${TEST_DATABASE_NAME}\``);
    await admin.query(`create database \`${TEST_DATABASE_NAME}\``);

    connection = await createConnection(testUrl);
    await applyMigrations(connection);
    db = createDb(connection);
  }, 60_000);

  afterAll(async () => {
    await connection.end();
    await admin.query(`drop database if exists \`${TEST_DATABASE_NAME}\``);
    await admin.end();
  });

  it('deja las once tablas del modelo sobre una base vacía', async () => {
    expect(await tableNames()).toEqual([
      'attempts',
      'question_options',
      'question_resources',
      'question_tag',
      'questions',
      'sessions',
      'settings',
      'subjects',
      'subtopics',
      'tags',
      'topics',
    ]);
  });

  it('siembra los parámetros de la ponderación', async () => {
    const rows = await select<{ key: string; value: string }>(
      'select `key`, `value` from `settings` order by `key`',
    );

    expect(rows).toHaveLength(10);
    expect(rows).toContainEqual({ key: 'visible_options_default', value: '4' });
    expect(rows).toContainEqual({ key: 'weight_new_boost', value: '10' });
    expect(rows).toContainEqual({ key: 'cooldown_hours', value: '24' });
  });

  describe('invariantes de publicación', () => {
    it('impide crear una pregunta ya publicada', async () => {
      const subtopicId = await createContentPath('crear-publicada');

      await expect(
        insertQuestion({ subtopicId, type: 'single', status: 'published' }),
      ).rejects.toThrow(/no se crea publicada/);
    });

    it('impide publicar una pregunta sin opciones', async () => {
      const subtopicId = await createContentPath('sin-opciones');
      const questionId = await insertQuestion({ subtopicId, type: 'single' });

      await expect(publish(questionId)).rejects.toThrow(/al menos dos opciones/);
    });

    it('impide publicar una pregunta sin ninguna opción correcta', async () => {
      const subtopicId = await createContentPath('sin-correcta');
      const questionId = await insertQuestion({ subtopicId, type: 'multiple' });
      await insertOptions(questionId, [false, false]);

      await expect(publish(questionId)).rejects.toThrow(/al menos una opción correcta/);
    });

    it('impide publicar una pregunta de selección única con dos correctas', async () => {
      const subtopicId = await createContentPath('unica-con-dos');
      const questionId = await insertQuestion({ subtopicId, type: 'single' });
      await insertOptions(questionId, [true, true, false]);

      await expect(publish(questionId)).rejects.toThrow(/exactamente una opción correcta/);
    });

    it('publica una pregunta bien formada', async () => {
      const subtopicId = await createContentPath('bien-formada');
      const questionId = await insertQuestion({ subtopicId, type: 'single' });
      await insertOptions(questionId, [true, false, false]);

      await expect(publish(questionId)).resolves.toBeDefined();
    });

    it('impide dejar sin correcta una pregunta ya publicada', async () => {
      const { questionId, optionIds } = await createPublishedQuestion('quitar-correcta', 'single', [
        true,
        false,
      ]);

      await expect(
        connection.query('update `question_options` set `is_correct` = 0 where `id` = ?', [
          optionIds[0],
        ]),
      ).rejects.toThrow(/al menos una opción correcta/);

      // La pregunta sigue publicada y con su correcta: el disparador es BEFORE.
      expect(await correctOptionCount(questionId)).toBe(1);
    });

    it('impide borrar la última opción correcta de una pregunta publicada', async () => {
      const { optionIds } = await createPublishedQuestion('borrar-correcta', 'multiple', [
        true,
        false,
        false,
      ]);

      await expect(
        connection.query('delete from `question_options` where `id` = ?', [optionIds[0]]),
      ).rejects.toThrow(/al menos una opción correcta/);
    });

    it('impide añadir una segunda correcta a una selección única publicada', async () => {
      const { questionId } = await createPublishedQuestion('anadir-correcta', 'single', [
        true,
        false,
      ]);

      await expect(insertOptions(questionId, [true])).rejects.toThrow(
        /exactamente una opción correcta/,
      );
    });

    it('deja tocar las opciones de un borrador y de una archivada', async () => {
      const subtopicId = await createContentPath('sin-publicar');
      const questionId = await insertQuestion({ subtopicId, type: 'single' });
      await insertOptions(questionId, [true, false]);
      await publish(questionId);

      await connection.query("update `questions` set `status` = 'archived' where `id` = ?", [
        questionId,
      ]);

      await expect(insertOptions(questionId, [true])).resolves.toBeDefined();
    });
  });

  describe('jerarquía de contenido', () => {
    it('impide borrar un tema con subtemas y deja archivarlo', async () => {
      const subjectId = await insertSubject('borrar-tema');
      const topicId = await insertTopic(subjectId, 'con-subtemas');
      await insertSubtopic(topicId, 'colgando');

      await expect(
        connection.query('delete from `topics` where `id` = ?', [topicId]),
      ).rejects.toThrow(/foreign key constraint/i);

      await connection.query("update `topics` set `status` = 'archived' where `id` = ?", [topicId]);

      expect(await statusOf('topics', topicId)).toBe('archived');
    });

    it('impide borrar una materia con temas y un subtema con preguntas', async () => {
      const subjectId = await insertSubject('borrar-materia');
      const topicId = await insertTopic(subjectId, 'tema');
      const subtopicId = await insertSubtopic(topicId, 'subtema');
      await insertQuestion({ subtopicId, type: 'single' });

      await expect(
        connection.query('delete from `subjects` where `id` = ?', [subjectId]),
      ).rejects.toThrow(/foreign key constraint/i);
      await expect(
        connection.query('delete from `subtopics` where `id` = ?', [subtopicId]),
      ).rejects.toThrow(/foreign key constraint/i);
    });

    it('exige el slug único dentro de su padre y lo permite repetido fuera', async () => {
      const first = await insertSubject('materia-a');
      const second = await insertSubject('materia-b');

      await insertTopic(first, 'introduccion');

      await expect(insertTopic(first, 'introduccion')).rejects.toThrow(/duplicate entry/i);
      await expect(insertTopic(second, 'introduccion')).resolves.toBeTypeOf('number');
    });
  });

  describe('intentos', () => {
    it('sobrevive al archivado de la pregunta con su copia del enunciado', async () => {
      const { questionId } = await createPublishedQuestion('intento', 'single', [true, false]);

      await connection.query(
        'insert into `attempts` (`question_id`, `question_version`, `subject_name`, `topic_name`, `subtopic_name`, `question_statement`, `question_type`, `difficulty`, `presented_options`, `selected_option_ids`, `is_correct`) values (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          questionId,
          'Materia de entonces',
          'Tema de entonces',
          'Subtema de entonces',
          'Enunciado tal como se mostró',
          'single',
          'medium',
          JSON.stringify([{ option_id: 1, text: 'A', is_correct: true }]),
          JSON.stringify([1]),
          true,
        ],
      );

      await connection.query(
        "update `questions` set `statement` = 'Enunciado editado después', `status` = 'archived' where `id` = ?",
        [questionId],
      );

      const [attempt] = await select<{ question_statement: string; question_version: number }>(
        'select `question_statement`, `question_version` from `attempts` where `question_id` = ?',
        [questionId],
      );

      expect(attempt?.question_statement).toBe('Enunciado tal como se mostró');
      expect(attempt?.question_version).toBe(1);
    });
  });

  describe('versión de la pregunta', () => {
    it('sube sola al editar el contenido', async () => {
      const { questionId } = await createPublishedQuestion('sube-version', 'single', [true, false]);

      expect(await versionOf(questionId)).toBe(1);

      await connection.query(
        "update `questions` set `statement` = 'Otro enunciado' where `id` = ?",
        [questionId],
      );

      expect(await versionOf(questionId)).toBe(2);
    });

    it('no sube al publicar, archivar ni tocar lo que no es contenido', async () => {
      const subtopicId = await createContentPath('version-estable');
      const questionId = await insertQuestion({ subtopicId, type: 'single' });
      await insertOptions(questionId, [true, false]);

      await publish(questionId);
      await connection.query("update `questions` set `status` = 'archived' where `id` = ?", [
        questionId,
      ]);

      expect(await versionOf(questionId)).toBe(1);
    });

    it('ignora la versión que mande quien escribe', async () => {
      const { questionId } = await createPublishedQuestion('version-impuesta', 'single', [
        true,
        false,
      ]);

      await connection.query(
        "update `questions` set `statement` = 'Otro enunciado', `version` = 99 where `id` = ?",
        [questionId],
      );

      expect(await versionOf(questionId)).toBe(2);
    });
  });

  describe('sembrado', () => {
    it('deja contenido publicado y no lo duplica al repetirlo', async () => {
      expect(await seedDevelopmentContent(db)).toBe('seeded');
      expect(await seedDevelopmentContent(db)).toBe('skipped');

      const [counts] = await select<{ preguntas: number; opciones: number }>(
        "select count(distinct q.`id`) as preguntas, count(o.`id`) as opciones from `questions` q join `question_options` o on o.`question_id` = q.`id` join `subtopics` st on st.`id` = q.`subtopic_id` join `topics` t on t.`id` = st.`topic_id` join `subjects` s on s.`id` = t.`subject_id` where q.`status` = 'published' and s.`slug` = 'matematicas'",
      );

      expect(counts?.preguntas).toBe(6);
      expect(counts?.opciones).toBe(29);
    });
  });

  // Va la última: deja el esquema entero y lo vuelve a levantar.
  describe('reversión', () => {
    it('revierte las migraciones aplicadas y las vuelve a aplicar', async () => {
      expect(await rollbackLast(connection)).toBe('0002_parametros_por_defecto');
      expect(await rollbackLast(connection)).toBe('0001_invariantes_de_la_pregunta');
      expect(await rollbackLast(connection)).toBe('0000_esquema_inicial');
      expect(await rollbackLast(connection)).toBeNull();

      // Solo queda el registro de migraciones, que no crea ninguna de ellas.
      expect(await tableNames()).toEqual([]);

      await applyMigrations(connection);

      expect(await tableNames()).toHaveLength(11);
      expect(await triggerNames()).toHaveLength(5);
    }, 60_000);
  });

  // --- Utilidades ---------------------------------------------------------

  async function select<Row>(sql: string, values: unknown[] = []): Promise<Row[]> {
    const [rows] = await connection.query<RowDataPacket[]>(sql, values);

    return rows as Row[];
  }

  async function insertReturningId(sql: string, values: unknown[]): Promise<number> {
    const [result] = await connection.query(sql, values);

    return (result as { insertId: number }).insertId;
  }

  async function tableNames(): Promise<string[]> {
    const rows = await select<{ name: string }>(
      'select `table_name` as `name` from `information_schema`.`tables` where `table_schema` = ? and `table_name` <> ? order by `table_name`',
      [TEST_DATABASE_NAME, '__drizzle_migrations'],
    );

    return rows.map((row) => row.name);
  }

  async function triggerNames(): Promise<string[]> {
    const rows = await select<{ name: string }>(
      'select `trigger_name` as `name` from `information_schema`.`triggers` where `trigger_schema` = ?',
      [TEST_DATABASE_NAME],
    );

    return rows.map((row) => row.name);
  }

  async function statusOf(table: 'topics' | 'questions', id: number): Promise<string | undefined> {
    const rows = await select<{ status: string }>(
      `select \`status\` from \`${table}\` where \`id\` = ?`,
      [id],
    );

    return rows[0]?.status;
  }

  async function versionOf(questionId: number): Promise<number> {
    const rows = await select<{ version: number }>(
      'select `version` from `questions` where `id` = ?',
      [questionId],
    );

    return Number(rows[0]?.version);
  }

  async function correctOptionCount(questionId: number): Promise<number> {
    const rows = await select<{ total: number }>(
      'select count(*) as total from `question_options` where `question_id` = ? and `is_correct` = 1',
      [questionId],
    );

    return Number(rows[0]?.total ?? 0);
  }

  function insertSubject(slug: string): Promise<number> {
    return insertReturningId(
      "insert into `subjects` (`slug`, `name`, `status`) values (?, ?, 'published')",
      [slug, slug],
    );
  }

  function insertTopic(subjectId: number, slug: string): Promise<number> {
    return insertReturningId(
      "insert into `topics` (`subject_id`, `slug`, `name`, `status`) values (?, ?, ?, 'published')",
      [subjectId, slug, slug],
    );
  }

  function insertSubtopic(topicId: number, slug: string): Promise<number> {
    return insertReturningId(
      "insert into `subtopics` (`topic_id`, `slug`, `name`, `status`) values (?, ?, ?, 'published')",
      [topicId, slug, slug],
    );
  }

  /** Materia, tema y subtema publicados, con el slug derivado del caso. */
  async function createContentPath(slug: string): Promise<number> {
    const subjectId = await insertSubject(slug);
    const topicId = await insertTopic(subjectId, slug);

    return insertSubtopic(topicId, slug);
  }

  function insertQuestion(question: {
    subtopicId: number;
    type: 'single' | 'multiple';
    status?: 'draft' | 'published';
  }): Promise<number> {
    return insertReturningId(
      'insert into `questions` (`subtopic_id`, `type`, `statement`, `status`, `content_hash`) values (?, ?, ?, ?, ?)',
      [
        question.subtopicId,
        question.type,
        'Enunciado de prueba',
        question.status ?? 'draft',
        'a'.repeat(64),
      ],
    );
  }

  async function insertOptions(questionId: number, correctness: boolean[]): Promise<number[]> {
    const ids: number[] = [];

    for (const [index, isCorrect] of correctness.entries()) {
      ids.push(
        await insertReturningId(
          'insert into `question_options` (`question_id`, `text`, `is_correct`, `position`) values (?, ?, ?, ?)',
          [questionId, `Opción ${index + 1}`, isCorrect, index + 1],
        ),
      );
    }

    return ids;
  }

  function publish(questionId: number): Promise<unknown> {
    return connection.query("update `questions` set `status` = 'published' where `id` = ?", [
      questionId,
    ]);
  }

  async function createPublishedQuestion(
    slug: string,
    type: 'single' | 'multiple',
    correctness: boolean[],
  ): Promise<{ questionId: number; optionIds: number[] }> {
    const subtopicId = await createContentPath(slug);
    const questionId = await insertQuestion({ subtopicId, type });
    const optionIds = await insertOptions(questionId, correctness);

    await publish(questionId);

    return { questionId, optionIds };
  }
});
