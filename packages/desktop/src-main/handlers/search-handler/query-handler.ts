import {
  canonicalizeSearchQuery,
  createSearchPageRequest,
  parseDirectTrackUrl,
  type DirectTrackUrl,
  type SearchQuery,
  type SearchSource,
} from '@ton/core';
import {
  getSpotifyTrackById,
  getPlaylistTracks,
  parsePlaylistUrl,
  searchSpotifyPage,
} from '../../services/spotify-client';
import {
  getSoundCloudTrackByUrl,
  searchSoundCloudPage,
} from '../../services/soundcloud-search';
import { getYouTubeTrackById, searchYouTubePage } from '../../services/youtube-search';
import { measurePerfAsync } from '../../services/perf';
import {
  enrichWithDownloadStatus,
  searchLocalTracks,
  searchPlaylistTracks,
  type SearchPageResult,
} from './library-search';
import {
  searchWithRelaxedRetry,
  settleSearchProviderTasks,
  type SearchProviderTask,
} from './orchestration';
import { sendSearchSourceEvent } from './renderer-events';

const PROVIDER_DEADLINE_MS = 15_000;
const activeSearches = new Map<number, { requestId: number; controller: AbortController }>();
const latestSearchRequestIds = new Map<number, number>();

export async function handleSearchQuery(
  target: Electron.WebContents,
  rawQuery: SearchQuery,
): Promise<{ sourceErrors: Record<string, string> }> {
  if (!Number.isSafeInteger(rawQuery.requestId) || rawQuery.requestId < 1) {
    throw new Error('Search requestId must be a positive integer');
  }

  const latestRequestId = latestSearchRequestIds.get(target.id) ?? 0;
  if (rawQuery.requestId <= latestRequestId) {
    return { sourceErrors: {} };
  }
  if (!latestSearchRequestIds.has(target.id)) {
    target.once('destroyed', () => {
      activeSearches.get(target.id)?.controller.abort();
      activeSearches.delete(target.id);
      latestSearchRequestIds.delete(target.id);
    });
  }
  latestSearchRequestIds.set(target.id, rawQuery.requestId);
  const previous = activeSearches.get(target.id);
  previous?.controller.abort();

  const controller = new AbortController();
  activeSearches.set(target.id, { requestId: rawQuery.requestId, controller });
  const query: SearchQuery = {
    ...rawQuery,
    query: canonicalizeSearchQuery(rawQuery.query),
    sources: Array.from(new Set(rawQuery.sources)),
  };

  try {
    return await measurePerfAsync(`search:query:${query.requestId}`, async () => ({
      sourceErrors: await settleSearchProviderTasks(
        query.requestId,
        query.sources.map((source) => createProviderTask(query, source)),
        controller.signal,
        (event) => sendSearchSourceEvent(target, event),
      ),
    }));
  } finally {
    const active = activeSearches.get(target.id);
    if (active?.requestId === query.requestId) activeSearches.delete(target.id);
  }
}

export function cancelSearch(target: Electron.WebContents, requestId?: number): void {
  const active = activeSearches.get(target.id);
  if (!active || (requestId != null && requestId !== active.requestId)) return;
  active.controller.abort();
  activeSearches.delete(target.id);
}

export async function handleSpotifyPlaylistLookup(url: string) {
  const playlistId = parsePlaylistUrl(url);
  if (!playlistId) throw new Error('Invalid Spotify playlist URL');
  return getPlaylistTracks(playlistId);
}

function createProviderTask(query: SearchQuery, source: SearchSource): SearchProviderTask {
  const { limit, offset } = createSearchPageRequest(
    source,
    query.limitBySource?.[source] ?? query.limit,
    query.offsetBySource?.[source],
  );
  const remote = source === 'youtube' || source === 'spotify' || source === 'soundcloud';

  return {
    source,
    offset,
    ...(remote ? { deadlineMs: PROVIDER_DEADLINE_MS } : {}),
    run: async (signal) => {
      if (signal.aborted) throw new Error('Cancelled');
      const page = await getSourcePage(source, query.query, limit, offset, signal);
      if (signal.aborted) throw new Error('Cancelled');
      return {
        results: remote ? enrichWithDownloadStatus(page.results) : page.results,
        hasMore: page.hasMore,
      };
    },
  };
}

function getSourcePage(
  source: SearchSource,
  query: string,
  limit: number,
  offset: number,
  signal: AbortSignal,
): Promise<SearchPageResult> {
  const directTrack = parseDirectTrackUrl(query);
  if (directTrack) {
    return getDirectTrackPage(source, directTrack, offset, signal);
  }

  switch (source) {
    case 'local':
      return searchLocalTracks(query, limit, offset);
    case 'playlist':
      return searchPlaylistTracks(query, limit, offset);
    case 'youtube':
      return searchWithRelaxedRetry(
        source,
        query,
        offset,
        signal,
        (effectiveQuery, retrySignal) => searchYouTubePage(
          effectiveQuery,
          limit,
          offset,
          retrySignal,
        ),
      );
    case 'spotify':
      return searchWithRelaxedRetry(
        source,
        query,
        offset,
        signal,
        (effectiveQuery, retrySignal) => searchSpotifyPage(
          effectiveQuery,
          limit,
          offset,
          retrySignal,
        ),
      );
    case 'soundcloud':
      return searchWithRelaxedRetry(
        source,
        query,
        offset,
        signal,
        (effectiveQuery, retrySignal) => searchSoundCloudPage(
          effectiveQuery,
          limit,
          offset,
          retrySignal,
        ),
      );
  }
}

async function getDirectTrackPage(
  source: SearchSource,
  directTrack: DirectTrackUrl,
  offset: number,
  signal: AbortSignal,
): Promise<SearchPageResult> {
  if (offset > 0 || source !== directTrack.source) {
    return { results: [], hasMore: false };
  }

  switch (directTrack.source) {
    case 'youtube':
      return {
        results: [await getYouTubeTrackById(directTrack.id, signal)],
        hasMore: false,
      };
    case 'spotify':
      return {
        results: [await getSpotifyTrackById(directTrack.id, signal)],
        hasMore: false,
      };
    case 'soundcloud':
      return {
        results: [await getSoundCloudTrackByUrl(directTrack.url, signal)],
        hasMore: false,
      };
  }
}
