import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import type { RowDataPacket } from 'mysql2';
import type { Connection } from 'mysql2/promise';

import {
  migrationsFolder,
  migrationsTable,
  readDownStatements,
  readJournal,
} from '@app/db/migrations.js';

/**
 * Las dos direcciones de la migración, como funciones y no como script, para
 * que las pruebas de integración puedan aplicar y revertir sobre una base
 * recién creada.
 */

interface AppliedRow extends RowDataPacket {
  created_at: number;
}

/** Aplica las migraciones pendientes, en el orden del journal. */
export async function applyMigrations(connection: Connection): Promise<void> {
  await migrate(drizzle(connection), { migrationsFolder });
}

/**
 * Revierte la última migración aplicada y borra su registro, de modo que
 * `applyMigrations` la vuelva a aplicar. Devuelve el `tag` revertido, o `null`
 * si no había nada aplicado.
 */
export async function rollbackLast(connection: Connection): Promise<string | null> {
  const appliedAt = await lastAppliedAt(connection);

  if (appliedAt === null) {
    return null;
  }

  // El journal es lo único que ata una marca de tiempo con su archivo: la tabla
  // de drizzle solo guarda el hash y el `created_at`.
  const entry = readJournal().find((candidate) => candidate.when === appliedAt);

  if (entry === undefined) {
    throw new Error(
      `La base tiene aplicada una migración con marca ${appliedAt} que no está en meta/_journal.json`,
    );
  }

  for (const statement of readDownStatements(entry.tag)) {
    await connection.query(statement);
  }

  await connection.query(`delete from \`${migrationsTable}\` where created_at = ?`, [appliedAt]);

  return entry.tag;
}

async function lastAppliedAt(connection: Connection): Promise<number | null> {
  const [tables] = await connection.query<RowDataPacket[]>('show tables like ?', [migrationsTable]);

  if (tables.length === 0) {
    return null;
  }

  const [rows] = await connection.query<AppliedRow[]>(
    `select created_at from \`${migrationsTable}\` order by created_at desc limit 1`,
  );

  const last = rows[0];

  return last === undefined ? null : Number(last.created_at);
}
