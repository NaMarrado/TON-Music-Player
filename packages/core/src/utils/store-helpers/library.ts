import type { Track } from '../../types';
import type { SortField, SortOrder } from './types';

export function getFilteredTracks<
  T extends Track & { playlist_names?: string | null },
>(
  tracks: T[],
  filterQuery: string,
  sortBy: SortField,
  sortOrder: SortOrder,
): T[] {
  let result = [...tracks];

  if (normalizeTrackFilterValue(filterQuery)) {
    result = result.filter((track) => matchesTrackFilter(track, filterQuery));
  }

  const dir = sortOrder === 'asc' ? 1 : -1;
  result.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'playlist') {
      const va = (a as T & { playlist_names?: string }).playlist_names || '';
      const vb = (b as T & { playlist_names?: string }).playlist_names || '';
      if (!va && !vb) comparison = 0;
      else if (!va) comparison = 1;
      else if (!vb) comparison = -1;
      else comparison = va.localeCompare(vb) * dir;
    } else {
      const va = a[sortBy as keyof Track];
      const vb = b[sortBy as keyof Track];
      if (va == null && vb == null) comparison = 0;
      else if (va == null) comparison = 1;
      else if (vb == null) comparison = -1;
      else if (typeof va === 'string') comparison = va.localeCompare(vb as string) * dir;
      else comparison = ((va as number) - (vb as number)) * dir;
    }
    if (comparison !== 0) return comparison;
    const stableA = a.content_hash_sha256 ?? a.youtube_id ?? a.spotify_id ?? a.soundcloud_id ?? '';
    const stableB = b.content_hash_sha256 ?? b.youtube_id ?? b.spotify_id ?? b.soundcloud_id ?? '';
    return stableA.localeCompare(stableB) || b.id - a.id;
  });

  return result;
}

function normalizeTrackFilterValue(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

function compactTrackFilterValue(value: string): string {
  return value.replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

export function matchesTrackFilter(
  track: Pick<Track, 'title' | 'artist' | 'album_artist' | 'album'>,
  filterQuery: string,
): boolean {
  const query = normalizeTrackFilterValue(filterQuery);
  if (!query) return true;
  const compactQuery = compactTrackFilterValue(query);

  return [track.title, track.artist, track.album_artist, track.album].some((value) => {
    const normalizedValue = normalizeTrackFilterValue(value);
    if (normalizedValue.includes(query)) return true;
    return compactQuery.length > 0
      && compactTrackFilterValue(normalizedValue).includes(compactQuery);
  });
}

export function getArtists(
  tracks: Track[],
): { artist: string; cover_art_path: string | null; trackCount: number }[] {
  const map = new Map<
    string,
    { artist: string; cover_art_path: string | null; count: number }
  >();

  for (const track of tracks) {
    const key = track.artist || '__unknown__';
    if (!map.has(key)) {
      map.set(key, {
        artist: track.artist || 'Unknown Artist',
        cover_art_path: track.cover_art_path,
        count: 0,
      });
    }
    map.get(key)!.count++;
  }

  return Array.from(map.values()).map((value) => ({
    artist: value.artist,
    cover_art_path: value.cover_art_path,
    trackCount: value.count,
  }));
}

export function getMostPlayed(tracks: Track[], limit = 8): Track[] {
  return [...tracks]
    .filter((track) => track.play_count > 0)
    .sort((a, b) => b.play_count - a.play_count)
    .slice(0, limit);
}

export function getRecentlyPlayed(tracks: Track[], limit = 8): Track[] {
  return [...tracks]
    .filter((track) => track.last_played_at != null)
    .sort((a, b) => (b.last_played_at ?? 0) - (a.last_played_at ?? 0))
    .slice(0, limit);
}
