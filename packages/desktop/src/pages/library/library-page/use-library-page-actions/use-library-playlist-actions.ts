import { useCallback, useState } from 'react';
import {
  addTracksToPlaylist,
  usePlaylistStore,
} from '../../../../stores/playlist-store';
import { showToast } from '../../../../stores/toast-store';
import type { LibraryPageActionsArgs } from './types';
import type { PlaylistDuplicateDialogState } from '../playlist-duplicate-dialog';

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
  const [duplicateDialog, setDuplicateDialog] = useState<PlaylistDuplicateDialogState | null>(null);
  const [pendingAddition, setPendingAddition] = useState<{
    playlistId: number;
    playlistName: string;
    trackIds: number[];
    approved: Set<number>;
    skipped: Set<number>;
    isBulk: boolean;
  } | null>(null);

  const finishAddition = useCallback(async (
    pending: NonNullable<typeof pendingAddition>,
    approved: Set<number>,
    skipped: Set<number>,
  ) => {
    const trackIds = pending.trackIds.filter((id) => !skipped.has(id));
    const result = await addTracksToPlaylist({
      playlistId: pending.playlistId,
      trackIds,
      allowedDuplicateTrackIds: [...approved],
    });
    if (result.status === 'needs_confirmation') {
      const next = { ...pending, approved, skipped };
      setPendingAddition(next);
      setDuplicateDialog({ currentIndex: 0, duplicates: result.duplicates, isBulk: pending.isBulk });
      return;
    }
    setDuplicateDialog(null);
    setPendingAddition(null);
    setContextMenu(null);
    setPlaylistPickerPos(null);
    if (pending.isBulk) setSelectedIds(new Set());
    showToast(t('addedToPlaylist', { name: pending.playlistName }), 'success');
  }, [setContextMenu, setPlaylistPickerPos, setSelectedIds, t]);

  const beginAddition = useCallback(async (
    playlistId: number,
    playlistName: string,
    trackIds: number[],
    isBulk: boolean,
  ) => {
    const pending = {
      playlistId,
      playlistName,
      trackIds,
      approved: new Set<number>(),
      skipped: new Set<number>(),
      isBulk,
    };
    const result = await addTracksToPlaylist({ playlistId, trackIds });
    if (result.status === 'added') {
      setContextMenu(null);
      setPlaylistPickerPos(null);
      if (isBulk) setSelectedIds(new Set());
      showToast(t('addedToPlaylist', { name: playlistName }), 'success');
      return;
    }
    setContextMenu(null);
    setPlaylistPickerPos(null);
    setPendingAddition(pending);
    setDuplicateDialog({ currentIndex: 0, duplicates: result.duplicates, isBulk });
  }, [setContextMenu, setPlaylistPickerPos, setSelectedIds, t]);

  const handleContextMenu = useCallback((trackId: number, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ trackId, x: event.clientX, y: event.clientY });
  }, [setContextMenu]);

  const handleAddToPlaylist = useCallback(async (playlistId: number) => {
    if (!contextMenu) {
      return;
    }

    const playlist = playlists.find((item) => item.id === playlistId);
    if (playlist) await beginAddition(playlistId, playlist.name, [contextMenu.trackId], false);
  }, [beginAddition, contextMenu, playlists]);

  const handleBulkAddToPlaylist = useCallback(async (playlistId: number) => {
    const playlist = playlists.find((item) => item.id === playlistId);
    if (playlist) await beginAddition(playlistId, playlist.name, [...selectedIds], true);
  }, [beginAddition, playlists, selectedIds]);

  const handleCancelDuplicate = useCallback(() => {
    setDuplicateDialog(null);
    setPendingAddition(null);
  }, []);

  const resolveCurrentDuplicate = useCallback((mode: 'add' | 'skip' | 'all') => {
    if (!duplicateDialog || !pendingAddition) return;
    const approved = new Set(pendingAddition.approved);
    const skipped = new Set(pendingAddition.skipped);
    const current = duplicateDialog.duplicates[duplicateDialog.currentIndex];
    if (mode === 'add' || mode === 'all') approved.add(current.trackId);
    else skipped.add(current.trackId);
    if (mode === 'all') {
      for (const duplicate of duplicateDialog.duplicates.slice(duplicateDialog.currentIndex + 1)) {
        approved.add(duplicate.trackId);
      }
      void finishAddition(pendingAddition, approved, skipped);
      return;
    }
    const nextIndex = duplicateDialog.currentIndex + 1;
    if (nextIndex < duplicateDialog.duplicates.length) {
      setPendingAddition({ ...pendingAddition, approved, skipped });
      setDuplicateDialog({ ...duplicateDialog, currentIndex: nextIndex });
      return;
    }
    void finishAddition(pendingAddition, approved, skipped);
  }, [duplicateDialog, finishAddition, pendingAddition]);

  const handleOpenPlaylistPicker = useCallback((event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setPlaylistPickerPos({ x: rect.left, y: rect.bottom + 4 });
  }, [setPlaylistPickerPos]);

  return {
    handleAddToPlaylist,
    handleBulkAddToPlaylist,
    handleContextMenu,
    handleOpenPlaylistPicker,
    duplicateDialog,
    handleAddAllDuplicates: () => resolveCurrentDuplicate('all'),
    handleAddCurrentDuplicate: () => resolveCurrentDuplicate('add'),
    handleCancelDuplicate,
    handleSkipDuplicate: () => resolveCurrentDuplicate('skip'),
  };
}
