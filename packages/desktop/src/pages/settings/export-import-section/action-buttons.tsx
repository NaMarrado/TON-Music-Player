interface ActionButtonsProps {
  busy: boolean;
  canExport: boolean;
  compact: boolean;
  onExport: () => void;
  onImport: () => void;
  phase: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  /** Own button texts. Without them the buttons are the library export and import buttons. */
  labels?: { export: string; exporting: string; import: string; importing: string };
  /** Names the two buttons (`<control>-export`, `<control>-import`) for tests. */
  control?: string;
}

export function ActionButtons({
  busy,
  canExport,
  compact,
  onExport,
  onImport,
  phase,
  t,
  labels,
  control,
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
        data-control={control ? `${control}-export` : undefined}
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
        {labels
          ? (busy && phase === 'export' ? labels.exporting : labels.export)
          : busy && phase && !phase.startsWith('import') ? t('exporting') : t('exportButton')}
      </button>
      <button
        className="preset-btn cursor-pointer"
        onClick={onImport}
        data-control={control ? `${control}-import` : undefined}
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
        {labels
          ? (busy && phase === 'import' ? labels.importing : labels.import)
          : busy && phase && phase !== 'manifest' && phase !== 'artwork'
            ? t('importing')
            : t('importButton')}
      </button>
    </div>
  );
}
