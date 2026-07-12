import { BINARY_METADATA, BINARY_STATUS_LABELS, type DesktopBinaryStatus } from './types';

export function BinaryStatusRow({
  item,
  t,
}: {
  item: DesktopBinaryStatus;
  t: (key: string) => string;
}) {
  const metadata = BINARY_METADATA[item.id];
  const showOptionalState = item.id === '7zz' && item.status === 'missing';
  const badgeLabel = showOptionalState ? t('dependencyOptional') : t(BINARY_STATUS_LABELS[item.status]);
  const badgeBackground = showOptionalState
    ? 'rgba(255,255,255,0.06)'
    : item.status === 'missing'
      ? 'rgba(255,68,68,0.12)'
      : item.status === 'bundled'
        ? 'rgba(74,222,128,0.12)'
        : 'rgba(255,255,255,0.06)';
  const badgeColor = showOptionalState
    ? 'var(--text-secondary)'
    : item.status === 'missing'
      ? '#ff8080'
      : item.status === 'bundled'
        ? '#86efac'
        : 'var(--text-secondary)';

  return (
    <div
      className="flex flex-col gap-1"
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-deep)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          style={{
            color: 'var(--text-primary)',
            fontSize: '0.78rem',
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          {metadata.label}
        </span>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '999px',
            background: badgeBackground,
            color: badgeColor,
            fontSize: '0.68rem',
            fontWeight: 600,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
          }}
        >
          {badgeLabel}
        </span>
      </div>
      <div
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.72rem',
          lineHeight: 1.45,
        }}
      >
        {t(metadata.descriptionKey)}
      </div>
      {item.path && (
        <div
          className="truncate"
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.72rem',
            fontFamily: 'monospace',
            letterSpacing: '-0.01em',
          }}
          title={item.path}
        >
          {item.path}
        </div>
      )}
    </div>
  );
}
