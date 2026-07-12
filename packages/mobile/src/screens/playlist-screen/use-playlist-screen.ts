import { useEffect, useState } from 'react';
import { formatTime } from '@ton/core';
import type { PlaylistTrackEntry } from '@ton/core';
import { useTranslation } from 'react-i18next';
import {
  EMPTY_PLAYLIST_DETAIL,
  loadPlaylist,
  usePlaylistStore,
} from '../../stores/playlist-store';
import { usePlaylistSelection } from './use-playlist-selection';
import { usePlaylistPlaybackActions } from './use-playlist-playback-actions';
import { usePlaylistLibraryActions } from './use-playlist-library-actions';
import { usePlaylistTransferActions } from './use-playlist-transfer-actions';
import { usePlaylistMutationActions } from './use-playlist-mutation-actions';

export function usePlaylistScreen(
  id: number,
  navigation: { goBack: () => void; navigate: (screen: 'Playlist', params: { id: number }) => void },
) {
  const { t } = useTranslation('playlist');
  const { t: tc } = useTranslation('common');
  const playlistDetail = usePlaylistStore((state) => state.playlistDetails[id] ?? EMPTY_PLAYLIST_DETAIL);
  const { playlist, tracks, isLoading, hasLoaded, error } = playlistDetail;
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    loadPlaylist(id);
  }, [id]);

  const selection = usePlaylistSelection(tracks);
  const playbackActions = usePlaylistPlaybackActions(
    tracks,
    selection.selectedTracks,
    selection.clearSelection,
  );
  const libraryActions = usePlaylistLibraryActions(
    tracks,
    selection.selectedTracks,
    selection.clearSelection,
    t,
  );
  const transferActions = usePlaylistTransferActions(id, navigation, t);
  const mutationActions = usePlaylistMutationActions(
    id,
    playlist?.name ?? undefined,
    tracks,
    selection.selectedPlaylistTrackIds,
    selection.clearSelection,
    navigation,
    t,
    tc,
  );

  const totalDurationLabel = tracks.length > 0
    ? `${tc('track', { count: tracks.length })}${tracks.reduce((sum, track) => sum + (track.duration_ms ?? 0), 0) > 0
      ? ` · ${formatTime(tracks.reduce((sum, track) => sum + (track.duration_ms ?? 0), 0))}`
      : ''}`
    : tc('track', { count: tracks.length });

  return {
    handleDelete: mutationActions.handleDelete,
    handleExportBundle: transferActions.handleExportBundle,
    handleImportBundle: transferActions.handleImportBundle,
    hasLoaded,
    handleAddPlaylistToLibrary: libraryActions.handleAddPlaylistToLibrary,
    handleAddSelectionToLibrary: libraryActions.handleAddSelectionToLibrary,
    handlePlay: playbackActions.handlePlay,
    handlePlaySelection: playbackActions.handlePlaySelection,
    handlePlayAll: playbackActions.handlePlayAll,
    handleMoveTrack: mutationActions.handleMoveTrack,
    handleRemoveFromPlaylist: mutationActions.handleRemoveFromPlaylist,
    handleRemoveSelection: mutationActions.handleRemoveSelection,
    handleTrackLongPress: (track: PlaylistTrackEntry) => {
      playbackActions.handleTrackLongPress(track, selection.toggleSelection);
    },
    handleTrackPress: (track: PlaylistTrackEntry, index: number) => {
      playbackActions.handleTrackPress(track, index, selection.selectionActive, selection.toggleSelection);
    },
    cancelTransfer: transferActions.cancelTransfer,
    isExportingBundle: transferActions.isExportingBundle,
    isImportingBundle: transferActions.isImportingBundle,
    isLoading,
    loadError: error === 'load-failed',
    playlist,
    selectedPlaylistTrackIds: selection.selectedPlaylistTrackIds,
    selectedTracks: selection.selectedTracks,
    selectionActive: selection.selectionActive,
    clearSelection: selection.clearSelection,
    setShowEditModal,
    showEditModal,
    transferProgress: transferActions.transferProgress,
    totalDurationLabel,
    tracks,
  };
}
