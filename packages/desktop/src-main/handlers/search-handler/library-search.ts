import type { SearchResult } from '@ton/core';
import { getDb } from '../../services/database';

export type SearchPageResult = {
  results: SearchResult[];
  hasMore: boolean;
};

export async function searchLocalTracks(
  query: string,
  limit?: number,
  offset = 0,
): Promise<SearchPageResult> {
  const db = getDb();
  const ftsQuery = buildFtsQuery(query);
  const pageSize = limit || 100;

  try {
    const rows = db
      .prepare(
        `SELECT t.* FROM tracks t
         JOIN tracks_fts fts ON fts.rowid = t.id
         WHERE tracks_fts MATCH ? AND t.in_library = 1
         ORDER BY rank
         LIMIT ? OFFSET ?`,
      )
      .all(ftsQuery, pageSize + 1, offset) as Array<{
      id: number;
      title: string | null;
      artist: string | null;
      album: string | null;
      duration_ms: number | null;
      cover_art_path: string | null;
      file_path: string;
    }>;

    return {
      results: rows.slice(0, pageSize).map((row) => ({
      id: String(row.id),
      source: 'local' as const,
      title: row.title || 'Unknown',
      artist: row.artist || 'Unknown',
      album: row.album,
      duration_ms: row.duration_ms,
      thumbnail_url: row.cover_art_path,
      url: row.file_path,
      is_downloaded: true,
      })),
      hasMore: rows.length > pageSize,
    };
  } catch {
    return { results: [], hasMore: false };
  }
}

export async function searchPlaylistTracks(
  query: string,
  limit?: number,
  offset = 0,
): Promise<SearchPageResult> {
  const db = getDb();
  const ftsQuery = buildFtsQuery(query);
  const pageSize = limit || 100;

  try {
    const rows = db
      .prepare(
        `SELECT t.*, p.name AS playlist_name FROM tracks t
         JOIN tracks_fts fts ON fts.rowid = t.id
         JOIN playlist_tracks pt ON pt.track_id = t.id
         JOIN playlists p ON p.id = pt.playlist_id
         WHERE tracks_fts MATCH ?
         ORDER BY rank
         LIMIT ? OFFSET ?`,
      )
      .all(ftsQuery, pageSize + 1, offset) as Array<{
      id: number;
      title: string | null;
      artist: string | null;
      album: string | null;
      duration_ms: number | null;
      cover_art_path: string | null;
      file_path: string;
      playlist_name: string;
    }>;

    return {
      results: rows.slice(0, pageSize).map((row) => ({
      id: String(row.id),
      source: 'playlist' as const,
      title: row.title || 'Unknown',
      artist: row.artist || 'Unknown',
      album: row.album,
      duration_ms: row.duration_ms,
      thumbnail_url: row.cover_art_path,
      url: row.file_path,
      is_downloaded: true,
      playlist_name: row.playlist_name,
      })),
      hasMore: rows.length > pageSize,
    };
  } catch {
    return { results: [], hasMore: false };
  }
}

export function enrichWithDownloadStatus(results: SearchResult[]): SearchResult[] {
  const db = getDb();
  const sourceIds = {
    youtube: [] as string[],
    spotify: [] as string[],
    soundcloud: [] as string[],
  };

  for (const result of results) {
    if (result.source === 'youtube' || result.source === 'spotify' || result.source === 'soundcloud') {
      sourceIds[result.source].push(result.id);
    }
  }

  const downloadedIds = {
    youtube: new Set<string>(),
    spotify: new Set<string>(),
    soundcloud: new Set<string>(),
  };

  for (const [source, ids] of Object.entries(sourceIds) as Array<
    [keyof typeof sourceIds, string[]]
  >) {
    if (ids.length === 0) {
      continue;
    }

    const column =
      source === 'youtube'
        ? 'youtube_id'
        : source === 'spotify'
          ? 'spotify_id'
          : 'soundcloud_id';
    const placeholders = ids.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT ${column} AS source_id FROM tracks WHERE ${column} IN (${placeholders})`)
      .all(...ids) as Array<{ source_id: string | null }>;

    for (const row of rows) {
      if (row.source_id) {
        downloadedIds[source].add(row.source_id);
      }
    }
  }

  for (const result of results) {
    if (
      result.source === 'youtube'
      || result.source === 'spotify'
      || result.source === 'soundcloud'
    ) {
      result.is_downloaded = downloadedIds[result.source].has(result.id);
    }
  }

  return results;
}

function buildFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((word) => `"${word.replace(/"/g, '')}"*`)
    .join(' ');
}
