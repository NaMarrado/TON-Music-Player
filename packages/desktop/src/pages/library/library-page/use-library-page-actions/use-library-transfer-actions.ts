import { useCallback } from 'react';
import { reconcileLibraryTracks } from '../../../../stores/library-store';
import { exportSongs } from '../../../../stores/playlist-store';
import { dismissToast, showToast } from '../../../../stores/toast-store';
import type { LibraryPageActionsArgs } from './types';

type UseLibraryTransferActionsArgs = Pick<LibraryPageActionsArgs, 'selectedIds' | 't'>;
type ExportStartResult = {
  trackCount: number;
  playlistCount: number;
  sizeBytes: number;
};

function hasExportedContent(result: ExportStartResult): boolean {
  return result.trackCount > 0 || result.playlistCount > 0 || result.sizeBytes > 0;
}

export function useLibraryTransferActions(
  { selectedIds, t, refreshExportSummary }: UseLibraryTransferActionsArgs & Pick<LibraryPageActionsArgs, 'refreshExportSummary'>,
) {
  const handleImport = useCallback(async () => {
    const loadingId = showToast(t('scanning'), 'loading', 0);
    try {
      const result = (await window.api.invoke('library:import-files')) as
        | { imported: number }
        | undefined;
      dismissToast(loadingId);
      const count = result?.imported ?? 0;
      if (count > 0) {
        await reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true });
        showToast(t('scanComplete', { count }), 'success');
      }
    } catch {
      dismissToast(loadingId);
      showToast(t('importError') || 'Import failed', 'error');
    }
  }, [t]);

  /** Export covers the selected songs when any are selected, otherwise the whole Library. */
  const handleExportLibrary = useCallback(async () => {
    const ipc = window.api.invoke as (...args: unknown[]) => Promise<unknown>;
    const loadingId = showToast(t('exporting') || 'Exporting...', 'loading', 0);
    try {
      if (selectedIds.size > 0) {
        const result = await exportSongs([...selectedIds]);
        dismissToast(loadingId);
        if (result.trackCount > 0) showToast(t('exportedSongs', { count: result.trackCount }), 'success');
        return;
      }
      const result = (await ipc('export:start')) as ExportStartResult;
      dismissToast(loadingId);
      if (hasExportedContent(result)) {
        showToast(t('exportSuccess'), 'success');
      } else {
        showToast(t('nothingToExport'), 'info');
      }
    } catch {
      dismissToast(loadingId);
      showToast(t('exportError') || 'Export failed', 'error');
    } finally {
      void refreshExportSummary();
    }
  }, [refreshExportSummary, selectedIds, t]);

  return {
    handleExportLibrary,
    handleImport,
  };
}
