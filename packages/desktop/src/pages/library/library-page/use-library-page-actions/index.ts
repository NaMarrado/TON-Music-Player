import { useLibraryDeleteActions } from './use-library-delete-actions';
import { useLibraryPlaybackActions } from './use-library-playback-actions';
import { useLibraryPlaylistActions } from './use-library-playlist-actions';
import { useLibraryTransferActions } from './use-library-transfer-actions';
import type { LibraryPageActionsArgs } from './types';

export function useLibraryPageActions({
  contextMenu,
  filteredTracksRef,
  refreshExportSummary,
  selectedIds,
  setContextMenu,
  setDeleteConfirm,
  setPlaylistPickerPos,
  setSelectedIds,
  t,
}: LibraryPageActionsArgs) {
  const playbackActions = useLibraryPlaybackActions({ filteredTracksRef });
  const transferActions = useLibraryTransferActions({ refreshExportSummary, t });
  const playlistActions = useLibraryPlaylistActions({
    contextMenu,
    selectedIds,
    setContextMenu,
    setPlaylistPickerPos,
    setSelectedIds,
    t,
  });
  const deleteActions = useLibraryDeleteActions({
    contextMenu,
    selectedIds,
    setContextMenu,
    setDeleteConfirm,
    setSelectedIds,
    t,
  });

  return {
    ...deleteActions,
    ...playbackActions,
    ...playlistActions,
    ...transferActions,
  };
}
