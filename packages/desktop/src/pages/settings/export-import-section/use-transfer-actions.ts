import { useCallback, useEffect, useState } from 'react';
import type { ExportRequest, ImportInspectResult, ImportRequest } from '../../../shared/transfer-ipc';
import { reconcileLibraryTracks } from '../../../stores/library-store';
import { loadPlaylists } from '../../../stores/playlist-store';
import { dismissToast, showToast } from '../../../stores/toast-store';
import type { ExportImportProgress } from './constants';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** After a profile import the window reloads, so every restored setting (language, sound, keys) takes effect. */
const RELOAD_AFTER_PROFILE_MS = 2500;

/** Development only: automated checks hand in a file path here instead of clicking through the system dialog. */
function testPath(): string | undefined {
  if (!import.meta.env.DEV) return undefined;
  const value: unknown = Reflect.get(window, '__tonTestTransferPath');
  return typeof value === 'string' && value ? value : undefined;
}

export function useTransferActions(t: Translate) {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  const track = useCallback(async <T,>(channel: 'export:progress' | 'import:progress', run: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setPhase('');
    setProgress(0);
    setTotal(0);
    const onProgress = (...args: unknown[]) => {
      const data = args[0] as ExportImportProgress;
      setPhase(data.phase);
      setProgress(data.current);
      setTotal(data.total);
    };
    window.api.on(channel, onProgress);
    const loading = showToast(t(channel === 'export:progress' ? 'transferExporting' : 'transferImporting'), 'loading', 0);
    try {
      return await run();
    } catch {
      showToast(t('transferFailed'), 'error');
      return null;
    } finally {
      dismissToast(loading);
      window.api.off(channel, onProgress);
      setBusy(false);
      setPhase('');
    }
  }, [t]);

  const runExport = useCallback(async (request: ExportRequest) => {
    const result = await track('export:progress', () => window.api.invoke('export:start', { ...request, destinationPath: testPath() }));
    if (!result) return;
    if (result.trackCount === 0 && result.playlistCount === 0) showToast(t('transferNothing'), 'info');
    else showToast(t('transferExported', { tracks: result.trackCount, playlists: result.playlistCount }), 'success');
  }, [t, track]);

  /** Opens a bundle to see what is in it (for the playlist choice). Null when nothing was chosen or the file is not a bundle. */
  const inspectImport = useCallback(
    (): Promise<ImportInspectResult> => track('import:progress', () => window.api.invoke('import:inspect', { bundlePath: testPath() })).then((result) => result ?? null),
    [track],
  );

  const runImport = useCallback(async (request: ImportRequest = {}) => {
    const result = await track('import:progress', () => window.api.invoke('import:start', request.inspectToken ? request : { ...request, bundlePath: testPath() }));
    if (!result) return;
    await Promise.all([
      reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
      loadPlaylists({ force: true }),
    ]);
    if (result.profileApplied) {
      showToast(t('transferProfileImported'), 'success');
      window.setTimeout(() => window.location.reload(), RELOAD_AFTER_PROFILE_MS);
      return;
    }
    if (result.importedTracks > 0 || result.importedPlaylists > 0 || result.skippedTracks > 0) {
      showToast(t('transferImported', { tracks: result.importedTracks, playlists: result.importedPlaylists }), 'success');
    }
  }, [t, track]);

  // The app menu's Export / Import entries mean the library.
  useEffect(() => {
    const onMenuImport = () => { if (!busy) void runImport(); };
    const onMenuExport = () => { if (!busy) void runExport({ kind: 'library', playlistIds: [] }); };
    window.api.on('menu:import', onMenuImport);
    window.api.on('menu:export', onMenuExport);
    return () => {
      window.api.off('menu:import', onMenuImport);
      window.api.off('menu:export', onMenuExport);
    };
  }, [busy, runExport, runImport]);

  return { busy, phase, progress, total, runExport, runImport, inspectImport };
}
