import { BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { getFfmpegPathAsync } from '../../services/binary-manager';
import { getDb } from '../../services/database';
import { analyzeLoudness } from '../../services/loudness-analyzer';
import { analyzeLoudnessBatch } from '../playlist-helpers';
import type {
  LibraryLoudnessAllResult,
  LibraryLoudnessResult,
  LibraryLoudnessStats,
} from './types';

export function scheduleLibraryLoudnessAnalysis(trackIds: number[]): void {
  if (trackIds.length === 0) return;

  void (async () => {
    const ffmpegPath = await getFfmpegPathAsync();
    if (!ffmpegPath) return;
    await analyzeLoudnessBatch(trackIds, ffmpegPath, getDb());
  })();
}

export async function handleAnalyzeTrackLoudness(
  trackId: number,
): Promise<LibraryLoudnessResult | null> {
  const ffmpeg = await getFfmpegPathAsync();
  if (!ffmpeg) return null;

  const db = getDb();
  const row = db.prepare('SELECT file_path FROM tracks WHERE id = ?').get(trackId) as
    | { file_path: string }
    | undefined;
  if (!row) return null;

  const result = await analyzeLoudness(row.file_path, ffmpeg);
  if (!result) return null;

  db.prepare('UPDATE tracks SET loudness_lufs = ?, loudness_gain = ? WHERE id = ?').run(
    result.lufs,
    result.gain,
    trackId,
  );

  return result;
}

export async function handleAnalyzeAllTrackLoudness(
  event: IpcMainInvokeEvent,
): Promise<LibraryLoudnessAllResult> {
  const ffmpeg = await getFfmpegPathAsync();
  if (!ffmpeg) return { analyzed: 0, failed: 0, total: 0, noFfmpeg: true };

  const db = getDb();
  const rows = db.prepare('SELECT id, file_path FROM tracks').all() as Array<{
    id: number;
    file_path: string;
  }>;

  const total = rows.length;
  if (total === 0) {
    return { analyzed: 0, failed: 0, total: 0, noFfmpeg: false };
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  const updateStmt = db.prepare(
    'UPDATE tracks SET loudness_lufs = ?, loudness_gain = ? WHERE id = ?',
  );

  let analyzed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await analyzeLoudness(row.file_path, ffmpeg);
      if (result) {
        updateStmt.run(result.lufs, result.gain, row.id);
        analyzed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    if (win && !win.isDestroyed()) {
      win.webContents.send('library:loudness-progress', {
        current: analyzed + failed,
        total,
        analyzed,
        failed,
      });
    }
  }

  return { analyzed, failed, total, noFfmpeg: false };
}

export function getLibraryLoudnessStats(): LibraryLoudnessStats {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM tracks').get() as { c: number }).c;
  const analyzed = (
    db.prepare('SELECT COUNT(*) as c FROM tracks WHERE loudness_gain IS NOT NULL').get() as {
      c: number;
    }
  ).c;

  return { total, analyzed, missing: total - analyzed };
}
