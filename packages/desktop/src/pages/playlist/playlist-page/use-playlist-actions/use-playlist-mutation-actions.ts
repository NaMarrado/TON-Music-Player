import { useCallback } from 'react';
import {
  deletePlaylist,
  removeTrackFromPlaylist,
} from '../../../../stores/playlist-store';
import { showToast } from '../../../../stores/toast-store';
import type { UsePlaylistActionsArgs } from './types';

type UsePlaylistMutationActionsArgs = Pick<
  UsePlaylistActionsArgs,
  'clearSelection' | 'navigate' | 'playlist' | 'selectedIds' | 't'
>;

export function usePlaylistMutationActions({
  clearSelection,
  navigate,
  playlist,
  selectedIds,
  t,
}: UsePlaylistMutationActionsArgs) {
  const handleDelete = useCallback(async () => {
    if (!playlist) {
      return;
    }

    const name = playlist.name;
    await deletePlaylist(playlist.id);
    showToast(t('toastDeleted', { name }), 'info');
    navigate('/library');
  }, [navigate, playlist, t]);

  const handleRemoveSelected = useCallback(async () => {
    if (!playlist || selectedIds.size === 0) {
      return;
    }

    const count = selectedIds.size;
    for (const playlistTrackId of selectedIds) {
      await removeTrackFromPlaylist(playlistTrackId);
    }

    clearSelection();
    showToast(t('toastRemoved', { count }), 'success');
  }, [clearSelection, playlist, selectedIds, t]);

  return {
    handleDelete,
    handleRemoveSelected,
  };
}
