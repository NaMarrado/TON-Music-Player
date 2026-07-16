import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, RefreshControl, Text, View } from 'react-native';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import type { PlaylistTrackEntry } from '@ton/core';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { PlaylistParams } from '../../types/navigation';
import { ActionSheet, type ActionSheetOption } from '../../components/action-sheet';
import { TrackRow } from '../../components/track-row';
import { EmptyState } from '../../components/empty-state';
import { EditPlaylistModal } from '../../components/edit-playlist-modal';
import { LibraryTransferProgressModal } from '../../components/library-transfer-progress-modal';
import { SearchInput } from '../../components/search-input';
import {
  MobileFastScroller,
  useMobileFastScroll,
} from '../../components/mobile-fast-scroller';
import { PlaylistHero } from './playlist-hero';
import { PlaylistReorderControls, PlaylistTrackNumber } from './playlist-reorder-controls';
import { PlaylistSelectionToolbar } from './playlist-selection-toolbar';
import { usePlaylistScreen } from './use-playlist-screen';

type Props = { route: { params: PlaylistParams } };

export function PlaylistScreen({ route }: Props) {
  const { id } = route.params;
  const { t } = useTranslation('playlist');
  const { t: tc } = useTranslation('common');
  const navigation = useNavigation();
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const {
    clearSelection,
    cancelTransfer,
    handleDelete,
    handleExportBundle,
    handleImportBundle,
    hasLoaded,
    handlePlaySelection,
    handlePlayAll,
    handleMoveTrack,
    handleRefresh,
    isExportingBundle,
    isImportingBundle,
    isLoading,
    isRefreshing,
    isOriginalOrder,
    loadError,
    playlist,
    selectedPlaylistTrackIds,
    selectedPlaylistTrackIdSet,
    selectionRevision,
    setShowEditModal,
    showEditModal,
    selectionActive,
    handleRemoveSelection,
    handleTrackLongPress,
    handleTrackPress,
    totalDurationLabel,
    transferProgress,
    tracks,
    sourceTrackCount,
    filterQuery,
    setFilterQuery,
    applySort,
    sortBy,
    sortOrder,
  } = usePlaylistScreen(id, navigation);
  const fastScroll = useMobileFastScroll<PlaylistTrackEntry>();

  useEffect(() => {
    if ((selectionActive || sourceTrackCount < 2 || !isOriginalOrder) && reorderMode) {
      setReorderMode(false);
    }
  }, [isOriginalOrder, reorderMode, selectionActive, sourceTrackCount]);

  const playlistActions = useMemo<ActionSheetOption[]>(() => [
    {
      label: t('sortTracks'),
      icon: 'sliders',
      onPress: () => setShowSortMenu(true),
    },
    {
      label: t('reorderTracks'),
      icon: 'list',
      disabled: sourceTrackCount < 2 || selectionActive || !isOriginalOrder,
      onPress: () => setReorderMode(true),
    },
    {
      label: t('importBundle'),
      icon: 'download',
      onPress: () => { void handleImportBundle(); },
    },
    {
      label: t('exportBundle'),
      icon: 'upload',
      disabled: tracks.length === 0,
      onPress: () => { void handleExportBundle(); },
    },
    {
      label: t('editPlaylist'),
      icon: 'edit-2',
      onPress: () => setShowEditModal(true),
    },
    {
      label: t('deleteTitle'),
      icon: 'trash-2',
      destructive: true,
      onPress: handleDelete,
    },
  ], [
    handleDelete,
    handleExportBundle,
    handleImportBundle,
    t,
    setShowEditModal,
    selectionActive,
    isOriginalOrder,
    sourceTrackCount,
  ]);

  const sortActions = useMemo<ActionSheetOption[]>(() => ([
    { field: null, key: 'sortOriginal' },
    { field: '#', key: 'sortPosition' },
    { field: 'title', key: 'sortTitle' },
    { field: 'artist', key: 'sortArtist' },
    { field: 'downloaded_at', key: 'sortDownloaded' },
    { field: 'time', key: 'sortDuration' },
  ] as const).map(({ field, key }) => ({
    label: `${t(key)}${sortBy === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}`,
    icon: sortBy === field ? 'check' : 'minus',
    onPress: () => applySort(field),
  })), [applySort, sortBy, sortOrder, t]);

  const listHeader = useMemo(() => playlist ? (
    <>
      <PlaylistHero
        name={playlist.name}
        coverPath={playlist.cover_path}
        metaText={totalDurationLabel}
        showPlayAll={tracks.length > 0}
        playAllLabel={t('playAll')}
        editLabel={t('editPlaylist')}
        actionsDisabled={isImportingBundle || isExportingBundle}
        topSpacing={selectionActive || reorderMode ? 12 : 8}
        onPlayAll={handlePlayAll}
        onOpenActions={() => setShowActionsMenu(true)}
      />
      <View className="pb-3">
        <SearchInput
          value={filterQuery}
          onChangeText={setFilterQuery}
          placeholder={t('filterPlaceholder')}
        />
      </View>
    </>
  ) : null, [
    filterQuery,
    handlePlayAll,
    isExportingBundle,
    isImportingBundle,
    playlist,
    reorderMode,
    selectionActive,
    setFilterQuery,
    t,
    totalDurationLabel,
    tracks.length,
  ]);

  const renderTrack = useCallback(({ item, index }: ListRenderItemInfo<PlaylistTrackEntry>) => (
    <TrackRow
      track={item}
      selected={selectedPlaylistTrackIdSet.has(item.playlist_track_id)}
      selectionMode={selectionActive && !reorderMode}
      disabled={reorderMode}
      leadingAccessory={reorderMode ? <PlaylistTrackNumber index={index} /> : undefined}
      rightAccessory={reorderMode ? (
        <PlaylistReorderControls
          isFirst={index === 0}
          isLast={index === tracks.length - 1}
          moveDownLabel={t('moveTrackDown')}
          moveUpLabel={t('moveTrackUp')}
          onMoveDown={() => { void handleMoveTrack(item.playlist_track_id, 1); }}
          onMoveUp={() => { void handleMoveTrack(item.playlist_track_id, -1); }}
        />
      ) : undefined}
      onPress={() => {
        if (!reorderMode) handleTrackPress(item, index);
      }}
      onLongPress={reorderMode ? undefined : () => handleTrackLongPress(item)}
    />
  ), [
    handleMoveTrack,
    handleTrackLongPress,
    handleTrackPress,
    reorderMode,
    selectedPlaylistTrackIdSet,
    selectionActive,
    t,
    tracks.length,
  ]);

  if (!playlist && loadError && !isLoading) {
    return (
      <View className="flex-1 bg-bg-deep">
        <EmptyState message={t('loadFailed')} />
      </View>
    );
  }

  if (!playlist && hasLoaded && !loadError && !isLoading) {
    return (
      <View className="flex-1 bg-bg-deep">
        <EmptyState message={t('notFound')} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg-deep">
      {selectionActive && (
        <PlaylistSelectionToolbar
          selectedCountLabel={t('selectedCount', { count: selectedPlaylistTrackIds.length })}
          onPlaySelection={handlePlaySelection}
          onRemoveSelection={() => { void handleRemoveSelection(); }}
          onClearSelection={clearSelection}
        />
      )}
      {reorderMode && !selectionActive && (
        <View
          className="flex-row items-center justify-between border-b border-white/10 bg-bg-surface px-4 py-3"
        >
          <View className="flex-1 pr-4">
            <Text className="text-sm font-semibold text-text-primary">
              {t('reorderTracks')}
            </Text>
            <Text className="mt-0.5 text-xs text-text-secondary">
              {t('reorderHint')}
            </Text>
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => setReorderMode(false)}
            className="rounded-full bg-white px-4 py-2"
          >
            <Text className="text-xs font-semibold text-black">
              {t('doneReordering')}
            </Text>
          </Pressable>
        </View>
      )}

      <View className="flex-1" onLayout={fastScroll.onLayout}>
        <FlashList
          ref={fastScroll.listRef}
          data={tracks}
          keyExtractor={(item) => String(item.playlist_track_id)}
          estimatedItemSize={56}
          drawDistance={650}
          extraData={`${selectionRevision}:${reorderMode ? 1 : 0}`}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={fastScroll.onContentSizeChange}
          onScroll={fastScroll.onScroll}
          onScrollBeginDrag={Keyboard.dismiss}
          scrollEventThrottle={32}
          refreshControl={(
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => { void handleRefresh(); }}
              tintColor="#e8e8e8"
            />
          )}
          renderItem={renderTrack}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={isLoading || !hasLoaded
            ? null
            : <EmptyState message={filterQuery ? t('noResults') : t('emptyPlaylist')} />}
        />
        <MobileFastScroller
          contentHeight={fastScroll.contentHeight}
          itemCount={tracks.length}
          onScrollToOffset={fastScroll.scrollToOffset}
          scrollOffset={fastScroll.scrollOffset}
          viewportHeight={fastScroll.viewportHeight}
        />
      </View>

      <ActionSheet
        visible={showActionsMenu}
        title={playlist?.name}
        options={playlistActions}
        onClose={() => setShowActionsMenu(false)}
      />

      <ActionSheet
        visible={showSortMenu}
        title={t('sortTracks')}
        options={sortActions}
        onClose={() => setShowSortMenu(false)}
      />

      {playlist && (
        <EditPlaylistModal
          visible={showEditModal}
          playlistId={playlist.id}
          initialName={playlist.name}
          initialDescription={playlist.description ?? ''}
          onClose={() => setShowEditModal(false)}
        />
      )}

      <LibraryTransferProgressModal
        visible={transferProgress != null}
        title={transferProgress?.title ?? t('importBundle')}
        message={transferProgress?.message ?? t('importBundle')}
        progress={transferProgress && transferProgress.total > 0
          ? Math.min(100, Math.round((transferProgress.current / transferProgress.total) * 100))
          : null}
        canCancel={Boolean(transferProgress?.cancel)}
        cancelLabel={tc('cancel')}
        onCancel={() => { void cancelTransfer(); }}
      />
    </View>
  );
}
