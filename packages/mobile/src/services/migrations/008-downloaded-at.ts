import type { SQLiteDatabase } from 'expo-sqlite';

const RECOVERY_WINDOW_SECONDS = 60 * 60;

export interface HistoricalTrackDownloadRow {
  id: number;
  file_mtime: number | null;
  spotify_id: string | null;
  youtube_id: string | null;
}

export interface HistoricalQueueCompletionRow {
  completed_at: number;
  id: number;
  linked_track_ids?: readonly number[];
  resolved_source_id?: string | null;
  source: string;
  source_id: string;
}

export interface HistoricalDownloadedAtRecovery {
  downloadedAt: number;
  trackId: number;
}

interface HistoricalDownloadCandidate extends HistoricalDownloadedAtRecovery {
  distance: number;
  priority: number;
  queueId: number;
}

function normalizePositiveSecond(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export function recoverHistoricalDownloadedAt(
  tracks: readonly HistoricalTrackDownloadRow[],
  queueRows: readonly HistoricalQueueCompletionRow[],
): HistoricalDownloadedAtRecovery[] {
  const candidates: HistoricalDownloadCandidate[] = [];
  for (const queueRow of queueRows) {
    if (
      (queueRow.source !== 'youtube' && queueRow.source !== 'spotify')
      || !Number.isInteger(queueRow.id)
      || queueRow.id <= 0
      || !queueRow.source_id
    ) {
      continue;
    }
    const completedAt = normalizePositiveSecond(queueRow.completed_at);
    if (completedAt == null) {
      continue;
    }

    for (const track of tracks) {
      const fileMtime = normalizePositiveSecond(track.file_mtime);
      if (fileMtime == null) {
        continue;
      }
      const anchor = Math.floor(fileMtime / 1000);
      if (anchor <= 0) {
        continue;
      }

      const explicitlyLinked = queueRow.linked_track_ids?.includes(track.id) ?? false;
      const directProviderMatch = (
        queueRow.source === 'spotify'
        && track.spotify_id != null
        && queueRow.source_id === track.spotify_id
      ) || (
        queueRow.source === 'youtube'
        && track.youtube_id != null
        && queueRow.source_id === track.youtube_id
      );
      const resolvedYoutubeMatch = track.youtube_id != null
        && queueRow.resolved_source_id === track.youtube_id;
      const priority = explicitlyLinked ? 0 : directProviderMatch ? 1 : resolvedYoutubeMatch ? 2 : null;
      if (priority == null) {
        continue;
      }

      const distance = Math.abs(completedAt - anchor);
      if (distance > RECOVERY_WINDOW_SECONDS) {
        continue;
      }
      candidates.push({
        distance,
        downloadedAt: completedAt,
        priority,
        queueId: queueRow.id,
        trackId: track.id,
      });
    }
  }

  const uniqueBest = (
    rows: HistoricalDownloadCandidate[],
    identity: 'queueId' | 'trackId',
  ): Map<number, HistoricalDownloadCandidate> => {
    const grouped = new Map<number, HistoricalDownloadCandidate[]>();
    for (const candidate of rows) {
      const group = grouped.get(candidate[identity]) ?? [];
      group.push(candidate);
      grouped.set(candidate[identity], group);
    }

    const best = new Map<number, HistoricalDownloadCandidate>();
    for (const [id, group] of grouped) {
      group.sort((left, right) => (
        left.priority - right.priority
        || left.distance - right.distance
        || (identity === 'trackId' ? left.queueId - right.queueId : left.trackId - right.trackId)
      ));
      const first = group[0];
      const tied = group.filter((candidate) => (
        candidate.priority === first.priority && candidate.distance === first.distance
      ));
      if (tied.length === 1) {
        best.set(id, first);
      }
    }
    return best;
  };

  const bestByTrack = uniqueBest(candidates, 'trackId');
  const bestByQueue = uniqueBest(candidates, 'queueId');
  return [...bestByTrack.values()]
    .filter((candidate) => bestByQueue.get(candidate.queueId) === candidate)
    .map(({ downloadedAt, trackId }) => ({ downloadedAt, trackId }));
}

export async function migrate008(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(tracks)');
  if (!columns.some((column) => column.name === 'downloaded_at')) {
    await db.execAsync('ALTER TABLE tracks ADD COLUMN downloaded_at INTEGER;');
  }
  const queueColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(download_queue)');
  if (!queueColumns.some((column) => column.name === 'resolved_source_id')) {
    await db.execAsync('ALTER TABLE download_queue ADD COLUMN resolved_source_id TEXT;');
  }

  const tracks = await db.getAllAsync<HistoricalTrackDownloadRow>(
    `SELECT id, file_mtime, spotify_id, youtube_id
     FROM tracks
     WHERE downloaded_at IS NULL`,
  );
  const queueRows = await db.getAllAsync<HistoricalQueueCompletionRow>(
    `SELECT id, completed_at, resolved_source_id, source, source_id
     FROM download_queue
     WHERE status = 'completed'
       AND completed_at IS NOT NULL
       AND completed_at > 0
       AND source_id IS NOT NULL
       AND source_id != ''
       AND source IN ('youtube', 'spotify')`,
  );
  const linkedRows = await db.getAllAsync<{ queue_id: number; track_id: number }>(
    `SELECT DISTINCT queue_id, track_id
     FROM playlist_import_items
     WHERE queue_id IS NOT NULL AND track_id IS NOT NULL`,
  );
  const linkedTrackIdsByQueue = new Map<number, number[]>();
  for (const linkedRow of linkedRows) {
    const trackIds = linkedTrackIdsByQueue.get(linkedRow.queue_id) ?? [];
    trackIds.push(linkedRow.track_id);
    linkedTrackIdsByQueue.set(linkedRow.queue_id, trackIds);
  }
  queueRows.forEach((row) => {
    row.linked_track_ids = linkedTrackIdsByQueue.get(row.id) ?? [];
  });

  for (const recovery of recoverHistoricalDownloadedAt(tracks, queueRows)) {
    await db.runAsync(
      `UPDATE tracks
       SET downloaded_at = ?
       WHERE id = ? AND downloaded_at IS NULL`,
      [recovery.downloadedAt, recovery.trackId],
    );
  }

  await db.execAsync(`
    DROP TRIGGER IF EXISTS tracks_fts_update;
    CREATE TRIGGER tracks_fts_update
    AFTER UPDATE OF title, artist, album, album_artist, genre ON tracks
    BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, album_artist, genre)
      VALUES('delete', old.id, old.title, old.artist, old.album, old.album_artist, old.genre);
      INSERT INTO tracks_fts(rowid, title, artist, album, album_artist, genre)
      VALUES (new.id, new.title, new.artist, new.album, new.album_artist, new.genre);
    END;

    UPDATE tracks SET in_library = 1;

    CREATE TRIGGER IF NOT EXISTS tracks_canonical_library_insert
    AFTER INSERT ON tracks
    WHEN NEW.in_library != 1
    BEGIN
      UPDATE tracks SET in_library = 1 WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS tracks_canonical_library_update
    AFTER UPDATE OF in_library ON tracks
    WHEN NEW.in_library != 1
    BEGIN
      UPDATE tracks SET in_library = 1 WHERE id = NEW.id;
    END;
  `);
}
