import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { TrackRow } from '../../components/track-row';
import { EmptyState } from '../../components/empty-state';
import { ActionSheet } from '../../components/action-sheet';
import { PlaylistPicker } from '../../components/playlist-picker';
import { CreatePlaylistModal } from './create-playlist-modal';
import { LibraryListHeader } from './library-list-header';
import { LibraryToolbar } from './library-toolbar';
import { useLibraryScreen } from './use-library-screen';

export function LibraryScreen() {
  const { t } = useTranslation('library');
  const {
    clearSelection,
    displayTracks,
    dismissRemovePrompt,
    filterQuery,
    handleAddSelectionToPlaylist,
    handleCreatePlaylist,
    handlePlaySelection,
    handlePlayAll,
    handleRemoveSelection,
    handleTrackLongPress,
    handleTrackPress,
    isLoading,
    playlists,
    playlistPickerTrackIds,
    removePromptDescription,
    removePromptOptions,
    removePromptTitle,
    removePromptVisible,
    selectedTrackIds,
    setPlaylistPickerTrackIds,
    setShowCreatePlaylist,
    setShowSortMenu,
    selectionActive,
    showCreatePlaylist,
    showSortMenu,
    sortActions,
  } = useLibraryScreen();

  const listHeader = (
    <LibraryListHeader
      playlists={playlists}
      filterQuery={filterQuery}
      trackCount={displayTracks.length}
      onCreatePlaylist={() => setShowCreatePlaylist(true)}
      onPlayAll={handlePlayAll}
    />
  );

  return (
    <View className="flex-1 bg-bg-deep">
      <LibraryToolbar
        title={t('title')}
        selectedCountLabel={t('selectedCount', { count: selectedTrackIds.length })}
        selectionActive={selectionActive}
        onPlaySelection={handlePlaySelection}
        onAddSelectionToPlaylist={handleAddSelectionToPlaylist}
        onRemoveSelection={() => { void handleRemoveSelection(); }}
        onClearSelection={clearSelection}
        onOpenSortMenu={() => setShowSortMenu(true)}
      />

      <FlashList
        data={displayTracks}
        keyExtractor={(item) => String(item.id)}
        estimatedItemSize={56}
        extraData={selectedTrackIds}
        ListHeaderComponent={listHeader}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            selected={selectedTrackIds.includes(item.id)}
            selectionMode={selectionActive}
            onPress={() => handleTrackPress(item, index)}
            onLongPress={() => handleTrackLongPress(item)}
          />
        )}
        ListEmptyComponent={
          isLoading ? null : <EmptyState message={filterQuery ? t('noResults') : t('emptyLibrary')} />
        }
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
    </View>
  );
}
