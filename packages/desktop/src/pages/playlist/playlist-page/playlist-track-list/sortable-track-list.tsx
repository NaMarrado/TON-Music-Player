import {
  DndContext,
  MeasuringFrequency,
  MeasuringStrategy,
  closestCenter,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTrackRow, TrackListHeader } from '../../sortable-track-row';
import type { PlaylistTrackListProps } from './types';
import type { PlaylistLayout } from '../use-playlist-layout';

type SortablePlaylistTrackListProps = Pick<
  PlaylistTrackListProps,
  | 't'
  | 'allSelected'
  | 'onSelectAll'
  | 'sortBy'
  | 'sortDir'
  | 'onSort'
  | 'sensors'
  | 'onDragEnd'
  | 'sortableIds'
  | 'tracks'
  | 'playingPtId'
  | 'selectedIds'
  | 'onPlayTrack'
  | 'onToggleSelect'
> & {
  layout: PlaylistLayout;
};

export function SortablePlaylistTrackList({
  layout,
  t,
  allSelected,
  onSelectAll,
  sortBy,
  sortDir,
  onSort,
  sensors,
  onDragEnd,
  sortableIds,
  tracks,
  playingPtId,
  selectedIds,
  onPlayTrack,
  onToggleSelect,
}: SortablePlaylistTrackListProps) {
  return (
    <div className="overflow-hidden">
        <TrackListHeader
          dense={layout.dense}
          showArtist={layout.showArtistColumn}
          t={t}
          showDrag
          allSelected={allSelected}
          onSelectAll={onSelectAll}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
        />
        <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.BeforeDragging,
            frequency: MeasuringFrequency.Optimized,
          },
        }}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1.5">
              {tracks.map((track, index) => (
                <SortableTrackRow
                  dense={layout.dense}
                  showArtist={layout.showArtistColumn}
                  key={track.playlist_track_id}
                  track={track}
                  index={index}
                  sortId={String(track.playlist_track_id)}
                  isPlaying={track.playlist_track_id === playingPtId}
                  isSelected={selectedIds.has(track.playlist_track_id)}
                  onClick={() => onPlayTrack(index)}
                  onToggleSelect={(shiftKey: boolean) =>
                    onToggleSelect(track.playlist_track_id, shiftKey)
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
    </div>
  );
}
