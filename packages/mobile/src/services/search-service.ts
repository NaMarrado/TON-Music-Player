import {
  SearchProviderQueryAliases,
  buildSearchFtsQuery,
  canonicalizeSearchQuery,
  createSearchPageRequest,
  relaxSearchQuery,
  type SearchResult,
  type SearchSource,
  type SearchSourceStatus,
} from '@ton/core';
import { searchYouTubePage } from './youtube-search';
import { searchSpotifyPage } from './spotify-client';
import { getTrackIdsBySourceIdentity, searchTracksFts } from './db-queries';
import { getDb } from './database';
import {
  DEFAULT_SEARCH_SOURCES,
  createEmptySearchMoreState,
  createEmptySearchResults,
} from './search-plan';

const PROVIDER_DEADLINE_MS = 15_000;
const providerQueryAliases = new SearchProviderQueryAliases();

export interface SearchResponse {
  results: Record<SearchSource, SearchResult[]>;
  sourceErrors: Record<string, string>;
  hasMoreBySource: Record<SearchSource, boolean>;
}

export interface MobileSearchSourceEvent {
  source: SearchSource;
  status: SearchSourceStatus;
  results: SearchResult[];
  hasMore: boolean;
  error?: string;
}

export interface SearchExecutionOptions {
  sources?: SearchSource[];
  limit?: number;
  limitBySource?: Partial<Record<SearchSource, number>>;
  offsetBySource?: Partial<Record<SearchSource, number>>;
  signal?: AbortSignal;
  onSourceSettled?: (event: MobileSearchSourceEvent) => void;
}

type SearchPage = { results: SearchResult[]; hasMore: boolean };

export async function executeSearch(
  rawQuery: string,
  options: SearchExecutionOptions = {},
): Promise<SearchResponse> {
  const query = canonicalizeSearchQuery(rawQuery);
  const {
    sources = DEFAULT_SEARCH_SOURCES,
    limit,
    limitBySource,
    offsetBySource,
    signal,
    onSourceSettled,
  } = options;
  const results = createEmptySearchResults();
  const sourceErrors: Record<string, string> = {};
  const hasMoreBySource = createEmptySearchMoreState();

  if (!query || sources.length === 0) return { results, sourceErrors, hasMoreBySource };

  const tasks = Array.from(new Set(sources)).map(async (source) => {
    const { limit: sourceLimit, offset: sourceOffset } = createSearchPageRequest(
      source,
      limitBySource?.[source] ?? limit,
      offsetBySource?.[source],
    );

    try {
      throwIfAborted(signal);
      const page = await getSourcePage(source, query, sourceLimit, sourceOffset, signal);
      throwIfAborted(signal);
      const sourceResults = source === 'youtube' || source === 'spotify' || source === 'soundcloud'
        ? await enrichRemoteResults(source, page.results)
        : page.results;
      results[source] = sourceResults;
      hasMoreBySource[source] = page.hasMore;
      onSourceSettled?.({
        source,
        status: 'success',
        results: sourceResults,
        hasMore: page.hasMore,
      });
    } catch (error) {
      if (signal?.aborted) {
        onSourceSettled?.({ source, status: 'cancelled', results: [], hasMore: false });
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      sourceErrors[source] = message;
      onSourceSettled?.({
        source,
        status: 'error',
        results: [],
        hasMore: false,
        error: message,
      });
    }
  });

  await Promise.allSettled(tasks);
  throwIfAborted(signal);
  return { results, sourceErrors, hasMoreBySource };
}

async function getSourcePage(
  source: SearchSource,
  query: string,
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<SearchPage> {
  switch (source) {
    case 'youtube':
      return withProviderDeadline(signal, (providerSignal) => searchRemoteWithRelaxedRetry(
        source,
        query,
        offset,
        providerSignal,
        (effectiveQuery, retrySignal) => searchYouTubePage(
          effectiveQuery,
          limit,
          offset,
          retrySignal,
        ),
      ));
    case 'spotify':
      return withProviderDeadline(signal, (providerSignal) => searchRemoteWithRelaxedRetry(
        source,
        query,
        offset,
        providerSignal,
        (effectiveQuery, retrySignal) => searchSpotifyPage(
          effectiveQuery,
          limit,
          offset,
          retrySignal,
        ),
      ));
    case 'local': {
      const tracks = await searchTracksFts(query, limit + 1, offset);
      return {
        results: tracks.slice(0, limit).map((track) => ({
          id: String(track.id),
          source: 'local' as const,
          library_track_id: track.id,
          title: track.title || '',
          artist: track.artist || '',
          album: track.album,
          duration_ms: track.duration_ms,
          thumbnail_url: track.cover_art_path,
          url: track.file_path,
          is_downloaded: true,
        })),
        hasMore: tracks.length > limit,
      };
    }
    case 'playlist':
      return searchPlaylists(query, limit, offset);
    case 'soundcloud':
      return { results: [], hasMore: false };
  }
}

async function searchRemoteWithRelaxedRetry(
  source: Extract<SearchSource, 'youtube' | 'spotify'>,
  query: string,
  offset: number,
  signal: AbortSignal,
  search: (query: string, signal: AbortSignal) => Promise<SearchPage>,
): Promise<SearchPage> {
  if (offset > 0) {
    return search(providerQueryAliases.resolve(source, query), signal);
  }

  providerQueryAliases.forget(source, query);
  const firstPage = await search(query, signal);
  if (firstPage.results.length > 0) {
    providerQueryAliases.remember(source, query, query);
    return firstPage;
  }
  const relaxedQuery = relaxSearchQuery(query);
  if (!relaxedQuery || relaxedQuery === query) return firstPage;
  throwIfAborted(signal);
  const relaxedPage = await search(relaxedQuery, signal);
  if (relaxedPage.results.length > 0 || relaxedPage.hasMore) {
    providerQueryAliases.remember(source, query, relaxedQuery);
  }
  return relaxedPage;
}

export function resetMobileSearchProviderQueryAliases(): void {
  providerQueryAliases.clear();
}

async function enrichRemoteResults(
  source: 'youtube' | 'spotify' | 'soundcloud',
  sourceResults: SearchResult[],
): Promise<SearchResult[]> {
  const ids = sourceResults.map((result) => result.id).filter(Boolean);
  const localTrackIds = await getTrackIdsBySourceIdentity(source, ids);

  return sourceResults.map((result) => {
    const libraryTrackId = localTrackIds[result.id];
    return libraryTrackId
      ? { ...result, library_track_id: libraryTrackId, is_downloaded: true }
      : result;
  });
}

async function searchPlaylists(
  query: string,
  limit: number,
  offset: number,
): Promise<SearchPage> {
  const ftsQuery = buildSearchFtsQuery(query);
  if (!ftsQuery) return { results: [], hasMore: false };
  const db = getDb();
  const rows = await db.getAllAsync<{
    track_id: number;
    title: string;
    artist: string;
    album: string | null;
    duration_ms: number | null;
    cover_art_path: string | null;
    file_path: string;
    playlist_name: string;
  }>(
    `SELECT t.id as track_id, t.title, t.artist, t.album, t.duration_ms,
            t.cover_art_path, t.file_path, p.name as playlist_name
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     JOIN tracks_fts fts ON fts.rowid = t.id
     JOIN playlists p ON p.id = pt.playlist_id
     WHERE tracks_fts MATCH ?
     ORDER BY bm25(tracks_fts, 10.0, 6.0, 3.0, 4.0, 1.0), t.id
     LIMIT ? OFFSET ?`,
    [ftsQuery, limit + 1, offset],
  );

  return {
    results: rows.slice(0, limit).map((row) => ({
      id: `pl-${row.track_id}`,
      source: 'playlist' as const,
      library_track_id: row.track_id,
      title: row.title || '',
      artist: row.artist || '',
      album: row.album,
      duration_ms: row.duration_ms,
      thumbnail_url: row.cover_art_path,
      url: row.file_path,
      is_downloaded: true,
      playlist_name: row.playlist_name,
    })),
    hasMore: rows.length > limit,
  };
}

function withProviderDeadline<T>(
  parentSignal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  parentSignal?.addEventListener('abort', onParentAbort, { once: true });

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
      callback();
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(new Error('Search provider timed out')));
    }, PROVIDER_DEADLINE_MS);

    if (parentSignal?.aborted) controller.abort();
    run(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Search aborted');
}
