import type { SearchResult } from '../types';
import { createSearchPageRequest } from '../utils/search';

export interface SpotifySearchTrackLike {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
  duration_ms: number;
  external_urls: { spotify: string };
}

export interface SpotifySearchResponseLike {
  tracks: {
    items: SpotifySearchTrackLike[];
    total: number;
  };
}

export type SpotifySearchPageFetcher = (
  query: string,
  limit: number,
  offset: number,
) => Promise<SpotifySearchResponseLike>;

export async function executeSpotifySearchPage(
  fetchPage: SpotifySearchPageFetcher,
  query: string,
  requestedLimit?: number,
  requestedOffset = 0,
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const { limit, offset } = createSearchPageRequest(
    'spotify',
    requestedLimit,
    requestedOffset,
  );
  const response = await fetchPage(query, limit, offset);

  return {
    results: response.tracks.items.map((track) => ({
      id: track.id,
      source: 'spotify' as const,
      title: track.name,
      artist: track.artists.map((artist) => artist.name).join(', '),
      album: track.album.name,
      duration_ms: track.duration_ms,
      thumbnail_url: track.album.images[0]?.url || null,
      url: track.external_urls.spotify,
      is_downloaded: false,
    })),
    hasMore: offset + response.tracks.items.length < response.tracks.total,
  };
}
