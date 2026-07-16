import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatTime,
  formatTrackFileSizeSummary,
  summarizeTrackFileSizes,
} from '@ton/core';
import type { PlaylistTrackEntry } from '@ton/core';
import { useTranslation } from 'react-i18next';
import {
  EMPTY_PLAYLIST_DETAIL,
  loadPlaylist,
  usePlaylistStore,
} from '../../stores/playlist-store';
import { usePlaylistSelection } from './use-playlist-selection';
import { usePlaylistPlaybackActions } from './use-playlist-playback-actions';
import { usePlaylistTransferActions } from './use-playlist-transfer-actions';
import { usePlaylistMutationActions } from './use-playlist-mutation-actions';
import { usePlaylistViewState } from './use-playlist-view-state';

export function usePlaylistScreen(
  id: number,
  navigation: { goBack: () => void; navigate: (screen: 'Playlist', params: { id: number }) => void },
) {
  const { t } = useTranslation('playlist');
  const { t: tc } = useTranslation('common');
  const playlistDetail = usePlaylistStore((state) => state.playlistDetails[id] ?? EMPTY_PLAYLIST_DETAIL);
  const { playlist, tracks: sourceTracks, isLoading, hasLoaded, error } = playlistDetail;
  const [showEditModal, setShowEditModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadPlaylist(id);
  }, [id]);

  const viewState = usePlaylistViewState(id, sourceTracks);
  const selection = usePlaylistSelection(viewState.displayTracks);
  const queueSource = useMemo(() => ({
    kind: 'playlist' as const,
    source_id: id,
    filter_query: viewState.filterQuery || undefined,
    sort_by: viewState.sortBy ?? undefined,
    sort_order: viewState.sortOrder,
  }), [id, viewState.filterQuery, viewState.sortBy, viewState.sortOrder]);
  const playbackActions = usePlaylistPlaybackActions(
    id,
    viewState.displayTracks,
    selection.selectedTracks,
    selection.clearSelection,
    queueSource,
  );
  const transferActions = usePlaylistTransferActions(id, navigation, t);
  const mutationActions = usePlaylistMutationActions(
    id,
    playlist?.name ?? undefined,
    selection.selectedPlaylistTrackIds,
    selection.clearSelection,
    navigation,
    t,
    tc,
  );

  const totalDurationLabel = useMemo(() => {
    const totalDuration = viewState.displayTracks.reduce(
      (sum, track) => sum + (track.duration_ms ?? 0),
      0,
    );
    return [
      tc('track', { count: viewState.displayTracks.length }),
      formatTime(totalDuration),
      formatTrackFileSizeSummary(summarizeTrackFileSizes(viewState.displayTracks)),
    ].join(' · ');
  }, [tc, viewState.displayTracks]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await loadPlaylist(id);
    } finally {
      setIsRefreshing(false);
    }
  }, [id, isRefreshing]);

  return {
    handleDelete: mutationActions.handleDelete,
    handleExportBundle: transferActions.handleExportBundle,
    handleImportBundle: transferActions.handleImportBundle,
    hasLoaded,
    handlePlay: playbackActions.handlePlay,
    handlePlaySelection: playbackActions.handlePlaySelection,
    handlePlayAll: playbackActions.handlePlayAll,
    handleMoveTrack: mutationActions.handleMoveTrack,
    handleRefresh,
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
    isRefreshing,
    loadError: error === 'load-failed',
    playlist,
    selectedPlaylistTrackIds: selection.selectedPlaylistTrackIds,
    selectedPlaylistTrackIdSet: selection.selectedPlaylistTrackIdSet,
    selectedTracks: selection.selectedTracks,
    selectionRevision: selection.selectionRevision,
    selectionActive: selection.selectionActive,
    clearSelection: selection.clearSelection,
    setShowEditModal,
    showEditModal,
    transferProgress: transferActions.transferProgress,
    totalDurationLabel,
    tracks: viewState.displayTracks,
    sourceTrackCount: sourceTracks.length,
    filterQuery: viewState.filterQuery,
    setFilterQuery: viewState.setFilterQuery,
    applySort: viewState.applySort,
    isOriginalOrder: viewState.isOriginalOrder,
    sortBy: viewState.sortBy,
    sortOrder: viewState.sortOrder,
  };
}
