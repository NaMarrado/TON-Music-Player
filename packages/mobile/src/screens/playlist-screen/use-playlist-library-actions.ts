import { useCallback } from 'react';
import type { PlaylistTrackEntry } from '@ton/core';
import { addTracksToLibrary } from '../../stores/playlist-store';
import { loadTracks } from '../../stores/library-store';
import { showToast } from '../../stores/toast-store';

export function usePlaylistLibraryActions(
  tracks: PlaylistTrackEntry[],
  selectedTracks: PlaylistTrackEntry[],
  clearSelection: () => void,
  t: (key: string, vars?: Record<string, unknown>) => string,
) {
  const handleAddTrackIdsToLibrary = useCallback(async (trackIds: number[]) => {
    const result = await addTracksToLibrary(trackIds);
    await loadTracks();

    if (result.added > 0) {
      showToast(t('addedToLibrary', { count: result.added }), 'success');
      return;
    }

    showToast(t('alreadyInLibrary'), 'info');
  }, [t]);

  const handleAddPlaylistToLibrary = useCallback(async () => {
    if (tracks.length === 0) {
      return;
    }

    await handleAddTrackIdsToLibrary(tracks.map((track) => track.id));
  }, [handleAddTrackIdsToLibrary, tracks]);

  const handleAddSelectionToLibrary = useCallback(async () => {
    if (selectedTracks.length === 0) {
      return;
    }

    await handleAddTrackIdsToLibrary(selectedTracks.map((track) => track.id));
    clearSelection();
  }, [clearSelection, handleAddTrackIdsToLibrary, selectedTracks]);

  return {
    handleAddPlaylistToLibrary,
    handleAddSelectionToLibrary,
  };
}
