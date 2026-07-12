import { useCallback, useState } from 'react';
import type { PlaylistImportResult } from '@ton/core';
import { showToast } from '../../stores/toast-store';
import { scheduleMobileJob } from '../../services/job-scheduler';
import { importPlaylistToDownloads } from '../../services/playlist-import';
import { loadPlaylistTracks } from './load-playlist-tracks';

type UseImportPlaylistModalArgs = {
  onClose: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

function showPlaylistImportResultToast(
  result: PlaylistImportResult,
  t: UseImportPlaylistModalArgs['t'],
): void {
  showToast(
    t('playlistCreated', {
      linked: result.linkedCount,
      name: result.playlistName,
      queued: result.queuedCount,
      waiting: result.alreadyQueuedCount,
    }),
    'success',
  );
}

export function useImportPlaylistModal({ onClose, t }: UseImportPlaylistModalArgs) {
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const handleImport = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }

    setImporting(true);
    try {
      const playlist = await scheduleMobileJob({
        kind: 'playlist-import',
        lane: 'network',
        priority: 'user-blocking',
        run: () => loadPlaylistTracks(trimmed),
      });
      if (playlist.tracks.length === 0) {
        showToast(t('playlistEmpty'), 'error');
        return;
      }

      const batchResult = await scheduleMobileJob({
        kind: 'playlist-queue-import',
        lane: 'archive-io',
        priority: 'user-visible',
        run: () => importPlaylistToDownloads(playlist),
      });

      showPlaylistImportResultToast(batchResult, t);
      setUrl('');
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid-playlist-url') {
        showToast(t('invalidPlaylistUrl'), 'error');
      } else {
        showToast(error instanceof Error ? error.message : String(error), 'error');
      }
    } finally {
      setImporting(false);
    }
  }, [onClose, t, url]);

  const handleClose = useCallback(() => {
    if (importing) {
      return;
    }

    setUrl('');
    onClose();
  }, [importing, onClose]);

  return {
    handleClose,
    handleImport,
    importing,
    setUrl,
    url,
  };
}
