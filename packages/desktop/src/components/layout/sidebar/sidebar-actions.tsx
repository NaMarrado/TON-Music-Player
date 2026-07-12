export function SidebarActions({
  collapsed,
  onCreatePlaylist,
  onImportPlaylist,
  t,
}: {
  collapsed: boolean;
  onCreatePlaylist: () => void;
  onImportPlaylist: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className="flex gap-2 shrink-0"
      style={{
        margin: collapsed ? '0 8px 12px' : '0 12px 12px',
        flexDirection: collapsed ? 'column' : 'row',
      }}
    >
      <button
        className="flex items-center justify-center gap-2.5 cursor-pointer create-playlist-btn"
        onClick={onCreatePlaylist}
        title={t('createPlaylist')}
        style={{
          padding: collapsed ? '10px 0' : '10px 10px',
          borderRadius: 'var(--radius)',
          color: 'var(--text-secondary)',
          fontSize: '0.82rem',
          fontWeight: 500,
          letterSpacing: '0.02em',
          border: '1px dashed var(--border)',
          background: 'transparent',
          fontFamily: 'inherit',
          flex: collapsed ? '0 0 auto' : 1,
          minWidth: collapsed ? undefined : undefined,
          width: collapsed ? '100%' : undefined,
        }}
      >
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: '26px',
            height: '26px',
            background: 'var(--bg-elevated)',
            borderRadius: '6px',
            fontSize: '0.95rem',
            color: 'var(--text-secondary)',
          }}
        >
          +
        </span>
        {!collapsed && t('createPlaylist')}
      </button>
      <button
        className="flex items-center justify-center cursor-pointer shrink-0 create-playlist-btn"
        onClick={onImportPlaylist}
        title={t('importPlaylist')}
        style={{
          width: collapsed ? '100%' : '44px',
          height: collapsed ? undefined : '44px',
          aspectRatio: collapsed ? '1 / 1' : undefined,
          borderRadius: 'var(--radius)',
          color: 'var(--text-secondary)',
          border: '1px dashed var(--border)',
          background: 'transparent',
          fontFamily: 'inherit',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </div>
  );
}
