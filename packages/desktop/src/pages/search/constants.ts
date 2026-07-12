import type { SearchSource } from '@ton/core';

export const SOURCE_TABS: Array<{ key: SearchSource | 'all'; labelKey: string }> = [
  { key: 'all', labelKey: 'all' },
  { key: 'youtube', labelKey: 'youtube' },
  { key: 'spotify', labelKey: 'spotify' },
  { key: 'soundcloud', labelKey: 'soundcloud' },
  { key: 'local', labelKey: 'library' },
  { key: 'playlist', labelKey: 'playlists' },
];
