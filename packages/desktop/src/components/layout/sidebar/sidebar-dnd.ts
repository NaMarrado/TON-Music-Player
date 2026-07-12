import { useCallback, useMemo } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { reorderPlaylists } from '../../../stores/playlist-store';

export function useSidebarDnd(playlists: { id: number }[]) {
  const playlistIds = useMemo(
    () => playlists.map((playlist) => String(playlist.id)),
    [playlists],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handlePlaylistDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = playlists.findIndex(
        (playlist) => String(playlist.id) === String(active.id),
      );
      const newIndex = playlists.findIndex(
        (playlist) => String(playlist.id) === String(over.id),
      );
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...playlists];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      void reorderPlaylists(reordered.map((playlist) => playlist.id));
    },
    [playlists],
  );

  return { handlePlaylistDragEnd, playlistIds, sensors };
}
