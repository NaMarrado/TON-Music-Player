import type { SortField } from '@ton/core';

export const SORT_KEYS: { field: SortField; key: string }[] = [
  { field: 'title', key: 'sortTitle' },
  { field: 'artist', key: 'sortArtist' },
  { field: 'added_at', key: 'sortDateAdded' },
  { field: 'play_count', key: 'sortPlayCount' },
  { field: 'duration_ms', key: 'sortDuration' },
];
