import { useCallback } from 'react';
import type { SearchResult } from '@ton/core';
import type { TFunction } from 'i18next';
import { getTrackById } from '../../../services/db-queries';
import { playSingleTrack } from '../../../services/playback-bridge';
import { enqueueDownload } from '../../../stores/download-store';
import { showToast } from '../../../stores/toast-store';

export function useSearchResultHandlers(t: TFunction<'search'>) {
  const handlePlayLocal = useCallback(async (result: SearchResult) => {
    if (result.library_track_id == null) {
      return;
    }

    const track = await getTrackById(result.library_track_id);
    if (track) {
      await playSingleTrack(track);
    }
  }, []);

  const handleDownload = useCallback(
    async (result: SearchResult) => {
      if (result.source !== 'youtube' && result.source !== 'spotify') {
        return;
      }

      const enqueueResult = await enqueueDownload({
        source: result.source,
        sourceId: result.id,
        title: result.title,
        artist: result.artist,
        album: result.album,
        durationMs: result.duration_ms ?? 0,
        coverUrl: result.thumbnail_url,
        sourceUrl: result.url,
        playlistId: null,
      });
      if (enqueueResult.status === 'saved') {
        showToast(t('alreadySaved', { title: result.title }), 'success');
        return;
      }

      if (enqueueResult.status === 'duplicate') {
        showToast(t('downloadAlreadyQueued', { title: result.title }), 'info');
        return;
      }

      showToast(t('downloadStarted', { title: result.title }), 'info');
    },
    [t],
  );

  const handleResultPress = useCallback(
    async (result: SearchResult) => {
      if (result.library_track_id != null) {
        await handlePlayLocal(result);
      } else {
        await handleDownload(result);
      }
    },
    [handleDownload, handlePlayLocal],
  );

  const handleRowAction = useCallback(
    async (result: SearchResult) => {
      if (result.library_track_id != null) {
        await handlePlayLocal(result);
      } else {
        await handleDownload(result);
      }
    },
    [handleDownload, handlePlayLocal],
  );

  return {
    handleDownload,
    handlePlayLocal,
    handleResultPress,
    handleRowAction,
  };
}
