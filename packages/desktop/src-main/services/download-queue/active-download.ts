import type Database from 'better-sqlite3';
import type { DownloadRequest } from '@ton/core';

/** The queued or running download of the same song, so a repeated Download click does not download it twice. */
export function findActiveDownloadId(db: Database.Database, request: DownloadRequest): number | null {
  if (!request.source_id) return null;
  const row = db.prepare(
    `SELECT id FROM download_queue
     WHERE source = ? AND source_id = ? AND status IN ('pending', 'downloading', 'resolving', 'converting')
     ORDER BY id LIMIT 1`,
  ).get(request.source, request.source_id) as { id: number } | undefined;
  return row?.id ?? null;
}
