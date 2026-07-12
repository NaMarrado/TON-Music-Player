import { usePlaybackStore } from '../../../stores/playback-store';
import { useLibraryStore } from '../../../stores/library-store';
import type { LibraryTrack } from '../../../stores/library-store';
import { VirtualizedList } from '../../../components/player/virtualized-list';
import type { LibraryLayout } from '../library-page/use-library-layout';
import type { SortField } from './types';
import { TrackListHeader } from './track-list-header';
import { TrackRow } from './track-row';

interface TrackListViewProps {
  layout: LibraryLayout;
  tracks: LibraryTrack[];
  onPlayTrack: (index: number) => void;
  onContextMenu: (trackId: number, event: React.MouseEvent) => void;
  selectedIds: Set<number>;
  onToggleSelect: (id: number, shiftKey: boolean) => void;
  onSelectAll: () => void;
  t: (key: string) => string;
}

export function TrackListView({
  layout,
  tracks,
  onPlayTrack,
  onContextMenu,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  t,
}: TrackListViewProps) {
  const currentTrackId = usePlaybackStore((state) => state.currentTrack?.id);
  const sortBy = useLibraryStore((state) => state.sortBy) as SortField;
  const sortOrder = useLibraryStore((state) => state.sortOrder);
  const allSelected = tracks.length > 0 && tracks.every((track) => selectedIds.has(track.id));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <TrackListHeader
        allSelected={allSelected}
        dense={layout.dense}
        onSelectAll={onSelectAll}
        showArtist={layout.showArtistColumn}
        showPlaylist={layout.showPlaylistColumn}
        sortBy={sortBy}
        sortOrder={sortOrder}
        t={t}
      />

      <VirtualizedList
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        style={{ scrollbarGutter: 'stable' }}
        contentStyle={{ paddingBottom: `${layout.listBottomPadding}px` }}
        items={tracks}
        estimateSize={54}
        overscan={14}
        keyExtractor={(track) => track.id}
        renderItem={(track, index) => (
          <div style={{ paddingBottom: index === tracks.length - 1 ? 0 : 'var(--track-list-row-gap)' }}>
            <TrackRow
              dense={layout.dense}
              showArtist={layout.showArtistColumn}
              showPlaylist={layout.showPlaylistColumn}
              track={track}
              isPlaying={track.id === currentTrackId}
              isSelected={selectedIds.has(track.id)}
              onClick={() => onPlayTrack(index)}
              onContextMenu={(event) => onContextMenu(track.id, event)}
              onToggleSelect={(shiftKey) => onToggleSelect(track.id, shiftKey)}
            />
          </div>
        )}
      />
    </div>
  );
}
