import { useCallback, useState } from 'react';
import {
  addPlaylistToLibrary,
  checkLibraryStatus,
  loadPlaylist,
} from '../../../../stores/playlist-store';
import { dismissToast, showToast } from '../../../../stores/toast-store';
import type { PlaylistLibraryCounts, UsePlaylistActionsArgs } from './types';

type UsePlaylistLibraryActionsArgs = Pick<UsePlaylistActionsArgs, 'playlist' | 't'>;

export function usePlaylistLibraryActions({
  playlist,
  t,
}: UsePlaylistLibraryActionsArgs) {
  const [libraryCounts, setLibraryCounts] = useState<PlaylistLibraryCounts | null>(null);

  const openAddToLibrary = useCallback(async () => {
    if (!playlist) {
      return;
    }

    try {
      const status = await checkLibraryStatus(playlist.id);
      setLibraryCounts(status);
    } catch {
      showToast(t('toastAddToLibraryError'), 'error');
    }
  }, [playlist, t]);

  const doAddToLibrary = useCallback(
    async (forceAll: boolean) => {
      if (!playlist) {
        return;
      }

      const loadingId = showToast(t('addingToLibrary') || 'Adding to library...', 'loading', 0);
      try {
        const result = await addPlaylistToLibrary(playlist.id, forceAll);
        dismissToast(loadingId);
        if (result.added > 0) {
          showToast(t('toastAddedToLibrary', { count: result.added }), 'success');
          await loadPlaylist(playlist.id);
        } else {
          showToast(t('toastAlreadyInLibrary'), 'info');
        }
      } catch {
        dismissToast(loadingId);
        showToast(t('toastAddToLibraryError'), 'error');
      }
    },
    [playlist, t],
  );

  return {
    doAddToLibrary,
    libraryCounts,
    openAddToLibrary,
  };
}
