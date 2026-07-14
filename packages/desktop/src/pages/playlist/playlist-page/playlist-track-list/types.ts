import type { DragEndEvent, SensorDescriptor, SensorOptions } from '@dnd-kit/core';
import type { PlaylistTrackEntry } from '@ton/core';
import type { TFunction } from 'i18next';
import type { SortColumn, SortDir } from '../../sortable-track-row';
import type { PlaylistLayout } from '../use-playlist-layout';

export type PlaylistTrackListProps = {
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
