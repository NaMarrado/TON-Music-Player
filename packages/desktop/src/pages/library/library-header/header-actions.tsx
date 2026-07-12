type HeaderActionsProps = {
  canPlay: boolean;
  compact: boolean;
  hasAnyTracks: boolean;
  hasExportableContent: boolean;
  t: (key: string) => string;
  onPlayAll: () => void;
  onImport: () => void;
  onExportLibrary: () => void;
};

function HeaderButton({
  children,
  compact,
  disabled,
  fillWidth = false,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  compact: boolean;
  disabled?: boolean;
  fillWidth?: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      className={`${primary ? 'play-all-btn' : 'download-btn'} cursor-pointer flex items-center gap-2`}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: compact ? '8px 12px' : '7px 16px',
        borderRadius: compact ? '14px' : '20px',
        background: primary ? 'var(--white)' : 'var(--bg-surface)',
        border: primary ? 'none' : '1px solid var(--border)',
        color: primary ? 'var(--bg-deep)' : 'var(--text-primary)',
        fontSize: '0.82rem',
        fontFamily: 'inherit',
        fontWeight: primary ? 500 : 400,
        transition: 'all var(--transition)',
        letterSpacing: primary ? undefined : '0.01em',
        justifyContent: 'center',
        minHeight: compact ? '38px' : undefined,
        width: fillWidth ? '100%' : undefined,
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function HeaderActions({
  canPlay,
  compact,
  hasAnyTracks,
  hasExportableContent,
  t,
  onPlayAll,
  onImport,
  onExportLibrary,
}: HeaderActionsProps) {
  return (
    <div
      className="gap-2"
      style={{
        display: compact ? 'grid' : 'flex',
        alignItems: 'center',
        flexWrap: compact ? undefined : 'nowrap',
        gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : undefined,
        width: compact ? '100%' : undefined,
      }}
    >
      {(hasAnyTracks || hasExportableContent) && (
        <>
          <HeaderButton compact={compact} fillWidth={compact} onClick={onPlayAll} disabled={!canPlay} primary>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            {t('playAll')}
          </HeaderButton>

          <HeaderButton compact={compact} fillWidth={compact} onClick={onImport}>
            <svg
              width="14"
              height="14"
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
            {t('import')}
          </HeaderButton>

          <HeaderButton compact={compact} fillWidth={compact} onClick={onExportLibrary} disabled={!hasExportableContent}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {t('exportLibrary')}
          </HeaderButton>
        </>
      )}
    </div>
  );
}
