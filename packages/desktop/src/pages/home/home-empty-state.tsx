export function HomeEmptyState({
  message,
  buttonLabel,
  onGoToSearch,
}: {
  message: string;
  buttonLabel: string;
  onGoToSearch: () => void;
}) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-4 px-8 animate-fade-in"
      style={{ minHeight: '300px' }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'var(--glow-strong)',
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <p
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
          textAlign: 'center',
          maxWidth: '320px',
          lineHeight: '1.6',
        }}
      >
        {message}
      </p>
      <button
        className="download-btn cursor-pointer"
        onClick={onGoToSearch}
        style={{
          padding: '7px 16px',
          borderRadius: '20px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontSize: '0.82rem',
          fontFamily: 'inherit',
          fontWeight: 400,
          transition: 'all var(--transition)',
          letterSpacing: '0.01em',
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
