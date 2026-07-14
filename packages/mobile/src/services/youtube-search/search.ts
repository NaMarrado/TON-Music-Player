import type { SearchResult, YouTubePlaylistTrack } from '@ton/core';
import { parseYouTubePlaylistItem, SEARCH_PAGE_LIMITS } from '@ton/core';

type SearchClientModule = typeof import('./client');
type SearchClient = Awaited<ReturnType<SearchClientModule['getSearchClient']>>;
type SearchPage = Awaited<ReturnType<SearchClient['search']>>;
type SearchClientFactory = () => Promise<SearchClient>;

const defaultSearchClientFactory: SearchClientFactory = async () => (
  (await import('./client')).getSearchClient()
);

const YOUTUBE_SEARCH_CACHE_LIMIT = 12;
const youtubeSearchSessions = new Map<string, {
  search: SearchPage;
  results: SearchResult[];
  exhausted: boolean;
}>();

export async function searchYouTube(
  query: string,
  limit = SEARCH_PAGE_LIMITS.youtube,
  offset = 0,
): Promise<SearchResult[]> {
  return (await searchYouTubePage(query, limit, offset)).results;
}

export async function searchYouTubePage(
  query: string,
  limit = SEARCH_PAGE_LIMITS.youtube,
  offset = 0,
  signal?: AbortSignal,
  clientFactory: SearchClientFactory = defaultSearchClientFactory,
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  throwIfSearchAborted(signal);
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return { results: [], hasMore: false };
  const sessionKey = normalizedQuery.toLowerCase();
  let session = offset > 0 ? youtubeSearchSessions.get(sessionKey) : undefined;

  if (!session) {
    const yt = await clientFactory();
    session = {
      search: await raceSearchAbort(yt.search(normalizedQuery, { type: 'video' }), signal),
      results: [],
      exhausted: false,
    };
    youtubeSearchSessions.set(sessionKey, session);
    trimYouTubeSearchSessions();
  }

  const targetCount = offset + limit + 1;
  await fillYouTubeSearchSession(session, targetCount, signal);

  return {
    results: session.results.slice(offset, offset + limit),
    hasMore: session.results.length > offset + limit
      || (!session.exhausted && session.search.has_continuation),
  };
}

export function resetYouTubeSearchSessions(): void {
  youtubeSearchSessions.clear();
}

async function fillYouTubeSearchSession(
  session: {
    search: SearchPage;
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
    if (!oldestKey) return;
    youtubeSearchSessions.delete(oldestKey);
  }
}

export async function getYouTubePlaylistTracks(listId: string): Promise<{
  name: string;
  tracks: YouTubePlaylistTrack[];
}> {
  const yt = await defaultSearchClientFactory();
  let playlist = await yt.getPlaylist(listId);
  const name = playlist.info.title || 'YouTube Playlist';
  const tracks: YouTubePlaylistTrack[] = [];

  const extractPlaylistVideos = (items: unknown[]) => {
    for (const item of items) {
      const track = parseYouTubePlaylistItem(item);
      if (track) tracks.push(track);
    }
  };

  extractPlaylistVideos(playlist.items || []);
  while (playlist.has_continuation) {
    playlist = await playlist.getContinuation();
    extractPlaylistVideos(playlist.items || []);
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

function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Search aborted');
}

function raceSearchAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfSearchAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Search aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
