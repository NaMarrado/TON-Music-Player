import type { Track } from '@ton/core';
import { getDb } from '../../services/database';

export type LibrarySummaryTrack = Track & {
  playlist_names: string | null;
};

export function handleLibraryListSummary(): LibrarySummaryTrack[] {
  return queryLibrarySummary();
}

export function handleLibraryListSummaryByIds(trackIds: number[]): LibrarySummaryTrack[] {
  if (trackIds.length === 0) {
    return [];
  }

  const placeholders = trackIds.map(() => '?').join(', ');
  return queryLibrarySummary(`AND t.id IN (${placeholders})`, trackIds);
}

function queryLibrarySummary(whereClause = '', params: unknown[] = []): LibrarySummaryTrack[] {
  const db = getDb();

  return db.prepare(`
    SELECT
      t.*,
      playlist_summary.playlist_names AS playlist_names
    FROM tracks t
    LEFT JOIN (
      SELECT
        pt.track_id,
        GROUP_CONCAT(DISTINCT p.name) AS playlist_names
      FROM playlist_tracks pt
      JOIN playlists p ON p.id = pt.playlist_id
      GROUP BY pt.track_id
    ) AS playlist_summary ON playlist_summary.track_id = t.id
    WHERE t.in_library = 1
    ${whereClause}
    ORDER BY t.added_at DESC
  `).all(...params) as LibrarySummaryTrack[];
}
