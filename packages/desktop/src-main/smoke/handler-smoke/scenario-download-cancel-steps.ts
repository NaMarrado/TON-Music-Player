import path from 'path';
import { getDb } from '../../services/database';
import { markDownloadDone, updateDownloadProgress } from '../../services/downloader/status';
import { assert } from './assert';
import type { InvokeFn } from './scenario-types';

export async function runDownloadCancelAllCheck(invoke: InvokeFn): Promise<void> {
  const db = getDb();
  const marker = `cancel-all-smoke-${Date.now()}`;
  const completionTrackId = Number(db.prepare(
    'INSERT INTO tracks (file_path, title, in_library) VALUES (?, ?, 1)',
  ).run(path.join('smoke', `${marker}.m4a`), marker).lastInsertRowid);
  const insert = db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('youtube', ?, ?, ?)`,
  );
  const statuses = ['pending', 'downloading', 'resolving', 'converting', 'done', 'error'];
  const ids = statuses.map((status, index) => Number(
    insert.run(`${marker}-${index}`, marker, status).lastInsertRowid,
  ));

  await invoke<void>('download:cancel-all');

  const rows = db.prepare(
    `SELECT id, status FROM download_queue
     WHERE id IN (${ids.map(() => '?').join(', ')})`,
  ).all(...ids) as Array<{ id: number; status: string }>;
  const statusById = new Map(rows.map((row) => [row.id, row.status]));

  for (let index = 0; index < 4; index += 1) {
    assert(
      statusById.get(ids[index]) === 'cancelled',
      `Expected ${statuses[index]} download to be cancelled by Cancel All`,
    );
  }
  assert(statusById.get(ids[4]) === 'done', 'Expected completed download to remain done');
  assert(statusById.get(ids[5]) === 'error', 'Expected failed download to remain failed');

  assert(
    !updateDownloadProgress(ids[0], 'downloading', 0.5),
    'Expected late progress to be ignored after Cancel All',
  );
  assert(
    !markDownloadDone(ids[1], completionTrackId),
    'Expected late completion to be ignored after Cancel All',
  );
  const cancelledRows = db.prepare(
    `SELECT COUNT(*) AS count FROM download_queue
     WHERE id IN (?, ?) AND status = 'cancelled'`,
  ).get(ids[0], ids[1]) as { count: number };
  assert(cancelledRows.count === 2, 'Expected cancelled downloads to stay cancelled');

  const completionQueueId = Number(
    insert.run(`${marker}-atomic`, marker, 'pending').lastInsertRowid,
  );
  assert(
    markDownloadDone(completionQueueId, completionTrackId),
    'Expected queue and track completion to commit atomically',
  );
  const completion = db.prepare(
    `SELECT dq.status, dq.completed_at, t.downloaded_at
     FROM download_queue dq
     JOIN tracks t ON t.id = ?
     WHERE dq.id = ?`,
  ).get(completionTrackId, completionQueueId) as {
    completed_at: number | null;
    downloaded_at: number | null;
    status: string;
  };
  assert(completion.status === 'done', 'Expected atomic queue completion status');
  assert(
    completion.completed_at != null && completion.downloaded_at === completion.completed_at,
    'Expected queue completion and track download timestamps to match',
  );
  assert(
    !markDownloadDone(completionQueueId, completionTrackId),
    'Expected an already completed queue item to reject a second completion',
  );
  const repeatedCompletion = db.prepare(
    `SELECT dq.completed_at, t.downloaded_at
     FROM download_queue dq
     JOIN tracks t ON t.id = ?
     WHERE dq.id = ?`,
  ).get(completionTrackId, completionQueueId) as {
    completed_at: number | null;
    downloaded_at: number | null;
  };
  assert(
    repeatedCompletion.completed_at === completion.completed_at
      && repeatedCompletion.downloaded_at === completion.downloaded_at,
    'Expected queue and track download timestamps to be written only once',
  );

  db.prepare(`DELETE FROM download_queue WHERE id IN (${ids.map(() => '?').join(', ')})`).run(...ids);
  db.prepare('DELETE FROM download_queue WHERE id = ?').run(completionQueueId);
  db.prepare('DELETE FROM tracks WHERE id = ?').run(completionTrackId);
}
