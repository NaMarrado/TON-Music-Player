import { useCallback, useMemo, useState } from 'react';
import { Keyboard, RefreshControl, View } from 'react-native';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import type { Track } from '@ton/core';
import { useTranslation } from 'react-i18next';
import { TrackRow } from '../../components/track-row';
import { EmptyState } from '../../components/empty-state';
import { ActionSheet } from '../../components/action-sheet';
import { PlaylistPicker } from '../../components/playlist-picker';
import { CreatePlaylistModal } from './create-playlist-modal';
import { LibraryListHeader } from './library-list-header';
import { LibraryToolbar } from './library-toolbar';
import { LibraryTransferProgressModal } from '../../components/library-transfer-progress-modal';
import { useLibraryTransferActions } from '../settings-screen/use-library-transfer-actions';
import { useLibraryScreen } from './use-library-screen';
import {
  MobileFastScroller,
  useMobileFastScroll,
} from '../../components/mobile-fast-scroller';

export function LibraryScreen() {
  const { t } = useTranslation('library');
  const { t: ts } = useTranslation('settings');
  const transfer = useLibraryTransferActions();
  const [pendingExportTrackIds, setPendingExportTrackIds] = useState<number[] | null>(null);
  const {
    clearSelection,
    displayTracks,
    dismissRemovePrompt,
    filterQuery,
    handleAddSelectionToPlaylist,
    handleCreatePlaylist,
    handlePlaySelection,
    handlePlayAll,
    handleRefresh,
    handleRemoveSelection,
    handleTrackLongPress,
    handleTrackPress,
    isLoading,
    isRefreshing,
    playlists,
    playlistPickerTrackIds,
    removePromptDescription,
    removePromptOptions,
    removePromptTitle,
    removePromptVisible,
    selectedTrackIds,
    selectedTrackIdSet,
    selectionRevision,
    setPlaylistPickerTrackIds,
    setShowCreatePlaylist,
    setShowSortMenu,
    selectionActive,
    showCreatePlaylist,
    showSortMenu,
    sortActions,
  } = useLibraryScreen();
  const fastScroll = useMobileFastScroll<Track>();

  const listHeader = useMemo(() => (
    <LibraryListHeader
      playlists={playlists}
      filterQuery={filterQuery}
      tracks={displayTracks}
      onCreatePlaylist={() => setShowCreatePlaylist(true)}
      onPlayAll={handlePlayAll}
    />
  ), [filterQuery, handlePlayAll, playlists, setShowCreatePlaylist, displayTracks]);

  const renderTrack = useCallback(({ item }: ListRenderItemInfo<Track>) => (
    <TrackRow
      track={item}
      selected={selectedTrackIdSet.has(item.id)}
      selectionMode={selectionActive}
      onPress={() => handleTrackPress(item)}
      onLongPress={() => handleTrackLongPress(item)}
    />
  ), [handleTrackLongPress, handleTrackPress, selectedTrackIdSet, selectionActive]);

  return (
    <View className="flex-1 bg-bg-deep">
      <LibraryToolbar
        title={t('title')}
        selectedCountLabel={t('selectedCount', { count: selectedTrackIds.length })}
        selectionActive={selectionActive}
        onPlaySelection={handlePlaySelection}
        onAddSelectionToPlaylist={handleAddSelectionToPlaylist}
        onExportSelection={() => {
          setPendingExportTrackIds([...selectedTrackIds]);
        }}
        onRemoveSelection={() => { void handleRemoveSelection(); }}
        onClearSelection={clearSelection}
        onOpenSortMenu={() => setShowSortMenu(true)}
      />

      <View className="flex-1" onLayout={fastScroll.onLayout}>
        <FlashList
          ref={fastScroll.listRef}
          data={displayTracks}
          keyExtractor={(item) => String(item.id)}
          estimatedItemSize={56}
          drawDistance={650}
          extraData={selectionRevision}
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
          ListHeaderComponent={listHeader}
          renderItem={renderTrack}
          ListEmptyComponent={
            isLoading ? null : <EmptyState message={filterQuery ? t('noResults') : t('emptyLibrary')} />
          }
        />
        <MobileFastScroller
          contentHeight={fastScroll.contentHeight}
          itemCount={displayTracks.length}
          onScrollToOffset={fastScroll.scrollToOffset}
          scrollOffset={fastScroll.scrollOffset}
          viewportHeight={fastScroll.viewportHeight}
        />
      </View>

      <ActionSheet
        visible={pendingExportTrackIds != null}
        title={t('exportFormatTitle')}
        options={[
          {
            label: t('exportIndividualFiles'),
            icon: 'file',
            onPress: () => {
              const trackIds = pendingExportTrackIds ?? [];
              setPendingExportTrackIds(null);
              clearSelection();
              void transfer.exportLibrary({
                includeLibrary: false,
                outputMode: 'individual_files',
                playlistIds: [],
                trackIds,
              });
            },
          },
          {
            label: t('exportZipArchive'),
            icon: 'archive',
            onPress: () => {
              const trackIds = pendingExportTrackIds ?? [];
              setPendingExportTrackIds(null);
              clearSelection();
              void transfer.exportLibrary({
                includeLibrary: false,
                outputMode: 'archive',
                playlistIds: [],
                trackIds,
              });
            },
          },
        ]}
        onClose={() => setPendingExportTrackIds(null)}
      />

      <ActionSheet
        visible={showSortMenu}
        title={t('sortBy')}
        options={sortActions}
        onClose={() => setShowSortMenu(false)}
      />

      <ActionSheet
        visible={removePromptVisible}
        title={removePromptTitle}
        description={removePromptDescription}
        options={removePromptOptions}
        onClose={dismissRemovePrompt}
      />

      {playlistPickerTrackIds && (
        <PlaylistPicker
          visible
          trackIds={playlistPickerTrackIds}
          onClose={() => {
            setPlaylistPickerTrackIds(null);
            clearSelection();
          }}
        />
      )}

      <CreatePlaylistModal
        visible={showCreatePlaylist}
        title={t('createPlaylist')}
        cancelLabel={t('cancel')}
        createLabel={t('create')}
        onClose={() => setShowCreatePlaylist(false)}
        onCreate={handleCreatePlaylist}
      />

      <LibraryTransferProgressModal
        visible={transfer.transferProgress != null}
        title={transfer.transferProgress?.title ?? ts('exportingButton')}
        message={transfer.transferProgress?.message ?? ts('transferPreparing')}
        progress={transfer.transferProgress && transfer.transferProgress.total > 0
          ? Math.round((transfer.transferProgress.current / transfer.transferProgress.total) * 100)
          : null}
        canCancel={Boolean(transfer.transferProgress?.cancel)}
        cancelLabel={t('cancel')}
        onCancel={() => { void transfer.cancelTransfer(); }}
      />
    </View>
  );
}
