import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ErrorBanners } from './error-banners';
import { SearchHeader } from './search-header';
import { SearchResults } from './search-results';
import { useSearchPageState } from './use-search-page-state';

export function SearchPage() {
  const { t } = useTranslation('pages/search');
  const navigate = useNavigate();
  const {
    activeSource,
    canLoadMore,
    counts,
    dismissBanner,
    dismissed,
    handleDownload,
    handlePlayLocal,
    isSearching,
    loadMore,
    query,
    setActiveSource,
    setSearchQuery,
    setSearchSortMode,
    sortMode,
    sourceErrors,
    visibleResults,
  } = useSearchPageState(t);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <SearchHeader
        activeSource={activeSource}
        counts={counts}
        isSearching={isSearching}
        query={query}
        t={t}
        sortMode={sortMode}
        onSetActiveSource={setActiveSource}
        onSetSearchQuery={setSearchQuery}
        onSetSortMode={setSearchSortMode}
      />

      <ErrorBanners
        dismissed={dismissed}
        query={query}
        sourceErrors={sourceErrors}
        t={t}
        onDismissBanner={dismissBanner}
        onOpenSettings={() => navigate('/settings')}
      />

      <SearchResults
        isSearching={isSearching}
        query={query}
        t={t}
        visibleResults={visibleResults}
        onDownload={handleDownload}
        canLoadMore={canLoadMore}
        onLoadMore={loadMore}
        onPlayLocal={handlePlayLocal}
      />
    </div>
  );
}
