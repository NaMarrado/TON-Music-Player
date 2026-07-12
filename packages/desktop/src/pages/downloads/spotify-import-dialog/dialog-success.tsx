export function DialogSuccess({
  playlistName,
  trackCount,
  t,
  onClose,
}: {
  playlistName: string;
  trackCount: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center" style={{ padding: '8px 0 4px' }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'rgba(74, 222, 128, 0.1)',
          marginBottom: '16px',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: '22px', height: '22px', color: '#4ade80' }}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <span
        style={{
          color: 'var(--text-primary)',
          fontSize: '0.93rem',
          fontWeight: 500,
          marginBottom: '4px',
        }}
      >
        {playlistName}
      </span>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
        {t('importSuccess', { count: trackCount })}
      </span>
      <button
        className="cursor-pointer"
        onClick={onClose}
        style={{
          marginTop: '20px',
          padding: '8px 28px',
          borderRadius: '20px',
          background: 'var(--white)',
          color: 'var(--bg-deep)',
          border: 'none',
          fontSize: '0.82rem',
          fontWeight: 500,
          fontFamily: 'inherit',
          transition: 'all var(--transition)',
        }}
      >
        OK
      </button>
    </div>
  );
}
