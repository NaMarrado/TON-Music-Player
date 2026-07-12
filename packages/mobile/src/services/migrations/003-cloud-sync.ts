import type { SQLiteDatabase } from 'expo-sqlite';

async function columnExists(db: SQLiteDatabase, table: string, column: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('${table}')`);
  return rows.some((row) => row.name === column);
}

export async function migrate003(db: SQLiteDatabase): Promise<void> {
  if (!(await columnExists(db, 'tracks', 'content_hash_sha256'))) {
    await db.execAsync('ALTER TABLE tracks ADD COLUMN content_hash_sha256 TEXT');
  }

  if (!(await columnExists(db, 'playlists', 'cloud_id'))) {
    await db.execAsync('ALTER TABLE playlists ADD COLUMN cloud_id TEXT');
  }

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_tracks_content_hash_sha256 ON tracks(content_hash_sha256);
    DROP INDEX IF EXISTS idx_playlists_cloud_id;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_cloud_id ON playlists(cloud_id);
  `);
}
