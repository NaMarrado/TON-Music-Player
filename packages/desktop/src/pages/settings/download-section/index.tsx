import { SectionHeader, ToggleSwitch } from '../helpers';
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
    qualityProfile,
    setQualityProfile,
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
          className="flex justify-between gap-5"
          style={{
            alignItems: layout.compact ? 'stretch' : 'center',
            flexDirection: layout.compact ? 'column' : 'row',
            padding: layout.compact ? '16px' : '18px 20px',
            borderRadius: '12px',
            border: '1px solid rgba(214, 170, 106, 0.5)',
            background: 'linear-gradient(135deg, rgba(214, 170, 106, 0.12), rgba(214, 170, 106, 0.035))',
            boxShadow: 'inset 0 0 24px rgba(214, 170, 106, 0.035)',
          }}
        >
          <div style={{ minWidth: 0, maxWidth: '680px' }}>
            <div style={{ fontSize: '1rem', color: 'var(--white)', fontWeight: 650 }}>
              {t('downloadQualityBest')}
            </div>
            <div
              style={{
                fontSize: '0.78rem',
                color: '#d6aa6a',
                lineHeight: 1.55,
                marginTop: 7,
              }}
            >
              {t('downloadQualityWarning')}
            </div>
          </div>
          <div className="flex shrink-0 items-center" style={{ alignSelf: layout.compact ? 'flex-end' : 'center' }}>
            <ToggleSwitch
              large
              enabled={qualityProfile === 'best_compatible'}
              onClick={() => void setQualityProfile(
                qualityProfile === 'best_compatible' ? 'normal' : 'best_compatible',
              )}
            />
          </div>
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
