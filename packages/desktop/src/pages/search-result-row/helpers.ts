import { CUSTOM_PROTOCOL } from '@ton/core';
import type { SearchResult } from '@ton/core';

export function isRemoteResult(result: SearchResult): boolean {
  return result.source !== 'local' && result.source !== 'playlist';
}

export function isLocalFileResult(result: SearchResult): boolean {
  return result.source === 'local' || result.source === 'playlist';
}

export function getSearchResultCoverUrl(result: SearchResult): string | null {
  if (!result.thumbnail_url) {
    return null;
  }

  return isLocalFileResult(result)
    ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(result.thumbnail_url)}`
    : result.thumbnail_url;
}

export function getSearchResultSourceLabel(result: SearchResult): string {
  switch (result.source) {
    case 'youtube':
      return 'YT';
    case 'spotify':
      return 'SP';
    case 'soundcloud':
      return 'SC';
    case 'playlist':
      return result.playlist_name || 'Playlist';
    default:
      return 'LIB';
  }
}
