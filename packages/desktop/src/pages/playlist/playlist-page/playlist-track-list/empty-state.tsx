import type { TFunction } from 'i18next';

export function EmptyPlaylist({ t }: { t: TFunction<'pages/playlist'> }) {
  return (
    <div className="flex flex-col items-center animate-fade-in" style={{ paddingTop: '80px' }}>
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
          width="24"
          height="24"
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
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        {t('emptyPlaylist')}
      </span>
    </div>
  );
}

export function NoResults({ t }: { t: TFunction<'pages/playlist'> }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '40px 0',
        color: 'var(--text-secondary)',
        fontSize: '0.85rem',
      }}
    >
      {t('noResults')}
    </div>
  );
}
