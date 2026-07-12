import { VirtualizedList } from '../../../../components/player/virtualized-list';
import { StaticTrackRow, TrackListHeader } from '../../sortable-track-row';
import { NoResults } from './empty-state';
import type { PlaylistTrackListProps } from './types';
import type { PlaylistLayout } from '../use-playlist-layout';

type StaticPlaylistTrackListProps = Pick<
  PlaylistTrackListProps,
  | 't'
  | 'isSmart'
  | 'allSelected'
  | 'onSelectAll'
  | 'sortBy'
  | 'sortDir'
  | 'onSort'
  | 'displayTracks'
  | 'playingPtId'
  | 'selectedIds'
  | 'onPlayTrack'
  | 'onToggleSelect'
> & {
  layout: PlaylistLayout;
};

export function StaticPlaylistTrackList({
  layout,
  t,
  isSmart,
  allSelected,
  onSelectAll,
  sortBy,
  sortDir,
  onSort,
  displayTracks,
  playingPtId,
  selectedIds,
  onPlayTrack,
  onToggleSelect,
}: StaticPlaylistTrackListProps) {
  return (
    <VirtualizedList
      items={displayTracks}
      estimateSize={60}
      overscan={14}
      keyExtractor={(track) => track.playlist_track_id}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
      contentStyle={{ padding: `8px ${layout.contentPaddingX}px 120px` }}
      header={
        <TrackListHeader
          dense={layout.dense}
          showArtist={layout.showArtistColumn}
          t={t}
          showDrag={!isSmart}
          allSelected={allSelected}
          onSelectAll={onSelectAll}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
        />
      }
      footer={displayTracks.length === 0 ? <NoResults t={t} /> : null}
      renderItem={(track, index) => (
        <div style={{ paddingBottom: index === displayTracks.length - 1 ? 0 : 'var(--track-list-row-gap)' }}>
          <StaticTrackRow
            dense={layout.dense}
            showArtist={layout.showArtistColumn}
            track={track}
            index={index}
            isPlaying={track.playlist_track_id === playingPtId}
            isSelected={selectedIds.has(track.playlist_track_id)}
            showDragSpacer={!isSmart}
            onClick={() => onPlayTrack(index)}
            onToggleSelect={(shiftKey: boolean) =>
              onToggleSelect(track.playlist_track_id, shiftKey)
            }
          />
        </div>
      )}
    />
  );
}
