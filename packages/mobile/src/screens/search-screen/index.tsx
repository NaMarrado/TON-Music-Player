import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { getSearchPageLimit, type SearchSource } from '@ton/core';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '../../components/action-sheet';
import { PlaylistPicker } from '../../components/playlist-picker';
import { SearchInput } from '../../components/search-input';
import { SourceTabs } from '../../components/source-tabs';
import { useScreenTopPadding } from '../../hooks/use-screen-top-padding';
import { DEFAULT_SEARCH_SOURCES } from '../../services/search-plan';
import { getSearchSourceLabel } from '../../services/search-source-label';
import {
  loadMoreSearchResults,
  setActiveSource,
  setSearchQuery,
  setSearchSortMode,
  useSearchStore,
} from '../../stores/search-store';
import { SearchEmptyState } from './search-empty-state';
import { SearchLoadMoreFooter } from './search-load-more-footer';
import { SearchResultRow } from './search-result-row';
import { SearchSpotifyError } from './search-spotify-error';
import { useSearchScreenActions } from './use-search-screen-actions';

export function SearchScreen() {
  const { t } = useTranslation('search');
  const { t: tc } = useTranslation('common');
  const navigation = useNavigation();
  const query = useSearchStore((state) => state.query);
  const results = useSearchStore((state) => state.results);
  const isSearching = useSearchStore((state) => state.isSearching);
  const activeSource = useSearchStore((state) => state.activeSource);
  const sortMode = useSearchStore((state) => state.sortMode);
  const sourceErrors = useSearchStore((state) => state.sourceErrors);
  const hasMoreBySource = useSearchStore((state) => state.hasMoreBySource);
  const loadingMoreSources = useSearchStore((state) => state.loadingMoreSources);
  const topPadding = useScreenTopPadding(8);
  const [showSort, setShowSort] = useState(false);

  const {
    counts,
    dismissSpotifyError,
    displayResults,
    handleRowAction,
    handleResultPress,
    playlistPickerTrackId,
    resultActions,
    selectedResult,
    setPlaylistPickerTrackId,
    setSelectedResult,
    spotifyError,
  } = useSearchScreenActions({
    activeSource,
    query,
    results,
    sourceErrors,
    sortMode,
    t,
  });
  const loadMoreSource: SearchSource | null = activeSource === 'all'
    ? DEFAULT_SEARCH_SOURCES.find((source) => (
        displayResults.some((result) => result.source === source)
        && hasMoreBySource[source]
      )) ?? null
    : activeSource;
  const isLoadingMore = loadMoreSource
    ? loadingMoreSources.includes(loadMoreSource)
    : false;
  const canLoadMore = Boolean(
    loadMoreSource
    && query.trim().length > 0
    && !isSearching
    && displayResults.length > 0
    && hasMoreBySource[loadMoreSource],
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View className="flex-1 bg-bg-deep">
        <View style={{ paddingTop: topPadding }}>
          <View className="flex-row items-center">
            <SearchInput
              value={query}
              onChangeText={setSearchQuery}
              placeholder={t('placeholder')}
              style={{
                flex: 1,
                marginLeft: 16,
                marginRight: activeSource === 'youtube' && query.trim().length > 0
                  ? 8
                  : 16,
              }}
            />
            {activeSource === 'youtube' && query.trim().length > 0 && (
              <Pressable
                accessibilityLabel={t('sortResults')}
                onPress={() => setShowSort(true)}
                className="bg-bg-elevated border border-border items-center justify-center mr-4"
                style={{ borderRadius: 20, height: 40, width: 40 }}
              >
                <Feather
                  name="bar-chart-2"
                  size={17}
                  color={sortMode === 'most_viewed' ? '#e8e8e8' : '#777'}
                />
              </Pressable>
            )}
          </View>
        </View>

        {spotifyError && (
          <SearchSpotifyError
            onOpenSettings={() => navigation.getParent()?.navigate('SettingsTab' as never)}
            onDismiss={dismissSpotifyError}
          />
        )}

        {query.trim().length > 0 && (
          <SourceTabs activeTab={activeSource} counts={counts} onTabChange={setActiveSource} />
        )}

        {isSearching && <ActivityIndicator color="#e8e8e8" style={{ marginTop: 16 }} />}

        {displayResults.length === 0 ? (
          <SearchEmptyState isSearching={isSearching} query={query} />
        ) : (
          <FlashList
            data={displayResults}
            keyExtractor={(item) => `${item.source}-${item.id}`}
            estimatedItemSize={64}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <SearchResultRow
                result={item}
                onPress={() => handleResultPress(item)}
                onLongPress={() => setSelectedResult(item)}
                downloadLabel={t('download')}
                onAction={() => handleRowAction(item)}
              />
            )}
            ListFooterComponent={(
              <SearchLoadMoreFooter
                visible={canLoadMore}
                disabled={!loadMoreSource}
                loading={isLoadingMore}
                label={t('loadMore', {
                  count: loadMoreSource ? getSearchPageLimit(loadMoreSource) : 0,
                  source: loadMoreSource ? getSearchSourceLabel(loadMoreSource, tc) : '',
                })}
                loadingLabel={t('loadingMore')}
                onPress={() => {
                  if (loadMoreSource) {
                    void loadMoreSearchResults(loadMoreSource);
                  }
                }}
              />
            )}
          />
        )}

        <ActionSheet
          visible={selectedResult !== null}
          title={selectedResult?.title ?? undefined}
          options={resultActions}
          onClose={() => setSelectedResult(null)}
        />

        <ActionSheet
          visible={showSort}
          title={t('sortResults')}
          options={[
            {
              label: t('sortRelevance'),
              icon: sortMode === 'relevance' ? 'check' : 'list',
              onPress: () => setSearchSortMode('relevance'),
            },
            {
              label: t('sortMostViewed'),
              icon: sortMode === 'most_viewed' ? 'check' : 'bar-chart-2',
              onPress: () => setSearchSortMode('most_viewed'),
            },
          ]}
          onClose={() => setShowSort(false)}
        />

        {playlistPickerTrackId != null && (
          <PlaylistPicker
            visible
            trackId={playlistPickerTrackId}
            onClose={() => setPlaylistPickerTrackId(null)}
          />
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}
