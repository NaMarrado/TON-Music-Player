import { getPlaylistTracks } from '../../services/spotify-client';
import { getSoundCloudPlaylistTracks } from '../../services/soundcloud-search';
import { getYouTubePlaylistTracks } from '../../services/youtube-search';

export async function loadSpotifyPlaylist(playlistId: string) {
  try {
    return await getPlaylistTracks(playlistId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('credentials')) {
      throw new Error('Spotify credentials are missing or invalid. Set them in Settings.');
    }
    if (message.includes('401') || message.includes('Unauthorized')) {
      throw new Error('Spotify credentials are invalid or expired. Check them in Settings.');
    }
    if (message.includes('404')) {
      if (playlistId.startsWith('37i9dQZ')) {
        throw new Error('Personalized Spotify playlists (Discover Weekly, Daily Mix, Release Radar etc.) cannot be imported. Copy the songs to a new public playlist instead.');
      }
      throw new Error('Playlist not found. Private Spotify playlists are not accessible — only public playlists can be imported.');
    }
    if (message.includes('429')) {
      throw new Error('Spotify rate limit reached. Wait a moment and try again.');
    }
    throw new Error(`Spotify error: ${message}`);
  }
}

export async function loadYouTubePlaylist(playlistId: string) {
  try {
    return await getYouTubePlaylistTracks(playlistId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('does not exist') || message.includes('not found') || message.includes('private')) {
      if (playlistId === 'WL' || playlistId === 'LL') {
        throw new Error('Watch Later and Liked Videos are private YouTube playlists tied to your account and cannot be imported.');
      }
      throw new Error('This playlist is private or doesn\'t exist. Only public and unlisted YouTube playlists can be imported.');
    }
    if (message.includes('Sign in') || message.includes('login')) {
      throw new Error('This YouTube playlist requires login and cannot be imported.');
    }
    throw new Error(`YouTube error: ${message}`);
  }
}

export async function loadSoundCloudPlaylist(playlistId: string) {
  try {
    return await getSoundCloudPlaylistTracks(playlistId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('401')
      || message.includes('403')
      || message.includes('Unauthorized')
      || message.includes('Forbidden')
    ) {
      throw new Error('This SoundCloud playlist is private. Only public playlists can be imported.');
    }
    if (message.includes('404') || message.includes('Not Found')) {
      throw new Error('SoundCloud playlist not found. Check the URL and try again.');
    }
    if (message.includes('429') || message.includes('Too Many Requests')) {
      throw new Error('SoundCloud rate limit reached. Wait a moment and try again.');
    }
    throw new Error(`SoundCloud error: ${message}`);
  }
}
