import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate001(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    -- ── Tracks ──
    CREATE TABLE IF NOT EXISTS tracks (
      id              INTEGER PRIMARY KEY,
      file_path       TEXT NOT NULL UNIQUE,
      file_hash       TEXT,
      content_hash_sha256 TEXT,
      file_size       INTEGER,
      file_mtime      INTEGER,
      title           TEXT,
      artist          TEXT,
      album           TEXT,
      album_artist    TEXT,
      track_number    INTEGER,
      disc_number     INTEGER,
      duration_ms     INTEGER,
      genre           TEXT,
      year            INTEGER,
      bitrate         INTEGER,
      sample_rate     INTEGER,
      format          TEXT,
      cover_art_path  TEXT,
      loudness_lufs   REAL,
      loudness_gain   REAL,
      youtube_id      TEXT,
      spotify_id      TEXT,
      soundcloud_id   TEXT,
      source_url      TEXT,
      play_count      INTEGER NOT NULL DEFAULT 0,
      last_played_at  INTEGER,
      rating          INTEGER,
      added_at        INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      scanned_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      in_library      INTEGER NOT NULL DEFAULT 1
    );

    -- ── Playlists ──
    CREATE TABLE IF NOT EXISTS playlists (
      id          INTEGER PRIMARY KEY,
      cloud_id    TEXT UNIQUE,
      name        TEXT NOT NULL,
      description TEXT,
      cover_path  TEXT,
      is_smart    INTEGER NOT NULL DEFAULT 0,
      smart_rules TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id          INTEGER PRIMARY KEY,
      playlist_id INTEGER NOT NULL,
      track_id    INTEGER NOT NULL,
      position    INTEGER NOT NULL,
      file_path   TEXT,
      added_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id)    REFERENCES tracks(id)    ON DELETE CASCADE
    );

    -- ── Play History ──
    CREATE TABLE IF NOT EXISTS play_history (
      id          INTEGER PRIMARY KEY,
      track_id    INTEGER NOT NULL,
      played_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      duration_ms INTEGER,
      completed   INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    -- ── Download Queue ──
    CREATE TABLE IF NOT EXISTS download_queue (
      id              INTEGER PRIMARY KEY,
      url             TEXT,
      source          TEXT NOT NULL,
      source_id       TEXT,
      title           TEXT,
      artist          TEXT,
      album           TEXT,
      cover_url       TEXT,
      playlist_id     INTEGER,
      duration_ms     INTEGER,
      format          TEXT NOT NULL DEFAULT 'webm',
      status          TEXT NOT NULL DEFAULT 'pending',
      progress        REAL NOT NULL DEFAULT 0,
      error_message   TEXT,
      retry_count     INTEGER NOT NULL DEFAULT 0,
      priority        INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      completed_at    INTEGER,
      settled_notification_sent_at INTEGER,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE SET NULL
    );

    -- ── Settings ──
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- ── FTS5 ──
    CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
      title, artist, album, album_artist, genre,
      content='tracks',
      content_rowid='id'
    );

    -- ── FTS Triggers ──
    CREATE TRIGGER IF NOT EXISTS tracks_fts_insert AFTER INSERT ON tracks BEGIN
      INSERT INTO tracks_fts(rowid, title, artist, album, album_artist, genre)
      VALUES (new.id, new.title, new.artist, new.album, new.album_artist, new.genre);
    END;

    CREATE TRIGGER IF NOT EXISTS tracks_fts_delete AFTER DELETE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, album_artist, genre)
      VALUES('delete', old.id, old.title, old.artist, old.album, old.album_artist, old.genre);
    END;

    CREATE TRIGGER IF NOT EXISTS tracks_fts_update AFTER UPDATE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, album_artist, genre)
      VALUES('delete', old.id, old.title, old.artist, old.album, old.album_artist, old.genre);
      INSERT INTO tracks_fts(rowid, title, artist, album, album_artist, genre)
      VALUES (new.id, new.title, new.artist, new.album, new.album_artist, new.genre);
    END;

    -- ── Indexes ──
    CREATE INDEX IF NOT EXISTS idx_tracks_in_library   ON tracks(in_library);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist       ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album        ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_album_artist ON tracks(album_artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_genre        ON tracks(genre);
    CREATE INDEX IF NOT EXISTS idx_tracks_year         ON tracks(year);
    CREATE INDEX IF NOT EXISTS idx_tracks_format       ON tracks(format);
    CREATE INDEX IF NOT EXISTS idx_tracks_added        ON tracks(added_at);
    CREATE INDEX IF NOT EXISTS idx_tracks_play_count   ON tracks(play_count);
    CREATE INDEX IF NOT EXISTS idx_tracks_last_played  ON tracks(last_played_at);
    CREATE INDEX IF NOT EXISTS idx_tracks_rating       ON tracks(rating);
    CREATE INDEX IF NOT EXISTS idx_tracks_youtube_id   ON tracks(youtube_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_spotify_id   ON tracks(spotify_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_content_hash_sha256 ON tracks(content_hash_sha256);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_cloud_id ON playlists(cloud_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_pos    ON playlist_tracks(playlist_id, position);
    CREATE INDEX IF NOT EXISTS idx_play_history_track     ON play_history(track_id);
    CREATE INDEX IF NOT EXISTS idx_play_history_time      ON play_history(played_at);
    CREATE INDEX IF NOT EXISTS idx_download_queue_status  ON download_queue(status);
    CREATE INDEX IF NOT EXISTS idx_download_queue_prio    ON download_queue(priority, created_at);
  `);
}
