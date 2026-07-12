import { SectionHeader } from '../helpers';
import { BinaryStatusPanel } from './binary-status-panel';
import { useDownloadSection } from './use-download-section';
import type { SettingsLayout } from '../use-settings-layout';

export function DownloadSection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const {
    binaryStatusMessage,
    downloadDir,
    hasMissingDependency,
    isLoadingBinaryStatuses,
    isRepairingBinaries,
    repairBinaries,
    sortedBinaryStatuses,
  } = useDownloadSection();

  return (
    <section>
      <SectionHeader
        compact={layout.compact}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        }
        title={t('downloadSection')}
      />

      <div className="flex flex-col gap-4" style={{ paddingLeft: layout.sectionIndent }}>
        <div
          className="flex justify-between gap-3"
          style={{
            alignItems: layout.compact ? 'flex-start' : 'center',
            flexDirection: layout.compact ? 'column' : 'row',
          }}
        >
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {t('downloadFormat')}
          </span>
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-primary)',
              fontWeight: 500,
            }}
          >
            MP3 320 kbps
          </span>
        </div>

        <div>
          <span
            className="block"
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            {t('downloadDirectory')}
          </span>
          <div
            className="truncate"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-deep)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              letterSpacing: '-0.01em',
            }}
          >
            {downloadDir || '...'}
          </div>
        </div>

        <BinaryStatusPanel
          compact={layout.compact}
          binaryStatusMessage={binaryStatusMessage}
          hasMissingDependency={hasMissingDependency}
          isLoadingBinaryStatuses={isLoadingBinaryStatuses}
          isRepairingBinaries={isRepairingBinaries}
          items={sortedBinaryStatuses}
          onRepair={() => void repairBinaries()}
          t={t}
        />
      </div>
    </section>
  );
}
