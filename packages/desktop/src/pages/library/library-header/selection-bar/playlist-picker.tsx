import type { Playlist } from '@ton/core';

export function PlaylistPicker({
  manualPlaylists,
  onBulkAddToPlaylist,
  playlistPickerPos,
  t,
}: {
  manualPlaylists: Playlist[];
  onBulkAddToPlaylist: (playlistId: number) => void;
  playlistPickerPos: { x: number; y: number };
  t: (key: string) => string;
}) {
  return (
    <div
      className="fixed z-50 rounded-lg overflow-hidden"
      style={{
        top: playlistPickerPos.y,
        left: playlistPickerPos.x,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        minWidth: '180px',
        padding: '4px',
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {manualPlaylists.length === 0 ? (
        <div
          style={{
            padding: '8px 12px',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
          }}
        >
          {t('noPlaylists')}
        </div>
      ) : (
        manualPlaylists.map((playlist) => (
          <button
            key={playlist.id}
            className="w-full text-left cursor-pointer"
            onClick={() => onBulkAddToPlaylist(playlist.id)}
            style={{
              display: 'block',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              fontFamily: 'inherit',
              transition: 'background var(--transition)',
            }}
          >
            {playlist.name}
          </button>
        ))
      )}
    </div>
  );
}
