import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Remembers that this device has created or observed the permanent V2
 * activation marker. Existing V2 installations start unconfirmed so their
 * first sync backfills the marker before the 304-only polling path is allowed.
 */
export async function migrate010(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(cloud_sync_state)');
  if (!columns.some((column) => column.name === 'activation_marker_confirmed')) {
    await db.execAsync(`
      ALTER TABLE cloud_sync_state
        ADD COLUMN activation_marker_confirmed INTEGER NOT NULL DEFAULT 0;
    `);
  }
}
