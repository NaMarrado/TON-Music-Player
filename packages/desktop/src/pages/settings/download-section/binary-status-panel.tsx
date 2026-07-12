import { BinaryStatusRow } from './binary-status-row';
import type { DesktopBinaryStatus } from './types';

export function BinaryStatusPanel({
  compact,
  binaryStatusMessage,
  hasMissingDependency,
  isLoadingBinaryStatuses,
  isRepairingBinaries,
  items,
  onRepair,
  t,
}: {
  compact: boolean;
  binaryStatusMessage: string | null;
  hasMissingDependency: boolean;
  isLoadingBinaryStatuses: boolean;
  isRepairingBinaries: boolean;
  items: DesktopBinaryStatus[];
  onRepair: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-3" style={{ paddingTop: '4px' }}>
      <div
        className="flex gap-3"
        style={{
          alignItems: compact ? 'flex-start' : 'center',
          justifyContent: compact ? 'flex-start' : 'space-between',
          flexDirection: compact ? 'column' : 'row',
        }}
      >
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {t('dependencySection')}
        </span>
        <button
          className="cursor-pointer"
          onClick={onRepair}
          disabled={isRepairingBinaries || isLoadingBinaryStatuses}
          style={{
            padding: '6px 12px',
            borderRadius: '999px',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontSize: '0.72rem',
            fontFamily: 'inherit',
            opacity: isRepairingBinaries || isLoadingBinaryStatuses ? 0.65 : 1,
            cursor: isRepairingBinaries || isLoadingBinaryStatuses ? 'default' : 'pointer',
          }}
        >
          {t(hasMissingDependency ? 'installDependencies' : 'repairDependencies')}
        </button>
      </div>

      {isLoadingBinaryStatuses ? (
        <div
          style={{
            padding: '12px',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-deep)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '0.76rem',
          }}
        >
          {t('dependenciesChecking')}
        </div>
      ) : (
        <div
          className="gap-2"
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          }}
        >
          {items.map((item) => (
            <BinaryStatusRow key={item.id} item={item} t={t} />
          ))}
        </div>
      )}

      {binaryStatusMessage && (
        <div
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.72rem',
          }}
        >
          {binaryStatusMessage}
        </div>
      )}
    </div>
  );
}
