interface LibraryPageStateProps {
  t: (key: string) => string;
}

export function EmptyLibraryState({
  onImport,
  onSearchMusic,
  t,
}: LibraryPageStateProps & {
  onImport: () => void;
  onSearchMusic: () => void;
}) {
  return (
    <div className="flex flex-col items-center" style={{ paddingTop: '80px' }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--glow-strong)',
          marginBottom: '16px',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{
            width: '24px',
            height: '24px',
            color: 'var(--text-secondary)',
          }}
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        {t('emptyLibrary')}
      </span>
      <div className="flex items-center gap-3" style={{ marginTop: '16px' }}>
        <button
          className="play-all-btn cursor-pointer"
          onClick={onImport}
          style={{
            padding: '8px 24px',
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
          {t('import')}
        </button>
        <button
          className="download-btn cursor-pointer"
          onClick={onSearchMusic}
          style={{
            padding: '8px 24px',
            borderRadius: '20px',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            fontSize: '0.82rem',
            fontWeight: 500,
            fontFamily: 'inherit',
            transition: 'all var(--transition)',
          }}
        >
          {t('searchMusic')}
        </button>
      </div>
    </div>
  );
}

export function EmptyFilterState({ t }: LibraryPageStateProps) {
  return (
    <div className="flex flex-col items-center" style={{ paddingTop: '80px' }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{
          width: '32px',
          height: '32px',
          color: 'var(--text-secondary)',
          marginBottom: '12px',
        }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        {t('noResults')}
      </span>
    </div>
  );
}

export function EmptyStarredState({ t }: LibraryPageStateProps) {
  return (
    <div className="flex flex-col items-center gap-3" style={{ paddingTop: '80px' }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-secondary)' }}>
        <path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91L12 3Z" />
      </svg>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{t('emptyStarred')}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{t('emptyStarredHint')}</span>
    </div>
  );
}
