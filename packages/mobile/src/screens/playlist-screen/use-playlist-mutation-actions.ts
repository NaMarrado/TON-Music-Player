import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import {
  deletePlaylist,
  loadPlaylist,
  movePlaylistTrack,
  removeTrackFromPlaylist,
} from '../../stores/playlist-store';
import { showToast } from '../../stores/toast-store';

export function usePlaylistMutationActions(
  id: number,
  playlistName: string | undefined,
  selectedPlaylistTrackIds: number[],
  clearSelection: () => void,
  navigation: { goBack: () => void },
  t: (key: string, vars?: Record<string, unknown>) => string,
  tc: (key: string, vars?: Record<string, unknown>) => string,
) {
  const moveInFlight = useRef(false);
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
    if (moveInFlight.current) return;
    moveInFlight.current = true;
    try {
      await movePlaylistTrack(id, playlistTrackId, direction);
    } catch {
      showToast(t('reorderFailed'), 'error');
      await loadPlaylist(id);
    } finally {
      moveInFlight.current = false;
    }
  }, [id, t]);

  return {
    handleDelete,
    handleMoveTrack,
    handleRemoveFromPlaylist,
    handleRemoveSelection,
  };
}
