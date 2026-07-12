import { detectPlaylistSource, type LoadedPlaylistImport } from '@ton/core';
import { getSpotifyPlaylistTracks } from '../../services/spotify-client';
import { getYouTubePlaylistTracks } from '../../services/youtube-search';

export async function loadPlaylistTracks(url: string): Promise<LoadedPlaylistImport> {
  const detected = detectPlaylistSource(url);
  if (!detected || detected.source === 'soundcloud') {
    throw new Error('invalid-playlist-url');
  }

  if (detected.source === 'youtube') {
    const result = await getYouTubePlaylistTracks(detected.id);
    return {
      name: result.name,
      source: 'youtube',
      sourceId: detected.id,
      sourceUrl: url,
      tracks: result.tracks.map((track, position) => ({
        album: null,
        artist: track.artist,
        coverUrl: track.cover_url,
        durationMs: track.duration_ms,
        position,
        sourceTrackId: track.youtube_id,
        sourceUrl: `https://www.youtube.com/watch?v=${track.youtube_id}`,
        title: track.title,
      })),
    };
  }

  const result = await getSpotifyPlaylistTracks(detected.id);
  return {
    name: result.name,
    source: 'spotify',
    sourceId: detected.id,
    sourceUrl: url,
    tracks: result.tracks.map((track, position) => ({
      album: track.album,
      artist: track.artist,
      coverUrl: null,
      durationMs: track.duration_ms,
      position,
      sourceTrackId: track.spotify_id,
      sourceUrl: `https://open.spotify.com/track/${track.spotify_id}`,
      title: track.title,
    })),
  };
}
