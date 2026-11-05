import { useCallback } from 'react';
import {
  exportPlaylist,
  exportSongs,
  importFilesToPlaylist,
} from '../../../../stores/playlist-store';
import { dismissToast, showToast } from '../../../../stores/toast-store';
import type { UsePlaylistActionsArgs } from './types';

type UsePlaylistFileActionsArgs = Pick<UsePlaylistActionsArgs, 'playbackTracksRef' | 'playlist' | 'selectedIds' | 't'>;

export function usePlaylistFileActions({ playbackTracksRef, playlist, selectedIds, t }: UsePlaylistFileActionsArgs) {
  const handleImport = useCallback(async () => {
    if (!playlist) {
      return;
    }

    const loadingId = showToast(t('importing') || 'Importing...', 'loading', 0);
    try {
      const result = await importFilesToPlaylist(playlist.id);
      dismissToast(loadingId);
      if (result.imported > 0) {
        showToast(t('toastImported', { count: result.imported }), 'success');
      }
    } catch {
      dismissToast(loadingId);
      showToast(t('toastImportError'), 'error');
    }
  }, [playlist, t]);

  /** Export covers the selected songs when any are selected, otherwise the whole playlist. */
  const handleExport = useCallback(async () => {
    if (!playlist) {
      return;
    }

    const selectedTrackIds = selectedIds.size > 0
      ? [...new Set(playbackTracksRef.current
        .filter((track) => selectedIds.has(track.playlist_track_id))
        .map((track) => track.id))]
      : [];
    const loadingId = showToast(t('exporting') || 'Exporting...', 'loading', 0);
    try {
      if (selectedTrackIds.length > 0) {
        const result = await exportSongs(selectedTrackIds);
        dismissToast(loadingId);
        if (result.trackCount > 0) {
          showToast(t('exportedSongs', { count: result.trackCount }), 'success', 5000);
        }
        return;
      }
      const filePath = await exportPlaylist(playlist.id);
      dismissToast(loadingId);
      if (filePath) {
        showToast(t('toastExported', { path: filePath }), 'success', 5000);
      }
    } catch {
      dismissToast(loadingId);
      showToast(t('toastExportError'), 'error', 5000);
    }
  }, [playbackTracksRef, playlist, selectedIds, t]);

  return {
    handleExport,
    handleImport,
  };
}
