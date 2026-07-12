import path from 'path';
import Database from 'better-sqlite3';
import { migrateSchema } from '../../services/database/migrations';
import { createSchema } from '../../services/database/schema';
import { assert } from './assert';

export function runLegacyDatabaseMigrationCheck(rootDir: string): void {
  const db = new Database(path.join(rootDir, 'legacy-migration.db'));
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE tracks (
      id INTEGER PRIMARY KEY,
      file_path TEXT NOT NULL UNIQUE,
      file_hash TEXT,
      file_size INTEGER,
      file_mtime INTEGER,
      title TEXT,
      artist TEXT,
      album TEXT,
      album_artist TEXT,
      track_number INTEGER,
      disc_number INTEGER,
      duration_ms INTEGER,
      genre TEXT,
      year INTEGER,
      bitrate INTEGER,
      sample_rate INTEGER,
      format TEXT,
      cover_art_path TEXT,
      loudness_lufs REAL,
      loudness_gain REAL,
      youtube_id TEXT,
      spotify_id TEXT,
      soundcloud_id TEXT,
      source_url TEXT,
      play_count INTEGER NOT NULL DEFAULT 0,
      last_played_at INTEGER,
      rating INTEGER,
      added_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      scanned_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      in_library INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE playlists (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cover_path TEXT,
      is_smart INTEGER NOT NULL DEFAULT 0,
      smart_rules TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE playlist_tracks (
      id INTEGER PRIMARY KEY,
      playlist_id INTEGER NOT NULL,
      track_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      file_path TEXT,
      added_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE download_queue (
      id INTEGER PRIMARY KEY,
      url TEXT,
      source TEXT NOT NULL,
      source_id TEXT,
      title TEXT,
      artist TEXT,
      album TEXT,
      cover_url TEXT,
      playlist_id INTEGER,
      format TEXT NOT NULL DEFAULT 'opus',
      status TEXT NOT NULL DEFAULT 'pending',
      progress REAL NOT NULL DEFAULT 0,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      completed_at INTEGER,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE SET NULL
    );

    INSERT INTO tracks (file_path, title) VALUES ('legacy.mp3', 'Legacy track');
    INSERT INTO playlists (name) VALUES ('Legacy playlist');
    INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (1, 1, 0);
  `);

  createSchema(db);
  migrateSchema(db);

  const trackColumns = new Set(
    (db.prepare("PRAGMA table_info('tracks')").all() as Array<{ name: string }>)
      .map((column) => column.name),
  );
  const playlistColumns = new Set(
    (db.prepare("PRAGMA table_info('playlists')").all() as Array<{ name: string }>)
      .map((column) => column.name),
  );
  const playlistTrackColumns = new Set(
    (db.prepare("PRAGMA table_info('playlist_tracks')").all() as Array<{ name: string }>)
      .map((column) => column.name),
  );
  const integrity = db.prepare('PRAGMA integrity_check').get() as {
    integrity_check: string;
  };

  assert(trackColumns.has('content_hash_sha256'), 'Expected cloud hash migration');
  assert(playlistColumns.has('cloud_id'), 'Expected playlist cloud ID migration');
  assert(playlistTrackColumns.has('import_item_id'), 'Expected playlist import migration');
  assert(integrity.integrity_check === 'ok', 'Expected migrated database integrity');
  assert(
    (db.prepare('SELECT COUNT(*) AS count FROM tracks').get() as { count: number }).count === 1,
    'Expected legacy track to survive migration',
  );
  assert(
    (db.prepare('SELECT COUNT(*) AS count FROM playlist_tracks').get() as { count: number }).count === 1,
    'Expected legacy playlist membership to survive migration',
  );
  db.close();
}
