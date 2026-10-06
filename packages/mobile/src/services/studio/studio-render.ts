import * as FileSystem from 'expo-file-system';
import {
  CLOUD_REPLACED_TRACK_KEY_PREFIX,
  STUDIO_SAMPLE_RATE,
  buildRenderArgs,
  encodeWavFloat32,
  generateReverbImpulse,
  requiredImpulseKeys,
  reverbImpulseSpec,
  sanitizeFilename,
  type SearchResult,
  type StudioProject,
} from '@ton/core';
import { insertTrack } from '../db-queries';
import type { SQLiteDatabase } from 'expo-sqlite';
import { runMobileCloudDbLane } from '../cloud-sync/db-lane';
import { MUSIC_DIR, ensureMusicDir, nativeDownload } from '../downloader/filesystem';
import { prepareDownloadSource } from '../downloader';
import { scheduleTrackLoudnessAnalysis } from '../loudness-analysis';
import { clearStudioFiles, ensureDir, ensureWorkDir, STUDIO_DOWNLOAD_DIR, toFfmpegPath, writeBytes, writeText } from './studio-files';
import { runFfmpeg, type FfmpegRun } from './studio-ffmpeg';

export interface StudioRender {
  outputUri: string;
  durationSec: number;
  cancel: () => Promise<void>;
  done: Promise<boolean>;
}

/** ffmpeg gets plain file paths, the project keeps the URIs the rest of the app uses. */
function withFfmpegPaths(project: StudioProject): StudioProject {
  const assets = Object.fromEntries(Object.entries(project.assets).map(([id, asset]) => [id, { ...asset, path: toFfmpegPath(asset.path) }]));
  return { ...project, assets };
}

/**
 * Renders a part of the mix (a short preview) or all of it (export) with the same filter graph the desktop uses.
 * `range` limits the render in timeline seconds.
 */
export async function startRender(
  project: StudioProject,
  options: { name: string; range?: { startSec: number; endSec: number }; metadata?: { title: string; artist: string }; onProgress?: (fraction: number) => void },
): Promise<StudioRender | null> {
  const directory = await ensureWorkDir();
  const impulsePaths: Record<string, string> = {};
  for (const key of requiredImpulseKeys(project)) {
    const spec = reverbImpulseSpec(key);
    const uri = `${directory}${key}.wav`;
    await writeBytes(uri, encodeWavFloat32(generateReverbImpulse(spec.size, spec.damping, STUDIO_SAMPLE_RATE), STUDIO_SAMPLE_RATE));
    impulsePaths[key] = toFfmpegPath(uri);
  }
  const outputUri = `${directory}${options.name}.m4a`;
  const scriptUri = `${directory}${options.name}.graph.txt`;
  const plan = buildRenderArgs(withFfmpegPaths(project), {
    output: { path: toFfmpegPath(outputUri), format: 'm4a' },
    impulsePaths,
    filterScriptPath: toFfmpegPath(scriptUri),
    range: options.range,
    metadata: options.metadata,
    bitrate: '160k',
  });
  if (!plan) return null;
  await writeText(scriptUri, plan.filterGraph);
  const run: FfmpegRun = await runFfmpeg(plan.args, (timeMs) => options.onProgress?.(Math.min(0.99, timeMs / 1000 / plan.durationSec)));
  return { outputUri, durationSec: plan.durationSec, cancel: run.cancel, done: run.done };
}

/** Moves a finished mix from the work folder into the music folder and registers it as a Library track. */
export async function saveMixToLibrary(outputUri: string, title: string, artist: string, durationSec: number): Promise<number> {
  await ensureMusicDir();
  const safeName = sanitizeFilename(`${artist} - ${title}`) || 'Studio mix';
  let target = `${MUSIC_DIR}${safeName}.m4a`;
  for (let attempt = 2; (await FileSystem.getInfoAsync(target)).exists; attempt += 1) target = `${MUSIC_DIR}${safeName} (${attempt}).m4a`;
  await FileSystem.moveAsync({ from: outputUri, to: target });
  const info = await FileSystem.getInfoAsync(target, { size: true });
  const trackId = await insertTrack({
    file_path: target,
    file_hash: null,
    content_hash_sha256: null,
    file_size: info.exists && typeof info.size === 'number' ? info.size : 0,
    file_mtime: null,
    title,
    artist,
    album: null,
    album_artist: null,
    track_number: null,
    disc_number: null,
    duration_ms: Math.round(durationSec * 1000),
    genre: null,
    year: null,
    bitrate: null,
    sample_rate: STUDIO_SAMPLE_RATE,
    format: 'm4a',
    cover_art_path: null,
    loudness_lufs: null,
    loudness_gain: null,
    youtube_id: null,
    spotify_id: null,
    soundcloud_id: null,
    source_url: null,
    last_played_at: null,
    rating: null,
    in_library: 1,
  });
  scheduleTrackLoudnessAnalysis(trackId);
  await clearStudioFiles(false);
  return trackId;
}

function toFileUri(path: string): string {
  return /^[a-z]+:\/\//i.test(path) ? path : `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Replaces the audio of an existing Library song with a rendered Studio edit (a quick edit such as a cut intro). The
 * song keeps its id, so it stays in every playlist with its star, cover and play counts. The new file sits next to the
 * original as `.m4a`; the original is removed and its cloud copy is excluded on this phone, like a deleted song, so
 * sync does not bring the unedited version back. Any failure before the database is updated puts the original back.
 */
export async function replaceTrackAudio(trackId: number, outputUri: string, durationSec: number): Promise<void> {
  // Sync reads and hashes song files in this lane; the swap must not happen while it does.
  await runMobileCloudDbLane((db) => swapTrackAudio(db, trackId, outputUri, durationSec));
  scheduleTrackLoudnessAnalysis(trackId);
  await clearStudioFiles(false);
}

async function swapTrackAudio(db: SQLiteDatabase, trackId: number, outputUri: string, durationSec: number): Promise<void> {
  const track = await db.getFirstAsync<{ id: number; file_path: string; content_hash_sha256: string | null }>(
    'SELECT id, file_path, content_hash_sha256 FROM tracks WHERE id = ?', [trackId]);
  if (!track) throw new Error('The song is no longer in the Library');
  const original = toFileUri(track.file_path);
  if (!(await FileSystem.getInfoAsync(original)).exists) throw new Error('The original song file is missing');

  const base = original.replace(/\.[^./]*$/, '');
  let target = `${base}.m4a`;
  for (let attempt = 2; ; attempt += 1) {
    const takenByTrack = await db.getFirstAsync('SELECT id FROM tracks WHERE file_path IN (?, ?) AND id != ?', [target, toFfmpegPath(target), trackId]);
    const takenOnDisk = target !== original && (await FileSystem.getInfoAsync(target)).exists;
    if (!takenByTrack && !takenOnDisk) break;
    target = `${base} (${attempt}).m4a`;
  }

  const backup = `${original}.studio-original`;
  await FileSystem.moveAsync({ from: original, to: backup });
  try {
    await FileSystem.moveAsync({ from: outputUri, to: target });
    const info = await FileSystem.getInfoAsync(target, { size: true });
    const size = info.exists && typeof info.size === 'number' ? info.size : 0;
    await db.withTransactionAsync(async () => {
      const oldHash = track.content_hash_sha256?.toLowerCase() ?? '';
      const shared = oldHash !== '' && await db.getFirstAsync(
        'SELECT 1 FROM tracks WHERE id != ? AND lower(content_hash_sha256) = ?', [trackId, oldHash]);
      if (oldHash && !shared) {
        await db.runAsync(
          `INSERT INTO cloud_sync_local_exclusions (scope_id, content_hash_sha256, deleted_at)
           SELECT active_scope_id, ?, strftime('%s','now') FROM cloud_sync_control
           WHERE id = 1 AND active_scope_id != ''
           ON CONFLICT(scope_id, content_hash_sha256) DO UPDATE SET deleted_at = excluded.deleted_at`,
          [oldHash]);
        // Other devices replace the song too: the tombstone removes the old audio there and the edited version
        // arrives with the same playlists (their upsert follows from the hash change).
        await db.runAsync(
          `UPDATE cloud_sync_control SET generation = generation + 1
           WHERE id = 1 AND suppress_outbox = 0 AND active_scope_id != ''`);
        await db.runAsync(
          `INSERT INTO cloud_sync_outbox (scope_id, entity_type, entity_key, local_id, operation, payload_json, generation)
           SELECT active_scope_id, 'track', ?, NULL, 'delete', json_object('content_hash_sha256', ?), generation
           FROM cloud_sync_control WHERE id = 1 AND suppress_outbox = 0 AND active_scope_id != ''
           ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
             operation = 'delete', payload_json = excluded.payload_json, generation = excluded.generation`,
          [`${CLOUD_REPLACED_TRACK_KEY_PREFIX}${oldHash}`, oldHash]);
      }
      await db.runAsync(
        `UPDATE tracks SET file_path = ?, file_hash = NULL, content_hash_sha256 = NULL, file_size = ?, file_mtime = NULL,
           duration_ms = ?, bitrate = NULL, sample_rate = ?, format = 'm4a', loudness_lufs = NULL, loudness_gain = NULL
         WHERE id = ?`,
        [/^[a-z]+:\/\//i.test(track.file_path) ? target : toFfmpegPath(target), size, Math.round(durationSec * 1000), STUDIO_SAMPLE_RATE, trackId]);
    });
  } catch (error) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    await FileSystem.moveAsync({ from: backup, to: original });
    throw error;
  }
  await FileSystem.deleteAsync(backup, { idempotent: true });
}

/** Downloads an online result into the Studio cache. It is never added to the Library. */
export async function downloadTemporarySong(result: SearchResult, onProgress: (fraction: number) => void): Promise<string | null> {
  if (result.source !== 'youtube' && result.source !== 'spotify') return null;
  const prepared = await prepareDownloadSource({
    source: result.source,
    sourceId: result.id,
    title: result.title,
    artist: result.artist,
    album: result.album,
    durationMs: result.duration_ms ?? 0,
    coverUrl: result.thumbnail_url,
    sourceUrl: result.url,
    playlistId: null,
  });
  await ensureDir(STUDIO_DOWNLOAD_DIR);
  const extension = prepared.filePath.slice(prepared.filePath.lastIndexOf('.'));
  const target = `${STUDIO_DOWNLOAD_DIR}${result.source}-${result.id.replace(/[^\w-]/g, '_')}${extension}`;
  const response = await nativeDownload(prepared.url, target, prepared.headers, (loaded, total) => onProgress(Math.min(0.99, loaded / total)));
  if (!response || (response.status !== 200 && response.status !== 206)) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    return null;
  }
  return target;
}
