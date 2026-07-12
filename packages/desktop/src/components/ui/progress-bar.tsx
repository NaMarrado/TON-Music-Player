interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  showPercent?: boolean;
}

export function ProgressBar({ value, max, label, showPercent }: ProgressBarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div>
      {(label || showPercent) && (
        <div className="flex justify-between mb-1">
          {label && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</span>}
          {showPercent && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{pct}%</span>}
        </div>
      )}
      <div className="w-full rounded-full overflow-hidden" style={{ height: '4px', background: 'var(--bg-hover)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: 'var(--white)', transition: 'width 200ms' }}
        />
      </div>
    </div>
  );
}
