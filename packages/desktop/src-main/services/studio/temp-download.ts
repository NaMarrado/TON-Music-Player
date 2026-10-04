import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { findBestMatch, toDownloadFailureMessage, type MatchCandidate } from '@ton/core';
import type { StudioTempDownloadRequest, StudioTempDownloadResult } from '../../../src/shared/studio-ipc';
import { getFfmpegPathAsync, getYtDlpPathAsync } from '../binary-manager';
import { getYtDlpAudioFormatSelector } from '../downloader/audio-policy';
import { findOutputFile } from '../downloader/file-output';
import { parseProgressLine } from '../downloader/parse-progress-line';
import { YT_DLP_DOWNLOAD_PROGRESS_TEMPLATE } from '../downloader/progress-template';
import { searchYouTube } from '../youtube-search';
import { ensureStudioTempDir } from './paths';


/** Spotify results carry no audio, so they are matched to a YouTube video the same way the Library download does. */
async function resolveUrl(request: StudioTempDownloadRequest, signal: AbortSignal): Promise<string> {
  if (request.source !== 'spotify') return request.url;
  const query = `${request.artist} - ${request.title}`.trim();
  const results = await searchYouTube(query, 10, signal);
  const candidates: MatchCandidate[] = results.map((result) => ({
    id: result.id,
    title: result.title,
    artist: result.artist,
    duration_ms: result.duration_ms,
    thumbnail_url: result.thumbnail_url,
    url: result.url,
  }));
  const match = findBestMatch({ title: request.title, artist: request.artist, duration_ms: request.durationMs ?? 0 }, candidates);
  if (!match) throw new Error(`No YouTube match found for "${query}"`);
  return match.url;
}

/** Downloads one song into the Studio temp folder. Nothing is written to the Library or the database. */
export async function downloadStudioTemporary(
  request: StudioTempDownloadRequest,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<StudioTempDownloadResult> {
  const directory = await ensureStudioTempDir();
  const url = await resolveUrl(request, signal);
  if (signal.aborted) throw new Error('Cancelled');
  const stem = `dl-${randomUUID().slice(0, 12)}`;
  const ffmpegPath = await getFfmpegPathAsync();
  const args = [
    url,
    // The Studio only decodes the file, so unlike a Library download it does not insist on M4A: YouTube often offers only Opus/WebM.
    '--format', getYtDlpAudioFormatSelector('soundcloud'),
    '--output', path.join(directory, `${stem}.%(ext)s`),
    '--no-playlist',
    '--retries', '3',
    '--newline',
    '--progress-template', `download:${YT_DLP_DOWNLOAD_PROGRESS_TEMPLATE}`,
    '--no-color',
    '--js-runtimes', 'node',
    '--extractor-args', 'youtube:player_client=default,-android_sdkless',
  ];
  if (ffmpegPath) args.push('--ffmpeg-location', path.dirname(ffmpegPath));

  const subprocess = spawn(await getYtDlpPathAsync(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const abort = () => subprocess.kill('SIGTERM');
  signal.addEventListener('abort', abort, { once: true });
  const errors: string[] = [];
  const handle = (line: string, collect: boolean) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parsed = parseProgressLine(trimmed);
    if (parsed) {
      const total = parsed.totalBytes ?? parsed.totalBytesEstimate;
      if (total && parsed.downloadedBytes != null) onProgress(Math.min(1, parsed.downloadedBytes / total));
    } else if (collect) {
      errors.push(trimmed);
    }
  };
  const stdout = createInterface({ input: subprocess.stdout });
  const stderr = createInterface({ input: subprocess.stderr });
  stdout.on('line', (line) => handle(line, false));
  stderr.on('line', (line) => handle(line, true));
  try {
    await new Promise<void>((resolve, reject) => {
      subprocess.on('error', reject);
      subprocess.on('close', (code) => {
        if (signal.aborted) reject(new Error('Cancelled'));
        else if (code === 0) resolve();
        else reject(new Error(toDownloadFailureMessage(errors.length > 0 ? errors.join('\n') : `yt-dlp exited with code ${code}`)));
      });
    });
  } finally {
    signal.removeEventListener('abort', abort);
    stdout.close();
    stderr.close();
  }
  const file = await findOutputFile(directory, stem);
  if (!file) throw new Error('Downloaded audio file not found');
  return { path: file };
}
