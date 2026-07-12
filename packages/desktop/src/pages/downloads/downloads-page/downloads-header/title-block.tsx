export function DownloadsTitleBlock({
  t,
  totalActive,
}: {
  t: (key: string) => string;
  totalActive: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <h1
        className="text-[1.7rem] font-bold tracking-tight"
        style={{ fontFamily: "'Syne', sans-serif", color: 'var(--white)' }}
      >
        {t('title')}
      </h1>
      {totalActive > 0 && (
        <span
          style={{
            padding: '2px 10px',
            borderRadius: '12px',
            background: 'var(--glow-strong)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            fontSize: '0.72rem',
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {totalActive}
        </span>
      )}
    </div>
  );
}
