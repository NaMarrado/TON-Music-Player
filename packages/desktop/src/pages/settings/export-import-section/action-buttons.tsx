interface ActionButtonsProps {
  busy: boolean;
  canExport: boolean;
  compact: boolean;
  onExport: () => void;
  onImport: () => void;
  phase: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function ActionButtons({
  busy,
  canExport,
  compact,
  onExport,
  onImport,
  phase,
  t,
}: ActionButtonsProps) {
  return (
    <div
      className="gap-2"
      style={{
        marginBottom: '12px',
        display: compact ? 'grid' : 'flex',
        alignItems: compact ? undefined : 'center',
        flexDirection: compact ? undefined : 'row',
        gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : undefined,
      }}
    >
      <button
        className="play-all-btn cursor-pointer"
        onClick={onExport}
        disabled={busy || !canExport}
        style={{
          padding: compact ? '10px 14px' : '7px 18px',
          borderRadius: '16px',
          background: 'var(--white)',
          color: 'var(--bg-deep)',
          border: 'none',
          fontSize: '0.78rem',
          fontWeight: 500,
          fontFamily: 'inherit',
          opacity: busy || !canExport ? 0.5 : 1,
          transition: 'all var(--transition)',
          width: compact ? '100%' : undefined,
          minHeight: compact ? '42px' : undefined,
        }}
      >
        {busy && phase && !phase.startsWith('import') ? t('exporting') : t('exportButton')}
      </button>
      <button
        className="preset-btn cursor-pointer"
        onClick={onImport}
        disabled={busy}
        style={{
          padding: compact ? '10px 14px' : '7px 18px',
          borderRadius: '16px',
          background: 'transparent',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
          fontSize: '0.78rem',
          fontWeight: 500,
          fontFamily: 'inherit',
          opacity: busy ? 0.5 : 1,
          transition: 'all var(--transition)',
          width: compact ? '100%' : undefined,
          minHeight: compact ? '42px' : undefined,
        }}
      >
        {busy && phase && phase !== 'manifest' && phase !== 'artwork'
          ? t('importing')
          : t('importButton')}
      </button>
    </div>
  );
}
