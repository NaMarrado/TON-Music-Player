/**
 * SoundCloud Search - uses yt-dlp's SoundCloud search capability.
 * Requires yt-dlp binary to be available.
 */

import { execFile } from 'child_process';
import type { SearchResult } from '@ton/core';
import { getYtDlpPathAsync } from './binary-manager';

interface ScEntry {
  id?: string;
  title?: string;
  uploader?: string;
  creator?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
  webpage_url?: string;
  url?: string;
}

interface YtDlpPlaylistResult extends ScEntry {
  entries?: ScEntry[];
}

function pickThumbnail(entry: ScEntry): string | null {
  // Prefer t300x300 from thumbnails array, fallback to thumbnail field
  if (entry.thumbnails?.length) {
    const t300 = entry.thumbnails.find((t) => t.width === 300);
    if (t300?.url) return t300.url;
    const large = entry.thumbnails.find((t) => t.width === 100);
    if (large?.url) return large.url;
    return entry.thumbnails[0]?.url || null;
  }
  return entry.thumbnail || null;
}

export async function searchSoundCloud(
  query: string,
  limit = 10,
): Promise<SearchResult[]> {
  const response = await searchSoundCloudPage(query, limit, 0);
  return response.results;
}

export async function getSoundCloudTrackByUrl(
  url: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const result = await runYtDlp(await getYtDlpPathAsync(), [
    url,
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
  ], signal);
  const canonicalUrl = result.webpage_url || url;
  return {
    id: result.id || canonicalUrl,
    source: 'soundcloud',
    title: result.title || '',
    artist: result.uploader || result.creator || '',
    album: null,
    duration_ms: result.duration == null ? null : Math.round(result.duration * 1000),
    thumbnail_url: pickThumbnail(result),
    url: canonicalUrl,
    is_downloaded: false,
  };
}

export async function searchSoundCloudPage(
  query: string,
  limit = 10,
  offset = 0,
  signal?: AbortSignal,
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const ytDlpPath = await getYtDlpPathAsync();
  const requestedCount = offset + limit + 1;
  const searchQuery = `scsearch${requestedCount}:${query}`;

  const result = await runYtDlp(ytDlpPath, [
    searchQuery,
    '--dump-single-json',
    '--flat-playlist',
    '--no-warnings',
  ], signal);

  const entries = result.entries || [];

  const results = entries.map((entry) => ({
    id: entry.id || entry.webpage_url || '',
    source: 'soundcloud' as const,
    title: entry.title || '',
    artist: entry.uploader || entry.creator || '',
    album: null,
    duration_ms: entry.duration ? Math.round(entry.duration * 1000) : null,
    thumbnail_url: pickThumbnail(entry),
    url: entry.webpage_url || entry.url || '',
    is_downloaded: false,
  }));

  return {
    results: results.slice(offset, offset + limit),
    hasMore: results.length > offset + limit,
  };
}

/** Parse a SoundCloud set/playlist URL. */
export function parseSoundCloudPlaylistUrl(url: string): string | null {
  const match = url.match(/soundcloud\.com\/[^/]+\/sets\/[^/?]+/);
  return match ? match[0] : null;
}

/** Fetch all tracks from a SoundCloud playlist/set via yt-dlp. */
export async function getSoundCloudPlaylistTracks(url: string): Promise<{
  name: string;
  tracks: { title: string; artist: string; url: string; duration_ms: number; cover_url: string | null }[];
}> {
  const ytDlpPath = await getYtDlpPathAsync();
  const result = await runYtDlp(ytDlpPath, [
    url,
    '--dump-single-json',
    '--flat-playlist',
    '--no-warnings',
  ]);

  const name = (result as unknown as { title?: string }).title || 'SoundCloud Playlist';
  const entries = result.entries || [];

  const tracks = entries.map((entry) => ({
    title: entry.title || '',
    artist: entry.uploader || entry.creator || '',
    url: entry.webpage_url || entry.url || '',
    duration_ms: entry.duration ? Math.round(entry.duration * 1000) : 0,
    cover_url: pickThumbnail(entry),
  }));

  return { name, tracks };
}

function runYtDlp(
  binPath: string,
  args: string[],
  signal?: AbortSignal,
): Promise<YtDlpPlaylistResult> {
  return new Promise((resolve, reject) => {
    execFile(binPath, args, {
      timeout: 15_000,
      maxBuffer: 10 * 1024 * 1024,
      signal,
    }, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr.trim() || err.message || 'SoundCloud search failed';
        reject(new Error(detail));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('Failed to parse SoundCloud search results'));
      }
    });
  });
}
