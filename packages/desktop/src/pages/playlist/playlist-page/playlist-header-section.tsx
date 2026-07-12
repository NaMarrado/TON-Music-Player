import type { Playlist, PlaylistTrackEntry } from '@ton/core';
import type { TFunction } from 'i18next';
import { PlaylistHeader } from '../playlist-header';
import type { PlaylistLayout } from './use-playlist-layout';

type PlaylistHeaderSectionProps = {
  layout: PlaylistLayout;
  playlist: Playlist;
  tracks: PlaylistTrackEntry[];
  selectedCount: number;
  filterQuery: string;
  t: TFunction<'pages/playlist'>;
  onFilterChange: (value: string) => void;
  onPlayAll: () => void;
  onEdit: () => void;
  onImport: () => void;
  onExport: () => void;
  onDelete: () => void;
  onRemoveSelected: () => void;
};

export function PlaylistHeaderSection({
  layout,
  playlist,
  tracks,
  selectedCount,
  filterQuery,
  t,
  onFilterChange,
  onPlayAll,
  onEdit,
  onImport,
  onExport,
  onDelete,
  onRemoveSelected,
}: PlaylistHeaderSectionProps) {
  return (
    <PlaylistHeader
      layout={layout}
      playlist={playlist}
      tracks={tracks}
      isSmart={playlist.is_smart ?? false}
      selectedCount={selectedCount}
      filterQuery={filterQuery}
      onFilterChange={onFilterChange}
      t={t}
      onPlayAll={onPlayAll}
      onEdit={onEdit}
      onImport={onImport}
      onExport={onExport}
      onDelete={onDelete}
      onRemoveSelected={onRemoveSelected}
    />
  );
}
