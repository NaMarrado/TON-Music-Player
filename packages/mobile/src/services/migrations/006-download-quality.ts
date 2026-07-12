import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate006(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info('download_queue')");
  if (!columns.some((column) => column.name === 'quality_profile')) {
    await db.execAsync(
      "ALTER TABLE download_queue ADD COLUMN quality_profile TEXT NOT NULL DEFAULT 'normal'",
    );
  }
}
