import { useCallback } from 'react';
import {
  exportPlaylist,
  importFilesToPlaylist,
} from '../../../../stores/playlist-store';
import { dismissToast, showToast } from '../../../../stores/toast-store';
import type { UsePlaylistActionsArgs } from './types';

type UsePlaylistFileActionsArgs = Pick<UsePlaylistActionsArgs, 'playlist' | 't'>;

export function usePlaylistFileActions({ playlist, t }: UsePlaylistFileActionsArgs) {
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

  const handleExport = useCallback(async () => {
    if (!playlist) {
      return;
    }

    const loadingId = showToast(t('exporting') || 'Exporting...', 'loading', 0);
    try {
      const filePath = await exportPlaylist(playlist.id);
      dismissToast(loadingId);
      if (filePath) {
        showToast(t('toastExported', { path: filePath }), 'success', 5000);
      }
    } catch {
      dismissToast(loadingId);
      showToast(t('toastExportError'), 'error', 5000);
    }
  }, [playlist, t]);

  return {
    handleExport,
    handleImport,
  };
}
