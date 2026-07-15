import type Database from 'better-sqlite3';
import { createCloudAutoSyncSchema } from './cloud-auto-sync-schema';

export function migrateSchema(db: Database.Database): void {
  db.transaction(() => migrateSchemaInTransaction(db))();
}

function migrateSchemaInTransaction(db: Database.Database): void {
  const playlistColumns = db.prepare("PRAGMA table_info('playlists')").all() as Array<{ name: string }>;
  const playlistColumnNames = new Set(playlistColumns.map((column) => column.name));
  const trackColumns = db.prepare("PRAGMA table_info('tracks')").all() as Array<{ name: string }>;
  const trackColumnNames = new Set(trackColumns.map((column) => column.name));
  const playlistTrackColumns = db.prepare("PRAGMA table_info('playlist_tracks')").all() as Array<{ name: string }>;
  const playlistTrackColumnNames = new Set(playlistTrackColumns.map((column) => column.name));
  const downloadColumns = db.prepare("PRAGMA table_info('download_queue')").all() as Array<{ name: string }>;
  const downloadColumnNames = new Set(downloadColumns.map((column) => column.name));
  const shouldBackfillDownloadedAt = !trackColumnNames.has('downloaded_at');

  if (!playlistColumnNames.has('sort_order')) {
    db.exec('ALTER TABLE playlists ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }

  if (!playlistColumnNames.has('cloud_id')) {
    db.exec('ALTER TABLE playlists ADD COLUMN cloud_id TEXT');
  }

  if (!trackColumnNames.has('content_hash_sha256')) {
    db.exec('ALTER TABLE tracks ADD COLUMN content_hash_sha256 TEXT');
  }

  if (shouldBackfillDownloadedAt) {
    db.exec('ALTER TABLE tracks ADD COLUMN downloaded_at INTEGER');
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

  // Metadata-independent canonical fields must not churn the external FTS table.
  // Recreate the legacy broad trigger before the Library/download timestamp updates.
  db.exec(`
    DROP TRIGGER IF EXISTS tracks_fts_update;
    CREATE TRIGGER tracks_fts_update
    AFTER UPDATE OF title, artist, album, album_artist, genre ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, album_artist, genre)
      VALUES('delete', old.id, old.title, old.artist, old.album, old.album_artist, old.genre);
      INSERT INTO tracks_fts(rowid, title, artist, album, album_artist, genre)
      VALUES (new.id, new.title, new.artist, new.album, new.album_artist, new.genre);
    END;
  `);

  // Every canonical tracks row belongs to the Library. Promote all legacy rows
  // and prevent later imports from re-introducing the retired hidden-row state.
  db.exec(`
    UPDATE tracks
    SET in_library = 1
    WHERE in_library != 1;

    CREATE TRIGGER IF NOT EXISTS tracks_force_library_insert
    AFTER INSERT ON tracks
    WHEN new.in_library != 1 BEGIN
      UPDATE tracks SET in_library = 1
      WHERE id = new.id;
    END;

    CREATE TRIGGER IF NOT EXISTS tracks_force_library_update
    AFTER UPDATE OF in_library ON tracks
    WHEN new.in_library != 1 BEGIN
      UPDATE tracks SET in_library = 1
      WHERE id = new.id;
    END;
  `);

  // Infer historical timestamps exactly once, when the column is introduced.
  // Future intentionally-NULL rows must never be guessed from old queue entries.
  if (shouldBackfillDownloadedAt) {
    db.exec(`
    WITH candidates AS (
      SELECT
        t.id AS track_id,
        dq.id AS queue_id,
        dq.completed_at AS downloaded_at,
        ABS(dq.completed_at - ROUND(t.file_mtime / 1000.0)) AS distance_seconds,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM playlist_import_items pii
            WHERE pii.queue_id = dq.id AND pii.track_id = t.id
          ) THEN 0
          WHEN (dq.source = 'youtube'
              AND t.youtube_id IS NOT NULL
              AND dq.source_id = t.youtube_id)
            OR (dq.source = 'spotify'
              AND t.spotify_id IS NOT NULL
              AND dq.source_id = t.spotify_id)
            OR (dq.source = 'soundcloud'
              AND t.soundcloud_id IS NOT NULL
              AND dq.source_id = t.soundcloud_id)
          THEN 1
          ELSE 2
        END AS match_priority
      FROM tracks t
      JOIN download_queue dq
        ON dq.status = 'done' AND dq.completed_at IS NOT NULL
      WHERE t.downloaded_at IS NULL
        AND t.file_mtime IS NOT NULL
        AND t.file_mtime > 0
        AND ABS(dq.completed_at - ROUND(t.file_mtime / 1000.0)) <= 3600
        AND (
          EXISTS (
            SELECT 1
            FROM playlist_import_items pii
            WHERE pii.queue_id = dq.id AND pii.track_id = t.id
          )
          OR (dq.source = 'youtube'
            AND t.youtube_id IS NOT NULL
            AND dq.source_id = t.youtube_id)
          OR (dq.source = 'spotify'
            AND t.spotify_id IS NOT NULL
            AND dq.source_id = t.spotify_id)
          OR (dq.source = 'soundcloud'
            AND t.soundcloud_id IS NOT NULL
            AND dq.source_id = t.soundcloud_id)
          OR (t.youtube_id IS NOT NULL
            AND dq.resolved_source_id = t.youtube_id)
        )
    ),
    track_ranked AS (
      SELECT
        candidates.*,
        ROW_NUMBER() OVER (
          PARTITION BY track_id
          ORDER BY match_priority, distance_seconds, queue_id
        ) AS track_rank,
        COUNT(*) OVER (
          PARTITION BY track_id, match_priority, distance_seconds
        ) AS track_tie_count
      FROM candidates
    ),
    mutual_ranked AS (
      SELECT
        track_ranked.*,
        ROW_NUMBER() OVER (
          PARTITION BY queue_id
          ORDER BY match_priority, distance_seconds, track_id
        ) AS queue_rank,
        COUNT(*) OVER (
          PARTITION BY queue_id, match_priority, distance_seconds
        ) AS queue_tie_count
      FROM track_ranked
    )
    UPDATE tracks
    SET downloaded_at = (
      SELECT mr.downloaded_at
      FROM mutual_ranked mr
      WHERE mr.track_id = tracks.id
        AND mr.track_rank = 1
        AND mr.track_tie_count = 1
        AND mr.queue_rank = 1
        AND mr.queue_tie_count = 1
    )
    WHERE downloaded_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM mutual_ranked mr
        WHERE mr.track_id = tracks.id
          AND mr.track_rank = 1
          AND mr.track_tie_count = 1
          AND mr.queue_rank = 1
          AND mr.queue_tie_count = 1
      );
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracks_content_hash_sha256 ON tracks(content_hash_sha256);
    CREATE INDEX IF NOT EXISTS idx_tracks_downloaded_at ON tracks(downloaded_at);
    DROP INDEX IF EXISTS idx_playlists_cloud_id;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_cloud_id ON playlists(cloud_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_tracks_import_item ON playlist_tracks(import_item_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_import_items_queue ON playlist_import_items(queue_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_import_items_track ON playlist_import_items(track_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_playlist_position ON playlist_tracks(track_id, playlist_id, position);
  `);

  createCloudAutoSyncSchema(db);
}
