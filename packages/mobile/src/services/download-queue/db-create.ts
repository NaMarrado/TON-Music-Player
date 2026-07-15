import type { SQLiteBindValue } from 'expo-sqlite';
import { getDb } from '../database';
import type { DownloadInput } from '../downloader';

const INSERT_QUEUE_SQL = `INSERT INTO download_queue (
  url, source, source_id, title, artist, album, cover_url,
  playlist_id, duration_ms, format, quality_profile, status
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'm4a', ?, 'pending')`;

function inputValues(input: DownloadInput): SQLiteBindValue[] {
  return [
    input.sourceUrl, input.source, input.sourceId, input.title, input.artist,
    input.album, input.coverUrl, input.playlistId, input.durationMs,
    input.qualityProfile ?? 'normal',
  ];
}

export async function insertQueueItemRecord(input: DownloadInput): Promise<number> {
  return (await getDb().runAsync(INSERT_QUEUE_SQL, inputValues(input))).lastInsertRowId;
}

export async function insertQueueItemRecords(
  inputs: DownloadInput[],
): Promise<Array<{ id: number; input: DownloadInput }>> {
  if (inputs.length === 0) return [];
  const inserted: Array<{ id: number; input: DownloadInput }> = [];
  await getDb().withExclusiveTransactionAsync(async (db) => {
    for (const input of inputs) {
      const result = await db.runAsync(INSERT_QUEUE_SQL, inputValues(input));
      inserted.push({ id: result.lastInsertRowId, input });
    }
  });
  return inserted;
}

export async function deleteQueueItemRecords(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await getDb().runAsync(
      `DELETE FROM download_queue WHERE id IN (${ids.map(() => '?').join(',')})`, ids,
    );
  } catch { /* non-fatal */ }
}

export async function markQueueItemRecordsCancelled(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await getDb().runAsync(
      `UPDATE download_queue SET status = 'error', error_message = 'download_cancelled',
       completed_at = strftime('%s','now') WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
  } catch { /* non-fatal */ }
}

export async function deleteCancelledQueueItemRecords(): Promise<void> {
  try {
    await getDb().runAsync("DELETE FROM download_queue WHERE error_message = 'download_cancelled'");
  } catch { /* non-fatal */ }
}
