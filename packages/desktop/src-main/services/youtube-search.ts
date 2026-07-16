/**
 * YouTube Search - uses youtubei.js (Innertube client).
 * No API key needed - uses YouTube's internal API.
 */

import { Innertube, Parser, YTNodes } from 'youtubei.js';
import type { SearchResult, YouTubePlaylistTrack } from '@ton/core';
import { parseYouTubePlaylistItem, SEARCH_PAGE_LIMITS } from '@ton/core';
import { searchYouTubeWithYtDlp } from './youtube-search-fallback';

let innertube: Innertube | null = null;
let parserCompatPatched = false;
const YOUTUBE_SEARCH_CACHE_LIMIT = 12;
const youtubeSearchSessions = new Map<string, {
  search: Awaited<ReturnType<Innertube['search']>>;
  results: SearchResult[];
  exhausted: boolean;
}>();

async function getClient(): Promise<Innertube> {
  patchParserCompatibility();

  if (!innertube) {
    innertube = await Innertube.create({ retrieve_player: false });
  }
  return innertube;
}

export async function searchYouTube(
  query: string,
  limit = SEARCH_PAGE_LIMITS.youtube,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const response = await searchYouTubePage(query, limit, 0, signal);
  return response.results;
}

export async function getYouTubeTrackById(
  videoId: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  throwIfSearchAborted(signal);
  const yt = await getClient();
  const info = await raceSearchAbort(yt.getBasicInfo(videoId), signal);
  const metadata = info.basic_info;
  if (!metadata.title) {
    throw new Error('YouTube video metadata is unavailable');
  }

  const thumbnail = metadata.thumbnail
    ?.filter((item): item is typeof item & { url: string } => Boolean(item.url))
    .sort((left, right) => (
      (right.width ?? right.height ?? 0) - (left.width ?? left.height ?? 0)
    ))[0]?.url ?? null;

  return {
    id: videoId,
    source: 'youtube',
    title: metadata.title,
    artist: metadata.author ?? metadata.channel?.name ?? '',
    album: null,
    duration_ms: metadata.duration == null ? null : Math.round(metadata.duration * 1000),
    thumbnail_url: thumbnail,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    is_downloaded: false,
  };
}

export async function searchYouTubePage(
  query: string,
  limit = SEARCH_PAGE_LIMITS.youtube,
  offset = 0,
  signal?: AbortSignal,
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return { results: [], hasMore: false };
  }

  const sessionKey = normalizedQuery.toLowerCase();

  try {
    throwIfSearchAborted(signal);
    const yt = await getClient();
    let session = offset > 0 ? youtubeSearchSessions.get(sessionKey) : null;

    if (!session) {
      session = {
        search: await raceSearchAbort(yt.search(normalizedQuery, { type: 'video' }), signal),
        results: [],
        exhausted: false,
      };
      youtubeSearchSessions.set(sessionKey, session);
      trimYouTubeSearchSessions();
    }

    await fillYouTubeSearchSession(session, offset + limit + 1, signal);
    if (offset === 0 && session.results.length === 0) {
      throw new Error('YouTube.js returned no search results');
    }

    return {
      results: session.results.slice(offset, offset + limit),
      hasMore: session.results.length > offset + limit
        || (!session.exhausted && session.search.has_continuation),
    };
  } catch (primaryError) {
    youtubeSearchSessions.delete(sessionKey);
    throwIfSearchAborted(signal);
    try {
      return await searchYouTubeWithYtDlp(normalizedQuery, limit, offset, signal);
    } catch (fallbackError) {
      throw new Error(
        `YouTube search failed (${getErrorMessage(primaryError)}); yt-dlp fallback failed (${getErrorMessage(fallbackError)})`,
      );
    }
  }
}

function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Cancelled');
}

function raceSearchAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfSearchAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse a YouTube playlist URL to extract the list ID. */
export function parseYouTubePlaylistUrl(url: string): string | null {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Fetch all tracks from a YouTube playlist. */
export async function getYouTubePlaylistTracks(listId: string): Promise<{
  name: string;
  tracks: YouTubePlaylistTrack[];
}> {
  const yt = await getClient();
  let playlist = await yt.getPlaylist(listId);
  const name = playlist.info.title || 'YouTube Playlist';
  const tracks: YouTubePlaylistTrack[] = [];

  const extract = (items: unknown[]) => {
    for (const item of items) {
      const track = parseYouTubePlaylistItem(item);
      if (track) tracks.push(track);
    }
  };

  extract(playlist.items || []);

  while (playlist.has_continuation) {
    playlist = await playlist.getContinuation();
    extract(playlist.items || []);
  }

  return { name, tracks };
}

function extractVideos(
  items: { type?: string }[],
  results: SearchResult[],
  limit: number,
): number {
  const seen = new Set(results.map((result) => result.id));
  let added = 0;
  for (const item of items) {
    if (results.length >= limit) break;
    if (item.type !== 'Video') continue;

    const video = item as unknown as {
      id: string;
      title?: { text?: string };
      author?: { name?: string };
      duration?: { seconds?: number };
      thumbnails?: Array<{ url?: string }>;
    };

    if (!video.id || seen.has(video.id)) continue;
    seen.add(video.id);
    added++;
    results.push({
      id: video.id,
      source: 'youtube',
      title: video.title?.text || '',
      artist: video.author?.name || '',
      album: null,
      duration_ms: (video.duration?.seconds || 0) * 1000,
      thumbnail_url: video.thumbnails?.[0]?.url || null,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      is_downloaded: false,
    });
  }
  return added;
}

async function fillYouTubeSearchSession(
  session: {
    search: Awaited<ReturnType<Innertube['search']>>;
    results: SearchResult[];
    exhausted: boolean;
  },
  targetCount: number,
  signal?: AbortSignal,
): Promise<void> {
  extractVideos(session.search.results || [], session.results, targetCount);

  let continuationPages = 0;
  while (
    session.results.length < targetCount
    && session.search.has_continuation
    && continuationPages < 3
  ) {
    throwIfSearchAborted(signal);
    session.search = await raceSearchAbort(session.search.getContinuation(), signal);
    continuationPages++;
    const added = extractVideos(session.search.results || [], session.results, targetCount);
    if (added === 0) {
      session.exhausted = true;
      break;
    }
  }

  if (!session.search.has_continuation) session.exhausted = true;
}

function trimYouTubeSearchSessions(): void {
  while (youtubeSearchSessions.size > YOUTUBE_SEARCH_CACHE_LIMIT) {
    const oldestKey = youtubeSearchSessions.keys().next().value;
    if (!oldestKey) {
      return;
    }
    youtubeSearchSessions.delete(oldestKey);
  }
}

function extractVideoSummaryParagraphText(paragraph: unknown): string {
  if (!paragraph || typeof paragraph !== 'object') return '';

  const data = paragraph as {
    videoSummaryParagraphView?: { text?: { content?: string } };
    text?: { content?: string };
  };

  return data.videoSummaryParagraphView?.text?.content ?? data.text?.content ?? '';
}

function patchParserCompatibility(): void {
  if (parserCompatPatched) return;

  if (!Parser.hasParser('VideoSummaryContentView')) {
    class VideoSummaryContentViewCompat extends YTNodes.HorizontalList {
      summary_text: string;

      constructor(data: { paragraphs?: unknown[] }) {
        super({ visibleItemCount: 0, items: [] });

        const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
        this.summary_text = paragraphs
          .map(extractVideoSummaryParagraphText)
          .filter(Boolean)
          .join('\n');
      }
    }

    Parser.addRuntimeParser('VideoSummaryContentView', VideoSummaryContentViewCompat);
  }

  parserCompatPatched = true;
}
