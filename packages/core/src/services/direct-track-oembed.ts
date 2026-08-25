import type { SearchResult } from '../types';
import type { DirectTrackUrl } from './detect-track-url';

export interface DirectTrackOEmbedPayload {
  author_name?: unknown;
  thumbnail_url?: unknown;
  title?: unknown;
}

export function getDirectTrackOEmbedUrl(track: DirectTrackUrl): string {
  switch (track.source) {
    case 'youtube':
      return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(track.url)}`;
    case 'spotify':
      return `https://open.spotify.com/oembed?url=${encodeURIComponent(track.url)}`;
    case 'soundcloud':
      return `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(track.url)}`;
  }
}

export function mapDirectTrackOEmbedResult(
  track: DirectTrackUrl,
  value: unknown,
): SearchResult {
  const payload: DirectTrackOEmbedPayload = value && typeof value === 'object'
    ? value as DirectTrackOEmbedPayload
    : {};
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  if (!title) throw new Error(`${track.source} track metadata is unavailable`);

  const artist = typeof payload.author_name === 'string' ? payload.author_name.trim() : '';
  return {
    id: track.id,
    source: track.source,
    title: stripSoundCloudArtistSuffix(track.source, title, artist),
    artist,
    album: null,
    duration_ms: null,
    thumbnail_url: typeof payload.thumbnail_url === 'string' ? payload.thumbnail_url : null,
    url: track.url,
    is_downloaded: false,
  };
}

function stripSoundCloudArtistSuffix(
  source: DirectTrackUrl['source'],
  title: string,
  artist: string,
): string {
  if (source !== 'soundcloud' || !artist) return title;
  const suffix = ` by ${artist}`;
  return title.toLowerCase().endsWith(suffix.toLowerCase())
    ? title.slice(0, -suffix.length).trim()
    : title;
}
