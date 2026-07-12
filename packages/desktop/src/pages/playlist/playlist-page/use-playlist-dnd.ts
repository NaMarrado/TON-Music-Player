import { useCallback } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { reorderTracks, usePlaylistStore } from '../../../stores/playlist-store';
import type { PlaylistTrackEntry } from '@ton/core';

export function usePlaylistDnd(
  playlistId: number | undefined,
  tracks: PlaylistTrackEntry[],
) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 0 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!playlistId) return;

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = tracks.findIndex(
        (track) => String(track.playlist_track_id) === String(active.id),
      );
      const newIndex = tracks.findIndex(
        (track) => String(track.playlist_track_id) === String(over.id),
      );
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...tracks];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      usePlaylistStore.setState({ currentTracks: reordered });
      reorderTracks(
        playlistId,
        reordered.map((track) => track.playlist_track_id),
      );
    },
    [playlistId, tracks],
  );

  return { handleDragEnd, sensors };
}
