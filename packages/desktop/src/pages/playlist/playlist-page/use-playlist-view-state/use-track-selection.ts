import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaylistTrackEntry } from '@ton/core';

type UseTrackSelectionArgs = {
  tracks: PlaylistTrackEntry[];
  displayTracksRef: React.MutableRefObject<PlaylistTrackEntry[]>;
};

export function useTrackSelection({ tracks, displayTracksRef }: UseTrackSelectionArgs) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const anchorIndexRef = useRef<number | null>(null);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tracks]);

  const handleToggleSelect = useCallback((playlistTrackId: number, shiftKey = false) => {
    const currentTracks = displayTracksRef.current;
    const currentIndex = currentTracks.findIndex(
      (track) => track.playlist_track_id === playlistTrackId,
    );

    if (shiftKey && anchorIndexRef.current !== null && currentIndex >= 0) {
      const start = Math.min(currentIndex, anchorIndexRef.current);
      const end = Math.max(currentIndex, anchorIndexRef.current);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let index = start; index <= end; index += 1) {
          next.add(currentTracks[index].playlist_track_id);
        }
        return next;
      });
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playlistTrackId)) {
        next.delete(playlistTrackId);
      } else {
        next.add(playlistTrackId);
      }
      return next;
    });

    anchorIndexRef.current = currentIndex >= 0 ? currentIndex : null;
  }, [displayTracksRef]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === tracks.length) {
        return new Set();
      }

      return new Set(tracks.map((track) => track.playlist_track_id));
    });
  }, [tracks]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const allSelected = tracks.length > 0
    && tracks.every((track) => selectedIds.has(track.playlist_track_id));

  return {
    allSelected,
    clearSelection,
    handleSelectAll,
    handleToggleSelect,
    selectedIds,
  };
}
