export function ActionButton({
  compact = false,
  children,
  danger = false,
  fillWidth = false,
  onClick,
  primary = false,
}: {
  compact?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  fillWidth?: boolean;
}) {
  return (
    <button
      className={`${
        primary ? 'play-all-btn' : 'download-btn'
      } cursor-pointer flex items-center gap-2`}
      onClick={onClick}
      style={{
        padding: compact ? '8px 12px' : '7px 16px',
        borderRadius: compact ? '14px' : '20px',
        background: primary ? 'var(--white)' : 'var(--bg-surface)',
        border: primary ? 'none' : danger ? '1px solid #ef4444' : '1px solid var(--border)',
        color: primary ? 'var(--bg-deep)' : danger ? '#ef4444' : 'var(--text-primary)',
        fontSize: '0.82rem',
        fontFamily: 'inherit',
        fontWeight: danger ? 500 : primary ? 500 : 400,
        transition: 'all var(--transition)',
        justifyContent: 'center',
        minHeight: compact ? '38px' : undefined,
        width: fillWidth ? '100%' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}
