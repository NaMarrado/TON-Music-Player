import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate005(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    UPDATE download_queue
    SET source = 'spotify'
    WHERE source = 'youtube'
      AND (url LIKE '%spotify.com/%' OR url LIKE 'spotify:%');

    CREATE TABLE IF NOT EXISTS playlist_import_sources (
      id          INTEGER PRIMARY KEY,
      playlist_id INTEGER NOT NULL UNIQUE,
      source      TEXT NOT NULL,
      source_id   TEXT NOT NULL,
      source_url  TEXT NOT NULL,
      source_name TEXT NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      UNIQUE (source, source_id)
    );

    CREATE TABLE IF NOT EXISTS playlist_import_items (
      id              INTEGER PRIMARY KEY,
      import_source_id INTEGER NOT NULL,
      source_track_id TEXT NOT NULL,
      source_position INTEGER NOT NULL,
      queue_id        INTEGER,
      track_id        INTEGER,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (import_source_id) REFERENCES playlist_import_sources(id) ON DELETE CASCADE,
      FOREIGN KEY (queue_id) REFERENCES download_queue(id) ON DELETE SET NULL,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE SET NULL,
      UNIQUE (import_source_id, source_position)
    );

    ALTER TABLE playlist_tracks
      ADD COLUMN import_item_id INTEGER REFERENCES playlist_import_items(id) ON DELETE CASCADE;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_tracks_import_item
      ON playlist_tracks(import_item_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_import_items_queue
      ON playlist_import_items(queue_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_import_items_track
      ON playlist_import_items(track_id);
  `);
}
