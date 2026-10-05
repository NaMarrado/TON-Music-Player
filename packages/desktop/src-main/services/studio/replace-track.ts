import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getDb } from '../database';
import { getFileStatsAsync } from '../file-scanner';
import { readTrackMetadataOffthread } from '../metadata-reader';
import { scheduleLibraryLoudnessAnalysis } from '../../handlers/library-handler/loudness';

interface ReplacedTrackRow {
  id: number;
  file_path: string;
  content_hash_sha256: string | null;
}

/**
 * Where the edited audio goes: next to the original, same name, `.m4a`. The original's own path is reused; a path used
 * by another song or by any other file on disk is never overwritten.
 */
function targetPathFor(db: Database.Database, track: ReplacedTrackRow): string {
  const parsed = path.parse(track.file_path);
  const base = path.join(parsed.dir, parsed.name);
  const taken = db.prepare('SELECT id FROM tracks WHERE file_path = ? AND id != ?');
  const isOriginal = (candidate: string) => path.resolve(candidate) === path.resolve(track.file_path);
  let candidate = `${base}.m4a`;
  for (let attempt = 2; taken.get(candidate, track.id) || (!isOriginal(candidate) && fs.existsSync(candidate)); attempt += 1) {
    candidate = `${base} (${attempt}).m4a`;
  }
  return candidate;
}

/**
 * Replaces the audio of an existing Library song with a rendered Studio edit. The song keeps its id, so it stays in
 * every playlist, keeps its star, cover and play counts. The original audio is removed from this device and its cloud
 * copy is excluded here, like a deleted song, so sync does not bring the unedited version back. Any failure before the
 * database is updated puts the original file back.
 */
export async function replaceTrackAudio(trackId: number, renderedPath: string): Promise<void> {
  const db = getDb();
  const track = db.prepare('SELECT id, file_path, content_hash_sha256 FROM tracks WHERE id = ?').get(trackId) as ReplacedTrackRow | undefined;
  if (!track) throw new Error('The song is no longer in the Library');

  const target = targetPathFor(db, track);
  const staging = `${target}.studio-tmp`;
  const backup = `${track.file_path}.studio-original`;
  await fs.promises.copyFile(renderedPath, staging);
  let backedUp = false;
  try {
    await fs.promises.rename(track.file_path, backup);
    backedUp = true;
    await fs.promises.rename(staging, target);

    const stats = await getFileStatsAsync(target);
    if (!stats) throw new Error('The edited song could not be saved');
    const meta = await readTrackMetadataOffthread(target, stats.size);

    db.transaction(() => {
      const oldHash = track.content_hash_sha256?.toLowerCase() ?? '';
      if (oldHash) {
        db.prepare(`
          INSERT INTO cloud_sync_local_exclusions (scope_id, content_hash_sha256, deleted_at)
          SELECT active_scope_id, ?, strftime('%s','now') FROM cloud_sync_control
          WHERE id = 1 AND active_scope_id != ''
            AND NOT EXISTS (SELECT 1 FROM tracks WHERE id != ? AND lower(content_hash_sha256) = ?)
          ON CONFLICT(scope_id, content_hash_sha256) DO UPDATE SET deleted_at = excluded.deleted_at
        `).run(oldHash, track.id, oldHash);
      }
      db.prepare(`
        UPDATE tracks SET
          file_path = ?, file_hash = ?, content_hash_sha256 = NULL, file_size = ?, file_mtime = ?,
          duration_ms = ?, bitrate = ?, sample_rate = ?, format = ?, loudness_lufs = NULL, loudness_gain = NULL
        WHERE id = ?
      `).run(target, meta.file_hash, stats.size, stats.mtimeMs, meta.duration_ms, meta.bitrate, meta.sample_rate, meta.format, track.id);
    })();
  } catch (error) {
    await fs.promises.rm(staging, { force: true }).catch(() => {});
    if (backedUp) {
      await fs.promises.rm(target, { force: true });
      await fs.promises.rename(backup, track.file_path);
    }
    throw error;
  }
  await fs.promises.rm(backup, { force: true }).catch(() => {});
  scheduleLibraryLoudnessAnalysis([track.id]);
}
