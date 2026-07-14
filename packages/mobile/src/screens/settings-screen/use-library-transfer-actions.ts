import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  beginExportMobileLibrary,
  beginImportMobileLibrary,
  isLibraryTransferValidationError,
  pickImportArchiveAsync,
  usesShareSheetLibraryExportOutput,
  type LibraryTransferProgress,
  type LibraryExportSelection,
} from '../../services/library-transfer';
import { loadPlaylists } from '../../stores/playlist-store';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { showToast } from '../../stores/toast-store';

export function useLibraryTransferActions() {
  const { t } = useTranslation('settings');
  const [isExportingLibrary, setIsExportingLibrary] = useState(false);
  const [isImportingLibrary, setIsImportingLibrary] = useState(false);
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [transferProgress, setTransferProgress] = useState<{
    title: string;
    message: string;
    current: number;
    total: number;
    cancel: (() => Promise<void>) | null;
  } | null>(null);

  const updateTransferProgress = useCallback((
    mode: 'export' | 'import',
    progress: LibraryTransferProgress,
    cancel: (() => Promise<void>) | null,
  ) => {
    const message = progress.phase === 'queued'
      ? t('transferQueued')
      : progress.phase === 'preparing'
        ? t('transferPreparing')
        : progress.phase === 'finalizing'
          ? t('transferFinalizing')
        : progress.phase === 'tracks'
          ? t(mode === 'export' ? 'exportTracksProgress' : 'importTracksProgress', {
            current: progress.current,
            total: progress.total,
          })
          : progress.phase === 'playlists'
            ? t(mode === 'export' ? 'exportPlaylistsProgress' : 'importPlaylistsProgress', {
              current: progress.current,
              total: progress.total,
            })
            : mode === 'export'
              ? t('exportingButton')
              : t('importingButton');

    setTransferProgress({
      title: mode === 'export' ? t('exportingButton') : t('importingButton'),
      message,
      current: progress.current,
      total: progress.total,
      cancel,
    });
  }, [t]);

  const openExportPicker = useCallback(async () => {
    if (isExportingLibrary || isImportingLibrary) {
      return;
    }

    await loadPlaylists();
    setShowExportPicker(true);
  }, [isExportingLibrary, isImportingLibrary]);

  const exportLibrary = useCallback(async (selection: LibraryExportSelection) => {
    if (isExportingLibrary || isImportingLibrary) {
      return;
    }

    if (!selection.includeLibrary && selection.playlistIds.length === 0) {
      return;
    }

    setIsExportingLibrary(true);

    try {
      let taskCancel: (() => Promise<void>) | null = null;
      const task = await beginExportMobileLibrary(selection, (progress) => {
        updateTransferProgress('export', progress, taskCancel);
      });
      taskCancel = task.cancel;
      setTransferProgress((current) => current ? { ...current, cancel: task.cancel } : current);
      const result = await task.result;

      if (!result) {
        return;
      }

      showToast(
        usesShareSheetLibraryExportOutput()
          ? t('exportLibraryShareSheetToast', {
            tracks: result.trackCount,
            playlists: result.playlistCount,
          })
          : t('exportLibrarySuccessToast', {
            tracks: result.trackCount,
            playlists: result.playlistCount,
          }),
        'success',
        5000,
      );
    } catch {
      showToast(t('exportLibraryFailedToast'), 'error', 5000);
    } finally {
      setTransferProgress(null);
      setIsExportingLibrary(false);
    }
  }, [isExportingLibrary, isImportingLibrary, t, updateTransferProgress]);

  const importLibrary = useCallback(async () => {
    if (isExportingLibrary || isImportingLibrary) {
      return;
    }

    setIsImportingLibrary(true);

    try {
      const archive = await pickImportArchiveAsync();
      if (!archive) {
        return;
      }

      let taskCancel: (() => Promise<void>) | null = null;
      const task = await beginImportMobileLibrary({
        uri: archive.uri,
        name: archive.name,
      }, (progress) => {
        updateTransferProgress('import', progress, taskCancel);
      });
      taskCancel = task.cancel;
      setTransferProgress((current) => current ? { ...current, cancel: task.cancel } : current);
      const result = await task.result;

      if (!result) {
        return;
      }

      await Promise.all([
        reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
        loadPlaylists(),
      ]);

      showToast(
        t('importLibrarySuccessToast', {
          tracks: result.importedTracks,
          skipped: result.skippedTracks,
          playlists: result.importedPlaylists,
        }),
        'success',
        5000,
      );
    } catch (error) {
      showToast(
        isLibraryTransferValidationError(error)
          ? t('importInvalidBundleToast')
          : t('importLibraryFailedToast'),
        'error',
        5000,
      );
    } finally {
      setTransferProgress(null);
      setIsImportingLibrary(false);
    }
  }, [isExportingLibrary, isImportingLibrary, t, updateTransferProgress]);

  return {
    cancelTransfer: async () => {
      if (!transferProgress?.cancel) {
        return;
      }

      await transferProgress.cancel();
    },
    exportLibrary,
    importLibrary,
    isExportingLibrary,
    isImportingLibrary,
    openExportPicker,
    setShowExportPicker,
    showExportPicker,
    transferProgress,
  };
}
