export function PlaylistLoadingState() {
  return (
    <div
      className="flex items-center justify-center flex-1"
      style={{ color: 'var(--text-secondary)' }}
    >
      <div
        className="w-5 h-5 border-2 rounded-full animate-spin"
        style={{
          borderColor: 'var(--text-secondary)',
          borderTopColor: 'transparent',
        }}
      />
    </div>
  );
}

export function PlaylistNotFoundState() {
  return (
    <div
      className="flex items-center justify-center flex-1"
      style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}
    >
      Playlist not found
    </div>
  );
}
