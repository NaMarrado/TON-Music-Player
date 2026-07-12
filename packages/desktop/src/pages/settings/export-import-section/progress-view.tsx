import { PHASE_LABELS } from './constants';

interface ProgressViewProps {
  phase: string;
  progress: number;
  total: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function ProgressView({
  phase,
  progress,
  total,
  t,
}: ProgressViewProps) {
  if (total <= 0) {
    return null;
  }

  const phaseLabel = phase && PHASE_LABELS[phase] ? t(PHASE_LABELS[phase]) : '';
  const progressPct = Math.round((progress / total) * 100);

  return (
    <div style={{ marginBottom: '10px' }}>
      <div className="flex justify-between" style={{ marginBottom: '4px' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {phaseLabel}
        </span>
        <span
          style={{
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {progressPct}%
        </span>
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: '3px', background: 'var(--bg-hover)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${progressPct}%`,
            background: 'var(--white)',
            transition: 'width 0.2s ease',
          }}
        />
      </div>
    </div>
  );
}
