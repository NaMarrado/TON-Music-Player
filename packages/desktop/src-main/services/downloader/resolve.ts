import { findBestMatch, type DownloadItem, type MatchCandidate } from '@ton/core';
import { searchYouTube } from '../youtube-search';
import { persistResolvedDownload } from './status';
import type { DownloadCallbacks } from './types';
import { updateDownloadStatus } from './status';

export interface ResolvedDesktopDownload {
  coverUrl: string | null;
  url: string;
  youtubeId: string | null;
}

export async function resolveDownloadUrl(
  item: DownloadItem,
  callbacks: DownloadCallbacks,
): Promise<ResolvedDesktopDownload> {
  if (item.source !== 'spotify') {
    if (!item.url) {
      throw new Error('No download URL');
    }
    return {
      coverUrl: item.cover_url,
      url: item.url,
      youtubeId: item.source === 'youtube' ? item.source_id : null,
    };
  }

  if (item.url && item.resolved_source_id) {
    return {
      coverUrl: item.resolved_cover_url ?? null,
      url: item.url,
      youtubeId: item.resolved_source_id,
    };
  }

  updateDownloadStatus(item.id, 'resolving');
  callbacks.onProgress({
    id: item.id,
    status: 'resolving',
    progress: Number.NaN,
    speed: '',
    eta: '',
    size: '',
  });

  const searchQuery = `${item.artist || ''} - ${item.title || ''}`.trim();
  const youtubeResults = await searchYouTube(searchQuery, 10);
  const candidates: MatchCandidate[] = youtubeResults.map((result) => ({
    id: result.id,
    title: result.title,
    artist: result.artist,
    duration_ms: result.duration_ms,
    thumbnail_url: result.thumbnail_url,
    url: result.url,
  }));

  const match = findBestMatch(
    {
      title: item.title || '',
      artist: item.artist || '',
      duration_ms: item.duration_ms ?? 0,
    },
    candidates,
  );

  if (!match) {
    throw new Error(`No YouTube match found for "${searchQuery}"`);
  }

  const resolved = {
    coverUrl: match.thumbnail_url ?? null,
    url: match.url,
    youtubeId: match.id,
  };
  persistResolvedDownload(item.id, resolved);
  return resolved;
}
