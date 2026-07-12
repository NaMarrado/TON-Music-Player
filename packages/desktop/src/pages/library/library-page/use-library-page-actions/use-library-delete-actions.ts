import { useCallback, useState } from 'react';
import {
  deleteTracksEverywhere,
  loadTracks,
  removeTracksFromLibraryOnly,
  useLibraryStore,
} from '../../../../stores/library-store';
import { showToast } from '../../../../stores/toast-store';
import type { LibraryPageActionsArgs } from './types';

type UseLibraryDeleteActionsArgs = Pick<
  LibraryPageActionsArgs,
  | 'contextMenu'
  | 'selectedIds'
  | 'setContextMenu'
  | 'setDeleteConfirm'
  | 'setSelectedIds'
  | 't'
>;

export function useLibraryDeleteActions({
  contextMenu,
  selectedIds,
  setContextMenu,
  setDeleteConfirm,
  setSelectedIds,
  t,
}: UseLibraryDeleteActionsArgs) {
  const [deleteModePrompt, setDeleteModePrompt] = useState<{ trackIds: number[] } | null>(null);

  const performDelete = useCallback(async (
    trackIds: number[],
    mode: 'library-only' | 'everywhere',
  ) => {
    const count = trackIds.length;
    try {
      if (mode === 'library-only') {
        await removeTracksFromLibraryOnly(trackIds);
        showToast(t('removedFromLibraryCount', { count }), 'info');
      } else {
        await deleteTracksEverywhere(trackIds);
        showToast(t('deletedCount', { count }), 'info');
      }
    } catch {
      showToast(t('deleteFailed'), 'error');
      await loadTracks({ force: true });
    }
  }, [t]);

  const requestDelete = useCallback((trackIds: number[]) => {
    const tracks = useLibraryStore.getState().tracks;
    const tracksById = new Map(tracks.map((track) => [track.id, track]));
    const hasPlaylistReferences = trackIds.some((trackId) => {
      const playlistNames = tracksById.get(trackId)?.playlist_names;
      return Boolean(playlistNames && playlistNames.trim().length > 0);
    });

    if (hasPlaylistReferences) {
      setDeleteModePrompt({ trackIds });
      return;
    }

    void performDelete(trackIds, 'everywhere');
  }, [performDelete]);

  const handleDeleteFromMenu = useCallback(() => {
    if (!contextMenu) {
      return;
    }

    const trackIds = [contextMenu.trackId];
    setContextMenu(null);
    requestDelete(trackIds);
  }, [contextMenu, requestDelete, setContextMenu]);

  const handleDelete = useCallback(() => {
    const ids = [...selectedIds];
    setDeleteConfirm(false);
    requestDelete(ids);
  }, [requestDelete, selectedIds, setDeleteConfirm]);

  const handleDeleteLibraryOnly = useCallback(async () => {
    if (!deleteModePrompt) {
      return;
    }

    const trackIds = deleteModePrompt.trackIds;
    setDeleteModePrompt(null);
    setSelectedIds(new Set());
    await performDelete(trackIds, 'library-only');
  }, [deleteModePrompt, performDelete, setSelectedIds]);

  const handleDeleteEverywhere = useCallback(async () => {
    if (!deleteModePrompt) {
      return;
    }

    const trackIds = deleteModePrompt.trackIds;
    setDeleteModePrompt(null);
    setSelectedIds(new Set());
    await performDelete(trackIds, 'everywhere');
  }, [deleteModePrompt, performDelete, setSelectedIds]);

  return {
    deleteModePromptCount: deleteModePrompt?.trackIds.length ?? 0,
    deleteModePromptOpen: deleteModePrompt !== null,
    handleDelete,
    handleDeleteEverywhere,
    handleDeleteFromMenu,
    handleDeleteLibraryOnly,
    handleDismissDeleteModePrompt: () => setDeleteModePrompt(null),
  };
}
