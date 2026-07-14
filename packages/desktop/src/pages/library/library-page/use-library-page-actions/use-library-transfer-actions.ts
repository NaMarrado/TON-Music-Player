import { useCallback } from 'react';
import { reconcileLibraryTracks } from '../../../../stores/library-store';
import { dismissToast, showToast } from '../../../../stores/toast-store';
import type { LibraryPageActionsArgs } from './types';

type UseLibraryTransferActionsArgs = Pick<LibraryPageActionsArgs, 't'>;
type ExportStartResult = {
  trackCount: number;
  playlistCount: number;
  sizeBytes: number;
};

function hasExportedContent(result: ExportStartResult): boolean {
  return result.trackCount > 0 || result.playlistCount > 0 || result.sizeBytes > 0;
}

export function useLibraryTransferActions(
  { t, refreshExportSummary }: UseLibraryTransferActionsArgs & Pick<LibraryPageActionsArgs, 'refreshExportSummary'>,
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

  const handleExportLibrary = useCallback(async () => {
    const ipc = window.api.invoke as (...args: unknown[]) => Promise<unknown>;
    const loadingId = showToast(t('exporting') || 'Exporting...', 'loading', 0);
    try {
      const result = (await ipc('export:start')) as {
        trackCount: number;
        playlistCount: number;
        sizeBytes: number;
      };
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
  }, [refreshExportSummary, t]);

  return {
    handleExportLibrary,
    handleImport,
  };
}
