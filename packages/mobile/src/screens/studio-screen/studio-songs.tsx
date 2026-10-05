import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatTime, getFilteredTracks, getSearchPageLimit, type Playlist, type SearchResult, type SearchSource, type Track } from '@ton/core';
import { CoverImage } from '../../components/cover-image';
import { SearchInput } from '../../components/search-input';
import { SourceTabs } from '../../components/source-tabs';
import { getAllPlaylists, getPlaylistTracks } from '../../services/db-queries';
import { DEFAULT_SEARCH_SOURCES } from '../../services/search-plan';
import { getSearchSourceLabel } from '../../services/search-source-label';
import { loadTracks, useLibraryStore } from '../../stores/library-store';
import { loadMoreSearchResults, setActiveSource, setSearchQuery, useSearchStore } from '../../stores/search-store';
import { addLibraryTrackToStudio, addOnlineResultToStudio, libraryTrackById, resultKey, useStudioStore } from '../../stores/studio-store';
import { SearchEmptyState } from '../search-screen/search-empty-state';
import { SearchLoadMoreFooter } from '../search-screen/search-load-more-footer';
import { SearchResultRow } from '../search-screen/search-result-row';
import { useSearchDerivedState } from '../search-screen/use-search-screen-actions/derived-state';
import { StudioButton, STUDIO_COLORS, useControlText } from './studio-ui';

export type SongSource = 'library' | 'playlists' | 'search';
const ROW = 60;

function Row({ title, subtitle, meta, cover, onPress }: { title: string; subtitle?: string; meta?: string; cover: string | null; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
      style={{ height: ROW, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 }}
    >
      <CoverImage uri={cover} size={42} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: STUDIO_COLORS.text, fontSize: 14 }}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={{ color: STUDIO_COLORS.dim, fontSize: 12 }}>{subtitle}</Text> : null}
      </View>
      {meta ? <Text style={{ color: STUDIO_COLORS.dim, fontSize: 12 }}>{meta}</Text> : null}
    </Pressable>
  );
}

function TrackList({ rows }: { rows: Track[] }) {
  return (
    <FlatList
      data={rows}
      keyExtractor={(track) => String(track.id)}
      getItemLayout={(_data, index) => ({ length: ROW, offset: ROW * index, index })}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      renderItem={({ item }) => (
        <Row title={item.title || '—'} subtitle={item.artist ?? undefined} meta={item.duration_ms ? formatTime(item.duration_ms) : ''} cover={item.cover_art_path} onPress={() => { void addLibraryTrackToStudio(item); }} />
      )}
    />
  );
}

function LibraryList({ query }: { query: string }) {
  const tracks = useLibraryStore((state) => state.tracks);
  const hasLoaded = useLibraryStore((state) => state.hasLoaded);
  useEffect(() => { if (!hasLoaded) void loadTracks(); }, [hasLoaded]);
  const rows = useMemo(() => getFilteredTracks(tracks, query, 'title', 'asc'), [tracks, query]);
  return <TrackList rows={rows} />;
}

function PlaylistList({ query }: { query: string }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [open, setOpen] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  useEffect(() => { void getAllPlaylists().then(setPlaylists); }, []);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getPlaylistTracks(open.id).then((rows) => { if (!cancelled) setTracks(rows); });
    return () => { cancelled = true; };
  }, [open]);
  const rows = useMemo(() => (query ? getFilteredTracks(tracks, query, 'title', 'asc') : tracks), [tracks, query]);
  if (open) {
    return (
      <>
        <Pressable accessibilityRole="button" accessibilityLabel={open.name} onPress={() => setOpen(null)} style={{ paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="chevron-left" size={18} color={STUDIO_COLORS.dim} />
          <Text numberOfLines={1} style={{ color: STUDIO_COLORS.dim, fontSize: 13 }}>{open.name}</Text>
        </Pressable>
        <TrackList rows={rows} />
      </>
    );
  }
  return (
    <FlatList
      data={playlists}
      keyExtractor={(playlist) => String(playlist.id)}
      nestedScrollEnabled
      renderItem={({ item }) => <Row title={item.name} cover={item.cover_path} onPress={() => setOpen(item)} />}
    />
  );
}

/** The app's own Search: same input, source tabs, result rows, empty state and load-more as the Search tab. */
function StudioSearch() {
  const { t } = useTranslation('search');
  const { t: tc } = useTranslation('common');
  const { t: ts } = useTranslation('studio');
  const query = useSearchStore((state) => state.query);
  const results = useSearchStore((state) => state.results);
  const isSearching = useSearchStore((state) => state.isSearching);
  const activeSource = useSearchStore((state) => state.activeSource);
  const sortMode = useSearchStore((state) => state.sortMode);
  const hasMoreBySource = useSearchStore((state) => state.hasMoreBySource);
  const loadingMoreSources = useSearchStore((state) => state.loadingMoreSources);
  const downloads = useStudioStore((state) => state.downloads);
  const { counts, displayResults } = useSearchDerivedState(activeSource, query, results, sortMode);

  const loadMoreSource: SearchSource | null = activeSource === 'all'
    ? DEFAULT_SEARCH_SOURCES.find((source) => displayResults.some((result) => result.source === source) && hasMoreBySource[source]) ?? null
    : activeSource;
  const canLoadMore = Boolean(loadMoreSource && query.trim().length > 0 && !isSearching && displayResults.length > 0 && hasMoreBySource[loadMoreSource]);

  const add = (result: SearchResult) => {
    if (result.source === 'local' || result.source === 'playlist' || result.library_track_id != null) {
      const track = libraryTrackById(result.library_track_id ?? Number(result.id));
      if (track) void addLibraryTrackToStudio(track);
      return;
    }
    void addOnlineResultToStudio(result);
  };
  const progress = Object.values(downloads).filter((value) => value >= 0);
  const failed = Object.values(downloads).some((value) => value < 0);

  return (
    <View style={{ flex: 1 }}>
      <SearchInput value={query} onChangeText={setSearchQuery} placeholder={t('placeholder')} />
      {query.trim().length > 0 && (
        <View style={{ height: 52, flexShrink: 0 }}>
          <SourceTabs activeTab={activeSource} counts={counts} onTabChange={setActiveSource} />
        </View>
      )}
      {isSearching && <ActivityIndicator color="#e8e8e8" style={{ marginTop: 8 }} />}
      {(progress.length > 0 || failed) && (
        <Text accessibilityRole="text" style={{ paddingHorizontal: 16, paddingVertical: 4, color: STUDIO_COLORS.dim, fontSize: 12 }}>
          {progress.length > 0 ? ts('downloading', { count: progress.length, percent: Math.round(Math.min(...progress) * 100) }) : ts('downloadFailed')}
        </Text>
      )}
      {displayResults.length === 0 ? (
        <SearchEmptyState isSearching={isSearching} query={query} />
      ) : (
        <FlatList
          data={displayResults}
          keyExtractor={(item) => `${item.source}-${item.id}`}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          extraData={downloads}
          renderItem={({ item }) => (
            <SearchResultRow
              result={item}
              onPress={() => add(item)}
              onLongPress={() => add(item)}
              downloadLabel={downloads[resultKey(item)] !== undefined && downloads[resultKey(item)] >= 0 ? `${Math.round(downloads[resultKey(item)] * 100)}%` : ts('addToStudio')}
              onAction={() => add(item)}
            />
          )}
          ListFooterComponent={(
            <SearchLoadMoreFooter
              visible={canLoadMore}
              disabled={!loadMoreSource}
              loading={loadMoreSource ? loadingMoreSources.includes(loadMoreSource) : false}
              label={t('loadMore', { count: loadMoreSource ? getSearchPageLimit(loadMoreSource) : 0, source: loadMoreSource ? getSearchSourceLabel(loadMoreSource, tc) : '' })}
              loadingLabel={t('loadingMore')}
              onPress={() => { if (loadMoreSource) void loadMoreSearchResults(loadMoreSource); }}
            />
          )}
        />
      )}
    </View>
  );
}

function FilterBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { name } = useControlText('songs-filter');
  return <SearchInput value={value} onChangeText={onChange} placeholder={name} style={{ marginBottom: 6 }} />;
}

export function StudioSongs({ source, onSource }: { source: SongSource; onSource: (source: SongSource) => void }) {
  const [text, setText] = useState('');
  const query = useDeferredValue(text);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}>
        <StudioButton control="songs-library" onPress={() => onSource('library')} active={source === 'library'} label><Feather name="music" size={18} color={STUDIO_COLORS.text} /></StudioButton>
        <StudioButton control="songs-playlists" onPress={() => onSource('playlists')} active={source === 'playlists'} label><Feather name="list" size={18} color={STUDIO_COLORS.text} /></StudioButton>
        <StudioButton control="songs-search" onPress={() => onSource('search')} active={source === 'search'} label><Feather name="search" size={18} color={STUDIO_COLORS.text} /></StudioButton>
      </View>
      {source !== 'search' && <FilterBox value={text} onChange={setText} />}
      <View style={{ flex: 1 }}>
        {source === 'library' && <LibraryList query={query} />}
        {source === 'playlists' && <PlaylistList query={query} />}
        {source === 'search' && <StudioSearch />}
      </View>
    </View>
  );
}
