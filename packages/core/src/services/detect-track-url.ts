export type DirectTrackSource = 'youtube' | 'spotify' | 'soundcloud';

export interface DirectTrackUrl {
  id: string;
  source: DirectTrackSource;
  url: string;
}

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;

interface ParsedUrl {
  hostname: string;
  pathname: string;
  protocol: string;
  searchParams: { get(name: string): string | null };
  toString(): string;
}

type UrlConstructor = new (value: string) => ParsedUrl;

function parseHttpUrl(value: string): ParsedUrl | null {
  try {
    const Url = (globalThis as unknown as { URL: UrlConstructor }).URL;
    const url = new Url(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^(?:www\.|m\.)/, '');
}

function parseYouTubeTrackUrl(url: ParsedUrl): DirectTrackUrl | null {
  const host = normalizeHost(url.hostname);
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (
    host === 'youtube.com'
    || host === 'music.youtube.com'
    || host === 'youtube-nocookie.com'
  ) {
    const segments = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/watch') {
      id = url.searchParams.get('v');
    } else if (['shorts', 'live', 'embed'].includes(segments[0] ?? '')) {
      id = segments[1] ?? null;
    }
  }

  if (!id || !YOUTUBE_VIDEO_ID.test(id)) return null;
  return {
    id,
    source: 'youtube',
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

function parseSpotifyTrackUrl(value: string, url: ParsedUrl | null): DirectTrackUrl | null {
  const uriMatch = /^spotify:track:([A-Za-z0-9]{22})$/i.exec(value.trim());
  const host = url ? normalizeHost(url.hostname) : '';
  const segments = url?.pathname.split('/').filter(Boolean) ?? [];
  const id = uriMatch?.[1]
    ?? (host === 'open.spotify.com' && segments[0] === 'track' ? segments[1] : null);

  if (!id || !SPOTIFY_TRACK_ID.test(id)) return null;
  return {
    id,
    source: 'spotify',
    url: `https://open.spotify.com/track/${id}`,
  };
}

function parseSoundCloudTrackUrl(url: ParsedUrl): DirectTrackUrl | null {
  const host = normalizeHost(url.hostname);
  if (host === 'on.soundcloud.com') {
    return {
      id: url.toString(),
      source: 'soundcloud',
      url: url.toString(),
    };
  }
  if (host !== 'soundcloud.com') return null;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2 || segments[1] === 'sets') return null;
  const canonicalUrl = `https://soundcloud.com/${segments[0]}/${segments[1]}`;
  return {
    id: canonicalUrl,
    source: 'soundcloud',
    url: canonicalUrl,
  };
}

export function parseDirectTrackUrl(value: string): DirectTrackUrl | null {
  const url = parseHttpUrl(value);
  const spotify = parseSpotifyTrackUrl(value, url);
  if (spotify) return spotify;
  if (!url) return null;

  return parseYouTubeTrackUrl(url) ?? parseSoundCloudTrackUrl(url);
}
