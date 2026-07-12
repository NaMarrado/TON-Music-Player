import { useCallback } from 'react';
import { Alert } from 'react-native';
import type { PlaylistTrackEntry } from '@ton/core';
import {
  deletePlaylist,
  loadPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
} from '../../stores/playlist-store';
import { showToast } from '../../stores/toast-store';

export function usePlaylistMutationActions(
  id: number,
  playlistName: string | undefined,
  tracks: PlaylistTrackEntry[],
  selectedPlaylistTrackIds: number[],
  clearSelection: () => void,
  navigation: { goBack: () => void },
  t: (key: string, vars?: Record<string, unknown>) => string,
  tc: (key: string, vars?: Record<string, unknown>) => string,
) {
  const handleDelete = useCallback(() => {
    Alert.alert(
      t('deleteTitle'),
      t('deleteMessage', { name: playlistName }),
      [
        { text: tc('cancel'), style: 'cancel' },
        {
          text: tc('delete'),
          style: 'destructive',
          onPress: async () => {
            await deletePlaylist(id);
            showToast(t('playlistDeleted'), 'success');
            navigation.goBack();
          },
        },
      ],
    );
  }, [id, navigation, playlistName, t, tc]);

  const handleRemoveFromPlaylist = useCallback(async (playlistTrackId: number) => {
    await removeTrackFromPlaylist(playlistTrackId);
    showToast(t('trackRemoved'), 'success');
  }, [t]);

  const handleRemoveSelection = useCallback(async () => {
    if (selectedPlaylistTrackIds.length === 0) {
      return;
    }

    const playlistTrackIds = [...selectedPlaylistTrackIds];
    for (const playlistTrackId of playlistTrackIds) {
      await removeTrackFromPlaylist(playlistTrackId);
    }

    await loadPlaylist(id);
    clearSelection();
    showToast(
      t('tracksRemoved', { count: playlistTrackIds.length }),
      'success',
    );
  }, [clearSelection, id, selectedPlaylistTrackIds, t]);

  const handleMoveTrack = useCallback(async (playlistTrackId: number, direction: -1 | 1) => {
    const currentIndex = tracks.findIndex((track) => track.playlist_track_id === playlistTrackId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= tracks.length) {
      return;
    }

    const reordered = [...tracks];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);

    try {
      await reorderPlaylistTracks(
        id,
        reordered.map((track) => track.playlist_track_id),
      );
    } catch {
      showToast(t('reorderFailed'), 'error');
      await loadPlaylist(id);
    }
  }, [id, t, tracks]);

  return {
    handleDelete,
    handleMoveTrack,
    handleRemoveFromPlaylist,
    handleRemoveSelection,
  };
}
