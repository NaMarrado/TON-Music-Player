import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaylistImportResult } from '@ton/core';
import { importPlaylist } from '../../../stores/download-store';
import { showToast } from '../../../stores/toast-store';

export function useSpotifyImportDialog() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PlaylistImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleImport = useCallback(async () => {
    if (!url.trim()) return;

    setIsLoading(true);
    setError('');
    try {
      const response = await importPlaylist(url);
      setResult(response);
      showToast(
        `${response.playlistName} — ${response.linkedCount} ready, ${response.queuedCount} queued`,
        'success',
      );
    } catch (errorValue) {
      let message = errorValue instanceof Error ? errorValue.message : 'Import failed';
      const ipcPrefix = /^Error invoking remote method '[^']+': Error: /;
      message = message.replace(ipcPrefix, '');
      setError(message);
      showToast(message, 'error', 5000);
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  return {
    error,
    handleImport,
    inputRef,
    isLoading,
    result,
    setUrl,
    url,
  };
}
