import { formatDuration } from '@ton/core';

type HeaderStatsProps = {
  compact: boolean;
  filterQuery: string;
  filteredCount: number;
  totalDuration: number;
  totalTrackCount: number;
  title: string;
};

export function HeaderStats({
  compact,
  filterQuery,
  filteredCount,
  totalDuration,
  totalTrackCount,
  title,
}: HeaderStatsProps) {
  const hasAnyTracks = totalTrackCount > 0;

  return (
    <div
      className="min-w-0"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'flex-start',
        gap: compact ? '10px' : '12px',
        width: 'auto',
      }}
    >
      <h1
        className="font-bold tracking-tight truncate"
        style={{
          fontFamily: "'Syne', sans-serif",
          color: 'var(--white)',
          fontSize: compact ? '1.55rem' : '1.7rem',
          minWidth: 0,
        }}
      >
        {title}
      </h1>
      {hasAnyTracks && (
        <div className="flex items-center gap-3 shrink-0" style={{ minWidth: 0 }}>
          <span
            style={{
              padding: compact ? '1px 8px' : '2px 10px',
              borderRadius: compact ? '10px' : '12px',
              background: 'var(--glow-strong)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: compact ? '0.68rem' : '0.72rem',
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {filterQuery ? filteredCount : totalTrackCount}
          </span>
          <span
            style={{
              fontSize: compact ? '0.74rem' : '0.78rem',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatDuration(totalDuration)}
          </span>
        </div>
      )}
    </div>
  );
}
