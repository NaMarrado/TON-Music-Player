import type { SQLiteDatabase } from 'expo-sqlite';

async function columnExists(db: SQLiteDatabase, table: string, column: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('${table}')`);
  return rows.some((row) => row.name === column);
}

export async function migrate004(db: SQLiteDatabase): Promise<void> {
  if (!(await columnExists(db, 'download_queue', 'settled_notification_sent_at'))) {
    await db.execAsync(
      'ALTER TABLE download_queue ADD COLUMN settled_notification_sent_at INTEGER',
    );
  }

  await db.execAsync(`
    UPDATE download_queue
    SET settled_notification_sent_at = COALESCE(completed_at, created_at, strftime('%s','now'))
    WHERE status IN ('completed', 'error')
      AND settled_notification_sent_at IS NULL;
  `);
}
