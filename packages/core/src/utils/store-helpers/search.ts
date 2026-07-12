import type { SearchResult, SearchSource } from '../../types';

export function relevanceScore(result: SearchResult, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const title = (result.title || '').toLowerCase();
  const artist = (result.artist || '').toLowerCase();

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title)) {
    return 60;
  }
  if (title.includes(q)) return 40;
  if (artist.startsWith(q)) return 30;
  if (artist.includes(q)) return 20;
  return 0;
}

export function getVisibleResults(
  results: Record<SearchSource, SearchResult[]>,
  activeSource: SearchSource | 'all',
  query: string,
): SearchResult[] {
  let visible: SearchResult[];
  if (activeSource === 'all') {
    visible = [
      ...results.local,
      ...results.playlist,
      ...results.youtube,
      ...results.spotify,
      ...results.soundcloud,
    ];
  } else {
    visible = [...(results[activeSource] || [])];
  }

  if (query.trim()) {
    visible.sort((a, b) => {
      const aLocal = a.source === 'local' || a.source === 'playlist' ? 1 : 0;
      const bLocal = b.source === 'local' || b.source === 'playlist' ? 1 : 0;
      if (aLocal !== bLocal) return bLocal - aLocal;
      return relevanceScore(b, query) - relevanceScore(a, query);
    });
  }

  return visible;
}

export function getSourceCounts(
  results: Record<SearchSource, SearchResult[]>,
): Record<string, number> {
  return {
    all: Object.values(results).reduce((sum, arr) => sum + arr.length, 0),
    youtube: results.youtube.length,
    spotify: results.spotify.length,
    soundcloud: results.soundcloud.length,
    local: results.local.length,
    playlist: results.playlist.length,
  };
}
