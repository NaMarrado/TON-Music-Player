import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate002(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_tracks_soundcloud_id ON tracks(soundcloud_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_track ON playlist_tracks(playlist_id, track_id);
  `);
}
