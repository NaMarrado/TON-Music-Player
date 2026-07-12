export function ErrorBanner({
  color,
  label,
  message,
  onDismiss,
  onOpenSettings,
  openSettingsLabel,
}: {
  color: string;
  label: string;
  message: string;
  onDismiss: () => void;
  onOpenSettings?: () => void;
  openSettingsLabel?: string;
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: '8px 14px',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        fontSize: '0.78rem',
        color: 'var(--text-secondary)',
      }}
    >
      <span
        style={{
          color,
          fontWeight: 600,
          fontSize: '0.72rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span>{message}</span>
      {onOpenSettings && openSettingsLabel ? (
        <button
          onClick={onOpenSettings}
          className="cursor-pointer"
          style={{
            marginLeft: 'auto',
            color: 'var(--text-primary)',
            background: 'none',
            border: 'none',
            fontFamily: 'inherit',
            fontSize: '0.78rem',
            textDecoration: 'underline',
            textUnderlineOffset: '2px',
          }}
        >
          {openSettingsLabel}
        </button>
      ) : (
        <span style={{ marginLeft: 'auto' }} />
      )}
      <button
        onClick={onDismiss}
        className="cursor-pointer shrink-0"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          padding: '2px',
          lineHeight: 0,
          transition: 'color var(--transition)',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
