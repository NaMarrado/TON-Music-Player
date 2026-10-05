import * as FileSystem from 'expo-file-system';
import {
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
