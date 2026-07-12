import type { Playlist, PlaylistTrackEntry } from '@ton/core';

export interface PlaylistHeaderProps {
  playlist: Playlist;
  tracks: PlaylistTrackEntry[];
  isSmart: boolean;
  selectedCount: number;
  filterQuery: string;
  onFilterChange: (query: string) => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
  onPlayAll: () => void;
  onEdit: () => void;
  onImport: () => void;
  onExport: () => void;
  onDelete: () => void;
  onRemoveSelected: () => void;
  onAddToLibrary: () => void;
}
