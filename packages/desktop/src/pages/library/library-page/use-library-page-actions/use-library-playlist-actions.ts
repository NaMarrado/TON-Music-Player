import { useCallback } from 'react';
import {
  addTracksToPlaylist,
  usePlaylistStore,
} from '../../../../stores/playlist-store';
import { showToast } from '../../../../stores/toast-store';
import type { LibraryPageActionsArgs } from './types';

type UseLibraryPlaylistActionsArgs = Pick<
  LibraryPageActionsArgs,
  'contextMenu' | 'selectedIds' | 'setContextMenu' | 'setPlaylistPickerPos' | 'setSelectedIds' | 't'
>;

export function useLibraryPlaylistActions({
  contextMenu,
  selectedIds,
  setContextMenu,
  setPlaylistPickerPos,
  setSelectedIds,
  t,
}: UseLibraryPlaylistActionsArgs) {
  const playlists = usePlaylistStore((state) => state.playlists);

  const handleContextMenu = useCallback((trackId: number, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ trackId, x: event.clientX, y: event.clientY });
  }, [setContextMenu]);

  const handleAddToPlaylist = useCallback(async (playlistId: number) => {
    if (!contextMenu) {
      return;
    }

    const playlist = playlists.find((item) => item.id === playlistId);
    await addTracksToPlaylist(playlistId, [contextMenu.trackId]);
    setContextMenu(null);
    if (playlist) {
      showToast(t('addedToPlaylist', { name: playlist.name }), 'success');
    }
  }, [contextMenu, playlists, setContextMenu, t]);

  const handleBulkAddToPlaylist = useCallback(async (playlistId: number) => {
    const playlist = playlists.find((item) => item.id === playlistId);
    await addTracksToPlaylist(playlistId, [...selectedIds]);
    setSelectedIds(new Set());
    setPlaylistPickerPos(null);
    if (playlist) {
      showToast(t('addedToPlaylist', { name: playlist.name }), 'success');
    }
  }, [playlists, selectedIds, setPlaylistPickerPos, setSelectedIds, t]);

  const handleOpenPlaylistPicker = useCallback((event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setPlaylistPickerPos({ x: rect.left, y: rect.bottom + 4 });
  }, [setPlaylistPickerPos]);

  return {
    handleAddToPlaylist,
    handleBulkAddToPlaylist,
    handleContextMenu,
    handleOpenPlaylistPicker,
  };
}
