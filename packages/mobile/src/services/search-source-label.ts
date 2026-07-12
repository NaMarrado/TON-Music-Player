import type { TFunction } from 'i18next';
import type { SearchSource } from '@ton/core';

export function getSearchSourceLabel(source: SearchSource, t: TFunction): string {
  switch (source) {
    case 'youtube':
      return 'YouTube';
    case 'spotify':
      return 'Spotify';
    case 'local':
      return t('library');
    case 'playlist':
      return t('playlists');
    case 'soundcloud':
      return 'SoundCloud';
    default:
      return source;
  }
}
