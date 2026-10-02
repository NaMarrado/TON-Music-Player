import { execFile } from 'child_process';
import { normalizeTrackDurationMs, parseYouTubeViewCount, type SearchResult } from '@ton/core';
import { getYtDlpPathAsync } from './binary-manager';

interface YtDlpYouTubeEntry {
  channel?: string;
  duration?: number;
  id?: string;
  is_live?: boolean;
  live_status?: string;
  thumbnail?: string;
  thumbnails?: Array<{ height?: number; url?: string; width?: number }>;
  title?: string;
  uploader?: string;
  webpage_url?: string;
  view_count?: number;
}

interface YtDlpYouTubeSearch extends YtDlpYouTubeEntry {
  entries?: YtDlpYouTubeEntry[];
}

/** Resolve the pasted video itself, rather than searching for a similar title. */
export async function getYouTubeTrackWithYtDlp(
  videoId: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const result = await runYtDlp(await getYtDlpPathAsync(), [
    `https://www.youtube.com/watch?v=${videoId}`,
    '--dump-single-json',
    '--no-playlist',
    '--skip-download',
    '--ignore-no-formats-error',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=default,-android_sdkless',
    '--js-runtimes', 'node',
  ], signal);
  if (result.id !== videoId || !result.title?.trim()) {
    throw new Error('YouTube video metadata is unavailable');
  }
  return mapYouTubeEntry(result, videoId);
}

export async function searchYouTubeWithYtDlp(
  query: string,
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const requestedCount = offset + limit + 1;
  const result = await runYtDlp(await getYtDlpPathAsync(), [
    `ytsearch${requestedCount}:${query}`,
    '--dump-single-json',
    '--flat-playlist',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=default,-android_sdkless',
    '--js-runtimes', 'node',
  ], signal);

  const results = (result.entries ?? []).flatMap((entry): SearchResult[] => {
    const id = entry.id?.trim();
    if (!id) {
      return [];
    }

    return [mapYouTubeEntry(entry, id)];
  });

  return {
    results: results.slice(offset, offset + limit),
    hasMore: results.length > offset + limit,
  };
}

function mapYouTubeEntry(entry: YtDlpYouTubeEntry, id: string): SearchResult {
  return {
    id,
    source: 'youtube',
    title: entry.title ?? '',
    artist: entry.uploader ?? entry.channel ?? '',
    album: null,
    duration_ms: entry.is_live || entry.live_status === 'is_upcoming'
      ? null
      : normalizeTrackDurationMs(entry.duration, 'seconds'),
    thumbnail_url: pickThumbnail(entry),
    url: entry.webpage_url || `https://www.youtube.com/watch?v=${id}`,
    is_downloaded: false,
    view_count: parseYouTubeViewCount(entry.view_count),
  };
}

function pickThumbnail(entry: YtDlpYouTubeEntry): string | null {
  const thumbnail = entry.thumbnails
    ?.filter((candidate): candidate is { height?: number; url: string; width?: number } => Boolean(candidate.url))
    .sort((left, right) => (right.width ?? right.height ?? 0) - (left.width ?? left.height ?? 0))[0]
    ?.url;
  return thumbnail ?? entry.thumbnail ?? null;
}

function runYtDlp(
  binaryPath: string,
  args: string[],
  signal?: AbortSignal,
): Promise<YtDlpYouTubeSearch> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      args,
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024, signal },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim().split('\n').at(-1) || error.message;
          reject(new Error(detail));
          return;
        }

        try {
          resolve(JSON.parse(stdout) as YtDlpYouTubeSearch);
        } catch {
          reject(new Error('Failed to parse fallback YouTube metadata'));
        }
      },
    );
  });
}
