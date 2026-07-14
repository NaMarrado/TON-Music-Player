import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  beginExportMobileLibrary,
  beginImportMobileLibrary,
  isLibraryTransferValidationError,
  pickImportArchiveAsync,
  usesShareSheetLibraryExportOutput,
  type LibraryTransferProgress,
} from '../../services/library-transfer';
import { loadPlaylists, loadPlaylist } from '../../stores/playlist-store';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { showToast } from '../../stores/toast-store';

export function usePlaylistTransferActions(
  id: number,
  navigation: { navigate: (screen: 'Playlist', params: { id: number }) => void },
  t: (key: string, vars?: Record<string, unknown>) => string,
) {
  const { t: ts } = useTranslation('settings');
  const [isImportingBundle, setIsImportingBundle] = useState(false);
  const [isExportingBundle, setIsExportingBundle] = useState(false);
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
      ? ts('transferQueued')
      : progress.phase === 'preparing'
        ? ts('transferPreparing')
        : progress.phase === 'finalizing'
          ? ts('transferFinalizing')
        : progress.phase === 'tracks'
          ? ts(mode === 'export' ? 'exportTracksProgress' : 'importTracksProgress', {
            current: progress.current,
            total: progress.total,
          })
          : progress.phase === 'playlists'
            ? ts(mode === 'export' ? 'exportPlaylistsProgress' : 'importPlaylistsProgress', {
              current: progress.current,
              total: progress.total,
            })
            : mode === 'export'
              ? t('exportBundle')
              : t('importBundle');

    setTransferProgress({
      title: mode === 'export' ? t('exportBundle') : t('importBundle'),
      message,
      current: progress.current,
      total: progress.total,
      cancel,
    });
  }, [t, ts]);

  const handleImportBundle = useCallback(async () => {
    if (isImportingBundle || isExportingBundle) {
      return;
    }

    setIsImportingBundle(true);
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

      if (result.bundleType === 'playlist' && result.playlistIds.length > 0) {
        navigation.navigate('Playlist', { id: result.playlistIds[0] });
      } else {
        await loadPlaylist(id);
      }

      showToast(
        t('importBundleSuccess', {
          tracks: result.importedTracks,
          playlists: result.importedPlaylists,
        }),
        'success',
        5000,
      );
    } catch (error) {
      showToast(
        isLibraryTransferValidationError(error)
          ? ts('importInvalidBundleToast')
          : t('importBundleFailed'),
        'error',
        5000,
      );
    } finally {
      setTransferProgress(null);
      setIsImportingBundle(false);
    }
  }, [id, isExportingBundle, isImportingBundle, navigation, t, ts, updateTransferProgress]);

  const handleExportBundle = useCallback(async () => {
    if (isImportingBundle || isExportingBundle) {
      return;
    }

    setIsExportingBundle(true);
    try {
      let taskCancel: (() => Promise<void>) | null = null;
      const task = await beginExportMobileLibrary({
        includeLibrary: false,
        playlistIds: [id],
      }, (progress) => {
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
          ? t('exportBundleShareSheetToast', {
            tracks: result.trackCount,
          })
          : t('exportBundleSuccess', {
            tracks: result.trackCount,
          }),
        'success',
        5000,
      );
    } catch {
      showToast(t('exportBundleFailed'), 'error', 5000);
    } finally {
      setTransferProgress(null);
      setIsExportingBundle(false);
    }
  }, [id, isExportingBundle, isImportingBundle, t, updateTransferProgress]);

  return {
    cancelTransfer: async () => {
      if (!transferProgress?.cancel) {
        return;
      }

      await transferProgress.cancel();
    },
    handleExportBundle,
    handleImportBundle,
    isExportingBundle,
    isImportingBundle,
    transferProgress,
  };
}
