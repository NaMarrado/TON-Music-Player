import type Database from 'better-sqlite3';

export function migrateSchema(db: Database.Database): void {
  const playlistColumns = db.prepare("PRAGMA table_info('playlists')").all() as Array<{ name: string }>;
  const playlistColumnNames = new Set(playlistColumns.map((column) => column.name));
  const trackColumns = db.prepare("PRAGMA table_info('tracks')").all() as Array<{ name: string }>;
  const trackColumnNames = new Set(trackColumns.map((column) => column.name));
  const playlistTrackColumns = db.prepare("PRAGMA table_info('playlist_tracks')").all() as Array<{ name: string }>;
  const playlistTrackColumnNames = new Set(playlistTrackColumns.map((column) => column.name));
  const downloadColumns = db.prepare("PRAGMA table_info('download_queue')").all() as Array<{ name: string }>;
  const downloadColumnNames = new Set(downloadColumns.map((column) => column.name));

  if (!playlistColumnNames.has('sort_order')) {
    db.exec('ALTER TABLE playlists ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }

  if (!playlistColumnNames.has('cloud_id')) {
    db.exec('ALTER TABLE playlists ADD COLUMN cloud_id TEXT');
  }

  if (!trackColumnNames.has('content_hash_sha256')) {
    db.exec('ALTER TABLE tracks ADD COLUMN content_hash_sha256 TEXT');
  }

  db.exec(`
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
      id               INTEGER PRIMARY KEY,
      import_source_id INTEGER NOT NULL,
      source_track_id  TEXT NOT NULL,
      source_position  INTEGER NOT NULL,
      queue_id         INTEGER,
      track_id         INTEGER,
      created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (import_source_id) REFERENCES playlist_import_sources(id) ON DELETE CASCADE,
      FOREIGN KEY (queue_id) REFERENCES download_queue(id) ON DELETE SET NULL,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE SET NULL,
      UNIQUE (import_source_id, source_position)
    );
  `);

  if (!playlistTrackColumnNames.has('import_item_id')) {
    db.exec(`
      ALTER TABLE playlist_tracks
      ADD COLUMN import_item_id INTEGER REFERENCES playlist_import_items(id) ON DELETE CASCADE
    `);
  }

  if (!downloadColumnNames.has('duration_ms')) {
    db.exec('ALTER TABLE download_queue ADD COLUMN duration_ms INTEGER');
  }

  if (!downloadColumnNames.has('resolved_source_id')) {
    db.exec('ALTER TABLE download_queue ADD COLUMN resolved_source_id TEXT');
  }

  if (!downloadColumnNames.has('resolved_cover_url')) {
    db.exec('ALTER TABLE download_queue ADD COLUMN resolved_cover_url TEXT');
  }

  if (!downloadColumnNames.has('quality_profile')) {
    db.exec("ALTER TABLE download_queue ADD COLUMN quality_profile TEXT NOT NULL DEFAULT 'normal'");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracks_content_hash_sha256 ON tracks(content_hash_sha256);
    DROP INDEX IF EXISTS idx_playlists_cloud_id;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_cloud_id ON playlists(cloud_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_tracks_import_item ON playlist_tracks(import_item_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_import_items_queue ON playlist_import_items(queue_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_import_items_track ON playlist_import_items(track_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_playlist_position ON playlist_tracks(track_id, playlist_id, position);
  `);
}
