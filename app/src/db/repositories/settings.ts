import type { Database } from '@app/db/client.js';
import { settings as settingsTable } from '@app/db/schema.js';
import type { SettingsRepository } from '@app/domain/repositories.js';
import { settingsFromRows, type SettingRow, type SidequestSettings } from '@app/domain/settings.js';

export function createSettingsRepository(db: Database): SettingsRepository {
  return {
    async read(): Promise<SidequestSettings> {
      return settingsFromRows(await db.select().from(settingsTable));
    },

    /**
     * Escritura parcial y de una pieza: el lote entra completo o no entra, para
     * que un valor rechazado a mitad no deje la configuración descabalada.
     */
    async write(rows: readonly SettingRow[]): Promise<SidequestSettings> {
      return db.transaction(async (tx) => {
        for (const row of rows) {
          await tx
            .insert(settingsTable)
            .values(row)
            .onDuplicateKeyUpdate({ set: { value: row.value, type: row.type } });
        }

        return settingsFromRows(await tx.select().from(settingsTable));
      });
    },
  };
}
