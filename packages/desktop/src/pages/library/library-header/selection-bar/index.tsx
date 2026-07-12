import type { Playlist } from '@ton/core';
import { DeleteControls } from './delete-controls';
import { PlaylistPicker } from './playlist-picker';

type SelectionBarProps = {
  compact: boolean;
  deleteConfirm: boolean;
  manualPlaylists: Playlist[];
  playlistPickerPos: { x: number; y: number } | null;
  selectedIds: Set<number>;
  t: (key: string, vars?: Record<string, unknown>) => string;
  onDeselectAll: () => void;
  onOpenPlaylistPicker: (event: React.MouseEvent) => void;
  onSetDeleteConfirm: (value: boolean) => void;
  onDelete: () => void;
  onBulkAddToPlaylist: (playlistId: number) => void;
};

export function SelectionBar({
  compact,
  deleteConfirm,
  manualPlaylists,
  playlistPickerPos,
  selectedIds,
  t,
  onDeselectAll,
  onOpenPlaylistPicker,
  onSetDeleteConfirm,
  onDelete,
  onBulkAddToPlaylist,
}: SelectionBarProps) {
  return (
    <div
      className="flex gap-2 shrink-0"
      style={{
        alignItems: compact ? 'flex-start' : 'center',
        flexWrap: 'wrap',
        width: compact ? '100%' : undefined,
      }}
    >
      <span
        style={{
          fontSize: '0.78rem',
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {selectedIds.size} {t('selected')}
      </span>
      <button
        className="cursor-pointer"
        onClick={onDeselectAll}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: '0.75rem',
          fontFamily: 'inherit',
          textDecoration: 'underline',
          transition: 'color var(--transition)',
        }}
      >
        {t('deselectAll')}
      </button>
      <button
        className="cursor-pointer flex items-center gap-1.5"
        onClick={onOpenPlaylistPicker}
        style={{
          padding: '5px 12px',
          borderRadius: '16px',
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontSize: '0.75rem',
          fontFamily: 'inherit',
          transition: 'all var(--transition)',
        }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {t('addToPlaylist')}
      </button>
      <DeleteControls
        deleteConfirm={deleteConfirm}
        onDelete={onDelete}
        onSetDeleteConfirm={onSetDeleteConfirm}
        t={t}
      />
      {playlistPickerPos && (
        <PlaylistPicker
          manualPlaylists={manualPlaylists}
          playlistPickerPos={playlistPickerPos}
          t={t}
          onBulkAddToPlaylist={onBulkAddToPlaylist}
        />
      )}
    </div>
  );
}
