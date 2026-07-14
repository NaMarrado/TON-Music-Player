import {
  DndContext,
  DragOverlay,
  MeasuringFrequency,
  MeasuringStrategy,
  closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTrackRow, StaticTrackRow, TrackListHeader } from '../../sortable-track-row';
import { VirtualizedList } from '../../../../components/player/virtualized-list';
import { useState } from 'react';
import type { PlaylistTrackListProps } from './types';
import type { PlaylistLayout } from '../use-playlist-layout';

type SortablePlaylistTrackListProps = Pick<
  PlaylistTrackListProps,
  | 't'
  | 'locale'
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
  locale,
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTrack = activeId == null
    ? null
    : tracks.find((track) => String(track.playlist_track_id) === activeId) ?? null;
  const activeIndex = activeTrack ? tracks.indexOf(activeTrack) : -1;
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    onDragEnd(event);
  };

  return (
    <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.BeforeDragging,
            frequency: MeasuringFrequency.Optimized,
          },
        }}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <VirtualizedList
            items={tracks}
            estimateSize={60}
            overscan={14}
            keyExtractor={(track) => track.playlist_track_id}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
            contentStyle={{ padding: `8px ${layout.contentPaddingX}px 120px` }}
            header={(
              <TrackListHeader
                dense={layout.dense}
                showArtist={layout.showArtistColumn}
                showDownloaded={layout.showDownloadedColumn}
                t={t}
                showDrag
                allSelected={allSelected}
                onSelectAll={onSelectAll}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={onSort}
              />
            )}
            renderItem={(track, index) => (
              <div style={{ paddingBottom: index === tracks.length - 1 ? 0 : 'var(--track-list-row-gap)' }}>
                <SortableTrackRow
                  dense={layout.dense}
                  locale={locale}
                  showArtist={layout.showArtistColumn}
                  showDownloaded={layout.showDownloadedColumn}
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
              </div>
            )}
          />
        </SortableContext>
        <DragOverlay>
          {activeTrack ? (
            <StaticTrackRow
              dense={layout.dense}
              locale={locale}
              showArtist={layout.showArtistColumn}
              showDownloaded={layout.showDownloadedColumn}
              track={activeTrack}
              index={activeIndex}
              isPlaying={activeTrack.playlist_track_id === playingPtId}
              isSelected={selectedIds.has(activeTrack.playlist_track_id)}
              showDragSpacer
              onClick={() => {}}
              onToggleSelect={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
  );
}
