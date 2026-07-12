import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { loadPlaylist, usePlaylistStore } from '../../../stores/playlist-store';
import { useQueueStore } from '../../../stores/queue-store';

export function usePlaylistPageData() {
  const { id } = useParams();
  const playlistId = id ? Number(id) : 0;

  const playlist = usePlaylistStore((state) => state.currentPlaylist);
  const tracks = usePlaylistStore((state) => state.currentTracks);
  const isLoading = usePlaylistStore((state) => state.isLoading);
  const queueItems = useQueueStore((state) => state.items);
  const queueIndex = useQueueStore((state) => state.currentIndex);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  useEffect(() => {
    if (playlistId > 0) {
      loadPlaylist(playlistId);
    }
  }, [playlistId]);

  const playingPtId = queueItems[queueIndex]?.playlist_track_id ?? null;
  const sortableIds = useMemo(
    () => tracks.map((track) => String(track.playlist_track_id)),
    [tracks],
  );

  return {
    isLoading,
    playingPtId,
    playlist,
    playlistId,
    setShowDeleteConfirm,
    setShowEditDialog,
    setShowRemoveConfirm,
    showDeleteConfirm,
    showEditDialog,
    showRemoveConfirm,
    sortableIds,
    tracks,
  };
}
