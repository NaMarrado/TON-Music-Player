import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  beginExportMobileLibrary,
  beginImportMobileLibrary,
  isLibraryTransferValidationError,
  pickImportArchiveAsync,
  usesShareSheetLibraryExportOutput,
  type LibraryTransferProgress,
  type LibraryExportSelection,
  type LibraryImportPlaylistChoice,
} from '../../services/library-transfer';
import { getSetting } from '../../services/db-queries';
import { restoreAudioSettings } from '../../services/audio-settings/restore';
import { loadPlaylists } from '../../stores/playlist-store';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { showToast } from '../../stores/toast-store';

const PROGRESS_INTERVAL_MS = 250;

/** The open tick list: playlists or songs to export, or the playlists of a file being imported. */
export type TransferPicker =
  | { mode: 'export-playlists' | 'export-songs' }
  | { mode: 'import-playlists'; items: LibraryImportPlaylistChoice[]; resolve: (indexes: number[] | null) => void };

export function useLibraryTransferActions() {
  const { t, i18n } = useTranslation('settings');
  const lastProgress = useRef<{ phase: string; at: number }>({ phase: '', at: 0 });
  const [isExportingLibrary, setIsExportingLibrary] = useState(false);
  const [isImportingLibrary, setIsImportingLibrary] = useState(false);
  const [picker, setPicker] = useState<TransferPicker | null>(null);
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
    if (progress.phase === 'sharing') {
      setTransferProgress(null);
      return;
    }
    // Redrawing the screen for every single song was the slowest part of an export; a few updates a second are enough.
    const now = Date.now();
    const last = lastProgress.current;
    if (last.phase === progress.phase && progress.current < progress.total && now - last.at < PROGRESS_INTERVAL_MS) return;
    lastProgress.current = { phase: progress.phase, at: now };
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

  /** Opens the tick list for a playlist or song export. The lists are read fresh, so new playlists and songs are offered. */
  const openExportPicker = useCallback(async (mode: 'export-playlists' | 'export-songs') => {
    if (isExportingLibrary || isImportingLibrary) {
      return;
    }

    await (mode === 'export-playlists' ? loadPlaylists() : reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }));
    setPicker({ mode });
  }, [isExportingLibrary, isImportingLibrary]);

  const exportLibrary = useCallback(async (selection: LibraryExportSelection) => {
    if (isExportingLibrary || isImportingLibrary) {
      return;
    }

    if (!selection.includeLibrary
        && selection.playlistIds.length === 0
        && (selection.trackIds?.length ?? 0) === 0) {
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
    } catch (error) {
      console.error('[library-transfer] Export failed', error);
      showToast(t('exportLibraryFailedToast'), 'error', 5000);
    } finally {
      setTransferProgress(null);
      setIsExportingLibrary(false);
    }
  }, [isExportingLibrary, isImportingLibrary, t, updateTransferProgress]);

  /** Imports a bundle. With choosePlaylists the user ticks which playlists of the file to bring in. */
  const importLibrary = useCallback(async (choosePlaylists = false) => {
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
      }, choosePlaylists
        ? { choosePlaylists: (items) => new Promise<number[] | null>((resolve) => setPicker({ mode: 'import-playlists', items, resolve })) }
        : undefined);
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

      if (result.profileApplied) {
        // Restored sound settings and language take effect at once, without restarting the app.
        await restoreAudioSettings();
        const language = await getSetting('language');
        if (language && language !== i18n.language) await i18n.changeLanguage(language);
        showToast(t('transferProfileImported'), 'success', 5000);
        return;
      }

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
      console.error('[library-transfer] Import failed', error);
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
    picker,
    setPicker,
    transferProgress,
  };
}
