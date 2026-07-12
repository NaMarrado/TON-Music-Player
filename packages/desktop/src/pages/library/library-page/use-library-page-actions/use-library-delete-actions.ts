import { useCallback } from 'react';
import {
  deleteTracksEverywhere,
  loadTracks,
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
  t,
}: UseLibraryDeleteActionsArgs) {
  const performDelete = useCallback(async (trackIds: number[]) => {
    const count = trackIds.length;
    try {
      await deleteTracksEverywhere(trackIds);
      showToast(t('deletedCount', { count }), 'info');
    } catch {
      showToast(t('deleteFailed'), 'error');
      await loadTracks({ force: true });
    }
  }, [t]);

  const requestDelete = useCallback((trackIds: number[]) => {
    void performDelete(trackIds);
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

  return {
    handleDelete,
    handleDeleteFromMenu,
  };
}
