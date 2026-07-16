import { findBestMatch, sanitizeFilename, type MatchCandidate } from '@ton/core';
import {
  getYouTubeAudioUrl,
  searchYouTube,
  type AudioStrategyName,
} from '../youtube-search';
import { buildLocalFileUri } from '../library-transfer/file-helpers';
import { MUSIC_DIR } from './filesystem';
import type { DownloadFormat, DownloadInput } from './types';

export interface ResolvedDownloadSource {
  coverUrl: string | null;
  contentLength: number;
  filePath: string;
  format: DownloadFormat;
  headers: Record<string, string>;
  mimeType: string;
  safeName: string;
  strategy: AudioStrategyName;
  url: string;
  videoId: string;
}

export interface ResolveDownloadSourceOptions {
  forceFreshStrategies?: readonly string[];
  signal?: AbortSignal;
  skipStrategies?: readonly string[];
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('download_cancelled');
  }
}

function getFileExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('mp4') || normalized.includes('x-m4a')) return '.m4a';
  throw new Error(`incompatible_download_mime:${mimeType}`);
}

export async function resolveVideoMatch(
  input: DownloadInput,
  signal?: AbortSignal,
): Promise<{ coverUrl: string | null; videoId: string }> {
  throwIfCancelled(signal);
  if (input.source === 'youtube') {
    return { coverUrl: input.coverUrl, videoId: input.sourceId };
  }

  const query = `${input.artist} - ${input.title}`.trim();
  const ytResults = await searchYouTube(query, 10);
  throwIfCancelled(signal);
  if (ytResults.length === 0) {
    throw new Error(`No YouTube match found for "${query}"`);
  }

  const candidates: MatchCandidate[] = ytResults.map((result) => ({
    artist: result.artist,
    duration_ms: result.duration_ms,
    id: result.id,
    thumbnail_url: result.thumbnail_url,
    title: result.title,
    url: result.url,
  }));
  const match = findBestMatch({
    artist: input.artist,
    duration_ms: input.durationMs,
    title: input.title,
  }, candidates);
  if (!match) {
    throw new Error(`No YouTube match found for "${query}"`);
  }

  return { coverUrl: match.thumbnail_url ?? null, videoId: match.id };
}

export async function resolveDownloadSource(
  input: DownloadInput,
  options: ResolveDownloadSourceOptions = {},
): Promise<ResolvedDownloadSource> {
  const { coverUrl, videoId } = await resolveVideoMatch(input, options.signal);
  throwIfCancelled(options.signal);
  const safeName = sanitizeFilename(`${input.artist} - ${input.title}`);

  console.log('[DL] Resolving audio URL for', videoId);
  const {
    contentLength,
    headers,
    mimeType,
    strategy,
    url,
  } = await getYouTubeAudioUrl(videoId, {
    forceFreshStrategies: options.forceFreshStrategies,
    signal: options.signal,
    skipStrategies: options.skipStrategies,
  });
  console.log('[DL] Got URL via', strategy, 'mime:', mimeType, 'size:', contentLength);
  console.log(
    '[DL] URL host:',
    new URL(url).hostname,
    'params:',
    new URL(url).searchParams.get('expire'),
  );

  const ext = getFileExtension(mimeType);
  const filePath = buildLocalFileUri(MUSIC_DIR, `${safeName || 'Track'}${ext}`, videoId);
  const format = ext.replace('.', '') as DownloadFormat;

  return {
    coverUrl,
    contentLength,
    filePath,
    format,
    headers,
    mimeType,
    safeName,
    strategy,
    url,
    videoId,
  };
}
