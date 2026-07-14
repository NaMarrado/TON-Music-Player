import type { Playlist, Track } from '@ton/core';

export interface LibraryHeaderProps {
  canExport: boolean;
  filteredTracks: Track[];
  exportableTrackCount: number;
  totalTrackCount: number;
  totalDuration: number;
  totalSizeLabel: string;
  filterQuery: string;
  selectedIds: Set<number>;
  deleteConfirm: boolean;
  exportablePlaylistCount: number;
  manualPlaylists: Playlist[];
  playlistCount: number;
  playlistPickerPos: { x: number; y: number } | null;
  t: (key: string, vars?: Record<string, unknown>) => string;
  onPlayAll: () => void;
  onImport: () => void;
  onExportLibrary: () => void;
  onDeselectAll: () => void;
  onOpenPlaylistPicker: (event: React.MouseEvent) => void;
  onSetDeleteConfirm: (value: boolean) => void;
  onDelete: () => void;
  onBulkAddToPlaylist: (playlistId: number) => void;
}
