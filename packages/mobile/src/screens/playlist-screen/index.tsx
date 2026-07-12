import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { PlaylistParams } from '../../types/navigation';
import { ActionSheet, type ActionSheetOption } from '../../components/action-sheet';
import { TrackRow } from '../../components/track-row';
import { EmptyState } from '../../components/empty-state';
import { EditPlaylistModal } from '../../components/edit-playlist-modal';
import { LibraryTransferProgressModal } from '../../components/library-transfer-progress-modal';
import { useScreenTopPadding } from '../../hooks/use-screen-top-padding';
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
  const topPadding = useScreenTopPadding(24);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const {
    clearSelection,
    cancelTransfer,
    handleAddPlaylistToLibrary,
    handleAddSelectionToLibrary,
    handleDelete,
    handleExportBundle,
    handleImportBundle,
    hasLoaded,
    handlePlaySelection,
    handlePlayAll,
    handleMoveTrack,
    isExportingBundle,
    isImportingBundle,
    isLoading,
    loadError,
    playlist,
    selectedPlaylistTrackIds,
    setShowEditModal,
    showEditModal,
    selectionActive,
    handleRemoveSelection,
    handleTrackLongPress,
    handleTrackPress,
    totalDurationLabel,
    transferProgress,
    tracks,
  } = usePlaylistScreen(id, navigation);

  useEffect(() => {
    if ((selectionActive || tracks.length < 2) && reorderMode) {
      setReorderMode(false);
    }
  }, [reorderMode, selectionActive, tracks.length]);

  const playlistActions = useMemo<ActionSheetOption[]>(() => [
    {
      label: t('reorderTracks'),
      icon: 'list',
      disabled: tracks.length < 2 || selectionActive,
      onPress: () => setReorderMode(true),
    },
    {
      label: t('addToLibrary'),
      icon: 'plus-circle',
      onPress: () => { void handleAddPlaylistToLibrary(); },
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
    handleAddPlaylistToLibrary,
    handleDelete,
    handleExportBundle,
    handleImportBundle,
    t,
    setShowEditModal,
    selectionActive,
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
          onAddSelectionToLibrary={() => { void handleAddSelectionToLibrary(); }}
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

      <FlashList
        data={tracks}
        keyExtractor={(item) => String(item.playlist_track_id)}
        estimatedItemSize={56}
        extraData={{ reorderMode, selectedPlaylistTrackIds }}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            selected={selectedPlaylistTrackIds.includes(item.playlist_track_id)}
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
              if (!reorderMode) {
                handleTrackPress(item, index);
              }
            }}
            onLongPress={reorderMode ? undefined : () => handleTrackLongPress(item)}
          />
        )}
        ListHeaderComponent={playlist ? (
          <PlaylistHero
            name={playlist.name}
            coverPath={playlist.cover_path}
            metaText={totalDurationLabel}
            showPlayAll={tracks.length > 0}
            playAllLabel={t('playAll')}
            editLabel={t('editPlaylist')}
            actionsDisabled={isImportingBundle || isExportingBundle}
            topSpacing={selectionActive || reorderMode ? 24 : topPadding}
            onPlayAll={handlePlayAll}
            onOpenActions={() => setShowActionsMenu(true)}
          />
        ) : null}
        ListEmptyComponent={isLoading || !hasLoaded ? null : <EmptyState message={t('emptyPlaylist')} />}
      />

      <ActionSheet
        visible={showActionsMenu}
        title={playlist?.name}
        options={playlistActions}
        onClose={() => setShowActionsMenu(false)}
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
