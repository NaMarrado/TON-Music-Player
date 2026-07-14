import type { PlaylistTrackEntry } from '@ton/core';
import type { TFunction } from 'i18next';
import { PlaylistTrackList } from './playlist-track-list';
import type { PlaylistLayout } from './use-playlist-layout';
import type { SortColumn, SortDir } from '../sortable-track-row';
import type { DragEndEvent, SensorDescriptor, SensorOptions } from '@dnd-kit/core';

type PlaylistTrackListSectionProps = {
  layout: PlaylistLayout;
  locale: string;
  t: TFunction<'pages/playlist'>;
  tracks: PlaylistTrackEntry[];
  displayTracks: PlaylistTrackEntry[];
  isSmart: boolean;
  isSorted: boolean;
  isFiltered: boolean;
  allSelected: boolean;
  selectedIds: Set<number>;
  sortBy: SortColumn;
  sortDir: SortDir;
  onSort: (column: SortColumn) => void;
  onSelectAll: () => void;
  onPlayTrack: (index: number) => void;
  onToggleSelect: (playlistTrackId: number, shiftKey?: boolean) => void;
  playingPtId: number | null;
  sensors: SensorDescriptor<SensorOptions>[];
  sortableIds: string[];
  onDragEnd: (event: DragEndEvent) => void;
};

export function PlaylistTrackListSection(props: PlaylistTrackListSectionProps) {
  return <PlaylistTrackList {...props} />;
}
