import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate007(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_playlist_position
      ON playlist_tracks(track_id, playlist_id, position);
    UPDATE tracks SET in_library = 1;
    UPDATE playlist_tracks SET file_path = NULL;
    INSERT OR REPLACE INTO settings (key, value)
    VALUES ('storage_layout_version', '2');
  `);
}
