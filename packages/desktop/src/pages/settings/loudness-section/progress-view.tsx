import type { AnalyzeProgress, LoudnessStats } from './types';

export function LoudnessProgressView({
  analyzing,
  onAnalyzeAll,
  progress,
  stats,
  t,
}: {
  analyzing: boolean;
  onAnalyzeAll: () => void;
  progress: AnalyzeProgress | null;
  stats: LoudnessStats | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div
      style={{ paddingLeft: '40px', marginTop: '12px' }}
      className="flex flex-col gap-2"
    >
      {stats && stats.total > 0 && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {t('loudnessStats', { analyzed: stats.analyzed, total: stats.total })}
        </span>
      )}

      {analyzing && progress ? (
        <div className="flex items-center gap-2">
          <div
            style={{
              flex: 1,
              maxWidth: '200px',
              height: '4px',
              borderRadius: '2px',
              background: 'var(--bg-surface)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(progress.current / progress.total) * 100}%`,
                height: '100%',
                background: '#4ade80',
                borderRadius: '2px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <span
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {progress.current}/{progress.total}
          </span>
        </div>
      ) : (
        <button
          onClick={onAnalyzeAll}
          disabled={analyzing}
          className="rounded-lg cursor-pointer download-btn"
          style={{
            padding: '6px 14px',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            fontSize: '0.78rem',
            fontFamily: 'inherit',
            width: 'fit-content',
            transition: 'all var(--transition)',
            opacity: analyzing ? 0.5 : 1,
          }}
        >
          {t('loudnessAnalyzeAll')}
        </button>
      )}
    </div>
  );
}
