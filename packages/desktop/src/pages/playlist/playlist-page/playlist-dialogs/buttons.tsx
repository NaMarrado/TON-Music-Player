export function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-lg cursor-pointer download-btn"
      onClick={onClick}
      style={{
        padding: '9px 18px',
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
        fontSize: '0.82rem',
        fontFamily: 'inherit',
        transition: 'all var(--transition)',
      }}
    >
      {children}
    </button>
  );
}

export function DestructiveButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-lg cursor-pointer"
      onClick={onClick}
      style={{
        padding: '9px 18px',
        background: '#ef4444',
        color: '#fff',
        border: 'none',
        fontSize: '0.82rem',
        fontWeight: 600,
        fontFamily: 'inherit',
        transition: 'all var(--transition)',
      }}
    >
      {children}
    </button>
  );
}
