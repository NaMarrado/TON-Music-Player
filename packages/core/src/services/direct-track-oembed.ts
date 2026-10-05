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

/** Provider seconds and milliseconds are different units; missing/invalid values stay unknown. */
export function normalizeTrackDurationMs(
  value: unknown,
  unit: 'seconds' | 'milliseconds',
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const milliseconds = Math.round(unit === 'seconds' ? value * 1000 : value);
  return milliseconds > 0 && Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

/**
 * oEmbed is a title/artwork fallback, not a duration source. Try exact-track
 * provider metadata first, including when the primary provider omits duration.
 */
export async function resolveDirectTrackWithFallback(
  track: DirectTrackUrl,
  resolvePrimary: () => Promise<SearchResult>,
  resolveFallback: () => Promise<SearchResult | null>,
  resolveOEmbed: () => Promise<unknown>,
  signal?: { readonly aborted: boolean },
): Promise<SearchResult> {
  let primary: SearchResult | null = null;
  let primaryError: unknown;
  try {
    const result = await resolvePrimary();
    if (signal?.aborted) throw new Error('Search aborted');
    const duration = normalizeTrackDurationMs(result.duration_ms, 'milliseconds');
    primary = duration === result.duration_ms ? result : { ...result, duration_ms: duration };
    if (duration !== null) return primary;
  } catch (error) {
    if (signal?.aborted) throw error;
    primaryError = error;
  }

  try {
    const fallback = await resolveFallback();
    if (signal?.aborted) throw new Error('Search aborted');
    // An exact ID matters: a URL search may return recommendations instead.
    if (fallback?.source === track.source && fallback.id === track.id) {
      const duration = normalizeTrackDurationMs(fallback.duration_ms, 'milliseconds');
      if (primary) {
        return duration === null ? primary : { ...primary, duration_ms: duration };
      }
      return duration === fallback.duration_ms ? fallback : { ...fallback, duration_ms: duration };
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }

  if (signal?.aborted) throw new Error('Search aborted');
  if (primary) return primary;
  try {
    const payload = await resolveOEmbed();
    if (signal?.aborted) throw new Error('Search aborted');
    return mapDirectTrackOEmbedResult(track, payload);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw primaryError ?? error;
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
