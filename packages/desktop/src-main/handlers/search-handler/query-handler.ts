import type { SearchQuery, SearchResult } from '@ton/core';
import {
  getPlaylistTracks,
  parsePlaylistUrl,
  searchSpotifyPage,
} from '../../services/spotify-client';
import { searchSoundCloudPage } from '../../services/soundcloud-search';
import { searchYouTubePage } from '../../services/youtube-search';
import { measurePerfAsync } from '../../services/perf';
import {
  enrichWithDownloadStatus,
  searchLocalTracks,
  searchPlaylistTracks,
  type SearchPageResult,
} from './library-search';
import { sendSearchSourceResults } from './renderer-events';

const SEARCH_PROVIDER_TIMEOUT_MS = 12_000;

export async function handleSearchQuery(
  target: Electron.WebContents,
  query: SearchQuery,
): Promise<{ sourceErrors: Record<string, string> }> {
  return measurePerfAsync(`search:query:${query.requestId ?? 'direct'}`, async () => {
    const sourceErrors: Record<string, string> = {};
    const promises: Promise<void>[] = [];
    const getSourceLimit = (source: SearchResult['source']) =>
      query.limitBySource?.[source] ?? query.limit;

    if (query.sources.includes('local')) {
      promises.push(
        searchLocalTracks(query.query, getSourceLimit('local'), getSourceOffset(query, 'local'))
          .then(({ results, hasMore }) => {
            sendSearchSourceResults(
              target,
              'local',
              results,
              query.query,
              query.requestId,
              getSourceOffset(query, 'local'),
              hasMore,
            );
          })
          .catch(() => {}),
      );
    }

    if (query.sources.includes('playlist')) {
      promises.push(
        searchPlaylistTracks(
          query.query,
          getSourceLimit('playlist'),
          getSourceOffset(query, 'playlist'),
        )
          .then(({ results, hasMore }) => {
            sendSearchSourceResults(
              target,
              'playlist',
              results,
              query.query,
              query.requestId,
              getSourceOffset(query, 'playlist'),
              hasMore,
            );
          })
          .catch(() => {}),
      );
    }

    registerRemoteSourceSearch(
      target,
      query,
      'youtube',
      () => withSearchTimeout('youtube', () =>
        searchYouTubePage(
          query.query,
          getSourceLimit('youtube'),
          getSourceOffset(query, 'youtube'),
        )),
      promises,
      sourceErrors,
    );
    registerRemoteSourceSearch(
      target,
      query,
      'spotify',
      () => withSearchTimeout('spotify', () =>
        searchSpotifyPage(
          query.query,
          getSourceLimit('spotify'),
          getSourceOffset(query, 'spotify'),
        )),
      promises,
      sourceErrors,
    );
    registerRemoteSourceSearch(
      target,
      query,
      'soundcloud',
      () => withSearchTimeout('soundcloud', () =>
        searchSoundCloudPage(
          query.query,
          getSourceLimit('soundcloud'),
          getSourceOffset(query, 'soundcloud'),
        )),
      promises,
      sourceErrors,
    );

    await Promise.allSettled(promises);
    return { sourceErrors };
  });
}

export async function handleSpotifyPlaylistLookup(url: string) {
  const playlistId = parsePlaylistUrl(url);
  if (!playlistId) {
    throw new Error('Invalid Spotify playlist URL');
  }

  return getPlaylistTracks(playlistId);
}

function registerRemoteSourceSearch(
  target: Electron.WebContents,
  query: SearchQuery,
  source: Extract<SearchResult['source'], 'youtube' | 'spotify' | 'soundcloud'>,
  search: () => Promise<SearchPageResult>,
  promises: Promise<void>[],
  sourceErrors: Record<string, string>,
): void {
  if (!query.sources.includes(source)) {
    return;
  }

  promises.push(
    search()
      .then(({ results, hasMore }) => {
        sendSearchSourceResults(
          target,
          source,
          enrichWithDownloadStatus(results),
          query.query,
          query.requestId,
          getSourceOffset(query, source),
          hasMore,
        );
      })
      .catch((error: unknown) => {
        sourceErrors[source] = String(error instanceof Error ? error.message : error);
      }),
  );
}

function getSourceOffset(
  query: SearchQuery,
  source: SearchResult['source'],
): number {
  return query.offsetBySource?.[source] ?? 0;
}

async function withSearchTimeout<T>(
  source: Extract<SearchResult['source'], 'youtube' | 'spotify' | 'soundcloud'>,
  run: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${source} search timed out after ${SEARCH_PROVIDER_TIMEOUT_MS}ms`));
        }, SEARCH_PROVIDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
