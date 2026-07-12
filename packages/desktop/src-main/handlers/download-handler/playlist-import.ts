import { ipcMain } from 'electron';
import { detectPlaylistSource, type LoadedPlaylistImport } from '@ton/core';
import { importDesktopPlaylistToDownloads } from '../../services/playlist-import';
import { loadSoundCloudPlaylist, loadSpotifyPlaylist, loadYouTubePlaylist } from './playlist-source-loaders';

type PlaylistImportOptions = {
  url: string;
};

export function registerDownloadPlaylistImportHandler(): void {
  ipcMain.handle('download:import-playlist', async (_event, options: PlaylistImportOptions) => {
    const detected = detectPlaylistSource(options.url);
    if (!detected) {
      throw new Error('Unsupported playlist URL. Use Spotify, YouTube, or SoundCloud.');
    }

    if (detected.source === 'spotify') {
      const result = await loadSpotifyPlaylist(detected.id);
      if (result.tracks.length === 0) {
        throw new Error('This Spotify playlist is empty.');
      }

      const playlist: LoadedPlaylistImport = {
        name: result.name,
        source: 'spotify',
        sourceId: detected.id,
        sourceUrl: options.url,
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
      return importDesktopPlaylistToDownloads(playlist);
    }

    if (detected.source === 'youtube') {
      const result = await loadYouTubePlaylist(detected.id);
      if (result.tracks.length === 0) {
        throw new Error('This YouTube playlist is empty or all its videos are private/unavailable.');
      }

      const playlist: LoadedPlaylistImport = {
        name: result.name,
        source: 'youtube',
        sourceId: detected.id,
        sourceUrl: options.url,
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
      return importDesktopPlaylistToDownloads(playlist);
    }

    const result = await loadSoundCloudPlaylist(detected.id);
    if (result.tracks.length === 0) {
      throw new Error('This SoundCloud playlist is empty.');
    }

    const playlist: LoadedPlaylistImport = {
      name: result.name,
      source: 'soundcloud',
      sourceId: detected.id,
      sourceUrl: options.url,
      tracks: result.tracks.map((track, position) => ({
        album: null,
        artist: track.artist,
        coverUrl: track.cover_url,
        durationMs: track.duration_ms,
        position,
        sourceTrackId: track.url,
        sourceUrl: track.url,
        title: track.title,
      })),
    };
    return importDesktopPlaylistToDownloads(playlist);
  });
}
