import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { SearchResult } from '@ton/core';
import { ErrorBanners } from '../search/error-banners';
import { SearchHeader } from '../search/search-header';
import { SearchResults } from '../search/search-results';
import { useSearchPageState } from '../search/use-search-page-state';
import { addLibraryTrackToStudio, addOnlineResultToStudio, libraryTrackById, useStudioStore } from './studio-store';

/**
 * The same Search the Search page uses (same state, header, error banners and result rows). The only differences are where
 * a result goes - onto a Studio lane, as a temporary file, instead of into the Library - and the wording of the row button.
 */
export function StudioSearch() {
  const { t: tSearch } = useTranslation('pages/search');
  const { t: tStudio } = useTranslation('pages/studio');
  const navigate = useNavigate();
  const downloads = useStudioStore((state) => state.downloads);
  const search = useSearchPageState(tSearch);

  // The row button reads "Download" on the Search page; here it adds the song to the Studio.
  const t = useCallback((key: string) => (key === 'download' ? tStudio('addToStudio') : tSearch(key)), [tSearch, tStudio]);

  const addResult = useCallback((result: SearchResult) => {
    if (result.source === 'local' || result.source === 'playlist') {
      const track = libraryTrackById(Number(result.id));
      if (track) void addLibraryTrackToStudio(track);
      return;
    }
    void addOnlineResultToStudio(result);
  }, []);

  const active = Object.entries(downloads).filter(([, progress]) => progress >= 0);
  const failed = Object.values(downloads).some((progress) => progress < 0);

  return (
    <div className="studio-search">
      <SearchHeader
        compact
        activeSource={search.activeSource}
        counts={search.counts}
        isSearching={search.isSearching}
        query={search.query}
        t={t}
        sortMode={search.sortMode}
        onSetActiveSource={search.setActiveSource}
        onSetSearchQuery={search.setSearchQuery}
        onSetSortMode={search.setSearchSortMode}
      />
      <ErrorBanners
        dismissed={search.dismissed}
        query={search.query}
        sourceErrors={search.sourceErrors}
        t={t}
        onDismissBanner={search.dismissBanner}
        onOpenSettings={() => navigate('/settings')}
      />
      <div className="studio-search-status" role="status">
        {active.length > 0
          ? tStudio('downloading', { count: active.length, percent: Math.round(Math.min(...active.map(([, progress]) => progress)) * 100) })
          : failed ? tStudio('downloadFailed') : ''}
      </div>
      <SearchResults
        compact
        isSearching={search.isSearching}
        query={search.query}
        t={t}
        visibleResults={search.visibleResults}
        onDownload={addResult}
        canLoadMore={search.canLoadMore}
        onLoadMore={search.loadMore}
        onPlayLocal={addResult}
      />
    </div>
  );
}
