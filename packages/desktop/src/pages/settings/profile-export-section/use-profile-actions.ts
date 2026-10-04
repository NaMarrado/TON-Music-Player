import { useCallback, useState } from 'react';
import { showToast } from '../../../stores/toast-store';

type Translate = (key: string, opts?: Record<string, unknown>) => string;
export type ProfileBusy = '' | 'export' | 'import';

/** Time the confirmation stays readable before the app reloads to apply the restored settings everywhere. */
const RELOAD_DELAY_MS = 2500;

/**
 * Development builds let the automated checks name the file instead of using the native file dialog, which no test can
 * click. In a packaged app this is always undefined and the dialog is used.
 */
function testPath(key: string): string | undefined {
  if (!import.meta.env.DEV) return undefined;
  const value: unknown = Reflect.get(window, key);
  return typeof value === 'string' ? value : undefined;
}

export function useProfileActions(t: Translate) {
  const [busy, setBusy] = useState<ProfileBusy>('');
  const [statusText, setStatusText] = useState('');

  const handleExport = useCallback(async () => {
    if (busy) return;
    setBusy('export');
    setStatusText('');
    try {
      const destinationPath = testPath('__tonTestProfilePath');
      const result = await window.api.invoke('profile:export', destinationPath ? { destinationPath } : undefined);
      if (!result.saved) return;
      const message = t('profileExportSuccess', { starred: result.starred, playlists: result.playlists, sessions: result.sessions });
      const note = result.unidentified > 0 ? ` ${t('profileExportSkipped', { count: result.unidentified })}` : '';
      showToast(message, 'success');
      setStatusText(message + note);
    } catch {
      showToast(t('profileExportFailed'), 'error');
    } finally {
      setBusy('');
    }
  }, [busy, t]);

  const handleImport = useCallback(async () => {
    if (busy) return;
    setBusy('import');
    setStatusText('');
    try {
      const sourcePath = testPath('__tonTestProfilePath');
      const result = await window.api.invoke('profile:import', sourcePath ? { sourcePath } : undefined);
      if (!result.imported) return;
      const missing = result.starsMissing + result.playlistTracksMissing;
      const message = t('profileImportSuccess', { starred: result.starred, playlists: result.playlistsCreated, sessions: result.sessions });
      const note = missing > 0 ? ` ${t('profileImportMissing', { count: missing })}` : '';
      showToast(message, 'success');
      setStatusText(message + note);
      window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    } catch {
      showToast(t('profileImportInvalid'), 'error');
    } finally {
      setBusy('');
    }
  }, [busy, t]);

  return { busy, handleExport, handleImport, statusText };
}
