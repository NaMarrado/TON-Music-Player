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
    if (sortBy === 'playlist') {
      const va = (a as T & { playlist_names?: string }).playlist_names || '';
      const vb = (b as T & { playlist_names?: string }).playlist_names || '';
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      return va.localeCompare(vb) * dir;
    }

    const va = a[sortBy as keyof Track];
    const vb = b[sortBy as keyof Track];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return va.localeCompare(vb as string) * dir;
    return ((va as number) - (vb as number)) * dir;
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
