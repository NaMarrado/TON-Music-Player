import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import type { SearchResult, SpotifyPlaylistTrack } from '@ton/core';
import { SEARCH_RESULTS_LIMIT } from '@ton/core';
import { getSetting } from './db-queries';

let client: SpotifyApi | null = null;

async function getClient(): Promise<SpotifyApi> {
  if (!client) {
    const clientId = await getSetting('spotify_client_id');
    const clientSecret = await getSetting('spotify_client_secret');
    if (!clientId || !clientSecret) {
      throw new Error('Spotify credentials not configured');
    }
    client = SpotifyApi.withClientCredentials(clientId, clientSecret);
  }
  return client;
}

export function resetSpotifyClient(): void {
  client = null;
}

export async function searchSpotify(
  query: string,
  limit = SEARCH_RESULTS_LIMIT,
  offset = 0,
): Promise<SearchResult[]> {
  const api = await getClient();
  const results = await api.search(query, ['track'], undefined, limit as 0 & number, offset);

  return results.tracks.items.map((track) => ({
    id: track.id,
    source: 'spotify' as const,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    album: track.album.name,
    duration_ms: track.duration_ms,
    thumbnail_url: track.album.images[0]?.url || null,
    url: track.external_urls.spotify,
    is_downloaded: false,
  }));
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

export async function getSpotifyPlaylistTracks(playlistId: string): Promise<{
  name: string;
  tracks: SpotifyPlaylistTrack[];
  total: number;
}> {
  const api = await getClient();
  const playlist = await api.playlists.getPlaylist(playlistId);
  const allTracks: SpotifyPlaylistTrack[] = [];

  for (const item of playlist.tracks.items) {
    if (item.track && 'album' in item.track) {
      allTracks.push(mapTrack(item.track as Parameters<typeof mapTrack>[0]));
    }
  }

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
