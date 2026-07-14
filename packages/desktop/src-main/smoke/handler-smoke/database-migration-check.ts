import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { migrateSchema } from '../../services/database/migrations';
import { createSchema } from '../../services/database/schema';
import { migrateCanonicalLibraryStorage } from '../../services/database/canonical-library-migration';
import { assert } from './assert';

export function runLegacyDatabaseMigrationCheck(rootDir: string): void {
  const databasePath = path.join(rootDir, 'legacy-migration.db');
  fs.rmSync(databasePath, { force: true });
  fs.rmSync(`${databasePath}-wal`, { force: true });
  fs.rmSync(`${databasePath}-shm`, { force: true });
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  try {
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

  `);

  const libraryDir = path.join(rootDir, 'canonical-library');
  const playlistDir = path.join(libraryDir, 'Playlists', '1');
  fs.mkdirSync(playlistDir, { recursive: true });
  const playlistOnlyFile = path.join(playlistDir, 'legacy.mp3');
  const playlistCopy = path.join(playlistDir, 'legacy-copy.mp3');
  const unknownMtimeFile = path.join(libraryDir, 'unknown-mtime.mp3');
  fs.writeFileSync(playlistOnlyFile, 'legacy-audio');
  fs.writeFileSync(playlistCopy, 'legacy-audio');
  fs.writeFileSync(unknownMtimeFile, 'unknown-mtime-audio');
  db.prepare(
    `INSERT INTO tracks (
       file_path, file_mtime, title, youtube_id, source_url, in_library
     ) VALUES (?, 1700000100000, ?, ?, ?, 0)`,
  ).run(playlistOnlyFile, 'Legacy track', 'legacy-video', 'https://youtu.be/legacy-video');
  db.prepare(
    `INSERT INTO tracks (
       file_path, title, youtube_id, source_url, in_library
     ) VALUES (?, ?, ?, ?, 0)`,
  ).run(unknownMtimeFile, 'Unknown mtime', 'legacy-video', 'https://youtu.be/legacy-video');
  db.prepare(
    `INSERT INTO download_queue (
       source, source_id, title, status, created_at, completed_at
     ) VALUES ('youtube', 'legacy-video', 'Legacy track', 'done', 1699999999, 1700000123)`,
  ).run();
  db.prepare(
    `INSERT INTO download_queue (
       source, source_id, title, status, created_at, completed_at
     ) VALUES ('youtube', 'legacy-video', 'Legacy duplicate', 'done', 1700002999, 1700003000)`,
  ).run();
  db.prepare("INSERT INTO playlists (name) VALUES ('Legacy playlist')").run();
  db.prepare(
    'INSERT INTO playlist_tracks (playlist_id, track_id, position, file_path) VALUES (1, 1, 0, ?)',
  ).run(playlistCopy);

  createSchema(db);
  migrateSchema(db);
  const migratedBeforeStorage = db.prepare(
    'SELECT in_library, downloaded_at FROM tracks WHERE id = 1',
  ).get() as { downloaded_at: number | null; in_library: number };
  assert(migratedBeforeStorage.in_library === 1, 'Expected every legacy track promoted during migration');
  assert(
    migratedBeforeStorage.downloaded_at === 1700000123,
    'Expected conservative completed-queue download timestamp backfill',
  );
  const unknownMtimeTrack = db.prepare(
    'SELECT in_library, downloaded_at FROM tracks WHERE id = 2',
  ).get() as { downloaded_at: number | null; in_library: number };
  assert(unknownMtimeTrack.in_library === 1, 'Expected non-playlist legacy track promotion');
  assert(unknownMtimeTrack.downloaded_at == null, 'Expected missing file mtime to remain unknown');
  db.prepare(
    `INSERT INTO tracks (file_path, file_mtime, title, youtube_id, in_library)
     VALUES (?, 1700000200000, 'Future unknown', 'future-video', 1)`,
  ).run(path.join(rootDir, 'future-unknown.mp3'));
  const futureTrackId = Number(
    (db.prepare("SELECT id FROM tracks WHERE youtube_id = 'future-video'").get() as { id: number }).id,
  );
  const futureQueueId = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status, completed_at)
     VALUES ('youtube', 'future-video', 'Future unknown', 'done', 1700000201)`,
  ).run().lastInsertRowid);
  migrateSchema(db);
  assert(
    (db.prepare('SELECT downloaded_at FROM tracks WHERE id = ?').get(futureTrackId) as {
      downloaded_at: number | null;
    }).downloaded_at == null,
    'Expected historical timestamp inference to run only when the column is introduced',
  );
  db.prepare('DELETE FROM download_queue WHERE id = ?').run(futureQueueId);
  db.prepare('DELETE FROM tracks WHERE id = ?').run(futureTrackId);
  db.prepare('UPDATE tracks SET in_library = 0 WHERE id = 1').run();
  assert(
    (db.prepare('SELECT in_library FROM tracks WHERE id = 1').get() as { in_library: number })
      .in_library === 1,
    'Expected canonical Library trigger to reject hidden track state',
  );
  migrateCanonicalLibraryStorage(db, libraryDir);

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
  const downloadColumns = new Set(
    (db.prepare("PRAGMA table_info('download_queue')").all() as Array<{ name: string }>)
      .map((column) => column.name),
  );
  const integrity = db.prepare('PRAGMA integrity_check').get() as {
    integrity_check: string;
  };

  assert(trackColumns.has('content_hash_sha256'), 'Expected cloud hash migration');
  assert(trackColumns.has('downloaded_at'), 'Expected download timestamp migration');
  assert(playlistColumns.has('cloud_id'), 'Expected playlist cloud ID migration');
  assert(playlistTrackColumns.has('import_item_id'), 'Expected playlist import migration');
  assert(downloadColumns.has('quality_profile'), 'Expected queue quality profile migration');
  assert(integrity.integrity_check === 'ok', 'Expected migrated database integrity');
  assert(
    (db.prepare('SELECT COUNT(*) AS count FROM tracks').get() as { count: number }).count === 2,
    'Expected all legacy tracks to survive migration',
  );
  const migratedTrack = db.prepare(
    'SELECT file_path, in_library, downloaded_at FROM tracks WHERE id = 1',
  ).get() as { downloaded_at: number | null; file_path: string; in_library: number };
  const migratedMembership = db.prepare(
    'SELECT file_path FROM playlist_tracks WHERE id = 1',
  ).get() as { file_path: string | null };
  assert(migratedTrack.in_library === 1, 'Expected canonical track in Library');
  assert(migratedTrack.downloaded_at === 1700000123, 'Expected download timestamp to survive migration');
  assert(!migratedTrack.file_path.includes(`${path.sep}Playlists${path.sep}`), 'Expected canonical Library path');
  assert(fs.existsSync(migratedTrack.file_path), 'Expected promoted canonical audio file');
  assert(migratedMembership.file_path === null, 'Expected reference-only playlist membership');
  assert(!fs.existsSync(playlistCopy), 'Expected legacy playlist copy cleanup');
  assert(
    (db.prepare('SELECT COUNT(*) AS count FROM playlist_tracks').get() as { count: number }).count === 1,
    'Expected legacy playlist membership to survive migration',
  );
  } finally {
    db.close();
  }
}
