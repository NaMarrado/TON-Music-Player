import type { SearchResult, SearchSource } from '@ton/core';
import { SEARCH_RESULTS_LIMIT } from '@ton/core';
import { searchYouTube } from './youtube-search';
import { searchSpotify } from './spotify-client';
import { getTrackIdsBySourceIdentity, searchTracksFts } from './db-queries';
import { getDb } from './database';
import { DEFAULT_SEARCH_SOURCES, createEmptySearchResults } from './search-plan';

export interface SearchResponse {
  results: Record<SearchSource, SearchResult[]>;
  sourceErrors: Record<string, string>;
}

export interface SearchExecutionOptions {
  sources?: SearchSource[];
  limit?: number;
  limitBySource?: Partial<Record<SearchSource, number>>;
  offsetBySource?: Partial<Record<SearchSource, number>>;
  signal?: AbortSignal;
}

export async function executeSearch(
  query: string,
  options: SearchExecutionOptions = {},
): Promise<SearchResponse> {
  const {
    sources = DEFAULT_SEARCH_SOURCES,
    limit = SEARCH_RESULTS_LIMIT,
    limitBySource,
    offsetBySource,
    signal,
  } = options;
  const results = createEmptySearchResults();
  const sourceErrors: Record<string, string> = {};

  const guardAbort = () => {
    if (signal?.aborted) {
      throw new Error('Search aborted');
    }
  };

  if (sources.length === 0) {
    return { results, sourceErrors };
  }

  const tasks = sources.map(async (source) => {
    const sourceLimit = limitBySource?.[source] ?? limit;
    const sourceOffset = offsetBySource?.[source] ?? 0;

    switch (source) {
      case 'youtube':
        return {
          source,
          results: await enrichRemoteResults(
            'youtube',
            await searchYouTube(query, sourceLimit, sourceOffset),
          ),
        };
      case 'spotify':
        return {
          source,
          results: await enrichRemoteResults(
            'spotify',
            await searchSpotify(query, sourceLimit, sourceOffset),
          ),
        };
      case 'local': {
        const tracks = await searchTracksFts(query, sourceLimit, sourceOffset);
        return {
          source,
          results: tracks.map((t) => ({
            id: String(t.id),
            source: 'local' as const,
            library_track_id: t.id,
            title: t.title || '',
            artist: t.artist || '',
            album: t.album,
            duration_ms: t.duration_ms,
            thumbnail_url: t.cover_art_path,
            url: t.file_path,
            is_downloaded: true,
          })),
        };
      }
      case 'playlist':
        return {
          source,
          results: await searchPlaylists(query, sourceLimit, sourceOffset),
        };
      default:
        return {
          source,
          results: [],
        };
    }
  });

  const settledTasks = await Promise.allSettled(tasks);
  guardAbort();

  for (const [index, settledTask] of settledTasks.entries()) {
    if (settledTask.status === 'fulfilled') {
      results[settledTask.value.source] = settledTask.value.results;
      continue;
    }

    if (signal?.aborted) {
      throw settledTask.reason;
    }

    const failedSource = sources[index];
    sourceErrors[failedSource] = String(settledTask.reason);
  }

  guardAbort();
  return { results, sourceErrors };
}

async function enrichRemoteResults(
  source: 'youtube' | 'spotify' | 'soundcloud',
  results: SearchResult[],
): Promise<SearchResult[]> {
  const ids = results.map((result) => result.id).filter(Boolean);
  const localTrackIds = await getTrackIdsBySourceIdentity(source, ids);

  return results.map((result) => {
    const libraryTrackId = localTrackIds[result.id];
    if (!libraryTrackId) {
      return result;
    }

    return {
      ...result,
      library_track_id: libraryTrackId,
      is_downloaded: true,
    };
  });
}

async function searchPlaylists(
  query: string,
  limit = SEARCH_RESULTS_LIMIT,
  offset = 0,
): Promise<SearchResult[]> {
  const db = getDb();
  const q = `%${query}%`;
  const rows = await db.getAllAsync<{
    track_id: number; title: string; artist: string; album: string | null;
    duration_ms: number | null; cover_art_path: string | null; file_path: string;
    playlist_name: string;
  }>(
    `SELECT t.id as track_id, t.title, t.artist, t.album, t.duration_ms,
            t.cover_art_path, t.file_path, p.name as playlist_name
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     JOIN playlists p ON p.id = pt.playlist_id
     WHERE t.title LIKE ? OR t.artist LIKE ? OR p.name LIKE ?
     LIMIT ? OFFSET ?`,
    [q, q, q, limit, offset],
  );

  return rows.map((r) => ({
    id: `pl-${r.track_id}`,
    source: 'playlist' as const,
    library_track_id: r.track_id,
    title: r.title || '',
    artist: r.artist || '',
    album: r.album,
    duration_ms: r.duration_ms,
    thumbnail_url: r.cover_art_path,
    url: r.file_path,
    is_downloaded: true,
    playlist_name: r.playlist_name,
  }));
}
