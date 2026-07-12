import type { Track } from '@ton/core';
import { getDb } from '../../services/database';

const TRACK_SNAPSHOT_SELECT = `
  t.id AS id,
  t.file_path AS file_path,
  NULL AS file_hash,
  NULL AS content_hash_sha256,
  NULL AS file_size,
  NULL AS file_mtime,
  t.title AS title,
  t.artist AS artist,
  t.album AS album,
  NULL AS album_artist,
  NULL AS track_number,
  NULL AS disc_number,
  t.duration_ms AS duration_ms,
  NULL AS genre,
  NULL AS year,
  NULL AS bitrate,
  NULL AS sample_rate,
  NULL AS format,
  t.cover_art_path AS cover_art_path,
  NULL AS loudness_lufs,
  t.loudness_gain AS loudness_gain,
  NULL AS youtube_id,
  NULL AS spotify_id,
  NULL AS soundcloud_id,
  NULL AS source_url,
  t.play_count AS play_count,
  t.last_played_at AS last_played_at,
  NULL AS rating,
  t.in_library AS in_library,
  t.added_at AS added_at,
  0 AS scanned_at
`;

type QueryTrackSnapshotsOptions = {
  whereClause?: string;
  params?: unknown[];
  orderBy?: string;
  limit?: number;
};

export function queryTrackSnapshots(options: QueryTrackSnapshotsOptions = {}): Track[] {
  const {
    whereClause = '',
    params = [],
    orderBy = 'ORDER BY t.added_at DESC',
    limit,
  } = options;
  const db = getDb();
  const resolvedLimit = typeof limit === 'number' ? Math.max(0, Math.floor(limit)) : null;
  const limitClause = resolvedLimit == null ? '' : `\nLIMIT ${resolvedLimit}`;

  return db.prepare(`
    SELECT
      ${TRACK_SNAPSHOT_SELECT}
    FROM tracks t
    WHERE t.in_library = 1
    ${whereClause}
    ${orderBy}
    ${limitClause}
  `).all(...params) as Track[];
}

export function handleLibraryGetTrackSnapshot(trackId: number): Track | null {
  return queryTrackSnapshots({
    whereClause: 'AND t.id = ?',
    params: [trackId],
    limit: 1,
  })[0] ?? null;
}
