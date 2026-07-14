import { useCallback, useEffect, useState } from 'react';
import { reconcileLibraryTracks } from '../../../stores/library-store';
import { loadPlaylists } from '../../../stores/playlist-store';
import { dismissToast, showToast } from '../../../stores/toast-store';
import type { ExportImportProgress } from './constants';

type ExportStartResult = {
  trackCount: number;
  playlistCount: number;
  sizeBytes: number;
};

function hasExportedContent(result: ExportStartResult): boolean {
  return result.trackCount > 0 || result.playlistCount > 0 || result.sizeBytes > 0;
}

export function useExportImportActions(
  t: (key: string, opts?: Record<string, unknown>) => string,
  canExport: boolean,
  refreshSummary: () => Promise<void>,
) {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusText, setStatusText] = useState('');

  const resetProgress = useCallback(() => {
    setStatusText('');
    setPhase('');
    setProgress(0);
    setTotal(0);
  }, []);

  const bindProgressHandler = useCallback(
    (channel: 'export:progress' | 'import:progress') => {
      const onProgress = (...args: unknown[]) => {
        const data = args[0] as ExportImportProgress;
        setPhase(data.phase);
        setProgress(data.current);
        setTotal(data.total);
      };

      window.api.on(channel, onProgress);
      return () => window.api.off(channel, onProgress);
    },
    [],
  );

  const handleExport = useCallback(async () => {
    if (busy || !canExport) {
      return;
    }

    setBusy(true);
    resetProgress();
    const loadingId = showToast(t('exporting'), 'loading', 0);
    const unbindProgress = bindProgressHandler('export:progress');

    try {
      const result = (await window.api.invoke('export:start')) as ExportStartResult;
      dismissToast(loadingId);
      if (hasExportedContent(result)) {
        const status = t('exportSuccess', {
          tracks: result.trackCount,
          playlists: result.playlistCount,
        });
        setStatusText(status);
        showToast(status, 'success');
      } else {
        const status = t('nothingToExport');
        setStatusText(status);
        showToast(status, 'info');
      }
    } catch {
      dismissToast(loadingId);
      setStatusText('Export failed');
      showToast('Export failed', 'error');
    } finally {
      unbindProgress();
      await refreshSummary();
      setBusy(false);
      setPhase('');
    }
  }, [bindProgressHandler, busy, canExport, refreshSummary, resetProgress, t]);

  const handleImport = useCallback(async () => {
    setBusy(true);
    resetProgress();
    const loadingId = showToast(t('importing'), 'loading', 0);
    const unbindProgress = bindProgressHandler('import:progress');

    try {
      const result = await window.api.invoke('import:start');
      dismissToast(loadingId);
      if (result.importedTracks > 0 || result.importedPlaylists > 0) {
        await Promise.all([
          reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
          loadPlaylists({ force: true }),
        ]);
        let status = t('importSuccess', {
          tracks: result.importedTracks,
          playlists: result.importedPlaylists,
        });
        if (result.skippedTracks > 0) {
          status += ` (${t('importSkipped', { count: result.skippedTracks })})`;
        }
        setStatusText(status);
        showToast(status, 'success');
      }
    } catch {
      dismissToast(loadingId);
      setStatusText('Import failed');
      showToast('Import failed', 'error');
    } finally {
      unbindProgress();
      await refreshSummary();
      setBusy(false);
      setPhase('');
    }
  }, [bindProgressHandler, refreshSummary, resetProgress, t]);

  useEffect(() => {
    const onMenuImport = () => {
      if (!busy) {
        void handleImport();
      }
    };
    const onMenuExport = () => {
      if (!busy && canExport) {
        void handleExport();
      }
    };
    window.api.on('menu:import', onMenuImport);
    window.api.on('menu:export', onMenuExport);
    return () => {
      window.api.off('menu:import', onMenuImport);
      window.api.off('menu:export', onMenuExport);
    };
  }, [busy, canExport, handleExport, handleImport]);

  return {
    busy,
    handleExport,
    handleImport,
    phase,
    progress,
    statusText,
    total,
  };
}
