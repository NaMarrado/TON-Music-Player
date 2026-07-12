import type { SearchResult, YouTubePlaylistTrack } from '@ton/core';
import { parseYouTubePlaylistItem, SEARCH_RESULTS_LIMIT } from '@ton/core';
import { getSearchClient } from './client';

export async function searchYouTube(
  query: string,
  limit = SEARCH_RESULTS_LIMIT,
  offset = 0,
): Promise<SearchResult[]> {
  const yt = await getSearchClient();
  let search = await yt.search(query, { type: 'video' });

  const results: SearchResult[] = [];
  const targetCount = offset + limit;
  extractVideos(search.results || [], results, targetCount);

  while (results.length < targetCount && search.has_continuation) {
    search = await search.getContinuation();
    extractVideos(search.results || [], results, targetCount);
  }

  return results.slice(offset, targetCount);
}

export async function getYouTubePlaylistTracks(listId: string): Promise<{
  name: string;
  tracks: YouTubePlaylistTrack[];
}> {
  const yt = await getSearchClient();
  let playlist = await yt.getPlaylist(listId);
  const name = playlist.info.title || 'YouTube Playlist';
  const tracks: YouTubePlaylistTrack[] = [];

  const extractPlaylistVideos = (items: unknown[]) => {
    for (const item of items) {
      const track = parseYouTubePlaylistItem(item);
      if (track) tracks.push(track);
    }
  };

  extractPlaylistVideos(playlist.items || []);
  while (playlist.has_continuation) {
    playlist = await playlist.getContinuation();
    extractPlaylistVideos(playlist.items || []);
  }

  return { name, tracks };
}

function extractVideos(
  items: { type?: string }[],
  results: SearchResult[],
  limit: number,
): void {
  for (const item of items) {
    if (results.length >= limit) break;
    if (item.type !== 'Video') continue;

    const video = item as unknown as {
      id: string;
      title?: { text?: string };
      author?: { name?: string };
      duration?: { seconds?: number };
      thumbnails?: Array<{ url?: string }>;
    };

    results.push({
      id: video.id,
      source: 'youtube',
      title: video.title?.text || '',
      artist: video.author?.name || '',
      album: null,
      duration_ms: (video.duration?.seconds || 0) * 1000,
      thumbnail_url: video.thumbnails?.[0]?.url || null,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      is_downloaded: false,
    });
  }
}
