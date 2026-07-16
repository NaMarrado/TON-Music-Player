/**
 * Spotify Client - uses @spotify/web-api-ts-sdk with Client Credentials flow.
 * Reads credentials from settings DB.
 */

import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import type { SearchResult, SpotifyPlaylistTrack } from '@ton/core';
import { SEARCH_PAGE_LIMITS, executeSpotifySearchPage } from '@ton/core';
import { getDb } from './database';

let client: SpotifyApi | null = null;

function getCredentials(): { clientId: string; clientSecret: string } {
  const db = getDb();
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const clientId = (stmt.get('spotify_client_id') as { value: string } | undefined)?.value || '';
  const clientSecret = (stmt.get('spotify_client_secret') as { value: string } | undefined)?.value || '';
  return { clientId, clientSecret };
}

function getClient(): SpotifyApi {
  if (!client) {
    const { clientId, clientSecret } = getCredentials();
    if (!clientId || !clientSecret) {
      throw new Error('Spotify credentials not configured');
    }
    client = SpotifyApi.withClientCredentials(clientId, clientSecret);
  }
  return client;
}

/** Reset client instance (call after credentials change). */
export function resetSpotifyClient(): void {
  client = null;
}

export async function searchSpotify(
  query: string,
  limit = SEARCH_PAGE_LIMITS.spotify,
): Promise<SearchResult[]> {
  const response = await searchSpotifyPage(query, limit, 0);
  return response.results;
}

export async function getSpotifyTrackById(
  trackId: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const track = await raceSearchAbort(getClient().tracks.get(trackId), signal);
  return {
    id: track.id,
    source: 'spotify',
    title: track.name,
    artist: track.artists.map((artist) => artist.name).join(', '),
    album: track.album.name,
    duration_ms: track.duration_ms,
    thumbnail_url: track.album.images[0]?.url ?? null,
    url: track.external_urls.spotify,
    is_downloaded: false,
  };
}

export async function searchSpotifyPage(
  query: string,
  limit = SEARCH_PAGE_LIMITS.spotify,
  offset = 0,
  signal?: AbortSignal,
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const api = getClient();
  return executeSpotifySearchPage(
    (effectiveQuery, pageLimit, pageOffset) => raceSearchAbort(api.search(
      effectiveQuery,
      ['track'],
      undefined,
      pageLimit as 0 & number,
      pageOffset,
    ), signal),
    query,
    limit,
    offset,
  );
}

function raceSearchAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error('Cancelled'));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Parse a Spotify playlist URL to extract the playlist ID. */
export function parsePlaylistUrl(url: string): string | null {
  const patterns = [
    /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    /spotify:playlist:([a-zA-Z0-9]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function mapTrack(track: {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { name: string; images: Array<{ url: string }> };
  duration_ms: number;
}): SpotifyPlaylistTrack {
  return {
    spotify_id: track.id,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    album: track.album.name,
    duration_ms: track.duration_ms,
    cover_url: track.album.images[0]?.url || null,
  };
}

/** Fetch all tracks from a Spotify playlist (handles pagination). */
export async function getPlaylistTracks(playlistId: string): Promise<{
  name: string;
  tracks: SpotifyPlaylistTrack[];
  total: number;
}> {
  const api = getClient();
  const playlist = await api.playlists.getPlaylist(playlistId);
  const allTracks: SpotifyPlaylistTrack[] = [];

  // First page
  for (const item of playlist.tracks.items) {
    if (item.track && 'album' in item.track) {
      allTracks.push(mapTrack(item.track as Parameters<typeof mapTrack>[0]));
    }
  }

  // Remaining pages
  let offset = playlist.tracks.items.length;
  const total = playlist.tracks.total;

  while (offset < total) {
    const page = await api.playlists.getPlaylistItems(
      playlistId,
      undefined,
      undefined,
      50 as 0 & number,
      offset,
    );
    for (const item of page.items) {
      if (item.track && 'album' in item.track) {
        allTracks.push(mapTrack(item.track as Parameters<typeof mapTrack>[0]));
      }
    }
    offset += page.items.length;
    if (page.items.length === 0) break;
  }

  return { name: playlist.name, tracks: allTracks, total: allTracks.length };
}
